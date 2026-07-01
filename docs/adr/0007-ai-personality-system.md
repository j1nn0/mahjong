---
status: 完了
---

# ADR 0007: AI Personality System — コンピュータプレイヤーの性格付け

## Context

コンピュータプレイヤーの性能向上と性格（打ち方の違い）を付けたい。現状の AI には以下の問題がある:

1. **全コンピュータプレイヤーが同一ロジック**: 3人の対戦相手に個性がなく、全員が同じ打牌・副露・リーチ判断をする。
2. **判断が単純**: 副露条件は「タンヤオ狙い」か「テンパイするか」のみ。リーチは単騎待ちを拒否する。打牌は危険度と孤立牌優先で、手の価値を考慮しない。
3. **押し引きがない**: 危険牌でも手の価値が高ければ押す、という判断ができない。

要件:

- コンピュータプレイヤーごとに個別の性格パラメータを持つ
- ゲーム開始前にランダム割り当て or ユーザーカスタム可能
- デフォルトの強さは現行 AI と同等
- パラメータは打点評価＋押し引きモデルに反映される
- 簡易打点評価から始め、後から拡張可能にする

## Decision

### 1. 性格の格納場所: PlayerData に `personality: AiPersonality | null`

人間プレイヤーは `null`、コンピュータプレイヤーは `AiPersonality` を持つ。

```ts
interface PlayerData {
  hand, melds, discards, riichi, ...
  personality: AiPersonality | null; // 新規
}
```

**他の選択肢と比較して:**
- `GameState.aiConfigs` 別配列: プレイヤー番号との対応管理が煩雑。セーブ/ロードで別途直列化が必要。
- state 外に保持: 永続化の仕組みが別途必要。
- **PlayerData に含める**のが最も単純で、既存の永続化・テスト機構に乗る。

### 2. 5軸の性格パラメータ

| パラメータ | 範囲 | デフォルト | 現行AI相当値 | 意味 |
|---|---|---|---|---|
| `aggression` | 1-5 | 2 | 2 | 押しの積極性。高いほど放銃覚悟で押す |
| `riskTolerance` | 1-5 | 2 | 2 | 危険牌許容度。高いほど危険牌ペナルティが小さい（危険牌が加点されることはない: `Math.max(0, 4 - riskTolerance)`） |
| `meldFrequency` | 1-5 | 2 | 2 | 鳴き頻度。高いほどタンヤオ条件外でも鳴く |
| `riichiFrequency` | 1-5 | 2 | 2 | リーチ頻度。高いほど単騎・安手でもリーチ |
| `handValueFocus` | 1-5 | 3 | 3 | 打点志向。低い=スピード優先、高い=高打点優先 |

デフォルト値 `(2,2,2,2,3)` は `isLegacyPersonality()` で検出され、従来の `aiChooseDiscard()` ロジックを通る。

### 3. 押し引きモデル（実装）

```ts
const riskPenalty = Math.max(0, 4 - riskTolerance); // clamp: 危険牌が加点されることはない
const score = handValue × winProb × aggression − danger × riskPenalty;
```

補足:
- `handValue < floorValue(handValueFocus)` の場合は手の価値不十分として押さない（floorValue: 5→3900, 4→2000, 1-3→0）
- `handValue > 0 && danger === 0` の場合は安全牌なので常に押す
- BALANCER は `isLegacyPersonality()` ガードにより personality 分岐に入らず、従来ロジックを通る

### 4. 簡易打点評価（実装）

`estimateMinPoints()` として実装。`fullScore()` は実行せず以下を簡易推定:
- ドラ枚数から打点を計算
- 確定役（リーチ・断么九・翻牌）の翻数を加算
- 面前/副露の区別はしない（タンヤオは副露でも検出）
- 推定点数早見表: 0飜→0, 1飜→1000, 2飜→2000, 3飜→3900, 4飜→7700, 5飜以上→8000
- 打牌ごとに `hand.filter(h => h !== tile)` で評価
- 自分の副露は `opponentMelds[selfIndex]` から取得
- 後から `fullScore()` ベースの精確な評価に差し替え可能な公開インターフェースを維持

### 5. ゲーム開始前 UI

3スロット（P2, P3, P4）に対して個別設定:
- テンプレート一覧から選択（バランサー、守りの名人、攻めの一点張り、手役派、鳴きの達人）
- カスタムで各パラメータを 1-5 で調整（Enter でカスタムモード切替）
- R キーですべてランダム割り当て
- S キーで開始、Q でキャンセル

### 6. dealRound での維持

`dealRound()` がプレイヤーを再構築する際に `state.players[i].personality` をコピーする。
P1（人間）は常に `null`。
これがないと `START_GAME` で設定した性格が配牌時に消失する。

### 7. handValueFocus の適用範囲

- **押し引き判断**: `handValueFocus ≥ 5` → 3900点未満で「引く」、`handValueFocus ≥ 4` → 2000点未満で「引く」、それ以下は制限なし
- **リーチ判断**: 同様の閾値を `riichiValueFloorForFocus()` で適用

## Consequences

### ポジティブ

- 3人のコンピュータプレイヤーに明確な性格の差が出る
- ランダム割り当て時は毎回異なる戦略の相手と対戦可能
- PlayerData に含めたためセーブ/ロード・テストが既存機構で動作
- BALANCER は `isLegacyPersonality()` ガードにより現行同等の強さを維持
- 351 テスト通過、型チェック通過

### ネガティブ

- 全 PlayerData 生成箇所の修正が必要
- 押し引きモデルに新たなチューニングパラメータが増える
- 簡易打点評価は実際の得点と乖離する可能性がある
- パラメータと挙動の対応をテストで保証する必要がある
- `Math.max(0, 4 - riskTolerance)` の clamp を理解していないと「riskTolerance 5 なら安全」と誤解する可能性

### 未スコープ

- 途中変更（ゲーム中の性格変更）はサポートしない
- 学習・適応機能は持たない
- リーチ後の打法（待ち替え判断など）は現行ロジックを維持
