---
id: TASK-5
title: 'Phase 24: Escキーで鳴き選択をキャンセル'
status: Done
assignee: []
created_date: '2026-06-30 23:54'
updated_date: '2026-07-01 00:02'
labels:
  - ux
dependencies: []
priority: medium
ordinal: 5
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
鳴き選択フェーズ（クレームフェーズ）でスペースキーに加え、Esc キーでもキャンセル（パス）できるようにする。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 クレームフェーズ中に Esc キーを押すと `PASS_CLAIM` アクションが発火する
- [x] #2 スペースキーの挙動は変わらない
- [x] #3 Ink の `useInput` で `key.escape` が正しく検知される
<!-- AC:END -->



## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- `src/ui/App.tsx`（クレームフェーズのキー入力ハンドラ）

---
<!-- SECTION:NOTES:END -->
