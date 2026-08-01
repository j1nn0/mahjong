---
id: TASK-4
title: 'Phase 23: リーチ後の暗カン可否判定'
status: Done
assignee: []
created_date: '2026-06-30 23:54'
updated_date: '2026-07-01 00:02'
labels:
  - rule
dependencies: []
priority: high
ordinal: 4
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
リーチ後の暗カンは「待ちが変わらない場合に限り可能」というルールがあるが、現状は一律で不可になっている。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 リーチ後に暗カンを宣言しようとした場合、暗カン後の待ち牌が現在の待ちと同一かどうかを確認する
- [x] #2 待ちが変わらない暗カンのみプレイヤー（人間・AI）が宣言できるようにする
- [x] #3 待ちが変わる暗カンは操作不可（UI でボタン非表示、AI でも宣言しない）にする
- [x] #4 リーチ後暗カンの可否判定に関するテストを追加する
<!-- AC:END -->



## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- `src/state/GameState.ts`
- `src/ui/App.tsx`（`humanCanKan` の条件）
- `src/state/GameState.test.ts`

---
<!-- SECTION:NOTES:END -->
