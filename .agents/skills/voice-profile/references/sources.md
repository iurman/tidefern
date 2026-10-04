# Sources

Where each harness stores what the user typed, and how to isolate it.

**Ask before reading any transcript directory.** These files contain everything the user has typed
to an agent, including things they would not choose to share.

**Everything here is local.** Read files, count locally, write locally. No transcript content
leaves the machine.

Formats are internal to each tool and change between releases. Treat every shape below as a
starting point: check the actual structure before parsing at volume, and fail loudly instead of
silently producing an empty corpus.

**Confidence varies by source, and the difference matters:**

| Source | Confidence |
| --- | --- |
| Claude Code | Verified against real transcript records |
| Git | Stable, plain `git log` |
| Codex CLI | From published descriptions, extraction logic fixture-tested |
| Cursor | From published descriptions, extraction logic fixture-tested |
| Gemini CLI | Path only, schema unconfirmed. Inspect before use |

An empty result from a source whose shape you did not verify is not evidence that the user has
no history there. It is evidence that the filter did not match. Report those differently.

---

## Claude Code

```
~/.claude/projects/<path-slug>/<session-uuid>.jsonl
```

`<path-slug>` is the project's working directory with non-alphanumeric characters replaced by
hyphens. `/home/user/notARobot` becomes `-home-user-notARobot`.

One JSON object per line. Verified record types include `user`, `assistant`, `message`, `system`,
`attachment`, `thinking`, `queue-operation`, `summary`.

### What to keep

Take lines where `type` is `"user"` **and** `message.content` is a **plain string**.

That last condition is the whole filter. Real typed prompts store content as a string. Tool
results are also `type: "user"` but store content as an **array** of content blocks. Keeping
arrays fills the corpus with tool output.

```json
{"type":"user","message":{"role":"user","content":"can you check why the build is failing"}}
```

`queue-operation` records with `"operation":"enqueue"` carry raw typed text in a top-level
`content` field. These are messages typed while the agent was busy. Include them, and expect
duplicates against the `user` record for the same message. Deduplicate on exact text.

```bash
# candidate extraction; verify the shape on a sample first
grep -h '"type":"user"' ~/.claude/projects/*/*.jsonl
```

With `jq` available, the filter is exact:

```bash
jq -r 'select(.type=="user" and (.message.content|type=="string")) | .message.content' \
  ~/.claude/projects/*/*.jsonl
```

Without `jq`, read the files and extract with your own parsing rather than regex across lines.
Single lines can be very long.

### Notes

- Sessions are deleted after 30 days by default, so the window is bounded.
- Sidechain records carry `"isSidechain":true`. Those are subagent conversations, not user input.
  Exclude them.
- Projects are per-directory, so a full corpus means globbing every project directory.

---

## Codex CLI

```
~/.codex/sessions/YYYY/MM/DD/rollout-YYYY-MM-DDTHH-MM-SS-<id>.jsonl
~/.codex/session_index.jsonl        # metadata cache, active and archived
```

JSONL rollout files holding the full conversation, tool calls, and token usage. Keep entries whose
role is `user` and whose content is typed text rather than a function or tool result.

Older sessions are compressed to `.jsonl.zst`. Decompress only if `zstd` is present:

```bash
command -v zstd >/dev/null && zstd -dc ~/.codex/sessions/*/*/*/rollout-*.jsonl.zst
```

If `zstd` is missing, skip the compressed files and note the gap in the build report. Do not
install anything.

Rollout files get large, since they include compacted history and raw tool output. Filter while
streaming rather than loading whole files.

---

## Cursor

SQLite, not JSONL.

| Platform | Path |
| --- | --- |
| Linux | `~/.config/Cursor/User/globalStorage/state.vscdb` |
| macOS | `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` |
| Windows | `%APPDATA%\Cursor\User\globalStorage\state.vscdb` |

Two databases matter:

- **Global** `globalStorage/state.vscdb` — message content, in keys shaped
  `bubbleId:{composerId}:{messageId}`. Cursor 3.0+ also stores conversation headers under
  `composer.composerHeaders`.
- **Workspace** `workspaceStorage/<id>/state.vscdb` — maps conversations to workspaces.

```bash
sqlite3 "$DB" "SELECT value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%';"
```

Each value is JSON with a role or type field distinguishing user from assistant. Keep user
messages.

**The `sqlite3` CLI is often missing**, including on many container images. Do not skip Cursor
when it is. Python ships a `sqlite3` module in its standard library, and any machine running an
agent almost certainly has Python:

```bash
python3 -c "
import sqlite3, json
db = sqlite3.connect('$DB')
for (v,) in db.execute(\"SELECT value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'\"):
    try: r = json.loads(v)
    except Exception: continue
    if r.get('type') == 1 and isinstance(r.get('text'), str):
        print(r['text'])
"
```

