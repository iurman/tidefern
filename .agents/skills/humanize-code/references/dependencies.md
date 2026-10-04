# Dependency and version currency

The rule: **never write a version number from memory.**

This is the highest-value part of the skill and the one with the strongest evidence. Measured
deprecated-API usage runs 25% to 38% across eight common Python libraries. Version-conditioned
generation benchmarks land at 48% to 51%. Both numbers come from the same cause: a model's version
knowledge is a snapshot, and it degrades every day after the cutoff.

It is not only the cutoff. Training corpora contain a decade of historical repositories, so
deprecated patterns are over-represented relative to their current use. A model can recall a
version that was already obsolete when it was trained.

---

## Procedure

Run these in order. Do not skip step 1.

### 1. Read what already exists

Before resolving anything, find the project's existing decisions.

| Ecosystem | Look at |
| --- | --- |
| Node | `package.json` (`engines`, `packageManager`), `package-lock.json`, `pnpm-lock.yaml`, `.nvmrc`, `.node-version` |
| Python | `pyproject.toml` (`requires-python`), `uv.lock`, `poetry.lock`, `requirements.txt`, `.python-version`, `tox.ini` |
| Go | `go.mod` (`go` directive), `go.sum` |
| Rust | `Cargo.toml` (`rust-version`), `Cargo.lock`, `rust-toolchain.toml` |
| Java | `pom.xml`, `build.gradle`, `.sdkmanrc` |
| Ruby | `Gemfile`, `Gemfile.lock`, `.ruby-version` |
| .NET | `*.csproj` (`TargetFramework`), `global.json` |
| Containers | `Dockerfile`, `docker-compose.yml`, `.github/workflows/*` |

A pin is a decision. It usually encodes a compatibility constraint that is invisible from inside
the file you are editing. If the project pins Node 20, use Node 20 and mention that a newer LTS
exists. Do not bump it because this skill says "current."

### 2. Resolve from the registry

Prefer the package manager CLI when it is available, since it respects project config and
registry mirrors. Fall back to the HTTP API.

| Ecosystem | CLI | HTTP |
| --- | --- | --- |
| npm | `npm view <pkg> version dist-tags deprecated` | `https://registry.npmjs.org/<pkg>/latest` |
| PyPI | `pip index versions <pkg>` | `https://pypi.org/pypi/<pkg>/json` |
| Go | `go list -m -versions <module>` | `https://proxy.golang.org/<module>/@latest` |
| Rust | `cargo search <name>` | `https://crates.io/api/v1/crates/<name>` |
| Maven | — | `https://search.maven.org/solrsearch/select?q=g:<group>+AND+a:<artifact>&core=gav&rows=1&wt=json` |
| RubyGems | `gem list -r <name>` | `https://rubygems.org/api/v1/gems/<name>.json` |
| NuGet | — | `https://api.nuget.org/v3-flatcontainer/<id>/index.json` |
| Packagist | — | `https://repo.packagist.org/p2/<vendor>/<pkg>.json` |

Notes that will save you a failed call:

- **crates.io requires a User-Agent header.** A bare request is rejected by their API policy.
  Send `-H "User-Agent: <something>"`.
- **Go module paths are case-encoded** in the proxy. Uppercase letters become `!` plus lowercase,
  so `github.com/BurntSushi/toml` is `github.com/!burnt!sushi/toml`.
- **npm `dist-tags`** distinguishes `latest` from `next` and `canary`. Use `latest` unless the
  task explicitly wants a prerelease.

### 3. Check health, not just existence

A version resolving is not the same as a version being a good idea.

- **npm**, a non-empty `deprecated` field means the package or version is deprecated. Read the
  message; it usually names the replacement.
- **PyPI**, check `yanked` and `yanked_reason` on the release. Check `requires_python` against
  the project's floor.
- **Everywhere**, if the newest release is years old, decide whether the package is stable or
  abandoned. Both look identical from the version number alone. Check the repository.

### 4. Verify the package exists at all

Before writing any import or dependency line for a package you have not confirmed in this session,
resolve it. Models hallucinate plausible package names, and attackers register those names. This
is an active supply-chain attack surface, and the check costs one request.

---

## Runtime and platform versions

This is the case where models most visibly reach for something old: they name the LTS that was
current at training time. The fix is a single endpoint.

### Node

```
https://nodejs.org/dist/index.json
```

