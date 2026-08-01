---
id: TASK-8
title: 'Phase 27: AIの危険牌評価改善'
status: Done
assignee: []
created_date: '2026-06-30 23:54'
updated_date: '2026-07-01 00:02'
labels:
  - ai
dependencies: []
priority: medium
ordinal: 8
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
現在の `evaluateDanger` は現物・スジのみの判定。より実戦的な評価に改善する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 字牌（風牌・三元牌）について、場に出ていない枚数が少ない牌は危険度を上げる
- [x] #2 リーチ者の捨て牌に数牌の両端が多い場合、中張牌の危険度を上げる
- [x] #3 リーチ者でない相手についても、副露の構成から待ちを推測して危険度評価に反映する
- [x] #4 AI の打牌安全度評価に関するテストを追加する
<!-- AC:END -->



## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- `src/game/ai.ts`
- `src/game/ai.test.ts`

---
<!-- SECTION:NOTES:END -->
