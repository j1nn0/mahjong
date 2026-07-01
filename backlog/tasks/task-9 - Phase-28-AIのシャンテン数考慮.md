---
id: TASK-9
title: 'Phase 28: AIのシャンテン数考慮'
status: Done
assignee: []
created_date: '2026-06-30 23:54'
updated_date: '2026-07-01 00:02'
labels:
  - ai
dependencies: []
priority: medium
ordinal: 9
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
現在の AI はテンパイ可否（0 or 1）のみを評価し、テンパイできない場合は孤立牌ヒューリスティックに頼る。シャンテン数計算を追加して最短でテンパイになる打牌を選ぶ。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 シャンテン数計算関数 `calcShanten(hand)` を `src/game/agari.ts` に追加する
- [x] #2 テンパイできない場合、シャンテン数が最小になる打牌を選ぶようにする
- [x] #3 シャンテン数計算のユニットテストを追加する
<!-- AC:END -->



## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- `src/game/agari.ts`
- `src/game/agari.test.ts`（新規）
- `src/game/ai.ts`

---
<!-- SECTION:NOTES:END -->