Newest first. Each entry has an `lts` field that is either `false` or a codename string. **The
current LTS is the highest version whose `lts` is a string.** Do not infer it from the version
number.

The even-major rule is a guideline, not a schedule. An even major is not LTS until its LTS date
arrives, so the newest even major is often still Current rather than LTS. Read the field.

```
first entry with "lts": "<name>"  ->  that major is the active LTS
"lts": false on the newest entries  ->  those are Current, not LTS
```

For production runtimes and Docker base images, use the active LTS unless the project needs
something newer. For libraries, set `engines` to the oldest LTS you actually support.

### Everything else

```
https://endoflife.date/api/<product>.json
```

Covers `nodejs`, `python`, `java`, `postgresql`, `ubuntu`, `debian`, `dotnet`, `go`, `ruby`,
`php`, `django`, `rails`, `kubernetes`, `redis`, `mysql`, `nginx`, `terraform`, and many more.

Each cycle entry gives you:

| Field | Meaning |
| --- | --- |
| `cycle` | Major version line |
| `latest` | Newest patch in that line |
| `eol` | End-of-life date, or `false` if not scheduled |
| `support` | End of active support |
| `lts` | `true`, `false`, or the date the cycle becomes LTS |

**Decision rule.** Choose the newest cycle where `lts` is truthy and `eol` is in the future. If
`lts` is a future date, that cycle is not LTS yet.

Always check `eol` against today's date. Shipping an EOL runtime is a security finding, not a
style preference.

### Per-ecosystem guidance

| Target | Rule |
| --- | --- |
| Node runtime | Active LTS from `nodejs.org/dist/index.json`. Never a version past EOL. |
| Python | Newest release with mature ecosystem support. Check the floor in `requires-python`, and check that pinned C-extension deps have wheels for it. |
| Java | LTS only for applications: 8, 11, 17, 21, 25. Non-LTS majors have six-month support windows. |
| .NET | Even-numbered majors are LTS with three years of support. Odd are STS with 18 months. |
| PostgreSQL | Any supported major. Five-year support window. Match what the deployment target actually runs. |
| Ubuntu base images | LTS only, and not one approaching EOL. Verify via `endoflife.date/api/ubuntu.json`. |
| Go | The Go team supports the two most recent majors. The `go` directive in `go.mod` is a floor, not a pin. |
| Rust | Stable, unless the project has a `rust-toolchain.toml` pinning otherwise. |

### Docker base images

Same rule, three extra checks:

- **Never `:latest`** in anything that gets deployed. It is not reproducible.
- **Pin to a real tag** verified against the registry, not recalled. Digest pinning is better where
  the project already does it.
- **Prefer slim or alpine variants** only when the project already uses them. Switching base image
  flavors changes glibc/musl behavior and is not a cosmetic change.

---

## API currency

Version numbers are half the problem. The other half is calling functions that no longer exist, or
that exist and are deprecated.

Cross-check against the installed version whenever you touch a fast-moving library. The families
that generate the most stale output are the ones that shipped a major rewrite: Pydantic v1 to v2,
React class components and lifecycle methods, Next.js pages router versus app router, OpenAI and
Anthropic SDK generations, Pandas `append` and `inplace`, NumPy type aliases, `datetime.utcnow`,
Express 4 to 5, SQLAlchemy 1.x to 2.0 query style.

That list is not exhaustive and will go stale itself. The durable rule:

**When you are about to write an API call from memory for a library you did not read in this
session, read it first.** Check the installed version, check the source or the docs, then write
the call. If the library is present in the project, the source is on disk and reading it is cheap.

Deprecation warnings in test output are evidence. Do not suppress them.

---

## Reporting

Every version you write should be traceable to a resolution, not a recollection.

```
DEPENDENCY       WAS      NOW      SOURCE
node             20       24       nodejs.org/dist/index.json (lts: Krypton)
python           3.11     3.11     unchanged, pinned in .python-version
fastapi          ^0.100   ^0.121   registry.npmjs.org equivalent: pypi.org/pypi/fastapi/json
requests         2.28     2.28     unchanged, not in scope
```

When you could not reach the network:

```
UNRESOLVED: node base image version. No registry access.
Left as-is at node:20. Verify against nodejs.org/dist/index.json before deploying.
```

Say that. Do not fill the gap with a guess.
