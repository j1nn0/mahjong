import { Suit, Wind, Dragon, type Tile } from './types.js';
import { tileToUnicode } from './tiles.js';

// ── Index conversion (0-33) ──────────────────────────────────────
// 0-8: Manzu, 9-17: Pinzu, 18-26: Souzu, 27-30: Winds, 31-33: Dragons

/** 牌を0-33のインデックスに変換 */
export function tileToIndex(tile: Tile): number {
  switch (tile.suit) {
    case Suit.Man:   return tile.value - 1;
    case Suit.Pin:   return 9 + (tile.value - 1);
    case Suit.Sou:   return 18 + (tile.value - 1);
    case Suit.Wind:  return 27 + tile.value;
    case Suit.Dragon:return 31 + tile.value;
  }
}

/** インデックス(0-33)を牌に変換 */
export function indexToTile(index: number, red = false): Tile {
  if (index < 9)  return { suit: Suit.Man,   value: (index + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, red };
  if (index < 18) return { suit: Suit.Pin,   value: (index - 9 + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, red };
  if (index < 27) return { suit: Suit.Sou,   value: (index - 18 + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, red };
  if (index < 31) return { suit: Suit.Wind,  value: (index - 27) as Wind, red: false };
  return { suit: Suit.Dragon, value: (index - 31) as Dragon, red: false };
}

/** 牌の配列をカウント配列(長さ34)に変換 */
export function tilesToCounts(tiles: readonly Tile[]): number[] {
  const counts = new Array<number>(34).fill(0);
  for (const tile of tiles) {
    counts[tileToIndex(tile)]++;
  }
  return counts;
}

// ── Winning hand check ───────────────────────────────────────────

const KOKUSHI_INDICES = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

function tileCount(counts: readonly number[]): number {
  return counts.reduce((sum, count) => sum + count, 0);
}

function isChiitoitsu(counts: readonly number[]): boolean {
  if (tileCount(counts) !== 14) return false;
  let pairs = 0;
  for (const count of counts) {
    if (count === 2) pairs++;
    else if (count !== 0) return false;
  }
  return pairs === 7;
}

function isKokushi(counts: readonly number[]): boolean {
  if (tileCount(counts) !== 14) return false;
  let pairFound = false;
  for (let i = 0; i < 34; i++) {
    const count = counts[i]!;
    const required = KOKUSHI_INDICES.includes(i);
    if (required) {
      if (count === 0) return false;
      if (count === 2) pairFound = true;
      else if (count !== 1) return false;
    } else if (count !== 0) {
      return false;
    }
  }
  return pairFound;
}

function isStandardWinningHand(counts: number[]): boolean {
  for (let i = 0; i < 34; i++) {
    if (counts[i]! >= 2) {
      counts[i] = counts[i]! - 2; // 雀頭として抜く
      if (tryRemoveGroups(counts, 4)) {
        counts[i] = counts[i]! + 2;
        return true;
      }
      counts[i] = counts[i]! + 2;
    }
  }
  return false;
}

/**
 * 手牌が和了形か判定する。
 * 標準形 (4面子 + 1雀頭)、七対子、国士無双に対応する。
 * counts: 長さ34のカウント配列 (14枚想定)
 */
export function isWinningHand(counts: number[]): boolean {
  if (isChiitoitsu(counts) || isKokushi(counts)) return true;
  return isStandardWinningHand([...counts]);
}

/** 再帰的に面子を抜いていく。n: 抜くべき面子の残り数 */
function tryRemoveGroups(counts: number[], n: number): boolean {
  if (n === 0) {
    // 全ての面子を抜き終わった。残りがないことを確認
    return counts.every(c => c === 0);
  }

  // 最初の0でない牌を探す
  let first = -1;
  for (let i = 0; i < 34; i++) {
    if (counts[i]! > 0) { first = i; break; }
  }
  if (first === -1) return false; // 枚数が足りない

  // 刻子 (triplet)
  if (counts[first]! >= 3) {
    counts[first] = counts[first]! - 3;
    if (tryRemoveGroups(counts, n - 1)) {
      counts[first] = counts[first]! + 3;
      return true;
    }
    counts[first] = counts[first]! + 3;
  }

  // 順子 (sequence) — 数牌かつ端でない場合のみ
  if (first < 27 && first % 9 <= 6) {
    if (counts[first]! > 0 && counts[first + 1]! > 0 && counts[first + 2]! > 0) {
      counts[first]--;
      counts[first + 1]--;
      counts[first + 2]--;
      if (tryRemoveGroups(counts, n - 1)) {
        counts[first]++;
        counts[first + 1]++;
        counts[first + 2]++;
        return true;
      }
      counts[first]++;
      counts[first + 1]++;
      counts[first + 2]++;
    }
  }

  // どちらも作れない → この雀頭では和了れない
  return false;
}

// ── Tenpai ──────────────────────────────────────────────────────

/**
 * テンパイしているかを判定 (あと1枚で和了)
 * tiles: 現在の手牌 (13枚想定)
 */
export function isTenpai(tiles: readonly Tile[]): boolean {
  const counts = tilesToCounts(tiles);
  // 各牌を加えて和了形になるか試す
  for (let i = 0; i < 34; i++) {
    if (counts[i]! < 4) { // その牌がまだ4枚未満
      counts[i] = counts[i]! + 1;
      if (isWinningHand(counts)) {
        counts[i] = counts[i]! - 1;
        return true;
      }
      counts[i] = counts[i]! - 1;
    }
  }
  return false;
}

/**
 * 待ち牌の一覧を返す (和了できる牌のインデックス)
 */
export function findTenpaiTiles(tiles: readonly Tile[]): number[] {
  const counts = tilesToCounts(tiles);
  const result: number[] = [];
  for (let i = 0; i < 34; i++) {
    if (counts[i]! < 4) {
      counts[i] = counts[i]! + 1;
      if (isWinningHand(counts)) {
        result.push(i);
      }
      counts[i] = counts[i]! - 1;
    }
  }
  return result;
}

/** 待ち牌の表示用文字列 */
export function formatTenpaiIndices(indices: number[]): string {
  return indices.map(i => tileToUnicode(indexToTile(i))).join('');
}

// ── Shanten calculation ──────────────────────────────────────────

function calcNormalShanten(counts: number[]): number {
  let minShanten = 8;

  function backtrack(meldsCount: number, taatsuCount: number, hasPair: boolean, startIdx: number) {
    let currentMelds = meldsCount;
    let currentTaatsu = taatsuCount;
    if (currentMelds + currentTaatsu > 4) {
      currentTaatsu = 4 - currentMelds;
    }
    const shanten = 8 - 2 * currentMelds - currentTaatsu - (hasPair ? 1 : 0);
    if (shanten < minShanten) {
      minShanten = shanten;
    }

    if (startIdx >= 34) return;

    for (let i = startIdx; i < 34; i++) {
      if (counts[i] === 0) continue;

      // 1. 刻子
      if (counts[i]! >= 3) {
        counts[i] = counts[i]! - 3;
        backtrack(meldsCount + 1, taatsuCount, hasPair, i);
        counts[i] = counts[i]! + 3;
      }

      // 2. 順子
      if (i < 27 && i % 9 <= 6) {
        if (counts[i]! > 0 && counts[i + 1]! > 0 && counts[i + 2]! > 0) {
          counts[i]--;
          counts[i + 1]--;
          counts[i + 2]--;
          backtrack(meldsCount + 1, taatsuCount, hasPair, i);
          counts[i]++;
          counts[i + 1]++;
          counts[i + 2]++;
        }
      }

      // 3. 対子（雀頭）
      if (!hasPair && counts[i]! >= 2) {
        counts[i] = counts[i]! - 2;
        backtrack(meldsCount, taatsuCount, true, i);
        counts[i] = counts[i]! + 2;
      }

      // 4. 塔子（面子＋塔子 < 4 のときのみ）
      if (meldsCount + taatsuCount < 4) {
        // 対子塔子
        if (counts[i]! >= 2) {
          counts[i] = counts[i]! - 2;
          backtrack(meldsCount, taatsuCount + 1, hasPair, i);
          counts[i] = counts[i]! + 2;
        }
        // 辺張・両面塔子
        if (i < 27 && i % 9 <= 7) {
          if (counts[i]! > 0 && counts[i + 1]! > 0) {
            counts[i]--;
            counts[i + 1]--;
            backtrack(meldsCount, taatsuCount + 1, hasPair, i);
            counts[i]++;
            counts[i + 1]++;
          }
        }
        // 嵌張塔子
        if (i < 27 && i % 9 <= 6) {
          if (counts[i]! > 0 && counts[i + 2]! > 0) {
            counts[i]--;
            counts[i + 2]--;
            backtrack(meldsCount, taatsuCount + 1, hasPair, i);
            counts[i]++;
            counts[i + 2]++;
          }
        }
      }
    }
  }

  backtrack(0, 0, false, 0);
  return minShanten;
}

function calcChiitoitsuShanten(counts: number[]): number {
  let pairs = 0;
  let uniqueTiles = 0;
  for (const count of counts) {
    if (count > 0) {
      uniqueTiles++;
      if (count >= 2) {
        pairs++;
      }
    }
  }
  let shanten = 6 - pairs;
  if (uniqueTiles < 7) {
    shanten += (7 - uniqueTiles);
  }
  return shanten;
}

function calcKokushiShanten(counts: number[]): number {
  let uniqueKokushi = 0;
  let hasPair = false;
  for (const idx of KOKUSHI_INDICES) {
    const count = counts[idx]!;
    if (count > 0) {
      uniqueKokushi++;
      if (count >= 2) {
        hasPair = true;
      }
    }
  }
  return 13 - uniqueKokushi - (hasPair ? 1 : 0);
}

/**
 * シャンテン数を計算する
 * tiles: 現在の手牌 (13枚または14枚想定)
 */
export function calcShanten(tiles: readonly Tile[]): number {
  const counts = tilesToCounts(tiles);
  
  if (tiles.length === 14 && isWinningHand(counts)) {
    return -1;
  }
  
  const normal = calcNormalShanten([...counts]);
  const chiitoi = calcChiitoitsuShanten(counts);
  const kokushi = calcKokushiShanten(counts);

  return Math.min(normal, chiitoi, kokushi);
}
