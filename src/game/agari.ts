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

/**
 * 手牌が和了形か判定 (4面子 + 1雀頭)
 * counts: 長さ34のカウント配列 (14枚想定)
 */
export function isWinningHand(counts: number[]): boolean {
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
