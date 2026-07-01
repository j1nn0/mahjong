---
id: TASK-2
title: 'Phase 21: ロン時の支払い者情報の修正'
status: Done
assignee: []
created_date: '2026-06-30 23:54'
updated_date: '2026-07-01 00:02'
labels:
  - bug
dependencies: []
priority: high
ordinal: 2
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`calcPayment()` がロン時に `from: []` を返しているため、UI で「誰が何点払ったか」が表示できない。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `calcPayment()` でロン時も `from: [{ player: loser, amount }]` を返すようにする
- [x] #2 ロン支払い者が `sr.payment.from` に含まれることをテストで確認する
- [x] #3 UI の支払い表示が正しく「Pn: X点」と表示されることを確認する
<!-- AC:END -->



## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- `src/game/scoring.ts`
- `src/game/scoring.test.ts`
- `src/ui/App.tsx`

---
<!-- SECTION:NOTES:END -->
