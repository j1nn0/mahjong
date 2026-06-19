import { describe, it, expect } from 'vitest';
import { aiChooseDiscard, evaluateDanger } from '../game/ai.js';
import { Suit, Wind, type Tile } from '../game/types.js';

function m(v: number, r?: boolean): Tile {
  return { suit: Suit.Man, value: v as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, red: r ?? false };
}
function s(v: number): Tile {
  return { suit: Suit.Sou, value: v as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, red: false };
}
function p(v: number): Tile {
  return { suit: Suit.Pin, value: v as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, red: false };
}
function nan(): Tile { return { suit: Suit.Wind, value: Wind.Nan, red: false }; }

describe('evaluateDanger', () => {
  it('returns 0 for genbutsu (tile in opponent discards)', () => {
    const danger = evaluateDanger(m(1), [[m(1)]], [true]);
    expect(danger).toBe(0);
  });

  it('returns 2 for suji of riichi opponent', () => {
    // Discard m(4), suji for m(1), m(7)
    const danger = evaluateDanger(m(1), [[m(4)]], [true]);
    expect(danger).toBe(2);
  });

  it('returns 8 for non-suji tile against riichi opponent', () => {
    // Opponent discarded m(1), m(1) didn't make any suji... actually m(1) suji is m(1),m(4),m(7)
    // A tile NOT in suji: e.g. m(2)
    const danger = evaluateDanger(m(2), [[m(1)]], [true]);
    // m(2) is not in suji group of m(1) (1-4-7)
    // Also not genbutsu
    expect(danger).toBe(8);
  });

  it('returns 8 for honor against riichi opponent (not genbutsu)', () => {
    // Riichi player didn't discard Nan
    const danger = evaluateDanger(nan(), [[m(1)]], [true]);
    expect(danger).toBe(8);
  });

  it('returns 4 for non-riichi opponent', () => {
    const danger = evaluateDanger(m(5), [[m(1)]], [false]);
    expect(danger).toBe(4);
  });

  it('returns worst danger across multiple opponents', () => {
    // Opponent 0 (non-riichi) → 4
    // Opponent 1 (riichi, genbutsu m(1)) → 0 for genbutsu m(1)
    // For tile m(1) which is genbutsu of O1 and non-suji of O0
    // Worst = 4 (from non-riichi opponent)
    const danger = evaluateDanger(m(1), [[m(5)], [m(1)]], [false, true]);
    expect(danger).toBe(4);
  });
});

describe('aiChooseDiscard', () => {
  it('prefers tenpai-keeping discard over non-tenpai', () => {
    // 14 tiles: 123m 456m 789m 123s + p1 + p9
    // Remove p1 or p9 → 4 groups + wait → tenpai
    // Remove s1 → no valid grouping → NOT tenpai
    const hand = [
      m(1), m(2), m(3),
      m(4), m(5), m(6),
      m(7), m(8), m(9),
      s(1), s(2), s(3),
      p(1), p(9),
    ];
    const discards: readonly (readonly Tile[])[] = [[], [], [], []];
    const riichi: readonly boolean[] = [false, false, false, false];
    
    const chosen = aiChooseDiscard(hand, discards, riichi);
    // Should prefer p(1) or p(9) (tenpai-keeping) over non-tenpai discards
    expect(chosen.suit).toBe(Suit.Pin);
  });

  it('avoids dangerous tiles when opponent is riichi', () => {
    // Same hand: 123m 456m 789m 123s p1 p9
    // Opponent 1 (riichi) discarded p(9) → p9 is genbutsu (safe, danger=0)
    // p1 is non-suji (suji of 9 = 3,6,9) → danger=8
    const hand = [
      m(1), m(2), m(3),
      m(4), m(5), m(6),
      m(7), m(8), m(9),
      s(1), s(2), s(3),
      p(9), p(1),
    ];
    const discards: readonly (readonly Tile[])[] = [[], [p(9)], [], []];
    const riichi: readonly boolean[] = [false, true, false, false];
    
    const chosen = aiChooseDiscard(hand, discards, riichi);
    // Should pick p(9) (genbutsu=0) over p(1) (non-suji=8)
    expect(chosen.suit).toBe(Suit.Pin);
    expect(chosen.value).toBe(9);
  });

  it('does not choose prohibited kuikae tiles', () => {
    const hand = [
      m(1), m(2), m(3),
      m(4), m(5), m(6),
      m(7), m(8), m(9),
      s(1), s(2), s(3),
      p(1), p(9),
    ];
    const discards: readonly (readonly Tile[])[] = [[], [], [], []];
    const riichi: readonly boolean[] = [false, false, false, false];

    const chosen = aiChooseDiscard(hand, discards, riichi, [p(1), p(9)]);

    expect(chosen.suit).not.toBe(Suit.Pin);
  });

  it('discards middle tiles (2-8) before terminals (1,9) when not in tenpai', () => {
    // Hand without tenpai: isolated tiles
    const hand = [
      m(1), m(5), m(9),
      p(1), p(5), p(9),
      s(1), s(5), s(9),
      nan(), nan(),
      nan(), nan(), nan(), // Just fill up 14 tiles
    ].slice(0, 14);
    const discards: readonly (readonly Tile[])[] = [[], [], [], []];
    const riichi: readonly boolean[] = [false, false, false, false];
    
    const chosen = aiChooseDiscard(hand, discards, riichi);
    expect([m(5), p(5), s(5)]).toContainEqual(chosen);
  });

  it('prefers to keep already-discarded honor tiles for safety when not in tenpai', () => {
    const hand = [
      m(1), m(9), p(1),
      p(9), s(1), s(9),
      nan(), { suit: Suit.Wind, value: Wind.Pei, red: false },
      m(2), m(3), m(4), m(5), m(6), m(7),
    ].slice(0, 14);
    const discards: readonly (readonly Tile[])[] = [[], [nan()], [], []];
    const riichi: readonly boolean[] = [false, false, false, false];
    
    const chosen = aiChooseDiscard(hand, discards, riichi);
    // Pei is not discarded by anyone -> score 0
    // Nan is discarded -> score 60
    // Middle tiles -> score 5 or more
    // Terminals -> score 10
    // So Pei has lowest score (0) and should be discarded first
    expect(chosen).toEqual({ suit: Suit.Wind, value: Wind.Pei, red: false });
  });
});
