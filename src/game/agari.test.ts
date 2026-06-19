import { describe, it, expect } from 'vitest';
import { Suit, type Tile } from '../game/types.js';
import { isTenpai, findTenpaiTiles, tileToIndex, tilesToCounts, isWinningHand, calcShanten } from '../game/agari.js';

function m(v: number): Tile {
  return { suit: Suit.Man, value: v as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 };
}
function p(v: number): Tile {
  return { suit: Suit.Pin, value: v as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 };
}
function s(v: number): Tile {
  return { suit: Suit.Sou, value: v as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 };
}
function ton(): Tile { return { suit: Suit.Wind, value: 0 }; }
function nan(): Tile { return { suit: Suit.Wind, value: 1 }; }
function sha(): Tile { return { suit: Suit.Wind, value: 2 }; }
function pei(): Tile { return { suit: Suit.Wind, value: 3 }; }
function chun(): Tile { return { suit: Suit.Dragon, value: 0 }; }
function haku(): Tile { return { suit: Suit.Dragon, value: 2 }; }
function hatsu(): Tile { return { suit: Suit.Dragon, value: 1 }; }

describe('isWinningHand', () => {
  it('detects a standard winning hand (4 sequences + 1 pair)', () => {
    const tiles = [
      m(1), m(2), m(3),
      m(4), m(5), m(6),
      m(7), m(8), m(9),
      m(1), m(2), m(3),
      m(5), m(5),
    ];
    expect(isWinningHand(tilesToCounts(tiles))).toBe(true);
  });

  it('detects a winning hand with triplets', () => {
    const tiles = [
      m(1), m(1), m(1),
      m(2), m(2), m(2),
      m(3), m(3), m(3),
      m(4), m(4), m(4),
      m(5), m(5),
    ];
    expect(isWinningHand(tilesToCounts(tiles))).toBe(true);
  });

  it('rejects a non-winning 14-tile hand', () => {
    const tiles = [
      m(1), m(3), m(5),
      m(7), m(8), m(9),
      m(1), m(2), m(3),
      m(6), m(7), m(8),
      m(2), m(2),
    ];
    expect(isWinningHand(tilesToCounts(tiles))).toBe(false);
  });

  it('detects winning hand with honors', () => {
    const tiles = [
      ton(), ton(), ton(),
      nan(), nan(), nan(),
      chun(), chun(), chun(),
      haku(), haku(), haku(),
      m(5), m(5),
    ];
    expect(isWinningHand(tilesToCounts(tiles))).toBe(true);
  });

  it('detects winning hand with mixed sequences and triplets', () => {
    const tiles = [
      m(1), m(1), m(1),
      m(2), m(3), m(4),
      m(5), m(6), m(7),
      m(8), m(8), m(8),
      m(9), m(9),
    ];
    expect(isWinningHand(tilesToCounts(tiles))).toBe(true);
  });

  it('detects winning hand with multiple sequences of same numbers', () => {
    const tiles = [
      m(2), m(2),
      m(3), m(4), m(5),
      m(3), m(4), m(5),
      m(6), m(7), m(8),
      m(6), m(7), m(8),
    ];
    expect(isWinningHand(tilesToCounts(tiles))).toBe(true);
  });

  it('detects chiitoitsu as a winning hand', () => {
    const tiles = [
      m(1), m(1),
      m(2), m(2),
      p(3), p(3),
      p(4), p(4),
      s(5), s(5),
      s(6), s(6),
      ton(), ton(),
    ];
    expect(isWinningHand(tilesToCounts(tiles))).toBe(true);
  });

  it('detects kokushi musou as a winning hand', () => {
    const tiles = [
      m(1), m(9),
      p(1), p(9),
      s(1), s(9),
      ton(), ton(), nan(), sha(), pei(),
      chun(), haku(), hatsu(),
    ];
    expect(isWinningHand(tilesToCounts(tiles))).toBe(true);
  });
});

