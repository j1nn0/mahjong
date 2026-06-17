# Repository Guidelines

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
