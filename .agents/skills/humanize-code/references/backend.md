# Backend anti-patterns

Ordered by measured frequency and consequence. **Missing input validation is the most common
security flaw in generated code across every language and model studied**, and roughly half of
generated code carries a detectable OWASP Top-10 issue. Studies put non-compliance with basic
secure-coding standards at 12% to 65% depending on task and model.

The cause is not carelessness. Training corpora are public repositories, documentation, and Q&A
sites, which contain a decade of insecure and outdated code alongside the good material. Models
reproduce what they saw, weighted by how often they saw it.

Severity here is consequence, not confidence.

---

## Security — high

### B01 · Unvalidated input

The single most common flaw. Handlers that take request data straight into business logic or a
query.

Validate at the boundary, once, with a schema. Zod, Pydantic, `encoding/json` with explicit
structs, Joi, whatever the project already uses. Reject early with a typed error. Do not validate
piecemeal deep in the call stack, and do not trust a field because a frontend form set it.

Every request needs to answer: what happens on empty, on wrong type, on absent, on far too large,
on unexpected extra fields.

### B02 · String-concatenated SQL

```python
cur.execute(f"SELECT * FROM users WHERE email = '{email}'")   # injection
cur.execute("SELECT * FROM users WHERE email = %s", (email,)) # correct
```

Parameterize. Always. This includes `ORDER BY` and `LIMIT` clauses, which cannot be
parameterized in most drivers and therefore must be validated against an allowlist rather than
interpolated. It also includes ORM raw-query escape hatches.

### B03 · Hand-rolled auth and crypto

Repeat offenders in generated code:

| Wrong | Right |
| --- | --- |
| MD5 or SHA-1 or SHA-256 for passwords | argon2id, scrypt, or bcrypt |
| `==` comparing tokens or signatures | constant-time compare |
| `Math.random()` / `random.random()` for tokens | `crypto.randomBytes`, `secrets.token_urlsafe` |
| Custom JWT verification | a maintained library, with algorithm pinned |
| `alg: none` accepted, or algorithm read from the token | pin the expected algorithm |
| Hand-written session logic | the framework's session support |

Use the platform primitive. Cryptography is the wrong place to be original.

### B04 · Secrets in source

Hardcoded API keys, connection strings with embedded passwords, `.env` files committed, tokens in
test fixtures, credentials in comments. Also secrets baked into Docker images at build time.

Read from the environment or a secret manager. If you see a real-looking secret in code, flag it
as high and note that it needs rotation, not just removal, because git history keeps it.

### B05 · Permissive CORS

`Access-Control-Allow-Origin: *` combined with `Allow-Credentials: true` is invalid per spec and
usually a sign the CORS config was generated rather than decided. Enumerate the origins.

### B06 · Missing authorization checks

Authentication answers *who*. Authorization answers *may they*. Generated endpoints frequently
check the first and skip the second, so any authenticated user can read or modify any record by
changing an ID in the path. Check ownership or role on every resource access.

### B07 · Injection beyond SQL

`eval`, `exec`, `child_process.exec` with interpolated input, `os.system`, unpickling untrusted
data, template rendering from user strings, path traversal in file handlers, `subprocess` with
`shell=True`. Use the argument-array form, never the shell string form.

### B08 · Sensitive data in logs

Whole request bodies, authorization headers, tokens, passwords, PII. Generated logging is
frequently `log.info(request)`. Log identifiers, not payloads. Redact at the logger.

---

## Correctness and robustness — medium

### B10 · Swallowed exceptions

```python
try:
    ...
except Exception:
    pass          # or: except: pass, or logging and continuing as if nothing happened
```

```javascript
} catch (e) { console.log(e); }   // then proceeds as though it succeeded
```

Catch the specific exception you can handle. Let the rest propagate. A caught-and-ignored error
turns a loud failure into a silent wrong answer, which is strictly worse.

### B11 · No timeouts

Outbound HTTP with no timeout, database calls with no statement timeout, no overall request
deadline. Most client libraries default to waiting forever, and one slow dependency then exhausts
the connection pool.

Set a timeout on every outbound call. Add retries with backoff and a cap only where the operation
is idempotent.

### B12 · N+1 queries

A query inside a loop over the results of another query. Batch it, join it, or use the ORM's
eager-loading. This is the most common generated performance defect, and it looks fine on ten
rows.

### B13 · `SELECT *`

