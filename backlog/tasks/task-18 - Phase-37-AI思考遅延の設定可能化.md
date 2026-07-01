---
id: TASK-18
title: 'Phase 37: AI思考遅延の設定可能化'
status: Done
assignee: []
created_date: '2026-06-30 23:54'
updated_date: '2026-07-01 00:02'
labels:
  - code-quality
dependencies: []
priority: low
ordinal: 18
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
AI の思考遅延が `setTimeout(..., 600)` の固定値になっており、調整できない。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `MAHJONG_AI_DELAY` 環境変数で遅延ミリ秒を上書きできるようにする
- [x] #2 デフォルト値は現在の `600ms` を維持する
- [x] #3 `README.md` に環境変数の説明を追記する
<!-- AC:END -->



## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- `src/ui/App.tsx` ✅
- `README.md` ✅
<!-- SECTION:NOTES:END -->
