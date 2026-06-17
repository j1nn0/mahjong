import { Suit, Wind, Dragon, type Tile } from './types.js';

// ── Unicode mapping ──────────────────────────────────────────────

/** Unicode code point base for mahjong tiles */
const BASE = 0x1F000;

const TILE_UNICODE_MAP: Record<string, string> = {
  // Winds (base + 0..3)
  'w:0': String.fromCodePoint(BASE + 0), // 🀀 Ton
  'w:1': String.fromCodePoint(BASE + 1), // 🀁 Nan
  'w:2': String.fromCodePoint(BASE + 2), // 🀂 Sha
  'w:3': String.fromCodePoint(BASE + 3), // 🀃 Pei

  // Dragons (base + 4..6)
  'd:0': String.fromCodePoint(BASE + 4), // 🀄 Chun
  'd:1': String.fromCodePoint(BASE + 5), // 🀅 Hatsu
  'd:2': String.fromCodePoint(BASE + 6), // 🀆 Haku

  // Man (base + 7..15)
  'm:1': String.fromCodePoint(BASE + 7),  // 🀇
  'm:2': String.fromCodePoint(BASE + 8),  // 🀈
  'm:3': String.fromCodePoint(BASE + 9),  // 🀉
  'm:4': String.fromCodePoint(BASE + 10), // 🀊
  'm:5': String.fromCodePoint(BASE + 11), // 🀋
  'm:6': String.fromCodePoint(BASE + 12), // 🀌
  'm:7': String.fromCodePoint(BASE + 13), // 🀍
  'm:8': String.fromCodePoint(BASE + 14), // 🀎
  'm:9': String.fromCodePoint(BASE + 15), // 🀏

  // Sou (base + 16..24)
  's:1': String.fromCodePoint(BASE + 16), // 🀐
  's:2': String.fromCodePoint(BASE + 17), // 🀑
  's:3': String.fromCodePoint(BASE + 18), // 🀒
  's:4': String.fromCodePoint(BASE + 19), // 🀓
  's:5': String.fromCodePoint(BASE + 20), // 🀔
  's:6': String.fromCodePoint(BASE + 21), // 🀕
  's:7': String.fromCodePoint(BASE + 22), // 🀖
  's:8': String.fromCodePoint(BASE + 23), // 🀗
  's:9': String.fromCodePoint(BASE + 24), // 🀘

  // Pin (base + 25..33)
  'p:1': String.fromCodePoint(BASE + 25), // 🀙
  'p:2': String.fromCodePoint(BASE + 26), // 🀚
  'p:3': String.fromCodePoint(BASE + 27), // 🀛
  'p:4': String.fromCodePoint(BASE + 28), // 🀜
  'p:5': String.fromCodePoint(BASE + 29), // 🀝
  'p:6': String.fromCodePoint(BASE + 30), // 🀞
  'p:7': String.fromCodePoint(BASE + 31), // 🀟
  'p:8': String.fromCodePoint(BASE + 32), // 🀠
  'p:9': String.fromCodePoint(BASE + 33), // 🀡
};

function tileKey(tile: Tile): string {
  if (tile.suit === Suit.Wind) return `${Suit.Wind}:${tile.value}`;
  if (tile.suit === Suit.Dragon) return `${Suit.Dragon}:${tile.value}`;
  return `${tile.suit}:${tile.value}`;
}

/** 牌に対応するUnicode文字を返す */
export function tileToUnicode(tile: Tile): string {
  return TILE_UNICODE_MAP[tileKey(tile)] ?? '?';
}

/** 牌の表示用文字列（Unicode + 赤指定） */
export function formatTile(tile: Tile): string {
  const char = tileToUnicode(tile);
  return tile.red ? `${char}*` : char;
}

// ── Tile generation ──────────────────────────────────────────────

const SUITS = [Suit.Man, Suit.Pin, Suit.Sou] as const;
const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

function createNumberTile(suit: Suit.Man | Suit.Pin | Suit.Sou, value: number, red = false): Tile {
  return { suit, value: value as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, red };
}

function createWindTile(value: Wind): Tile {
  return { suit: Suit.Wind, value, red: false };
}

function createDragonTile(value: Dragon): Tile {
  return { suit: Suit.Dragon, value, red: false };
}

