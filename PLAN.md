# リーチ麻雀 東風戦ルール拡張計画

## 目的

東風戦だけを対象に、一般的なリーチ麻雀のルールを段階的に追加する。Phase 1〜39 では半荘、ウマ・オカ、責任払い、チョンボを対象外としていたが、次期ルール拡張では責任払い v1 を扱う。

## 合意済みルール方針

- 東風戦のみを対象にする
- ルール名は `リーチ麻雀` を正語にする
- アリアリを採用する
- チョンボは扱わず、不正操作はできるだけ操作不可として扱う
- ウマ・オカは扱わず、順位は素点で決める
- 責任払い v1 は大三元・大四喜に限定して扱う

## 実装済み（Phase 1〜39）

- [x] 用語整理・ADR・README 整備（Phase 1）
- [x] 食い替え禁止（Phase 2）
- [x] 途中流局: 九種九牌、四風連打、四家立直、四槓散了（Phase 3-6）
- [x] 複数ロン: ダブロン、三家和（Phase 7-8）
- [x] 流し満貫（Phase 9）
- [x] トビ終了（Phase 10）
- [x] totalHan 食い下がりバグ修正（Phase 11）
- [x] 天和・地和の追加（Phase 12）
- [x] 役満時のスコア表示修正（Phase 13）
- [x] チーの複数候補選択（Phase 14）
- [x] AIのカン宣言（Phase 15）
- [x] テンパイ表示（Phase 16）
- [x] カンドラの公開タイミング修正（Phase 17）
- [x] フリテン検証の確認と修正（Phase 18）
- [x] 最終結果画面の改善（Phase 19）
- [x] 天和処理の重複排除／リファクタリング（Phase 20）
- [x] ロン時の支払い者情報修正（Phase 21）
- [x] テンパイ流局のノーテン罰符（Phase 22）
- [x] リーチ後の暗カン可否判定（Phase 23）
- [x] Escキーで鳴き選択キャンセル（Phase 24）
- [x] ピンフ・ツモ符計算テスト補強（Phase 25）
- [x] AIのリーチ宣言（Phase 26）
- [x] AIの危険牌評価改善（Phase 27）
- [x] AIのシャンテン数考慮（Phase 28）
- [x] AIの副露宣言（Phase 29）
- [x] リーチ宣言牌のマーキング（Phase 30）
- [x] 捨て牌表示上限と画面崩れ対策（Phase 31）
- [x] 待ち牌表示のトグル（Phase 32）
- [x] キーボードショートカット一覧（Phase 33）
- [x] GameState.ts 分割（Phase 34）
- [x] App.tsx ロジック分離（Phase 35）
- [x] AIエラーハンドリング（Phase 36）
- [x] AI思考遅延の設定可能化（Phase 37）
- [x] UI/UX 総合改善（Phase 39）

最新の検証結果（Phase 39 完了時点）:

- `rtk pnpm test`: 14 files / 254 tests passed
- `rtk pnpm exec tsc --noEmit`: exit 0

---

## 次の作業

改善の優先順は「バグ・ルール上の問題 → UX改善（小規模） → AI改善 → UX改善（大規模） → コード品質」の順とする。

---

### Phase 21: ロン時の支払い者情報の修正（バグ）

`calcPayment()` がロン時に `from: []` を返しているため、UI で「誰が何点払ったか」が表示できない。

受け入れ条件:

- [x] `calcPayment()` でロン時も `from: [{ player: loser, amount }]` を返すようにする
- [x] ロン支払い者が `sr.payment.from` に含まれることをテストで確認する
- [x] UI の支払い表示が正しく「Pn: X点」と表示されることを確認する

想定変更ファイル:

- `src/game/scoring.ts`
- `src/game/scoring.test.ts`
- `src/ui/App.tsx`

---

### Phase 22: テンパイ流局のノーテン罰符（ルール）

牌山が尽きたとき（流局）にノーテン罰符（3000点の等分）が発生しない問題を修正する。

受け入れ条件:

- [x] 流局時に全プレイヤーのテンパイ/ノーテン状態を判定する
- [x] テンパイ者が 1〜3 人の場合、ノーテン者がテンパイ者に 3000点を等分して支払う
- [x] テンパイ者が 0 人（全員ノーテン）または 4 人（全員テンパイ）の場合は点数移動なし
- [x] テンパイ流局後の `roundEnded` 画面で各プレイヤーのテンパイ状態を表示する
- [x] ノーテン罰符の計算・支払い処理にテストを追加する

