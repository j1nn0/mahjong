---
id: TASK-25
title: 東風戦の完全対応とルール不備の修正
status: Done
assignee: []
created_date: '2026-06-30 23:54'
updated_date: '2026-07-01 00:02'
labels:
  - rules
dependencies: []
priority: high
ordinal: 25
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
grill-with-docs セッションを通じて東風戦の終了ルールを仕様として固め、コードベースに残っていた3つのルール不備を修正する。修正後は「東風戦を完走できる」状態を満たすすべての終了条件が標準リーチ麻雀ルールに準拠していることをテストで保証する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 途中流局（九種九牌・四風連打・四家立直・四槓散了・三家和）後は常に**親継続**（連荘）となり、本場が 1 つ増える
- [x] #2 南4局でトップが30000点未満のまま親が連荘した場合、ゲームを**続行**する（南4局1本場へ進む）
- [x] #3 途中流局時は**サドンデス判定をスキップ**し、トビ（0点未満）が発生した場合のみ即時終了する
- [x] #4 上記3点をカバーするユニットテストを追加し、`pnpm test` がすべてパスする
- [x] #5 既存の途中流局テスト（ディーラー変数のアサーション）を親継続を反映した形に修正する
- [x] #6 `CONTEXT.md` の「親継続」と「途中流局」の定義を新仕様に合わせて更新する
- [x] #7 `README.md` を最新の実装状況に合わせて更新する（責任払いv1を実装済みへ移動、東風戦ルールの詳細を追記）
- [x] #8 `docs/adr/0002` の途中流局ディーラー挙動の記述を訂正する
- [x] #9 `docs/adr/0006` を新規作成し、今回の3つの設計判断を記録する
<!-- AC:END -->



## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- `finishRound` に `isAbortiveDraw?: boolean` 引数を追加し、`true` の場合は30000点によるゲーム終了判定（サドンデス・南4局打ち切り）を行わない
- `finishAbortiveDraw` を `dealerContinues = true`、`isAbortiveDraw = true` で呼び出すよう変更
- 南4局の強制終了条件を `roundNumber >= 4` から `roundNumber >= 4 && !dealerContinues` に変更
- トビ判定（`points < 0`）は `isAbortiveDraw` の影響を受けない（常に有効）
- 0点ちょうどはトビ扱いせず、ゲームを続行する（今回確認・仕様確定）
<!-- SECTION:NOTES:END -->
