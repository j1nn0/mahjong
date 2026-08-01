---
id: TASK-14
title: 'Phase 33: キーボードショートカット一覧の整備'
status: Done
assignee: []
created_date: '2026-06-30 23:54'
updated_date: '2026-07-01 00:02'
labels:
  - ux
dependencies: []
priority: medium
ordinal: 14
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ゲーム中に利用可能なキーの説明が不完全で、初見のプレイヤーが操作に迷う。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 プレイ中画面のフッターに現在のフェーズで有効なキー一覧を表示する
- [x] #2 クレームフェーズでは `L:ロン C:チー P:ポン K:カン Space/Esc:パス ←→:選択` を表示する
- [x] #3 プレイフェーズでは `←→:選択 Enter:打牌 T:ツモ R:リーチ K:カン Y:九種 Q:終了` を表示する
<!-- AC:END -->



## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- `src/ui/App.tsx`
- `src/ui/KeyLegend.tsx`（新規）
<!-- SECTION:NOTES:END -->
