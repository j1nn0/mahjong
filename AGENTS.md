# Repository Guidelines

## Top priority rule

- Always reply to users in Japanese.
- Shell commands are executed with `rtk` as the prefix. For example: `rtk pnpm run ci`.

## Code Intelligence

Use the cheapest tool that can answer the question.

Use Context Mode to discover relevant project context before broad investigation.

Code investigation:
Serena or ast-grep → CodeGraph only when broader impact analysis is needed

- Prefer Serena for symbol lookup, definitions, references, and call hierarchy.
- Prefer ast-grep for syntax-aware pattern search and mechanical refactors.

Refactoring and impact analysis:
CodeGraph → Serena → ast-grep

Use plain-text search only for config keys, env names, logs, route output, documentation, and non-code text.

Escalate only when additional context is required.

## Project Structure & Module Organization

This is a TypeScript riichi mahjong terminal UI built with React and Ink.
Source lives under `src/`:

- `src/index.tsx`: application entry point.
- `src/ui/`: Ink/React terminal components and input handling.
- `src/state/`: game reducer, turn flow, save/load persistence.
- `src/game/`: tile models, AI, agari/yaku/scoring logic.

Tests are colocated with the code as `*.test.ts`, mostly in `src/game/` and
`src/state/`. There is no separate asset directory at present.

## Build, Test, and Development Commands

Use the package scripts from `package.json`:

- `pnpm install`: install dependencies from `pnpm-lock.yaml`.
- `pnpm start`: run the Ink TUI via `tsx src/index.tsx`.
- `pnpm test`: run the Vitest suite once.
- `pnpm test:watch`: run Vitest in watch mode while developing.
- `pnpm exec tsc --noEmit`: run TypeScript checks without writing `dist/`.

No lint script is currently configured.

## Coding Style & Naming Conventions

Use strict TypeScript with ES modules. Keep explicit `.js` extensions in local
imports, matching the existing source. Use two-space indentation, single quotes,
semicolons, and concise named exports. Keep domain types and pure mahjong logic
in `src/game/`; keep reducer and persistence concerns in `src/state/`; keep
Ink rendering and keyboard behavior in `src/ui/`.

Name React components in `PascalCase`, functions and variables in `camelCase`,
and tests after the module under test, for example `scoring.test.ts`.

## Testing Guidelines

Vitest is the test framework. Add or update colocated tests for scoring, yaku,
AI, reducer, and persistence changes. Prefer deterministic hands and explicit
assertions over broad snapshots. Run `pnpm test` before submitting, and add
targeted cases for regressions or rule changes.

## Commit & Pull Request Guidelines

Recent history mostly follows Conventional Commits, such as
`feat(core): implement dora system`. Use `type(scope): imperative summary`
where possible, for example `fix(state): preserve riichi after restore`.

Pull requests should include a short behavior summary, test results, linked
issues when relevant, and terminal screenshots or recordings for visible TUI
changes. Call out changes to mahjong rules, save-file behavior, or AI decisions
so reviewers can focus on the affected scenarios.

## Agent Workspace

Agents that need temporary files during their work must use the `.temp`
directory at the project root, not `/tmp`. Create the directory if it does not
exist, and clean up any temporary files when the task completes.

# context-mode — MANDATORY routing rules

context-mode MCP tools available. Rules protect context window from flooding. One unrouted command dumps 56 KB into context.

## Think in Code — MANDATORY

Analyze/count/filter/compare/search/parse/transform data: **write code** via `context-mode_ctx_execute(language, code)`, `console.log()` only the answer. Do NOT read raw data into context. PROGRAM the analysis, not COMPUTE it. Pure JavaScript — Node.js built-ins only (`fs`, `path`, `child_process`). `try/catch`, handle `null`/`undefined`. One script replaces ten tool calls.

## BLOCKED — do NOT attempt

### curl / wget — BLOCKED
Shell `curl`/`wget` intercepted and blocked. Do NOT retry.
Use: `context-mode_ctx_fetch_and_index(url, source)` or `context-mode_ctx_execute(language: "javascript", code: "const r = await fetch(...)")`

