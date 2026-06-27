import { describe, it, expect } from 'vitest';
import { aiChooseDiscard, evaluateDanger } from '../game/ai.js';
import { MeldType, Suit, Wind, type Meld, type Tile } from '../game/types.js';

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
function ton(): Tile { return { suit: Suit.Wind, value: Wind.Ton, red: false }; }

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

  it('returns 10 for honor against riichi opponent (not genbutsu)', () => {
    // Riichi player didn't discard Nan
    const danger = evaluateDanger(nan(), [[m(1)]], [true]);
    expect(danger).toBe(10);
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

  it('assigns lower danger for visible honors and very high for fresh (生牌) honors', () => {
    // Evaluating danger of nan()
    // Case 1: Fresh honor (0 visible in discards, hand, melds)
    const dangerFresh = evaluateDanger(nan(), [[m(1)]], [true], [[]], [m(2)]);
    expect(dangerFresh).toBeGreaterThanOrEqual(9);

    // Case 2: 4 visible honors (e.g. 3 in discards, 1 in my hand)
    const danger4Visible = evaluateDanger(nan(), [[nan(), nan(), nan()]], [true], [[]], [nan()]);
    expect(danger4Visible).toBeLessThanOrEqual(1);
  });

  it('T-022: selfIndex指定時も自分の公開牌を字牌のvisibleCountに含める', () => {
    const selfPon: Meld = { type: MeldType.Poon, tiles: [nan(), nan(), nan()], calledTile: nan() };
    const fromDiscards = evaluateDanger(
      nan(), [[nan(), nan(), nan()], []], [false, true], [[], []], [], 0,
    );
    const fromMeld = evaluateDanger(nan(), [[], []], [false, true], [[selfPon], []], [], 0);

    expect(fromDiscards).toBe(2);
    expect(fromMeld).toBe(2);
  });

  it('raises danger of middle tiles when riichi opponent discarded many terminals', () => {
    // Opponent discarded terminal tiles: m(1), m(9), p(1), p(9)
    // Middle tile m(5) (non-suji) should have increased danger
    const dangerTerminals = evaluateDanger(m(5), [[m(1), m(9), p(1), p(9)]], [true]);
    expect(dangerTerminals).toBeGreaterThan(8);
  });

  it('raises danger for specific suit when non-riichi opponent has multiple melds of that suit (honitsu)', () => {
    // Opponent is not riichi, but has 2 melds of Man (e.g. Chi 123m, Pon 555m)
    const melds = [
      { type: 'chi', tiles: [m(1), m(2), m(3)], calledTile: m(1) },
      { type: 'pon', tiles: [m(5), m(5), m(5)], calledTile: m(5) }
    ] as any;
    
    // Evaluating Man tile (m(4)) vs Pin tile (p(4))
    const dangerMan = evaluateDanger(m(4), [[]], [false], [melds], []);
    const dangerPin = evaluateDanger(p(4), [[]], [false], [melds], []);
    
    expect(dangerMan).toBeGreaterThan(dangerPin);
  });

  it('raises base danger for players with 3 or more melds', () => {
    const melds = [
      { type: 'chi', tiles: [m(1), m(2), m(3)], calledTile: m(1) },
      { type: 'pon', tiles: [m(5), m(5), m(5)], calledTile: m(5) },
      { type: 'pon', tiles: [p(9), p(9), p(9)], calledTile: p(9) }
    ] as any;

    const danger = evaluateDanger(s(5), [[]], [false], [melds], []);
    expect(danger).toBeGreaterThan(4);
  });
  it('T-022: 4が切られているとき1と7は片スジ（安全）', () => {
    expect(evaluateDanger(m(1), [[m(4)]], [true])).toBe(2);
    expect(evaluateDanger(m(7), [[m(4)]], [true])).toBe(2);
  });

  it('T-022: 1だけが切られているとき4や7はスジではない（危険）', () => {
    expect(evaluateDanger(m(4), [[m(1)]], [true])).toBe(8);
    expect(evaluateDanger(m(7), [[m(1)]], [true])).toBe(8);
  });

  it('T-022: 1と7の両方が切られているとき4は中スジ（安全）', () => {
    expect(evaluateDanger(m(4), [[m(1), m(7)]], [true])).toBe(2);
  });

  it('T-022: 5が切られているとき2と8は片スジ（安全）', () => {
    expect(evaluateDanger(m(2), [[m(5)]], [true])).toBe(2);
    expect(evaluateDanger(m(8), [[m(5)]], [true])).toBe(2);
  });

  it('T-022: 6が切られているとき3と9は片スジ（安全）', () => {
    expect(evaluateDanger(m(3), [[m(6)]], [true])).toBe(2);
    expect(evaluateDanger(m(9), [[m(6)]], [true])).toBe(2);
  });

  it('T-022: スジは同じスートにのみ適用される', () => {
    expect(evaluateDanger(p(1), [[m(4)]], [true])).toBe(8);
  });

  it('T-022: selfIndexで自分のリーチを危険度評価から除外する', () => {
    const danger = evaluateDanger(
      m(5), [[m(1)], [m(2)], [m(3)], []], [true, false, false, false], undefined, undefined, 0,
    );
    expect(danger).toBe(4);
  });

  it('T-022: selfIndex未指定時は従来通り全プレイヤーを評価する', () => {
    const danger = evaluateDanger(m(5), [[m(1)], [m(2)], [m(3)], []], [true, false, false, false]);
    expect(danger).toBe(8);
  });
  it('detects kabe: reduces danger when adjacent tile has 4 visible copies', () => {
    // m(5) with m(6) fully visible (4 copies in discards): ryanmen 5-6 is impossible
    const dangerWithKabe = evaluateDanger(m(5), [[m(6), m(6), m(6), m(6)]], [true]);
    // Should be lower than without kabe
    const dangerNoKabe = evaluateDanger(m(5), [[m(6), m(6), m(6)]], [true]);
    expect(dangerWithKabe).toBeLessThan(dangerNoKabe);
  });
  it('raises danger when 3 copies are visible across melds and discards (near-wall threat)', () => {
    // Opponent 0: not riichi, no melds, no m5 discards
    // Opponent 1: riichi, no melds, no m5 discards
    // Global visible: 3 copies of m5 (2 in opponent 0 discards, 1 in my hand)
    // For opponent 1 (riichi), m5 is non-suji, visibleCount=3 → +2 penalty
    const danger3 = evaluateDanger(
      m(5), [[m(5), m(5)], []], [false, true], [[], []], [m(5)],
    );
    const danger2 = evaluateDanger(
      m(5), [[m(5)], []], [false, true], [[], []], [m(5)],
    );
    expect(danger3).toBeGreaterThan(danger2);
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
      nan(), { suit: Suit.Wind, value: Wind.Pei } as Tile,
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
    expect(chosen).toEqual({ suit: Suit.Wind, value: Wind.Pei } as Tile);
  });

  it('chooses discard that minimizes shanten when not in tenpai', () => {
    // 14 tiles: 123m 456m (2 melds), 12p 45p 78s (3 taatsu), 9p 9s nan (3 isolated)
    // Minimizing shanten means discarding one of the isolated tiles (9p or nan()) -> shanten 1
    // Discarding a tile from a taatsu (e.g. 4p) would increase shanten to 2
    const hand = [
      m(1), m(2), m(3),
      m(4), m(5), m(6),
      p(1), p(2),
      p(4), p(5),
      s(7), s(8),
      p(9), nan(),
    ];
    const discards: readonly (readonly Tile[])[] = [[], [], [], []];
    const riichi: readonly boolean[] = [false, false, false, false];

    const chosen = aiChooseDiscard(hand, discards, riichi);

    const badDiscards = [
      m(1), m(2), m(3), m(4), m(5), m(6),
      p(1), p(2), p(4), p(5), s(7), s(8)
    ];
    const isBad = badDiscards.some(b => b.suit === chosen.suit && b.value === chosen.value);
    expect(isBad).toBe(false);
  });

  it('prefers to discard a safe honor tile rather than breaking a ready (tenpai) hand', () => {
    // Hand: 123m 456m 789s (3 melds), 88s (pair, from s789s + s8 + s8), chun chun (pair), nan (1 safe honor)
    // Discarding nan() yields tenpai (shanten 0, waiting for 8s/chun)
    // Discarding 8s or chun breaks the tenpai (shanten 1)
    // Traditional heuristic scores safe nan() as 60, and pairs as 50, which would discard 8s or chun!
    // With shanten minimization, it must discard nan() to keep tenpai (shanten 0).
    const hand = [
      m(1), m(2), m(3),
      m(4), m(5), m(6),
      s(7), s(8), s(9),
      s(8), s(8),
      p(5), p(5),
      nan(),
    ];
    // Add nan() to discards to make it "safe"
    const discards: readonly (readonly Tile[])[] = [[nan()], [], [], []];
    const riichi: readonly boolean[] = [false, false, false, false];

    const chosen = aiChooseDiscard(hand, discards, riichi);

    // Should discard nan() to maintain tenpai
    expect(chosen).toEqual(nan());
  });

  it('does not break taatsu (塔子) or pairs to keep safe honors when in iishanten', () => {
    // Hand: 123m 456m (2 melds), 88s 55p (2 pairs), 23s (1 taatsu), nan ton (2 safe honors)
    // Discarding nan() or ton() keeps iishanten (shanten 1)
    // Discarding a taatsu tile (2s, 3s) breaks taatsu and increases shanten to 2
    // Traditional heuristic scores safe nan()/ton() as 60, pairs as 50, and taatsu as 20, which would discard 2s or 3s!
    // With shanten minimization, it must discard nan() or ton() to keep shanten 1.
    const hand = [
      m(1), m(2), m(3),
      m(4), m(5), m(6),
      s(8), s(8),
      p(5), p(5),
      s(2), s(3),
      nan(), ton(),
    ];
    // Add nan() and ton() to discards to make them "safe"
    const discards: readonly (readonly Tile[])[] = [[nan(), ton()], [], [], []];
    const riichi: readonly boolean[] = [false, false, false, false];

    const chosen = aiChooseDiscard(hand, discards, riichi);

    // Should discard nan() or ton() to keep shanten 1
    expect([nan(), ton()]).toContainEqual(chosen);
  });
});
