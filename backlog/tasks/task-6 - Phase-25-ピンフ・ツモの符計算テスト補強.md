---
id: TASK-6
title: 'Phase 25: ピンフ・ツモの符計算テスト補強'
status: Done
assignee: []
created_date: '2026-06-30 23:54'
updated_date: '2026-07-01 00:02'
labels:
  - bug
dependencies: []
priority: high
ordinal: 6
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ピンフ・ツモが「20符2翻」固定になることを明示するテストが不足している。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ピンフ・ツモの手牌で `calculateFu()` が 20 を返すことをテストする
- [x] #2 ピンフ・ロン（門前加符あり）の場合は 30符であることをテストする
- [x] #3 非ピンフ・ツモで 22符が 30符に丸め上げられることをテストする
<!-- AC:END -->



## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- `src/game/scoring.test.ts`

---
<!-- SECTION:NOTES:END -->