Cursor encodes the role as an integer `type` on each bubble, where `1` is the user and `2` is the
assistant. Confirm that mapping on a handful of records before trusting it at volume, since a
role encoding is exactly the kind of detail that changes between releases. If the values do not
look like user messages, try the inverse before giving up.

Only skip Cursor when neither the CLI nor Python is available, and say so in the coverage report.

**Copy the database before reading it** if Cursor is running, since reading a live SQLite file can
hit a lock.

---

## Gemini CLI

```
~/.gemini/tmp/<project-hash>/logs.json
```

**Least reliable entry in this file.** The path comes from published descriptions and has not been
confirmed against a real install. No schema is given here, because guessing at one would be worse
than having none.

Treat it as a lead, not a procedure. If the directory exists, read one file, work out the shape
from what is actually there, and only then extract. If the shape is unclear, skip it and record
the gap. A profile built from a misparsed corpus is worse than a profile with one source missing.

---

## Harness-independent sources

These are often better than transcripts. They are text the user wrote deliberately, for a real
audience, and they map cleanly onto registers.

### Git

```bash
git config user.email                     # find the right author filter

# commit register: subjects only
git log --author="$EMAIL" --pretty=format:'%s' --no-merges

# pr-description register: bodies, where they exist
git log --author="$EMAIL" --pretty=format:'%b' --no-merges | grep -v '^$'

# across every repo on the machine
find ~ -maxdepth 4 -name .git -type d 2>/dev/null
```

Exclude merge commits, `Co-Authored-By` trailers, generated commits, revert boilerplate, and
anything matching a template. Commit subjects are the single cleanest register signal available:
short, high-volume, unambiguously the user's, and stylistically consistent.

### Authored documents

Markdown notes, READMEs, design docs, drafts. Only files the user wrote. Check `git log` on a file
before assuming authorship, and skip anything that looks generated or heavily edited by an agent.

### Anything the user hands you

If the user offers exported chat logs, sent email, or a folder of writing, use it. Volunteered
text is better than mined text: it is unambiguously theirs, and consent is explicit.

---

## Dictation

Voice-transcribed input is common in agent sessions and needs its own bucket.

**Recognize it by:** filler disfluencies (`um`, `uh`, `like`, `you know`), false starts and
self-repairs (`I I I kind of want`), run-on structure with few sentence boundaries, spelled-out
punctuation, and `etcetera` for `etc.`

**Use it for:** vocabulary, characteristic phrases, how the person structures an argument, how
they hedge, what they care about.

**Never use it for:** sentence length, punctuation rates, capitalization, paragraph structure, or
formatting. A transcription pipeline made all of those choices, not the user.

Keep dictated samples as a separate register. If dictated samples are a large share of the corpus,
say so in the build report, because it caps how much can be inferred about written mechanics.

---

## Filtering

Applied to every source.

**Drop:**

| Pattern | Reason |
| --- | --- |
| Fenced code blocks, diffs, stack traces, logs | Pasted, not written |
| Lines that are only a path or URL | No style content |
| Slash commands, `@` file mentions | Interface, not prose |
| Under ~15 characters | "ok", "yes", "continue" |
| Near-duplicates | Skews frequency counts |
| Template or generated text | Not the user's |
| Model output in any form | Poisons the profile |

**Keep** prose the user composed, including terse messages above the length floor. Bluntness is
style.

Strip inline code spans before counting words, but keep the sentence.

---

## Redaction

Run before anything is written to disk. Applies to measurements, lexicon, and especially
exemplars.

| Remove | Notes |
| --- | --- |
| API keys, tokens, passwords, connection strings | Including anything key-shaped |
| Email addresses | Except the user's own |
| Phone numbers, physical addresses | |
| Absolute paths with a username | `/Users/jane/...` → `~/...` |
| Internal hostnames, private URLs, IPs | |
| Third-party names in a private context | Colleagues, clients |
| Anything ambiguous | Redact when unsure |

Prefer `[redacted]` over deletion where the sentence is stylistically useful. The shape of the
sentence is what the exemplar is for.

**Never commit a profile.** Confirm the output path is gitignored before writing a copy into a
repository.

---

## Coverage report

State what was available and what was not. A profile built only from chat prompts is a different
object than one built from commits and documents, and the user should be able to see which they
got.

```
SOURCE          SAMPLES  REGISTERS              STATUS
claude-code     287      chat, longform         ok
codex           0        -                      no ~/.codex/sessions
cursor          0        -                      sqlite3 not available
git             98       commit, pr-description ok (4 repos)
documents       27       longform               ok
dictated        31       dictated               separated, excluded from punctuation

total usable: 412
gaps: no standup register; cursor unread
```
