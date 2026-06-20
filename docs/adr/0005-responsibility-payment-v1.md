# ADR-0005: 責任払い v1 — 大三元・大四喜の包

## Status
Accepted / Implemented (2026-06-20)

## Context
責任払い（包）は初回の東風戦ルール拡張では意図的に除外されていた。通常のロン・ツモ精算とは異なる例外精算を導入するためである。次のルール拡張で v1 として狭い範囲で採用し、役満精算を一般的なリーチ麻雀の期待に近づける。

## Decision

### 対象範囲
v1 は**大三元**と**大四喜**のみを対象とする。四槓子および大明カン後の嶺上責任払いは対象外。

### 責任成立の判定 (`detectResponsibility`)
- ポンまたは大明カン時にのみ判定。暗槓・チーは対象外。
- **大三元**: 三元牌の公開刻子・槓子を既に2種類持ち、残りの三元牌をポン/大明カンしたとき、その打牌者を責任者とする。
- **大四喜**: 風牌の公開刻子・槓子を既に3種類持ち、残りの風牌をポン/大明カンしたとき、その打牌者を責任者とする。
- 判定は `src/state/claimPhase.ts` の `detectResponsibility()` で行う。

### Meld インターフェース拡張
```typescript
interface Meld {
  // ... existing fields
  calledFrom?: number;          // 鳴いた牌の打牌者 (0-3)
  responsibility?: 'daisangen' | 'daisuushii';  // 包成立時に設定
}
```
両フィールドとも optional であり、既存セーブデータとの後方互換性を保つ。

### 支払い調整 (`adjustForResponsibility`)
`src/game/scoring.ts` の `adjustForResponsibility()` で支払いを補正:

| 和了形態 | 放銃者 | 支払い |
|----------|--------|--------|
| ツモ | — | 責任者が全額支払う |
| ロン | 第三者 | 放銃者と責任者が折半（100点単位切り上げ） |
| ロン | 責任者自身 | 責任者が全額支払う（通常通り） |

責任払いの種類（大三元/大四喜）が和了した役満と一致しない場合は補正しない。

### 統合ポイント
- **Reducer** (`src/state/reducer.ts`): PON, DAIMINKAN アクションで `detectResponsibility` を呼び出し、Meld に `calledFrom` と `responsibility` を記録。TSUMO, RON アクションで `getResponsibilityInfo()` から責任情報を取得し `calculateScore()` に渡す。
- **Scoring** (`src/game/scoring.ts`): `calculateScore()` が `ScoreParams.responsiblePlayer` と `ScoreParams.responsibilityType` を受け取り、役満和了時に `adjustForResponsibility()` を呼ぶ。
- **UI** (`src/state/GameState.ts`): `formatResponsibilityMessage()` が `責任払い(大三元): P2` 形式のメッセージを生成。Reducer で局終了メッセージに追加し、`RoundHistoryItem.responsibilityMessage` に保存。

### テスト
6件の新規テストを追加:
- `GameState.test.ts`: calledFrom 記録、大三元責任検出、大四喜責任検出、1種のみで不成立、暗槓で不成立
- `scoring.test.ts`: ツモ全額、ロン折半、責任者放銃、種別不一致、パラメータなし通常
- `persistence.test.ts`: calledFrom/responsibility なしの旧セーブデータ互換

## Consequences
- 役満精算がより標準的なリーチ麻雀ルールに近づく
- Meld の optional フィールド追加により、将来の拡張（四槓子など）が容易
- 既存セーブデータはそのまま読み込める（後方互換）
- 責任払い未成立時は通常精算のまま（パフォーマンス・複雑性への影響なし）
