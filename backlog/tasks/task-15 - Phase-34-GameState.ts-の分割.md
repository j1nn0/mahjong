---
id: TASK-15
title: 'Phase 34: GameState.ts の分割'
status: Done
assignee: []
created_date: '2026-06-30 23:54'
updated_date: '2026-07-01 00:02'
labels:
  - code-quality
dependencies: []
priority: low
ordinal: 15
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`src/state/GameState.ts` が 1673 行に肥大化しており、可読性・保守性が低い。責務ごとにファイルを分割する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 アクションハンドラ群を `src/state/reducer.ts` に分離する
- [x] #2 局終了・清算処理を `src/state/finishRound.ts` に分離する
- [x] #3 クレームフェーズ処理を `src/state/claimPhase.ts` に分離する
- [x] #4 分割後もすべての既存テストが通過する
<!-- AC:END -->



## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- `src/state/GameState.ts`（2018行 → 654行に縮小、再エクスポート追加）
- `src/state/types.ts`（新規 158行: 型定義を分離し循環依存を回避）
- `src/state/reducer.ts`（新規 818行: gameReducer）
- `src/state/finishRound.ts`（新規 499行: 局終了・清算・途中流局）
- `src/state/claimPhase.ts`（新規 160行: クレーム収集・処理）
<!-- SECTION:NOTES:END -->
