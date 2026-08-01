---
id: TASK-21
title: 'Phase 40: 責任払い v1'
status: Done
assignee: []
created_date: '2026-06-30 23:54'
updated_date: '2026-06-30 23:56'
labels:
  - rule
dependencies: []
priority: high
ordinal: 21
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
既存計画で対象外としていた責任払いを、次期ルール拡張として追加する。v1 は大三元・大四喜の包に限定し、四槓子と大明カン後の嶺上責任払いは対象外とする。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `CONTEXT.md` に責任払いを用語として追加する
- [ ] #2 `docs/adr/0005-responsibility-payment-v1.md` に、責任払い v1 を採用する理由と対象範囲を記録する
- [ ] #3 `Meld` に鳴いた牌の打牌者を追跡できる optional 情報を追加し、既存セーブデータと互換にする
- [ ] #4 大三元は、三元牌の公開刻子・槓子を2組持つプレイヤーが残りの三元牌をポンまたは大明カンしたとき、その鳴きの打牌者を責任者として記録する
- [ ] #5 大四喜は、風牌の公開刻子・槓子を3組持つプレイヤーが残りの風牌をポンまたは大明カンしたとき、その鳴きの打牌者を責任者として記録する
- [ ] #6 責任払い対象役満をツモった場合、責任者が全額支払う
- [ ] #7 責任払い対象役満を第三者からロンした場合、放銃者と責任者が折半して支払う
- [ ] #8 責任者自身が放銃した場合、責任者が全額支払う
- [ ] #9 責任払い対象外の役満、包が未成立の大三元・大四喜、暗槓のみのケースでは通常支払いのままにする
- [ ] #10 局終了メッセージと対戦履歴に `責任払い: Pn` を短く表示する
- [ ] #11 責任払いの成立、ツモ支払い、ロン支払い、既存セーブ互換のテストを追加する
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- 文書では `コンピュータプレイヤー` を正語にし、実装名として既存の `ai.ts` / `processAiTurn` はそのまま扱う
- 責任払いの成立は claim 時点で判定し、和了時に成立役満と責任種別が一致した場合だけ支払いを補正する
- `Meld` に `calledFrom?: number` と `responsibility?: 'daisangen' | 'daisuushii'` を持たせる案を第一候補にする
- 支払い方針は、ツモ時は責任者が全額、ロン時は放銃者と責任者で折半とする
<!-- SECTION:NOTES:END -->