describe('isTenpai', () => {
  it('detects tenpai with open wait (ryanmen)', () => {
    const tiles = [
      m(1), m(2), m(3),
      m(5), m(6), m(7),
      m(7), m(8), m(9),
      m(4), m(5),
      m(1), m(1),
    ];
    expect(isTenpai(tiles)).toBe(true);
    const waits = findTenpaiTiles(tiles);
    expect(waits).toContain(tileToIndex(m(3)));
    expect(waits).toContain(tileToIndex(m(6)));
  });

  it('detects tenpai with pair wait (shanpon)', () => {
    const tiles = [
      m(1), m(1), m(1),
      m(2), m(2), m(2),
      m(3), m(3), m(3),
      m(4), m(4),
      m(5), m(5),
    ];
    expect(isTenpai(tiles)).toBe(true);
    const waits = findTenpaiTiles(tiles);
    expect(waits).toContain(tileToIndex(m(4)));
    expect(waits).toContain(tileToIndex(m(5)));
  });

  it('detects no tenpai for random tiles', () => {
    const tiles = [
      m(1), m(4), m(9),
      p(1), p(4), p(9),
      s(1), s(4), s(9),
      ton(), nan(), sha(), pei(),
    ];
    expect(isTenpai(tiles)).toBe(false);
  });

  it('detects chiitoitsu tenpai', () => {
    const tiles = [
      m(1), m(1),
      m(2), m(2),
      p(3), p(3),
      p(4), p(4),
      s(5), s(5),
      s(6), s(6),
      ton(),
    ];
    expect(isTenpai(tiles)).toBe(true);
    expect(findTenpaiTiles(tiles)).toContain(tileToIndex(ton()));
  });

  it('detects kokushi tenpai', () => {
    const tiles = [
      m(1), m(9),
      p(1), p(9),
      s(1), s(9),
      ton(), nan(), sha(), pei(),
      chun(), haku(), hatsu(),
    ];
    expect(isTenpai(tiles)).toBe(true);
    expect(findTenpaiTiles(tiles)).toContain(tileToIndex(m(1)));
    expect(findTenpaiTiles(tiles)).toContain(tileToIndex(hatsu()));
  });
});

describe('calcShanten', () => {
  it('returns -1 for a winning 14-tile hand', () => {
    const tiles = [
      m(1), m(2), m(3),
      m(4), m(5), m(6),
      m(7), m(8), m(9),
      m(1), m(2), m(3),
      m(5), m(5),
    ];
    expect(calcShanten(tiles)).toBe(-1);
  });

  it('returns 0 for tenpai hands (13 tiles)', () => {
    // Ryanmen tenpai
    const tiles = [
      m(1), m(2), m(3),
      m(5), m(6), m(7),
      m(7), m(8), m(9),
      m(4), m(5),
      m(1), m(1),
    ];
    expect(calcShanten(tiles)).toBe(0);
  });

  it('returns 1 for iishanten (1-shanten) hands', () => {
    // 123m 456m 789m 45p 78s 9p (13 tiles)
    // Needs 3p/6p (to make 456p) or 6s/9s (to make 789s) -> iishanten
    const tiles = [
      m(1), m(2), m(3),
      m(4), m(5), m(6),
      m(7), m(8), m(9),
      p(4), p(5),
      s(7), s(8),
      p(9),
    ];
    expect(calcShanten(tiles)).toBe(1);
  });

  it('returns 2 for ryanshanten (2-shanten) hands', () => {
    // 123m 456m 12p 45p 78s 9p 1s (13 tiles)
    const tiles = [
      m(1), m(2), m(3),
      m(4), m(5), m(6),
      p(1), p(2),
      p(4), p(5),
      s(7), s(8),
      s(1),
    ];
    expect(calcShanten(tiles)).toBe(2);
  });

  it('returns 1 for chiitoitsu 1-shanten hand', () => {
    // 5 pairs + 3 isolated tiles (13 tiles) -> 1-shanten
    const tiles = [
      m(1), m(1),
      m(2), m(2),
      p(3), p(3),
      p(4), p(4),
      s(5), s(5),
      s(9), ton(), nan()
    ];
    expect(calcShanten(tiles)).toBe(1);
  });

  it('returns 1 for kokushi 1-shanten hand', () => {
    // 12 different kokushi tiles (13 tiles) -> 1-shanten
    const tiles = [
      m(1), m(9),
      p(1), p(9),
      s(1), s(9),
      ton(), nan(), sha(), pei(),
      chun(), haku(),
      m(2), // non-kokushi tile
    ];
    expect(calcShanten(tiles)).toBe(1);
  });
});
