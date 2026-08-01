---
id: TASK-7
title: 'Phase 26: AIのリーチ宣言'
status: Done
assignee: []
created_date: '2026-06-30 23:54'
updated_date: '2026-07-01 00:02'
labels:
  - ai
dependencies: []
priority: medium
ordinal: 7
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
現在の AI はテンパイしても絶対にリーチを宣言しない。点数効率のため、シンプルなリーチ判断を追加する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `processAiTurn` でツモ後テンパイかつ 1000 点以上持っている場合、リーチを宣言する
- [x] #2 リーチ宣言可能でも門前でない場合（副露あり）はリーチしない
- [x] #3 AI がリーチを宣言するシナリオをテストする
<!-- AC:END -->



## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- `src/state/GameState.ts`（`processAiTurn`）
- `src/state/GameState.test.ts`

---
<!-- SECTION:NOTES:END -->
