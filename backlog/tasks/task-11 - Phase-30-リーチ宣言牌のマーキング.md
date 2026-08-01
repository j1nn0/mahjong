---
id: TASK-11
title: 'Phase 30: リーチ宣言牌のマーキング'
status: Done
assignee: []
created_date: '2026-06-30 23:54'
updated_date: '2026-07-01 00:02'
labels:
  - ux
dependencies: []
priority: medium
ordinal: 11
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
相手の捨て牌でリーチ宣言牌がどれかが視覚的に分からない。`Discard.isRiichi` フラグを UI で活用する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `DiscardView` でリーチ宣言牌（`isRiichi: true`）を `inverse` などで強調表示する
- [x] #2 `Discard` 型の情報が `DiscardView` まで伝わるよう Props を修正する
- [x] #3 リーチ宣言牌が視覚的に他の牌と区別できることを確認する
<!-- AC:END -->



## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- `src/ui/App.tsx`（`DiscardView`, `OpponentInfo`）
- `src/state/GameState.ts`（`PlayerData.discards` を `Discard[]` 化）
- `src/ui/DiscardView.tsx`（新規）
- `src/ui/DiscardView.test.tsx`（新規）

---
<!-- SECTION:NOTES:END -->