想定変更ファイル:

- `src/state/GameState.ts`（流局処理部分）
- `src/state/GameState.test.ts`
- `src/ui/App.tsx`

---

### Phase 23: リーチ後の暗カン可否判定（ルール）

リーチ後の暗カンは「待ちが変わらない場合に限り可能」というルールがあるが、現状は一律で不可になっている。

受け入れ条件:

- [x] リーチ後に暗カンを宣言しようとした場合、暗カン後の待ち牌が現在の待ちと同一かどうかを確認する
- [x] 待ちが変わらない暗カンのみプレイヤー（人間・AI）が宣言できるようにする
- [x] 待ちが変わる暗カンは操作不可（UI でボタン非表示、AI でも宣言しない）にする
- [x] リーチ後暗カンの可否判定に関するテストを追加する

想定変更ファイル:

- `src/state/GameState.ts`
- `src/ui/App.tsx`（`humanCanKan` の条件）
- `src/state/GameState.test.ts`

---

### Phase 24: Escキーで鳴き選択をキャンセル（UX）

鳴き選択フェーズ（クレームフェーズ）でスペースキーに加え、Esc キーでもキャンセル（パス）できるようにする。

受け入れ条件:

- [x] クレームフェーズ中に Esc キーを押すと `PASS_CLAIM` アクションが発火する
- [x] スペースキーの挙動は変わらない
- [x] Ink の `useInput` で `key.escape` が正しく検知される

想定変更ファイル:

- `src/ui/App.tsx`（クレームフェーズのキー入力ハンドラ）

---

### Phase 25: ピンフ・ツモの符計算テスト補強（バグ予防）

ピンフ・ツモが「20符2翻」固定になることを明示するテストが不足している。

受け入れ条件:

- [x] ピンフ・ツモの手牌で `calculateFu()` が 20 を返すことをテストする
- [x] ピンフ・ロン（門前加符あり）の場合は 30符であることをテストする
- [x] 非ピンフ・ツモで 22符が 30符に丸め上げられることをテストする

想定変更ファイル:

- `src/game/scoring.test.ts`

---

### Phase 26: AIのリーチ宣言（AI改善）

現在の AI はテンパイしても絶対にリーチを宣言しない。点数効率のため、シンプルなリーチ判断を追加する。

受け入れ条件:

- [x] `processAiTurn` でツモ後テンパイかつ 1000 点以上持っている場合、リーチを宣言する
- [x] リーチ宣言可能でも門前でない場合（副露あり）はリーチしない
- [x] AI がリーチを宣言するシナリオをテストする

想定変更ファイル:

- `src/state/GameState.ts`（`processAiTurn`）
- `src/state/GameState.test.ts`

---

### Phase 27: AIの危険牌評価改善（AI改善）

現在の `evaluateDanger` は現物・スジのみの判定。より実戦的な評価に改善する。

受け入れ条件:

- [x] 字牌（風牌・三元牌）について、場に出ていない枚数が少ない牌は危険度を上げる
- [x] リーチ者の捨て牌に数牌の両端が多い場合、中張牌の危険度を上げる
- [x] リーチ者でない相手についても、副露の構成から待ちを推測して危険度評価に反映する
- [x] AI の打牌安全度評価に関するテストを追加する

想定変更ファイル:

- `src/game/ai.ts`
- `src/game/ai.test.ts`

---

### Phase 28: AIのシャンテン数考慮（AI改善）

現在の AI はテンパイ可否（0 or 1）のみを評価し、テンパイできない場合は孤立牌ヒューリスティックに頼る。シャンテン数計算を追加して最短でテンパイになる打牌を選ぶ。

受け入れ条件:

- [x] シャンテン数計算関数 `calcShanten(hand)` を `src/game/agari.ts` に追加する
- [x] テンパイできない場合、シャンテン数が最小になる打牌を選ぶようにする
- [x] シャンテン数計算のユニットテストを追加する

想定変更ファイル:

- `src/game/agari.ts`
- `src/game/agari.test.ts`（新規）
- `src/game/ai.ts`

---

### Phase 29: AIの副露宣言（AI改善）

