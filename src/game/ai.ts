import { type Tile, Suit } from './types.js';
import { sortHand } from './tiles.js';
import { findTenpaiTiles, tileToIndex, indexToTile } from './agari.js';

// ── Suji helper ──────────────────────────────────────────────────────

/** 数牌のsujiグループ: { [base: number]: number[] } */
const sujiMap: Record<number, number[]> = {
  1: [1, 4, 7], 4: [1, 4, 7], 7: [1, 4, 7],
  2: [2, 5, 8], 5: [2, 5, 8], 8: [2, 5, 8],
  3: [3, 6, 9], 6: [3, 6, 9], 9: [3, 6, 9],
};

/** 数牌のsujiグループ(インデックス版): 各インデックスに対応するsujiインデックス配列 */
function sujiIndices(idx: number): number[] {
  const base = idx % 9 + 1;
  return (sujiMap[base] ?? []).map(v => Math.floor(idx / 9) * 9 + v - 1);
}

// ── Danger evaluation ────────────────────────────────────────────────

/**
 * ある牌の危険度を評価する（0=安全, 高いほど危険）。
 * stateの全プレイヤーの捨て牌とリーチ状態を元に評価。
 */
export function evaluateDanger(
  tile: Tile,
  opponentDiscards: readonly (readonly Tile[])[],
  opponentRiichi: readonly boolean[],
): number {
  const idx = tileToIndex(tile);
  let worst = 0;

  for (let p = 0; p < opponentDiscards.length; p++) {
    const discards = opponentDiscards[p]!;
    const riichi = opponentRiichi[p] ?? false;
    const d = dangerForPlayer(tile, idx, discards, riichi);
    if (d > worst) worst = d;
  }

  return worst;
}

const DANGER_GENBUTSU = 0;
const DANGER_SUJI = 2;
const DANGER_LOW = 4;
const DANGER_HIGH = 8;

function dangerForPlayer(
  tile: Tile,
  idx: number,
  discards: readonly Tile[],
  isRiichi: boolean,
): number {
  // Genbutsu: 相手の捨て牌そのもの → 100%安全
  if (discards.some(d => d.suit === tile.suit && d.value === tile.value)) {
    return DANGER_GENBUTSU;
  }

  // リーチ者以外はsuji判定のみ
  if (!isRiichi) {
    return DANGER_LOW;
  }

  // リーチ者向け追加判定
  const discardSuji = new Set<number>();
  const discardValues = new Set<number>();

  for (const d of discards) {
    if (d.suit === Suit.Wind || d.suit === Suit.Dragon) continue;
    const dIdx = tileToIndex(d);
    for (const si of sujiIndices(dIdx)) {
      discardSuji.add(si);
    }
    discardValues.add(d.value as number);
  }

  // Suji: 相手の捨て牌のsuji → 比較的安全
  if (tile.suit !== Suit.Wind && tile.suit !== Suit.Dragon) {
    if (discardSuji.has(idx)) {
      return DANGER_SUJI;
    }
  } else {
    // 風牌・三元牌: リーチ後に捨てられていない → 危険度高
    return DANGER_HIGH;
  }

  return DANGER_HIGH;
}

// ── Shanten ──────────────────────────────────────────────────────────

/**
 * 14枚手牌から1枚切った後のテンパイ可否を評価。
 * returns: { tile, tenpaiTiles, danger } の配列
 */
function evaluateDiscards(
  hand: readonly Tile[],
  opponentDiscards: readonly (readonly Tile[])[],
  opponentRiichi: readonly boolean[],
): Array<{ tile: Tile; tenpai: number[]; danger: number }> {
  const results: Array<{ tile: Tile; tenpai: number[]; danger: number }> = [];

  for (const t of hand) {
    const testHand = hand.filter(h => h !== t);
    const waits = findTenpaiTiles(testHand);
    const danger = evaluateDanger(t, opponentDiscards, opponentRiichi);
    results.push({ tile: t, tenpai: waits, danger });
  }

  return results;
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * AIが切る牌を選択する。
 * テンパイする牌の中から最も安全な牌を選び、
 * テンパイできない場合は孤立牌優先（従来ロジック）。
 */
export function aiChooseDiscard(
  hand: readonly Tile[],
  opponentDiscards: readonly (readonly Tile[])[],
  opponentRiichi: readonly boolean[],
): Tile {
  if (hand.length !== 14) {
    // 14枚でなければエラーだが、fallback
    return hand[0] ?? indexToTile(0);
  }

  const evals = evaluateDiscards(hand, opponentDiscards, opponentRiichi);

  // テンパイする候補に絞る
  const tenpaiCandidates = evals.filter(e => e.tenpai.length > 0);
  if (tenpaiCandidates.length > 0) {
    // テンパイ候補中、最も危険度の低い牌を選ぶ
    const sorted = [...tenpaiCandidates].sort((a, b) => a.danger - b.danger);
    return sorted[0]!.tile;
  }

  // テンパイできない: 孤立牌優先（スコア最低の牌）
  return fallbackIsolated(hand);
}

/** 孤立牌優先のfallback */
function fallbackIsolated(hand: readonly Tile[]): Tile {
  const sorted = sortHand([...hand]);
  const counts = new Map<string, number>();
  for (const t of sorted) {
    const key = `${t.suit}:${t.value}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  function score(tile: Tile): number {
    const key = `${tile.suit}:${tile.value}`;
    const count = counts.get(key) ?? 0;
    if (count >= 2) return 50;
    if (tile.suit === Suit.Wind || tile.suit === Suit.Dragon) return 0;

    const idx = tileToIndex(tile);
    let s = 10;
    if (idx % 9 > 0 && sorted.some(t => tileToIndex(t) === idx - 1)) s += 15;
    if (idx % 9 < 8 && sorted.some(t => tileToIndex(t) === idx + 1)) s += 15;
    if (idx % 9 > 1 && sorted.some(t => tileToIndex(t) === idx - 2)) s += 5;
    if (idx % 9 < 7 && sorted.some(t => tileToIndex(t) === idx + 2)) s += 5;
    return s;
  }

  let worst = sorted[0]!;
  let worstScore = score(worst);
  for (const t of sorted.slice(1)) {
    const s = score(t);
    if (s < worstScore) { worst = t; worstScore = s; }
  }
  return worst;
}

/** テンパイ判断: この手牌(13枚)でfindTenpaiTilesが空でないか */
export function canTenpai(hand: readonly Tile[]): boolean {
  return findTenpaiTiles(hand).length > 0;
}