Breaks when columns are added, pulls columns that are not needed, and hides which fields the code
actually depends on. Name the columns.

### B14 · Blocking I/O in async code

`requests` inside an `async def`. `fs.readFileSync` in a request handler. A CPU-bound loop on the
event loop. Blocks the entire loop, so concurrency silently becomes serial.

Use the async client, or push the work to a thread pool.

### B15 · Unbounded results

List endpoints with no pagination, no `LIMIT`, no maximum page size, unbounded file uploads,
unbounded request bodies. Fine in development, a denial of service in production. Cap it, and cap
the cap.

### B16 · Race conditions on read-modify-write

Read a value, compute, write it back, with no transaction, no row lock, and no optimistic
concurrency check. Correct under test, wrong under concurrency. Common in counters, balances, and
inventory.

### B17 · No transaction boundaries

Multi-step writes that can half-apply. If two writes must both succeed, they belong in one
transaction.

### B18 · Ignored errors in Go

```go
result, _ := doSomething()   // the underscore is the bug
```
Handle it or explicitly document why it cannot fail.

### B19 · Migrations that lose data

Generated migrations that drop and recreate rather than alter, that add a `NOT NULL` column with
no default to a populated table, or that have no down migration. Read every generated migration
against the real table before running it.

---

## Structure — low, flag for a human

These need judgment, not a rule. Report them; do not unilaterally refactor.

### B30 · Single-implementation interface

An interface, an abstract base class, or a protocol with exactly one implementation and no second
one planned. Indirection with no payoff. Collapse it until a second case exists.

### B31 · Factory for two cases

A factory, registry, or strategy pattern selecting between two concrete options. An `if` is
clearer.

### B32 · Configuration nothing reads

Config keys, feature flags, and environment variables that no code path consumes. Models generate
the shape of configurability.

### B33 · Wrapper that adds nothing

A service class whose methods each call exactly one repository method and return the result
unchanged. Delete the layer.

### B34 · Speculative generality

`**kwargs` passed through five layers untouched. Callback parameters nothing supplies.
`Optional[Any]` fields nothing sets. Version fields on a schema with one version.

### B35 · Comments restating code

```python
# increment the counter
counter += 1
```
Delete. Keep comments that record *why*: a constraint, a workaround, a decision, a surprise, a
link to the issue that explains it.

### B36 · Defensive noise

Null checks on values constructed three lines above. Try/catch around pure arithmetic. Validating
callers that are internal and typed. It reads as thorough and buries the checks that matter.

### B37 · Uniform file shape

Every module the same length, every function the same size, every file with the same section
comments. Real codebases are lopsided because real problems are.

---

## Testing

Generated tests fail in a characteristic way: they test the happy path, they mock the thing under
test, and they assert on implementation rather than behavior.

- **No error-path coverage.** Test what happens when input is invalid, the dependency is down, the
  record is missing, the call times out.
- **Over-mocking.** Mocking the unit under test means the test asserts the mock works. Mock at the
  boundary: the network, the clock, the filesystem.
- **Asserting on internals.** Asserting a private method was called couples the test to the
  implementation. Assert on the observable result.
- **No boundary cases.** Empty, one, many, maximum, negative, zero, null, unicode, very long.
- **Nondeterminism.** Tests depending on wall-clock time, real network, iteration order, or
  execution order. Inject the clock. Seed the randomness.
- **Assertion-free tests.** A test that calls the function and asserts nothing passes forever.

---

## Quick grep

```bash
# swallowed exceptions
grep -rnE 'except.*:\s*$' --include=*.py -A1 . | grep -B1 'pass'
grep -rnE 'catch\s*\([^)]*\)\s*\{\s*\}' --include=*.ts --include=*.js .

# ignored errors in Go
grep -rnE '^\s*[a-zA-Z_]+, _ :?= ' --include=*.go .

# sql concatenation
grep -rniE '(execute|query|raw)\(.*(f"|\+ *[a-z_]+|%s? *%|\$\{)' .

# weak crypto and randomness
grep -rniE 'md5|sha1\(|Math\.random\(\)|random\.random\(\)' .

# permissive cors
grep -rniE "Allow-Origin.*\*|origin: *['\"]\*" .

# select star
grep -rniE 'SELECT \*' .

# shell injection
grep -rniE 'shell=True|child_process\.exec\(|os\.system\(' .
```

Grep finds candidates, not findings. Read each hit before reporting it.
