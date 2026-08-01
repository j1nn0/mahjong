---
id: TASK-10
title: 'Phase 29: AIの副露宣言'
status: Done
assignee: []
created_date: '2026-06-30 23:54'
updated_date: '2026-07-01 00:02'
labels:
  - ai
dependencies: []
priority: medium
ordinal: 10
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`processAiTurn` のクレーム処理で、ロン・大明カンは即座に宣言し、チー・ポンは「タンヤオ狙い or テンパイ形成」になる場合のみ宣言するようにした。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 タンヤオを目指している（手牌に字牌・端牌が少ない）場合、チー・ポンを宣言する
- [x] #2 ポン後にテンパイになる場合は必ずポンを宣言する
- [x] #3 食い下がりで役がなくなる場合は副露しない
- [x] #4 AI の副露判断に関するテストを追加する
<!-- AC:END -->



## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- `src/state/GameState.ts`（`processAiTurn` のクレーム処理）
- `src/state/GameState.test.ts`

---
<!-- SECTION:NOTES:END -->