`processAiTurn` のクレーム処理で、ロン・大明カンは即座に宣言し、チー・ポンは「タンヤオ狙い or テンパイ形成」になる場合のみ宣言するようにした。

受け入れ条件:

- [x] タンヤオを目指している（手牌に字牌・端牌が少ない）場合、チー・ポンを宣言する
- [x] ポン後にテンパイになる場合は必ずポンを宣言する
- [x] 食い下がりで役がなくなる場合は副露しない
- [x] AI の副露判断に関するテストを追加する

最新の検証結果（Phase 29 完了時点）:

- `rtk pnpm test`: 10 files / 193 tests passed
- `rtk pnpm exec tsc --noEmit`: exit 0

想定変更ファイル:

- `src/state/GameState.ts`（`processAiTurn` のクレーム処理）
- `src/state/GameState.test.ts`

---

### Phase 30: リーチ宣言牌のマーキング（UX）

相手の捨て牌でリーチ宣言牌がどれかが視覚的に分からない。`Discard.isRiichi` フラグを UI で活用する。

受け入れ条件:

- [x] `DiscardView` でリーチ宣言牌（`isRiichi: true`）を `inverse` などで強調表示する
- [x] `Discard` 型の情報が `DiscardView` まで伝わるよう Props を修正する
- [x] リーチ宣言牌が視覚的に他の牌と区別できることを確認する

最新の検証結果（Phase 30 完了時点）:

- `rtk pnpm test`: 11 files / 203 tests passed
- `rtk pnpm exec tsc --noEmit`: exit 0

想定変更ファイル:

- `src/ui/App.tsx`（`DiscardView`, `OpponentInfo`）
- `src/state/GameState.ts`（`PlayerData.discards` を `Discard[]` 化）
- `src/ui/DiscardView.tsx`（新規）
- `src/ui/DiscardView.test.tsx`（新規）

---

### Phase 31: 捨て牌の表示上限と画面崩れ対策（UX）

終盤になると捨て牌が多くなり、狭いターミナルでは表示が折り返して画面が崩れることがある。

受け入れ条件:

- [x] `DiscardView` に最大表示枚数（例: 直近 18 枚）を設ける
- [x] 上限を超えた場合は古い捨て牌を省略し `...` などで件数を示す
- [x] 表示上限を `terminalWidth` に応じて動的に計算する

想定変更ファイル:

- `src/ui/DiscardView.tsx`: `DiscardViewProps` に `terminalWidth` / `compact` 追加、`computeMaxDisplayCount` 追加、省略ロジック実装
- `src/ui/App.tsx`: `OpponentInfoProps` に `terminalWidth` / `compact` 追加、全 `OpponentInfo` / `DiscardView` に渡すよう修正
- `src/ui/DiscardView.test.tsx`: `computeMaxDisplayCount` テスト、省略 visual/structure テスト追加

検証結果 (2026-06-19):

```
✓ src/ui/DiscardView.test.tsx (22 tests) 20ms
Test Files  11 passed (11)
     Tests  217 passed (217)
$ tsc --noEmit (no output)
```

---

### Phase 32: 待ち牌表示のトグル（UX）

現状は待ち牌の具体名がアクションバーに常時表示される。トグルキーで表示/非表示を切り替えられるようにする。

受け入れ条件:

- [x] `[W]` キーで待ち牌の具体的な牌名表示をトグルできるようにする
- [x] デフォルトは種類数のみの表示（`待ち: N種`）
- [x] アクションバーにトグルキーの説明を追加する

想定変更ファイル:

- `src/ui/App.tsx`
- `src/ui/WaitsInfo.tsx`（新規）

検証結果 (2026-06-19):

```
✓ src/ui/WaitsInfo.test.tsx (3 tests) 4ms
Test Files  12 passed (12)
     Tests  220 passed (220)
$ tsc --noEmit (no output)
```

---

### Phase 33: キーボードショートカット一覧の整備（UX）

ゲーム中に利用可能なキーの説明が不完全で、初見のプレイヤーが操作に迷う。

受け入れ条件:

- [x] プレイ中画面のフッターに現在のフェーズで有効なキー一覧を表示する
- [x] クレームフェーズでは `L:ロン C:チー P:ポン K:カン Space/Esc:パス ←→:選択` を表示する
- [x] プレイフェーズでは `←→:選択 Enter:打牌 T:ツモ R:リーチ K:カン Y:九種 Q:終了` を表示する

