---
id: TASK-24
title: UI・セレクターの改善（ツモ・リーチボタンのアクティブ判定ガード、キー入力ガード）
status: Done
assignee: []
created_date: '2026-06-30 23:54'
updated_date: '2026-07-01 00:00'
labels:
  - selectors
  - ui
dependencies: []
priority: medium
ordinal: 24
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
UIおよびセレクターの挙動を改善し、誤操作や不親切な表示を防ぎます。
1. `canHumanTsumo` の判定が甘く、アガリ形や役の有無に関わらずツモ番で14枚あれば常に「ツモ」がアクティブ表示されてしまう問題を改善します。
2. `canHumanRiichi` の判定が甘く、ノーテンや鳴いている状態でも1000点以上あれば常に「リーチ」がアクティブ表示されてしまう問題を改善します。
3. `App.tsx` のキー入力ハンドラーにおいて、Selector のガード条件（例: `canHumanAnkan`）を無視してアクションを dispatch できてしまう問題を修正します。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `canHumanTsumo` を修正し、実際にツモあがりが可能（`canScoreTsumo` が true）な場合のみ `true` を返すようにする。
- [ ] #2 `canHumanRiichi` を修正し、門前かつテンパイ（手元の14枚からどれか1枚を切ってテンパイになる）かつ1000点以上持ちの場合のみ `true` を返すようにする。
- [ ] #3 `App.tsx` のキーハンドラー（`useInput` 内の `r` や `k` キー等）で、対応する Selector（`humanCanRiichi`, `humanCanKan` 等）が `true` の場合のみ dispatch を行うようにガードを追加する。
- [ ] #4 各セレクターの改善を検証するテストを追加する。
- [ ] #5 `pnpm test` がすべてパスすること。
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- `src/state/selectors.ts` および `src/ui/App.tsx` が主な修正対象となります。
<!-- SECTION:NOTES:END -->