/** 136牌（34種×4枚）を生成。赤ドラは各色5に1枚ずつ。 */
export function createAllTiles(): readonly Tile[] {
  const tiles: Tile[] = [];

  for (const suit of SUITS) {
    for (const num of NUMBERS) {
      // 4 copies of each number tile
      for (let copy = 0; copy < 4; copy++) {
        // Mark the first copy of each 5 as red
        const red = num === 5 && copy === 0;
        tiles.push(createNumberTile(suit, num, red));
      }
    }
  }

  // Winds: Ton(0), Nan(1), Sha(2), Pei(3) × 4 copies
  for (let copy = 0; copy < 4; copy++) {
    for (let w = 0; w < 4; w++) {
      tiles.push(createWindTile(w as Wind));
    }
  }

  // Dragons: Chun(0), Hatsu(1), Haku(2) × 4 copies
  for (let copy = 0; copy < 4; copy++) {
    for (let d = 0; d < 3; d++) {
      tiles.push(createDragonTile(d as Dragon));
    }
  }

  return tiles;
}

// ── Shuffle (Fisher-Yates) ───────────────────────────────────────

/** Fisher-Yates シャッフル（副作用で配列を破壊） */
function shuffleInPlace<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = array[i]!;
    array[i] = array[j]!;
    array[j] = tmp;
  }
}

// ── Wall ─────────────────────────────────────────────────────────

/** 牌山の情報 */
export interface WallData {
  /** 通常の山 (残りすべて) */
  wall: readonly Tile[];
  /** 王牌 (14枚: ドラ表示牌 x N + 裏ドラ x N + 嶺上牌) */
  deadWall: readonly Tile[];
  /** 現在めくられているドラ表示牌の数 */
  doraCount: number;
}

const DEAD_WALL_SIZE = 14;

/** 136牌をシャッフルして牌山と王牌に分割 */
export function buildWall(): WallData {
  const tiles = [...createAllTiles()];
  shuffleInPlace(tiles);

  const deadWall = tiles.slice(0, DEAD_WALL_SIZE);
  const wall = tiles.slice(DEAD_WALL_SIZE);

  return { wall, deadWall, doraCount: 1 };
}

/** 山の先頭から指定枚数をツモする。新しい山を返す。 */
export function drawFromWall(wall: readonly Tile[], count: number): { drawn: readonly Tile[]; remaining: readonly Tile[] } {
  const drawn = wall.slice(0, count);
  const remaining = wall.slice(count);
  return { drawn, remaining };
}

/** 王牌から新しいドラ表示牌をめくる。新しいdeadWallとdoraCountを返す。 */
export function revealDora(deadWall: readonly Tile[], doraCount: number): { deadWall: readonly Tile[]; doraCount: number } {
  const nextIndex = doraCount;
  if (nextIndex >= deadWall.length) {
    return { deadWall, doraCount };
  }
  return { deadWall, doraCount: doraCount + 1 };
}

/** 王牌から嶺上牌をツモする。 */
export function drawDeadWall(deadWall: readonly Tile[]): { drawn: Tile; remaining: readonly Tile[] } | undefined {
  // 嶺上牌は王牌の後ろから (王牌の先頭がドラ表示牌ゾーン、末尾が嶺上牌)
  const lastIndex = deadWall.length - 1;
  if (lastIndex < 0) return undefined;
  const drawn = deadWall[lastIndex]!;
  const remaining = deadWall.slice(0, lastIndex);
  return { drawn, remaining };
}

// ── Hand formatting ──────────────────────────────────────────────

/** 手牌を並べ替え（萬→筒→索→風→三元の順、各スート内は数字順） */
export function sortHand(tiles: readonly Tile[]): readonly Tile[] {
  return [...tiles].sort((a, b) => tileSortKey(a) - tileSortKey(b));
}

function tileSortKey(tile: Tile): number {
  switch (tile.suit) {
    case Suit.Man:   return 0 + tile.value;
    case Suit.Pin:   return 100 + tile.value;
    case Suit.Sou:   return 200 + tile.value;
    case Suit.Wind:  return 300 + tile.value;
    case Suit.Dragon: return 400 + tile.value;
  }
}