### Inline HTTP — BLOCKED
`fetch('http`, `requests.get(`, `requests.post(`, `http.get(`, `http.request(` — intercepted. Do NOT retry.
Use: `context-mode_ctx_execute(language, code)` — only stdout enters context

### Direct web fetching — BLOCKED
Use: `context-mode_ctx_fetch_and_index(url, source)` then `context-mode_ctx_search(queries)`

## REDIRECTED — use sandbox

### Shell (>20 lines output)
Shell ONLY for: `git`, `mkdir`, `rm`, `mv`, `cd`, `ls`, `npm install`, `pip install`.
Otherwise: `context-mode_ctx_batch_execute(commands, queries)` or `context-mode_ctx_execute(language: "shell", code: "...")`

### File reading (for analysis)
Reading to **edit** → reading correct. Reading to **analyze/explore/summarize** → `context-mode_ctx_execute_file(path, language, code)`.

### grep / search (large results)
Use `context-mode_ctx_execute(language: "shell", code: "grep ...")` in sandbox.

## Tool selection

0. **MEMORY**: `context-mode_ctx_search(sort: "timeline")` — after resume, check prior context before asking user.
1. **GATHER**: `context-mode_ctx_batch_execute(commands, queries)` — runs all commands, auto-indexes, returns search. ONE call replaces 30+. Each command: `{label: "header", command: "..."}`.
2. **FOLLOW-UP**: `context-mode_ctx_search(queries: ["q1", "q2", ...])` — all questions as array, ONE call (default relevance mode).
3. **PROCESSING**: `context-mode_ctx_execute(language, code)` | `context-mode_ctx_execute_file(path, language, code)` — sandbox, only stdout enters context.
4. **WEB**: `context-mode_ctx_fetch_and_index(url, source)` then `context-mode_ctx_search(queries)` — raw HTML never enters context.
5. **INDEX**: `context-mode_ctx_index(content, source)` — store in FTS5 for later search.

## Parallel I/O batches

For multi-URL fetches or multi-API calls, **always** include `concurrency: N` (1-8):

- `context-mode_ctx_batch_execute(commands: [3+ network commands], concurrency: 5)` — gh, curl, dig, docker inspect, multi-region cloud queries
- `context-mode_ctx_fetch_and_index(requests: [{url, source}, ...], concurrency: 5)` — multi-URL batch fetch

**Use concurrency 4-8** for I/O-bound work (network calls, API queries). **Keep concurrency 1** for CPU-bound (npm test, build, lint) or commands sharing state (ports, lock files, same-repo writes).

GitHub API rate-limit: cap at 4 for `gh` calls.

## Output

Write artifacts to FILES — never inline. Return: file path + 1-line description.
Descriptive source labels for `search(source: "label")`.

## Session Continuity

Skills, roles, and decisions persist for the entire session. Do not abandon them as the conversation grows.

## Memory

Session history is persistent and searchable. On resume, search BEFORE asking the user:

| Need | Command |
|------|---------|
| What did we decide? | `context-mode_ctx_search(queries: ["decision"], source: "decision", sort: "timeline")` |
| What constraints exist? | `context-mode_ctx_search(queries: ["constraint"], source: "constraint")` |

DO NOT ask "what were we working on?" — SEARCH FIRST.
If search returns 0 results, proceed as a fresh session.

## ctx commands

| Command | Action |
|---------|--------|
| `ctx stats` | Call `stats` MCP tool, display full output verbatim |
| `ctx doctor` | Call `doctor` MCP tool, run returned shell command, display as checklist |
| `ctx upgrade` | Call `upgrade` MCP tool, run returned shell command, display as checklist |
| `ctx purge` | Call `purge` MCP tool with confirm: true. Warns before wiping knowledge base. |

After /clear or /compact: knowledge base and session stats preserved. Use `ctx purge` to start fresh.
