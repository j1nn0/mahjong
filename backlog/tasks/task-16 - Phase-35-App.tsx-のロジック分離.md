---
id: TASK-16
title: 'Phase 35: App.tsx のロジック分離'
status: Done
assignee: []
created_date: '2026-06-30 23:54'
updated_date: '2026-07-01 00:02'
labels:
  - code-quality
dependencies: []
priority: low
ordinal: 16
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`humanCanRiichi`、`humanCanKan`、`humanWaits` などのゲームロジック計算が UI コンポーネント内に混在しており、テストが困難。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 プレイヤーの操作可能な状態を返すセレクター関数群を `src/state/selectors.ts` に切り出す
- [x] #2 `App.tsx` はセレクター関数を呼び出すだけにする
- [x] #3 切り出したセレクター関数のユニットテストを追加する
<!-- AC:END -->



## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- `src/state/selectors.ts`（新規）✅
- `src/ui/App.tsx` ✅
- `src/state/selectors.test.ts`（新規）✅
<!-- SECTION:NOTES:END -->
