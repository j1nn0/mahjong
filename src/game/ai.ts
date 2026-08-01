import { type Tile, type Meld, Suit, type AiPersonality, Wind } from './types.js';
import { sortHand, countDora } from './tiles.js';
import { findTenpaiTiles, tileToIndex, indexToTile, calcShanten } from './agari.js';

// ── Suji helper ──────────────────────────────────────────────────────

/** 捨て牌から片スジ・中スジとして安全な数牌を求める。 */
function computeSujiTiles(discards: readonly Tile[]): Set<number> {
  const safe = new Set<number>();
  const bySuit = new Map<Suit, Set<number>>();
  for (const tile of discards) {
    if (tile.suit === Suit.Wind || tile.suit === Suit.Dragon) continue;
    const values = bySuit.get(tile.suit) ?? new Set<number>();
    values.add(tile.value);
    bySuit.set(tile.suit, values);
  }
  for (const [suit, values] of bySuit) {
    const base = suit === Suit.Man ? 0 : suit === Suit.Pin ? 9 : 18;
    if (values.has(4)) { safe.add(base); safe.add(base + 6); }
    if (values.has(5)) { safe.add(base + 1); safe.add(base + 7); }
    if (values.has(6)) { safe.add(base + 2); safe.add(base + 8); }
    if (values.has(1) && values.has(7)) safe.add(base + 3);
    if (values.has(2) && values.has(8)) safe.add(base + 4);
    if (values.has(3) && values.has(9)) safe.add(base + 5);
  }
  return safe;
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
  selfIndex?: number,
): number {
  const idx = tileToIndex(tile);
  let worst = 0;

  // Compute visible count for ALL tiles (0-33) for kabe detection
  const visibleCounts = new Array<number>(34).fill(0);
  for (const discards of opponentDiscards) {
    for (const d of discards) {
      visibleCounts[tileToIndex(d)]++;
    }
  }
  if (myHand) {
    for (const h of myHand) {
      visibleCounts[tileToIndex(h)]++;
    }
  }
  if (opponentMelds) {
    for (const melds of opponentMelds) {
      for (const m of melds) {
        for (const t of m.tiles) {
          visibleCounts[tileToIndex(t)]++;
        }
      }
    }
  }

  const visibleCount = visibleCounts[idx] ?? 0;

  for (let p = 0; p < opponentDiscards.length; p++) {
    if (selfIndex !== undefined && p === selfIndex) continue;
    const discards = opponentDiscards[p]!;
    const riichi = opponentRiichi[p] ?? false;
    const melds = opponentMelds ? (opponentMelds[p] ?? []) : [];
    const d = dangerForPlayer(tile, idx, discards, riichi, melds, visibleCount, visibleCounts);
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
  visibleCounts?: readonly number[],
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

  // 2. 壁 (kabe) 検出: ある数牌が4枚全て見えている場合、隣接牌の危険度を下げる
  if (tile.suit !== Suit.Wind && tile.suit !== Suit.Dragon && visibleCounts) {
    const suitBase = tile.suit === Suit.Man ? 0 : tile.suit === Suit.Pin ? 9 : 18;
    const v = tile.value;
    // v+1 が壁 (4枚見え) なら vのリャンメン待ち(v, v+1)は不可能 → 安全側へ
    if (v < 9 && visibleCounts[suitBase + v] === 4) {
      // 牌vは壁(v+1が4枚見え)で守られている: リャンメン待ち(v, v+1)不可
      baseDanger -= 2;
    }
    // v-1 が壁 (4枚見え) なら vのリャンメン待ち(v-1, v)は不可能 → 安全側へ
    if (v > 1 && visibleCounts[suitBase + v - 2] === 4) {
      // v-1壁
      baseDanger -= 2;
    }
    // v自体が3枚見え → 残り1枚を持っている場合、それで待つ可能性 (タンキ・シャンポン) があるので少し危険
    if (visibleCount >= 3 && visibleCount < 4) {
      baseDanger += 2;
    }
  }

  // 3. ホンイツ・チンイツの警戒
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

  // 4. 字牌危険度補正
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

  // 5. リーチ者向け追加判定
  if (isRiichi) {
    const terminalDiscards = discards.filter(d => 
      d.suit !== Suit.Wind && d.suit !== Suit.Dragon && 
      (d.value === 1 || d.value === 2 || d.value === 8 || d.value === 9)
    ).length;

    const discardSuji = computeSujiTiles(discards);

    if (tile.suit !== Suit.Wind && tile.suit !== Suit.Dragon) {
      if (discardSuji.has(idx)) {
        return DANGER_SUJI;
      }
      if (tile.value >= 3 && tile.value <= 7 && terminalDiscards >= 3) {
        return 10;
      }
    }
  }

  return Math.max(1, baseDanger);
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
  selfIndex?: number,
): Array<{ tile: Tile; tenpai: number[]; danger: number }> {
  const results: Array<{ tile: Tile; tenpai: number[]; danger: number }> = [];

  for (const t of hand) {
    if (prohibitedTiles.some(p => p.suit === t.suit && p.value === t.value)) continue;
    const testHand = hand.filter(h => h !== t);
    const waits = findTenpaiTiles(testHand);
    const danger = evaluateDanger(t, opponentDiscards, opponentRiichi, opponentMelds, hand, selfIndex);
    results.push({ tile: t, tenpai: waits, danger });
  }

  return results;
}

// ── Old aiChooseDiscard replaced below ─────────────────────────────

/** 孤立牌優先のfallback */
function fallbackIsolated(
  candidates: readonly Tile[],
  fullHand: readonly Tile[],
  opponentDiscards: readonly (readonly Tile[])[],
  prohibitedTiles: readonly Tile[] = []
): Tile {
  const legal = candidates.filter(t => !prohibitedTiles.some(p => p.suit === t.suit && p.value === t.value));
  const sortedCandidates = sortHand(legal.length > 0 ? legal : [...candidates]);
  
  const counts = new Map<string, number>();
  for (const t of fullHand) {
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
    const fullHandSorted = sortHand([...fullHand]);
    if (idx % 9 > 0 && fullHandSorted.some(t => tileToIndex(t) === idx - 1)) s += 15;
    if (idx % 9 < 8 && fullHandSorted.some(t => tileToIndex(t) === idx + 1)) s += 15;
    if (idx % 9 > 1 && fullHandSorted.some(t => tileToIndex(t) === idx - 2)) s += 5;
    if (idx % 9 < 7 && fullHandSorted.some(t => tileToIndex(t) === idx + 2)) s += 5;
    return s;
  }

  let worst = sortedCandidates[0]!;
  let worstScore = score(worst);
  for (const t of sortedCandidates.slice(1)) {
    const s = score(t);
    if (s < worstScore) { worst = t; worstScore = s; }
  }
  return worst;
}

/** テンパイ判断: この手牌(13枚)でfindTenpaiTilesが空でないか */
export function canTenpai(hand: readonly Tile[]): boolean {
  return findTenpaiTiles(hand).length > 0;
}

// ── Hand value estimation ──────────────────────────────────────────

export interface HandEstimate {
  /** 最低推定打点 */
  minPoints: number;
  /** 確定している飜数（ドラ除く） */
  confirmedHan: number;
  /** ドラ飜数 */
  doraHan: number;
}

/** 簡易打点推定。確定している役とドラのみを考慮し、最小打点を返す */
export function estimateMinPoints(
  hand: readonly Tile[],
  melds: readonly Meld[],
  doraIndicators: readonly Tile[],
  roundWind: Wind,
  playerWind: Wind,
  isRiichi: boolean = false,
): HandEstimate {
  let confirmedHan = 0;
  if (isRiichi) confirmedHan += 1;

  // 役牌: ドラ・風牌の刻子/槓子が副露面子にある
  for (const meld of melds) {
    if (meld.type === 'closedKan') continue; // 暗槓は手牌扱い
    const tile = meld.tiles[0]!;
    if (tile.suit === Suit.Dragon) {
      confirmedHan += 1;
    } else if (tile.suit === Suit.Wind) {
      if (tile.value === playerWind) confirmedHan += 1; // 自風
      if (tile.value === roundWind) confirmedHan += 1;  // 場風（ダブ東などで2翻）
    }
  }

  // タンヤオ: 全ての牌（手牌+副露）が中張牌(2-8)である
  let allSimples = true;
  for (const tile of hand) {
    if (tile.suit === Suit.Wind || tile.suit === Suit.Dragon) { allSimples = false; break; }
    if (tile.value === 1 || tile.value === 9) { allSimples = false; break; }
  }
  if (allSimples) {
    for (const meld of melds) {
      for (const tile of meld.tiles) {
        if (tile.suit === Suit.Wind || tile.suit === Suit.Dragon) { allSimples = false; break; }
        if (tile.value === 1 || tile.value === 9) { allSimples = false; break; }
      }
      if (!allSimples) break;
    }
  }
  if (allSimples) confirmedHan += 1;

  // ドラ
  const allTiles = [...hand, ...melds.flatMap((m) => m.tiles)];
  const doraHan = countDora(allTiles, doraIndicators, false);

  // 最低打点の概算
  const totalHan = confirmedHan + doraHan;
  const minPoints = confirmedHan > 0
    ? totalHan >= 5 ? 8000
      : totalHan === 4 ? 7700
      : totalHan === 3 ? 3900
      : totalHan === 2 ? 2000
      : 1000
    : 0;

  return { minPoints, confirmedHan, doraHan };
}

// ── Personality push/fold ──────────────────────────────────────────

function isLegacyPersonality(personality: AiPersonality): boolean {
  return personality.aggression === 2
    && personality.riskTolerance === 2
    && personality.meldFrequency === 2
    && personality.riichiFrequency === 2
    && personality.handValueFocus === 3;
}

function valueFloorForFocus(handValueFocus: number): number {
  if (handValueFocus >= 5) return 3900;
  if (handValueFocus === 4) return 2000;
  return 0;
}


/** 性格に基づき、危険牌を押すべきか判断する */
function shouldPush(
  handValue: number,
  waitCount: number,
  danger: number,
  personality: AiPersonality,
): boolean {
  if (handValue < valueFloorForFocus(personality.handValueFocus)) return false;
  const winProb = Math.min(1, waitCount / 34);
  // score = 推定打点 × 和了確率 × aggression - 危険度 × riskPenalty
  // riskTolerance は危険度ペナルティを下げるだけで、危険牌を加点しない。
  const riskPenalty = Math.max(0, 4 - personality.riskTolerance);
  const score = handValue * winProb * personality.aggression - danger * riskPenalty;
  return score > 0 || (handValue > 0 && danger === 0);
}

// ── Updated aiChooseDiscard ────────────────────────────────────────

/** 性格パラメータを考慮した打牌選択 */
export function aiChooseDiscard(
  hand: readonly Tile[],
  opponentDiscards: readonly (readonly Tile[])[],
  opponentRiichi: readonly boolean[],
  prohibitedTiles: readonly Tile[] = [],
  opponentMelds?: readonly (readonly Meld[])[],
  selfIndex?: number,
  personality?: AiPersonality,
  doraIndicators?: readonly Tile[],
  roundWind?: Wind,
  playerWind?: Wind,
  isRiichi?: boolean,
): Tile {
  if (hand.length !== 14) {
    return hand.find(t => !prohibitedTiles.some(p => p.suit === t.suit && p.value === t.value)) ?? hand[0] ?? indexToTile(0);
  }

  const evals = evaluateDiscards(hand, opponentDiscards, opponentRiichi, prohibitedTiles, opponentMelds, selfIndex);

  // テンパイ候補
  const tenpaiCandidates = evals.filter(e => e.tenpai.length > 0);

  if (
    tenpaiCandidates.length > 0
    && personality
    && !isLegacyPersonality(personality)
    && doraIndicators !== undefined
    && roundWind !== undefined
    && playerWind !== undefined
  ) {
    // ── 性格ベースの押し引き ──
    const ownMelds = selfIndex !== undefined && opponentMelds ? (opponentMelds[selfIndex] ?? []) : [];

    // テンパイ候補を押す価値があるか、打牌後の手牌価値で評価する。
    const pushable = tenpaiCandidates.filter((e) => {
      const testHand = hand.filter((h) => h !== e.tile);
      const estimate = estimateMinPoints(testHand, ownMelds, doraIndicators, roundWind, playerWind, isRiichi);
      return shouldPush(estimate.minPoints, e.tenpai.length, e.danger, personality);
    });

    if (pushable.length > 0) {
      // 押せる候補の中で最も安全な牌を選ぶ
      pushable.sort((a, b) => a.danger - b.danger);
      return pushable[0]!.tile;
    }
    // 押せる候補がない → 降りる: テンパイを崩しても安全な牌を切る
    const nonTenpai = evals.filter(e => e.tenpai.length === 0);
    if (nonTenpai.length > 0) {
      nonTenpai.sort((a, b) => a.danger - b.danger);
      return nonTenpai[0]!.tile;
    }
    // 全てテンパイ（ありえないが念のため）
    return tenpaiCandidates.sort((a, b) => a.danger - b.danger)[0]!.tile;
  }

  // ── 性格なし or パラメータ不足: 従来ロジック ──
  if (tenpaiCandidates.length > 0) {
    tenpaiCandidates.sort((a, b) => a.danger - b.danger);
    return tenpaiCandidates[0]!.tile;
  }

  // テンパイできない: シャンテン数最小化
  const candidates: Array<{ tile: Tile; shanten: number }> = [];
  for (const t of hand) {
    if (prohibitedTiles.some(p => p.suit === t.suit && p.value === t.value)) continue;
    const testHand = hand.filter(h => h !== t);
    const shanten = calcShanten(testHand);
    candidates.push({ tile: t, shanten });
  }

  if (candidates.length > 0) {
    const minShanten = Math.min(...candidates.map(c => c.shanten));
    const bestTiles = candidates.filter(c => c.shanten === minShanten).map(c => c.tile);
    return fallbackIsolated(bestTiles, hand, opponentDiscards, prohibitedTiles);
  }

  return fallbackIsolated(hand, hand, opponentDiscards, prohibitedTiles);
}