想定変更ファイル:

- `src/ui/App.tsx`
- `src/ui/KeyLegend.tsx`（新規）

検証結果 (2026-06-19):

```
✓ src/ui/KeyLegend.test.tsx (2 tests) 5ms
Test Files  13 passed (13)
     Tests  222 passed (222)
$ tsc --noEmit (no output)
```

---

### Phase 34: GameState.ts の分割（コード品質）

`src/state/GameState.ts` が 1673 行に肥大化しており、可読性・保守性が低い。責務ごとにファイルを分割する。

受け入れ条件:

- [x] アクションハンドラ群を `src/state/reducer.ts` に分離する
- [x] 局終了・清算処理を `src/state/finishRound.ts` に分離する
- [x] クレームフェーズ処理を `src/state/claimPhase.ts` に分離する
- [x] 分割後もすべての既存テストが通過する

変更ファイル:

- `src/state/GameState.ts`（2018行 → 654行に縮小、再エクスポート追加）
- `src/state/types.ts`（新規 158行: 型定義を分離し循環依存を回避）
- `src/state/reducer.ts`（新規 818行: gameReducer）
- `src/state/finishRound.ts`（新規 499行: 局終了・清算・途中流局）
- `src/state/claimPhase.ts`（新規 160行: クレーム収集・処理）

検証結果:
- `pnpm test`: 13 files / 222 tests passed
- `tsc --noEmit`: exit 0

---

### Phase 35: App.tsx のロジック分離（コード品質）

`humanCanRiichi`、`humanCanKan`、`humanWaits` などのゲームロジック計算が UI コンポーネント内に混在しており、テストが困難。

受け入れ条件:

- [x] プレイヤーの操作可能な状態を返すセレクター関数群を `src/state/selectors.ts` に切り出す
- [x] `App.tsx` はセレクター関数を呼び出すだけにする
- [x] 切り出したセレクター関数のユニットテストを追加する

想定変更ファイル:

- `src/state/selectors.ts`（新規）✅
- `src/ui/App.tsx` ✅
- `src/state/selectors.test.ts`（新規）✅

検証結果:
- `pnpm test`: 14 files / 251 tests passed
- `tsc --noEmit`: exit 0

---

### Phase 36: AIエラーハンドリング（コード品質）

`processAiTurn()` が予期せぬ例外を投げた場合、Ink がクラッシュする恐れがある。

受け入れ条件:

- [x] AI 処理の `useEffect` 内を `try-catch` で包む
- [x] エラー発生時は `state.message` にエラー内容を表示し、ゲームを継続できる状態にする

想定変更ファイル:

- `src/ui/App.tsx`（AI 処理 useEffect）✅
- `src/state/types.ts`（`SET_MESSAGE` アクション追加）✅
- `src/state/reducer.ts`（`SET_MESSAGE` ハンドラ追加）✅
- `src/state/GameState.test.ts`（`SET_MESSAGE` テスト追加）✅

検証結果:
- `pnpm test`: 14 files / 252 tests passed
- `tsc --noEmit`: exit 0

---

### Phase 37: AI思考遅延の設定可能化（コード品質）

AI の思考遅延が `setTimeout(..., 600)` の固定値になっており、調整できない。

受け入れ条件:

- [x] `MAHJONG_AI_DELAY` 環境変数で遅延ミリ秒を上書きできるようにする
- [x] デフォルト値は現在の `600ms` を維持する
- [x] `README.md` に環境変数の説明を追記する

想定変更ファイル:

- `src/ui/App.tsx` ✅
- `README.md` ✅

検証結果:
- `pnpm test`: 14 files / 252 tests passed
- `tsc --noEmit`: exit 0

---

### Phase 38: 最終検証

- [x] `rtk pnpm test` が全て通過する
- [x] `rtk pnpm exec tsc --noEmit` がエラーなく通過する
- [ ] `pnpm start` で正常に起動し、1 東風戦をプレイしてエラーが発生しないことを確認する
- [x] すべての機能追加とバグ修正が完了したことを `PLAN.md` 上で確認し、チェックを入れる

