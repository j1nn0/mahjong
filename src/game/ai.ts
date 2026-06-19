import { type Tile, type Meld, Suit } from './types.js';
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
  opponentMelds?: readonly (readonly Meld[])[],
  myHand?: readonly Tile[],
): number {
  const idx = tileToIndex(tile);
  let worst = 0;

  // 全体で見えている該当牌の枚数をカウントする（字牌の危険度評価用）
  let visibleCount = 0;
  for (const discards of opponentDiscards) {
    visibleCount += discards.filter(d => d.suit === tile.suit && d.value === tile.value).length;
  }
  if (myHand) {
    visibleCount += myHand.filter(h => h.suit === tile.suit && h.value === tile.value).length;
  }
  if (opponentMelds) {
    for (const melds of opponentMelds) {
      for (const m of melds) {
        visibleCount += m.tiles.filter(t => t.suit === tile.suit && t.value === tile.value).length;
      }
    }
  }

  for (let p = 0; p < opponentDiscards.length; p++) {
    const discards = opponentDiscards[p]!;
    const riichi = opponentRiichi[p] ?? false;
    const melds = opponentMelds ? (opponentMelds[p] ?? []) : [];
    const d = dangerForPlayer(tile, idx, discards, riichi, melds, visibleCount);
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
  melds: readonly Meld[],
  visibleCount: number,
): number {
  // Genbutsu: 相手の捨て牌そのもの → 100%安全
  if (discards.some(d => d.suit === tile.suit && d.value === tile.value)) {
    return DANGER_GENBUTSU;
  }

  // 1. 相手の副露数に基づくベース危険度の評価
  let baseDanger = isRiichi ? DANGER_HIGH : DANGER_LOW;
  if (!isRiichi) {
    if (melds.length >= 3) {
      baseDanger = 7;
    } else if (melds.length === 2) {
      baseDanger = 5;
    }
  }

  // 2. ホンイツ・チンイツの警戒 (特定のSuitで2つ以上副露している場合、そのSuitの危険度を上げる)
  if (melds.length >= 2) {
    const suitCounts: Record<string, number> = {};
    for (const m of melds) {
      const first = m.tiles[0];
      if (first && first.suit !== Suit.Wind && first.suit !== Suit.Dragon) {
        suitCounts[first.suit] = (suitCounts[first.suit] ?? 0) + 1;
      }
    }
    for (const s in suitCounts) {
      if (suitCounts[s]! >= 2 && tile.suit === s) {
        baseDanger += 3;
      }
    }
  }

  // 3. 字牌（風牌・三元牌）の危険度補正
  if (tile.suit === Suit.Wind || tile.suit === Suit.Dragon) {
    if (visibleCount >= 4) {
      return 1;
    }
    if (visibleCount === 3) {
      return 2;
    }
    if (visibleCount === 2) {
      return 4;
    }
    if (visibleCount === 1) {
      return 6;
    }
    if (visibleCount === 0) {
      return isRiichi ? 10 : 7;
    }
  }

  // 4. リーチ者向け追加判定
  if (isRiichi) {
    const terminalDiscards = discards.filter(d => 
      d.suit !== Suit.Wind && d.suit !== Suit.Dragon && 
      (d.value === 1 || d.value === 2 || d.value === 8 || d.value === 9)
    ).length;

    const discardSuji = new Set<number>();
    for (const d of discards) {
      if (d.suit === Suit.Wind || d.suit === Suit.Dragon) continue;
      const dIdx = tileToIndex(d);
      for (const si of sujiIndices(dIdx)) {
        discardSuji.add(si);
      }
    }

    if (tile.suit !== Suit.Wind && tile.suit !== Suit.Dragon) {
      if (discardSuji.has(idx)) {
        return DANGER_SUJI;
      }
      if (tile.value >= 3 && tile.value <= 7 && terminalDiscards >= 3) {
        return 10;
      }
    }
  }

  return baseDanger;
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
  prohibitedTiles: readonly Tile[] = [],
  opponentMelds?: readonly (readonly Meld[])[],
): Array<{ tile: Tile; tenpai: number[]; danger: number }> {
  const results: Array<{ tile: Tile; tenpai: number[]; danger: number }> = [];

  for (const t of hand) {
    if (prohibitedTiles.some(p => p.suit === t.suit && p.value === t.value)) continue;
    const testHand = hand.filter(h => h !== t);
    const waits = findTenpaiTiles(testHand);
    const danger = evaluateDanger(t, opponentDiscards, opponentRiichi, opponentMelds, hand);
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
  prohibitedTiles: readonly Tile[] = [],
  opponentMelds?: readonly (readonly Meld[])[],
): Tile {
  if (hand.length !== 14) {
    // 14枚でなければエラーだが、fallback
    return hand.find(t => !prohibitedTiles.some(p => p.suit === t.suit && p.value === t.value)) ?? hand[0] ?? indexToTile(0);
  }

  const evals = evaluateDiscards(hand, opponentDiscards, opponentRiichi, prohibitedTiles, opponentMelds);

  // テンパイする候補に絞る
  const tenpaiCandidates = evals.filter(e => e.tenpai.length > 0);
  if (tenpaiCandidates.length > 0) {
    // テンパイ候補中、最も危険度の低い牌を選ぶ
    const sorted = [...tenpaiCandidates].sort((a, b) => a.danger - b.danger);
    return sorted[0]!.tile;
  }

  // テンパイできない: 孤立牌優先（スコア最低の牌）
  return fallbackIsolated(hand, opponentDiscards, prohibitedTiles);
}

/** 孤立牌優先のfallback */
function fallbackIsolated(
  hand: readonly Tile[],
  opponentDiscards: readonly (readonly Tile[])[],
  prohibitedTiles: readonly Tile[] = []
): Tile {
  const legal = hand.filter(t => !prohibitedTiles.some(p => p.suit === t.suit && p.value === t.value));
  const sorted = sortHand(legal.length > 0 ? legal : [...hand]);
  const counts = new Map<string, number>();
  for (const t of sorted) {
    const key = `${t.suit}:${t.value}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const allDiscards = new Set<string>();
  for (const discards of opponentDiscards) {
    for (const d of discards) {
      allDiscards.add(`${d.suit}:${d.value}`);
    }
  }

  function score(tile: Tile): number {
    const key = `${tile.suit}:${tile.value}`;
    const count = counts.get(key) ?? 0;
    if (count >= 2) return 50;
    
    if (tile.suit === Suit.Wind || tile.suit === Suit.Dragon) {
      if (allDiscards.has(key)) {
        return 60; // 既に捨てられている字牌（安全牌）は残す
      }
      return 0; // まだ捨てられていない字牌は不要
    }

    const idx = tileToIndex(tile);
    let s = (tile.value === 1 || tile.value === 9) ? 10 : 5; // 中張牌(2-8)は序盤に処理するためスコアを低くする
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
