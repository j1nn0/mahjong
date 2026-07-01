---
id: TASK-22
title: AIロジックの改善（自己危険度評価・スジ判定の修正）
status: Done
assignee: []
created_date: '2026-06-30 23:54'
updated_date: '2026-07-01 00:02'
labels:
  - gameplay
  - ai
dependencies: []
priority: high
ordinal: 22
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
AIが切る牌を決定する際のロジックを改善します。
1. `evaluateDanger` で手番プレイヤー（自分自身）の情報も「対戦相手」として巻き込んで評価してしまうため、自分がリーチしていると手牌の全牌が危険判定されて安全牌選択が壊れる問題を修正します。
2. 切られた牌に対して、そのスジグループ全体を一括してスジ（安全）と判定してしまうため、本来安全ではない牌（片スジなど）をスジと判定してしまう不正確なスジ判定ロジックを修正します。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `aiChooseDiscard` または `evaluateDanger` の中で、手番プレイヤー（自分自身）のデータを危険度評価のループから除外する。
- [x] #2 自分がリーチしたことによって、手牌の全ての牌の危険度が `8 (DANGER_HIGH)` などに不当に上がらないことを検証するテストケースを追加する。
- [x] #3 スジ判定ロジック（`sujiIndices` や `discardSuji` の使われ方）を、麻雀の本来の安全牌ルール（中スジ、端牌のスジなど）に基づいて正しく処理するように修正する。
- [x] #4 正しいスジ判定を検証するユニットテストを追加する。
- [x] #5 `pnpm test` がすべてパスすること。
<!-- AC:END -->



## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- `src/game/ai.ts` の `evaluateDanger` や `sujiIndices` 辺りが修正対象となります。
<!-- SECTION:NOTES:END -->