検証結果:
- `pnpm test`: 14 files / 254 tests passed
- `tsc --noEmit`: exit 0
- Phase 1–39: 全受け入れ条件チェック済み ✅
- `pnpm start` の動作確認: **要ユーザー確認**

---

### Phase 39: UI/UX 総合改善（UX）

ゲーム全体の視認性・操作性・情報量を向上させる包括的な UI/UX 改善。

受け入れ条件:

- [x] **巡目把握**: 残り巡数とリーチ棒を常時表示（`TurnInfo` コンポーネント）
- [x] **ターン進行ログ**: 直近5件の捨て牌履歴を表示（`TurnLogView` コンポーネント、`useRef` で追跡）
- [x] **テンパイ状況**: シャンテン数（`calcShanten`）＋待ち牌を手牌下に常時表示（トグル廃止）
- [x] **相手の状態変化**: リーチ表示を bold yellow に変更、メルドなし時は副露行を非表示
- [x] **操作の直感性**: `KeyLegend` を色付きキー文字でリッチ化
- [x] **色の使い方**: ドラ表示牌を bold + color、選択牌を `inverse` → `underline`+`bold`、赤ドラ牌を `bold`+赤、メッセージを太字で表示
- [x] **レイアウト順**: playing/claiming 両画面を ラウンド→ドラ→相手→捨て牌→ログ→自分→手牌→巡目→アクション→シャンテン＋待ち→メッセージ→キー凡例 に再構成
- [x] `MeldView`: 空メルド時に `null` を返しノイズ削減
- [x] `ActionBar`: シンプル化（WaitsInfo・message 削除）

変更ファイル:

- `src/ui/App.tsx`: HandView 選択ハイライト変更、TurnInfo/TurnLogView 追加、DoraView 太字化、OpponentInfo リーチ bold yellow/副露条件表示、ActionBar 簡素化、shanten+waits 常時表示、layout 再構成
- `src/ui/KeyLegend.tsx`: 色付きキー文字によるリッチ表示
- `src/ui/KeyLegend.test.tsx`: 新 KeyLegend に合わせてテスト更新

検証結果 (2026-06-19):

- `pnpm test`: 14 files / 254 tests passed
- `tsc --noEmit`: exit 0

---

### Phase 40: 責任払い v1（ルール）

既存計画で対象外としていた責任払いを、次期ルール拡張として追加する。v1 は大三元・大四喜の包に限定し、四槓子と大明カン後の嶺上責任払いは対象外とする。

受け入れ条件:

- [ ] `CONTEXT.md` に責任払いを用語として追加する
- [ ] `docs/adr/0005-responsibility-payment-v1.md` に、責任払い v1 を採用する理由と対象範囲を記録する
- [ ] `Meld` に鳴いた牌の打牌者を追跡できる optional 情報を追加し、既存セーブデータと互換にする
- [ ] 大三元は、三元牌の公開刻子・槓子を2組持つプレイヤーが残りの三元牌をポンまたは大明カンしたとき、その鳴きの打牌者を責任者として記録する
- [ ] 大四喜は、風牌の公開刻子・槓子を3組持つプレイヤーが残りの風牌をポンまたは大明カンしたとき、その鳴きの打牌者を責任者として記録する
- [ ] 責任払い対象役満をツモった場合、責任者が全額支払う
- [ ] 責任払い対象役満を第三者からロンした場合、放銃者と責任者が折半して支払う
- [ ] 責任者自身が放銃した場合、責任者が全額支払う
- [ ] 責任払い対象外の役満、包が未成立の大三元・大四喜、暗槓のみのケースでは通常支払いのままにする
- [ ] 局終了メッセージと対戦履歴に `責任払い: Pn` を短く表示する
- [ ] 責任払いの成立、ツモ支払い、ロン支払い、既存セーブ互換のテストを追加する

実装方針:

- 文書では `コンピュータプレイヤー` を正語にし、実装名として既存の `ai.ts` / `processAiTurn` はそのまま扱う
- 責任払いの成立は claim 時点で判定し、和了時に成立役満と責任種別が一致した場合だけ支払いを補正する
- `Meld` に `calledFrom?: number` と `responsibility?: 'daisangen' | 'daisuushii'` を持たせる案を第一候補にする
- 支払い方針は、ツモ時は責任者が全額、ロン時は放銃者と責任者で折半とする
