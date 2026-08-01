# Repository Guidelines

## Top priority rule

- Always reply to users in Japanese.
- Shell commands are executed with `rtk` as the prefix. For example: `rtk pnpm run ci`.

## Code Intelligence

- Use the cheapest tool that can answer the question.
- Use Context Mode to discover relevant project context before broad investigation.
- Use ast-grep for syntax-aware search and mechanical refactors.
- Use CodeGraph only when broader impact analysis is needed.
- Use plain-text search only for config keys, env names, logs, route output, documentation, and non-code text.
- Escalate only when additional context is required.

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

<!-- BACKLOG.MD GUIDELINES START -->
<CRITICAL_INSTRUCTION>

## Backlog.md Workflow

This project uses Backlog.md for task and project management.

**For every user request in this project, run `backlog instructions overview` before answering or taking action.**

Use the overview to decide whether to search, read, create, or update Backlog tasks.

Use the detailed guides when needed:
- `backlog instructions task-creation` for creating or splitting tasks
- `backlog instructions task-execution` for planning and implementation workflow
- `backlog instructions task-finalization` for completion and handoff

Use `backlog <command> --help` before running unfamiliar commands. Help shows options, fields, and examples.

Do not edit Backlog task, draft, document, decision, or milestone markdown files directly. Use the `backlog` CLI so metadata, relationships, and history stay consistent.

</CRITICAL_INSTRUCTION>
<!-- BACKLOG.MD GUIDELINES END -->
