---
id: TASK-13
title: 'Phase 32: 待ち牌表示のトグル'
status: Done
assignee: []
created_date: '2026-06-30 23:54'
updated_date: '2026-07-01 00:02'
labels:
  - ux
dependencies: []
priority: medium
ordinal: 13
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
現状は待ち牌の具体名がアクションバーに常時表示される。トグルキーで表示/非表示を切り替えられるようにする。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `[W]` キーで待ち牌の具体的な牌名表示をトグルできるようにする
- [x] #2 デフォルトは種類数のみの表示（`待ち: N種`）
- [x] #3 アクションバーにトグルキーの説明を追加する
<!-- AC:END -->



## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- `src/ui/App.tsx`
- `src/ui/WaitsInfo.tsx`（新規）
<!-- SECTION:NOTES:END -->
