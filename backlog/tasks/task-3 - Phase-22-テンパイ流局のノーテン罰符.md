---
id: TASK-3
title: 'Phase 22: テンパイ流局のノーテン罰符'
status: Done
assignee: []
created_date: '2026-06-30 23:54'
updated_date: '2026-07-01 00:02'
labels:
  - rule
dependencies: []
priority: high
ordinal: 3
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
牌山が尽きたとき（流局）にノーテン罰符（3000点の等分）が発生しない問題を修正する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 流局時に全プレイヤーのテンパイ/ノーテン状態を判定する
- [x] #2 テンパイ者が 1〜3 人の場合、ノーテン者がテンパイ者に 3000点を等分して支払う
- [x] #3 テンパイ者が 0 人（全員ノーテン）または 4 人（全員テンパイ）の場合は点数移動なし
- [x] #4 テンパイ流局後の `roundEnded` 画面で各プレイヤーのテンパイ状態を表示する
- [x] #5 ノーテン罰符の計算・支払い処理にテストを追加する
<!-- AC:END -->



## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- `src/state/GameState.ts`（流局処理部分）
- `src/state/GameState.test.ts`
- `src/ui/App.tsx`

---
<!-- SECTION:NOTES:END -->
