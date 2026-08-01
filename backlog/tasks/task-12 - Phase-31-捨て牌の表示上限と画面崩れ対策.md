---
id: TASK-12
title: 'Phase 31: 捨て牌の表示上限と画面崩れ対策'
status: Done
assignee: []
created_date: '2026-06-30 23:54'
updated_date: '2026-07-01 00:02'
labels:
  - ux
dependencies: []
priority: medium
ordinal: 12
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
終盤になると捨て牌が多くなり、狭いターミナルでは表示が折り返して画面が崩れることがある。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `DiscardView` に最大表示枚数（例: 直近 18 枚）を設ける
- [x] #2 上限を超えた場合は古い捨て牌を省略し `...` などで件数を示す
- [x] #3 表示上限を `terminalWidth` に応じて動的に計算する
<!-- AC:END -->



## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- `src/ui/DiscardView.tsx`: `DiscardViewProps` に `terminalWidth` / `compact` 追加、`computeMaxDisplayCount` 追加、省略ロジック実装
- `src/ui/App.tsx`: `OpponentInfoProps` に `terminalWidth` / `compact` 追加、全 `OpponentInfo` / `DiscardView` に渡すよう修正
- `src/ui/DiscardView.test.tsx`: `computeMaxDisplayCount` テスト、省略 visual/structure テスト追加
<!-- SECTION:NOTES:END -->
