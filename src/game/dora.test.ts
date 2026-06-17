import { describe, it, expect } from 'vitest';
import { nextDoraTile, countDora } from '../game/tiles.js';
import { Suit, type Tile, Wind, Dragon } from '../game/types.js';

function m(v: number, r?: boolean): Tile {
  return { suit: Suit.Man, value: v as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, red: r ?? false };
}
function p(v: number, r?: boolean): Tile {
  return { suit: Suit.Pin, value: v as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, red: r ?? false };
}
function s(v: number, r?: boolean): Tile {
  return { suit: Suit.Sou, value: v as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, red: r ?? false };
}
function ton(): Tile { return { suit: Suit.Wind, value: Wind.Ton, red: false }; }
function pei(): Tile { return { suit: Suit.Wind, value: Wind.Pei, red: false }; }
function haku(): Tile { return { suit: Suit.Dragon, value: Dragon.Haku, red: false }; }
function chun(): Tile { return { suit: Suit.Dragon, value: Dragon.Chun, red: false }; }

describe('nextDoraTile', () => {
  it('wraps number tiles: 9 → 1', () => {
    expect(nextDoraTile(m(9)).value).toBe(1);
  });
  it('increments number tiles: 1 → 2', () => {
    expect(nextDoraTile(m(1)).value).toBe(2);
  });
  it('wraps wind: 北 → 東', () => {
    expect(nextDoraTile(pei()).value).toBe(Wind.Ton);
  });
  it('wraps wind: 東 → 南', () => {
    expect(nextDoraTile(ton()).value).toBe(Wind.Nan);
  });
  it('wraps dragon: 中 → 白', () => {
    expect(nextDoraTile(chun()).value).toBe(Dragon.Haku);
  });
  it('wraps dragon: 白 → 發', () => {
    expect(nextDoraTile(haku()).value).toBe(Dragon.Hatsu);
  });
  it('preserves suit for number tiles', () => {
    expect(nextDoraTile(p(5)).suit).toBe(Suit.Pin);
  });
});

describe('countDora', () => {
  it('counts dora from one indicator', () => {
    const hand = [m(2)];
    const indicators = [m(1)];
    expect(countDora(hand, indicators, false)).toBe(1);
  });

  it('counts multiple matching dora tiles', () => {
    const hand = [m(2), m(2)];
    const indicators = [m(1)];
    expect(countDora(hand, indicators, false)).toBe(2);
  });

  it('counts zero dora when no match', () => {
    const hand = [m(3)];
    const indicators = [m(1)];
    expect(countDora(hand, indicators, false)).toBe(0);
  });

  it('counts from multiple indicators', () => {
    const hand = [m(2), p(3)];
    const indicators = [m(1), p(2)];
    expect(countDora(hand, indicators, false)).toBe(2);
  });

  it('counts red dora (red tiles)', () => {
    const hand = [p(5, true), s(5, true)];
    expect(countDora(hand, [], false)).toBe(2);
  });

  it('counts red dora even with dora indicators', () => {
    const hand = [p(5, true), m(2)];
    const indicators = [m(1)];
    expect(countDora(hand, indicators, false)).toBe(2); // 1 regular + 1 red
  });

  it('counts ura dora when riichi is true', () => {
    const hand = [s(4)];
    const indicators = [m(1)];
    const ura = [s(3)]; // ura indicator = s3 → dora = s4
    // Non-riichi: dora is from indicator m1 → m2, which hand doesn't have → 0
    // But with riichi+ura: dora from ura s3 → s4 matches hand → 1
    expect(countDora(hand, indicators, true, ura)).toBe(1);
  });

  it('does NOT count ura dora when isRiichi is false', () => {
    const hand = [s(4)];
    const indicators: Tile[] = [];
    const ura = [s(3)];
    // isRiichi=false, so ura dora should not be counted
    expect(countDora(hand, indicators, false, ura)).toBe(0);
  });

  it('combines regular dora, red dora, and ura dora', () => {
    const hand = [m(2), p(5, true), s(4)];
    const indicators = [m(1)];           // → m2 matches: 1
    const ura = [s(3)];                 // → s4 matches: 1
    expect(countDora(hand, indicators, true, ura)).toBe(3); // 1 + 1 + 1(red)
  });
});
