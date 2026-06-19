# Mahjong

React Ink と TypeScript で作る、ターミナル上の一人用リーチ麻雀ゲームです。

あなたが、3人のコンピュータプレイヤーと東風戦を完走できることを当面の完成基準にしています。全役・全特殊ルールの完全対応よりも、まずは局進行、点数の支払い、供託、本場、親継続、続きから再開、最終順位まで破綻せず進むことを優先しています。

## Current Scope

実装済み、または現在の主対象:

- 1人用の四人麻雀
- 東風戦の局進行
- 親継続、オーラス親トップ終了、本場、供託
- ロン、ツモ、流局、聴牌、聴牌料
- リーチ、リーチ後ツモ切り
- チー、ポン、カン
- 食い替え禁止
- ドラ、赤ドラ、裏ドラ、カンドラ
- 一発、海底、河底、嶺上開花、搶槓
- 九種九牌、四風連打、四家立直、四槓散了
- ダブロン、三家和
- 流し満貫
- トビ終了
- 天和、地和
- 七対子、国士無双を含むあがり形判定
- 自分の捨て牌、同巡見逃し、リーチ後見逃しによるフリテン
- コンピュータプレイヤーの自動打牌
- AI副露判断（タンヤオ狙い・テンパイ狙いのチー/ポン）
- 起動時の保存済み対戦の続きから再開
- あなたと他家の捨て牌、鳴き・カンした牌の表示
- リーチ宣言牌の強調表示
- 捨て牌表示の動的上限制御と画面崩れ対策
- 巡目表示（残り巡数・リーチ棒を常時太字表示）
- ターン進行ログ（直近5件の捨て牌履歴）
- シャンテン数・待ち牌の常時表示
- ドラ表示牌・赤ドラの色強調表示
- 選択牌のアンダーライン＋太字ハイライト
- 相手リーチ表示の太字黄色化、メルドなし時は副露行非表示
- 色付きキー凡例（KeyLegend）

当面の範囲外:

- 半荘
- ウマ、オカ
- 責任払いなどの特殊ルール
- チョンボ

方針の背景は [ADR 0001](docs/adr/0001-finish-east-only-game-before-full-rules.md) と [ADR 0002](docs/adr/0002-expand-east-game-with-common-riichi-rules.md) を参照してください。

## Requirements

- Node.js
- pnpm

## Setup

```bash
pnpm install
```

## Run

```bash
pnpm start
```

保存済み対戦がある場合、起動時に続きから再開するか、新しい対戦を始めるかを選べます。保存ファイルは `.mahjong-save.json` です。

AIの思考遅延は `MAHJONG_AI_DELAY` 環境変数（ミリ秒）で調整できます。デフォルトは `600` です:

```bash
MAHJONG_AI_DELAY=200 pnpm start   # 高速
MAHJONG_AI_DELAY=1000 pnpm start  # 低速
```

## Controls

通常の打牌:

- `←` / `→`: 手牌カーソル移動。端まで行くと反対側へ回り込みます。
- `1`-`9`: 手牌を番号で選択
- `Enter`: 選択中の牌を打牌
- `R`: リーチ
- `T`: ツモ
- `K`: カン（暗槓・加槓）
- `Y`: 九種九牌
- `Q`: ゲームを終了

鳴き:

- `←` / `→`: 鳴き候補の選択
- `L`: ロン
- `C`: チー
- `P`: ポン
- `K`: 大明カン
- `Space` / `Esc`: 鳴かずにパス

局終了後:

- `N` / `Enter` / `Space`: 次局へ進む

対戦終了後:

- `Space` / `Q`: 新しい対戦を開始

## Development

```bash
pnpm test
pnpm test:watch
pnpm exec tsc --noEmit
```

`pnpm test` は Vitest のユニットテストを一回実行します。`pnpm exec tsc --noEmit` は TypeScript の型チェックだけを実行します。

## Project Structure

```text
src/
  game/        牌、あがり形、役、点数、ドラ、AI
  state/       対戦状態（types, reducer, selectors）、局進行（finishRound, claimPhase）、保存と再開
  ui/          Ink/React のターミナルUI（App, DiscardView, WaitsInfo, KeyLegend 他）
  index.tsx    エントリーポイント
docs/adr/      重要な設計判断
CONTEXT.md     プロジェクト用語集
```

## Notes

このプロジェクトはまだ開発中です。現時点では「リーチ麻雀のすべてのルールを正確に再現すること」ではなく、「東風戦を最後まで遊べる土台を固め、一般的な東風戦ルールを段階的に広げること」を優先しています。
