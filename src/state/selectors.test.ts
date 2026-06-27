import { describe, it, expect } from "vitest";
import { createInitialState, turnTileCount } from "./GameState.js";
import type { GameState, PlayerData } from "./GameState.js";
import { MeldType, Suit, Wind, type Tile, type Meld } from "../game/types.js";
import {
  canHumanTsumo,
  canHumanRiichi,
  canHumanAnkan,
  canHumanKakan,
  canHumanKan,
  canHumanKyuushu,
  computeHumanWaits,
  getHumanHand,
} from "./selectors.js";

// ── Tile factory helpers ────────────────────────────────────────────

function m(v: number, r?: boolean): Tile {
  return { suit: Suit.Man, value: v as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, red: r ?? false };
}
function p(v: number, r?: boolean): Tile {
  return { suit: Suit.Pin, value: v as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, red: r ?? false };
}
function s(v: number, r?: boolean): Tile {
  return { suit: Suit.Sou, value: v as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, red: r ?? false };
}
function ton(): Tile {
  return { suit: Suit.Wind, value: Wind.Ton, red: false };
}
function nan(): Tile {
  return { suit: Suit.Wind, value: Wind.Nan, red: false };
}
function sha(): Tile {
  return { suit: Suit.Wind, value: Wind.Sha, red: false };
}
function pei(): Tile {
  return { suit: Suit.Wind, value: Wind.Pei, red: false };
}

// ── State factory helpers ──────────────────────────────────────────

function makePlayer(overrides: Partial<PlayerData> = {}): PlayerData {
  return {
    hand: [],
    melds: [],
    discards: [],
    riichi: false,
    doubleRiichi: false,
    ippatsu: false,
    temporaryFuriten: false,
    riichiFuriten: false,
    points: 25000,
    wind: Wind.Ton,
    ...overrides,
  };
}

const BASE_PLAYERS: readonly [PlayerData, PlayerData, PlayerData, PlayerData] = [
  makePlayer(),
  makePlayer({ wind: Wind.Nan }),
  makePlayer({ wind: Wind.Sha }),
  makePlayer({ wind: Wind.Pei }),
];

function makeState(overrides: Partial<GameState> = {}): GameState {
  const base = createInitialState();
  return {
    ...base,
    phase: "playing",
    wall: [],
    deadWall: { tiles: [], doraCount: 1 },
    roundWind: 0,
    roundNumber: 1,
    dealer: 0,
    honba: 0,
    riichiSticks: 0,
    currentPlayer: 0,
    lastDiscard: null,
    winner: null,
    claimOptions: [],
    lastDrawnTile: null,
    lastScoreResult: null,
    finalRanking: null,
    message: "",
    pendingRinshan: false,
    ...overrides,
  };
}

// Convenience: make a playing-phase GameState with custom player 0
function makePlayState(
  player0Overrides: Partial<PlayerData>,
  otherOverrides: Partial<GameState> = {},
): GameState {
  return makeState({
    phase: "playing",
    currentPlayer: 0,
    players: [makePlayer(player0Overrides), BASE_PLAYERS[1], BASE_PLAYERS[2], BASE_PLAYERS[3]],
    ...otherOverrides,
  });
}

// ── Test: getHumanHand ────────────────────────────────────────────

describe("getHumanHand", () => {
  it("returns player 0 hand", () => {
    const hand = [m(1), m(2), m(3)];
    const state = makePlayState({ hand });
    expect(getHumanHand(state)).toBe(hand);
  });
});

// ── Test: canHumanTsumo ─────────────────────────────────────────────

describe("canHumanTsumo", () => {
  it("returns true when phase=playing, currentPlayer=0, turnTileCount=14, and hand is winning", () => {
    // Tanyao: all 2-8 tiles, forms 4 sequences + pair (m8)
    // (m2,m3,m4)(m5,m6,m7)(p2,p3,p4)(s5,s6,s7) + (m8,m8)
    const hand = [m(2), m(3), m(4), m(5), m(6), m(7), p(2), p(3), p(4), s(5), s(6), s(7), m(8), m(8)];
    const melds: Meld[] = [];
    const state = makePlayState({ hand, melds }, { lastDrawnTile: m(8) });
    expect(turnTileCount(state.players[0])).toBe(14);
    expect(canHumanTsumo(state)).toBe(true);
  });

  it("returns false when phase is not playing", () => {
    const state = makePlayState(
      {
        hand: [m(1), m(2), m(3), m(4), m(5), m(6), m(7), m(8), m(9), p(1), p(2), p(3), p(4), p(5)],
      },
      { phase: "claiming" },
    );
    expect(canHumanTsumo(state)).toBe(false);
  });

  it("returns false when currentPlayer is not 0", () => {
    const state = makePlayState(
      {
        hand: [m(1), m(2), m(3), m(4), m(5), m(6), m(7), m(8), m(9), p(1), p(2), p(3), p(4), p(5)],
      },
      { currentPlayer: 1 },
    );
    expect(canHumanTsumo(state)).toBe(false);
  });

  it("returns false when turnTileCount !== 14", () => {
    const hand = [m(1), m(2), m(3), m(4), m(5), m(6), m(7), m(8), m(9), p(1), p(2), p(3), p(4)];
    const state = makePlayState({ hand });
    expect(turnTileCount(state.players[0])).toBe(13);
    expect(canHumanTsumo(state)).toBe(false);
  });
  it("returns false when hand is 14 tiles but not a winning hand", () => {
    // 12 terminal/honor kinds + 2 middle tiles = no kokushi, no standard hand
    const hand = [m(1), m(9), p(1), p(9), s(1), s(9), ton(), nan(), sha(), pei(), m(1), m(2), s(2), m(3)];
    const state = makePlayState({ hand, melds: [] }, { lastDrawnTile: m(3) });
    expect(turnTileCount(state.players[0])).toBe(14);
    expect(canHumanTsumo(state)).toBe(false);
  });
});



// ── Test: canHumanRiichi ─────────────────────────────────────────

describe("canHumanRiichi", () => {
  it("returns true when phase=playing, currentPlayer=0, not riichi, points>=1000, closed hand, and tenpai", () => {
    // 14 tiles: discarding ton leaves (m1,m2,m3)(m4,m5,m6)(p1,p2,p3)(s1,s2,s3)+ton → tanki wait for ton
    const hand = [m(1), m(2), m(3), m(4), m(5), m(6), p(1), p(2), p(3), s(1), s(2), s(3), ton(), ton()];
    const state = makePlayState({ hand, melds: [], riichi: false, points: 25000 });
    expect(canHumanRiichi(state)).toBe(true);
  });

  it("returns false when already riichi", () => {
    const state = makePlayState({ points: 25000, riichi: true });
    expect(canHumanRiichi(state)).toBe(false);
  });

  it("returns false when points < 1000", () => {
    const state = makePlayState({ points: 500, riichi: false });
    expect(canHumanRiichi(state)).toBe(false);
  });

  it("returns false when phase is not playing", () => {
    const state = makePlayState({ riichi: false, points: 25000 }, { phase: "claiming" });
    expect(canHumanRiichi(state)).toBe(false);
  });
  it("returns false when player has open melds", () => {
    const hand = [m(1), m(2), m(3), m(4), m(5), m(6), p(1), p(2), p(3), s(1), s(2), s(3), ton(), ton()];
    const melds: Meld[] = [{ type: MeldType.Poon, tiles: [nan(), nan(), nan()] }];
    const state = makePlayState({ hand, melds, riichi: false, points: 25000 });
    expect(canHumanRiichi(state)).toBe(false);
  });

  it("returns false when no discard leads to tenpai", () => {
    // Truly non-tenpai: 5 honors + 9 gapped numbers from 3 suits
    const hand = [m(1), m(4), m(7), p(2), p(5), p(8), s(3), s(6), s(9), ton(), nan(), sha(), pei(), m(2)];
    const state = makePlayState({ hand, melds: [], riichi: false, points: 25000 });
    expect(canHumanRiichi(state)).toBe(false);
  });
});

// ── Test: canHumanAnkan ──────────────────────────────────────────

describe("canHumanAnkan", () => {
  it("returns true when hand has 4 of same kind, not riichi", () => {
    const hand = [
      m(1),
      m(1),
      m(1),
      m(1),
      m(2),
      m(2),
      m(2),
      m(2),
      m(3),
      m(4),
      m(5),
      m(6),
      m(7),
      m(8),
    ];
    const state = makePlayState({ hand, riichi: false });
    expect(canHumanAnkan(state, 0)).toBe(true);
  });

  it("returns false when less than 4 of same kind", () => {
    const hand = [
      m(1),
      m(1),
      m(1),
      m(2),
      m(3),
      m(4),
      m(5),
      m(6),
      m(7),
      m(8),
      m(9),
      p(1),
      p(2),
      p(3),
    ];
    const state = makePlayState({ hand, riichi: false });
    expect(canHumanAnkan(state, 0)).toBe(false);
  });

  it("returns false when selectedIndex out of bounds", () => {
    const hand: Tile[] = [];
    const state = makePlayState({ hand, riichi: false });
    expect(canHumanAnkan(state, 0)).toBe(false);
  });

  it("returns true when riichi and ankan preserves waits", () => {
    // Hand: 1m×4 + 2s,3s,4s, 5s,6s,7s, 8s,9s,9s,9s (14 tiles)
    // Both removing 1×1m and removing all 4×1m (ankan) yield same waits
    const hand = [
      m(1),
      m(1),
      m(1),
      m(1),
      s(2),
      s(3),
      s(4),
      s(5),
      s(6),
      s(7),
      s(8),
      s(9),
      s(9),
      s(9),
    ];
    const state = makePlayState({ hand, riichi: true });
    expect(canHumanAnkan(state, 0)).toBe(true);
  });

  it("returns false when riichi and ankan changes waits", () => {
    // Hand: 1111m 2222m 345p 678s (14 tiles, 4x 1m)
    // Removing 1×1m gives wait on 3m
    // Removing all 4×1m (ankan) gives wait on 2m
    const hand = [
      m(1),
      m(1),
      m(1),
      m(1),
      m(2),
      m(2),
      m(2),
      m(2),
      p(3),
      p(4),
      p(5),
      s(6),
      s(7),
      s(8),
    ];
    const state = makePlayState({ hand, riichi: true });
    expect(canHumanAnkan(state, 0)).toBe(false);
  });
});

// ── Test: canHumanKakan ──────────────────────────────────────────

describe("canHumanKakan", () => {
  it("returns true when hand has a tile matching an existing Poon meld", () => {
    const hand = [
      m(1),
      m(2),
      m(3),
      m(4),
      m(5),
      m(6),
      m(7),
      m(8),
      m(9),
      p(1),
      p(2),
      p(3),
      p(4),
      m(1),
    ];
    const melds: Meld[] = [{ type: MeldType.Poon, tiles: [m(1), m(1), m(1)], calledTile: m(1) }];
    const state = makePlayState({ hand, melds, riichi: false });
    // index 0 = m(1), matches the Poon meld
    expect(canHumanKakan(state, 0)).toBe(true);
  });

  it("returns false when no matching Poon", () => {
    const hand = [
      m(2),
      m(2),
      m(3),
      m(4),
      m(5),
      m(6),
      m(7),
      m(8),
      m(9),
      p(1),
      p(2),
      p(3),
      p(4),
      p(5),
    ];
    const melds: Meld[] = [{ type: MeldType.Poon, tiles: [m(1), m(1), m(1)], calledTile: m(1) }];
    const state = makePlayState({ hand, melds, riichi: false });
    // index 0 = m(2), does not match the Poon meld
    expect(canHumanKakan(state, 0)).toBe(false);
  });

  it("returns false when already riichi", () => {
    const hand = [
      m(1),
      m(2),
      m(3),
      m(4),
      m(5),
      m(6),
      m(7),
      m(8),
      m(9),
      p(1),
      p(2),
      p(3),
      p(4),
      m(1),
    ];
    const melds: Meld[] = [{ type: MeldType.Poon, tiles: [m(1), m(1), m(1)], calledTile: m(1) }];
    const state = makePlayState({ hand, melds, riichi: true });
    expect(canHumanKakan(state, 0)).toBe(false);
  });

  it("returns false when selectedIndex out of bounds", () => {
    const hand: Tile[] = [];
    const melds: Meld[] = [
      { type: MeldType.Poon, tiles: [ton(), ton(), ton()], calledTile: ton() },
    ];
    const state = makePlayState({ hand, melds, riichi: false });
    expect(canHumanKakan(state, 0)).toBe(false);
  });
});

// ── Test: canHumanKan ────────────────────────────────────────────

describe("canHumanKan", () => {
  it("returns true when ankan is possible", () => {
    const hand = [
      m(1),
      m(1),
      m(1),
      m(1),
      m(2),
      m(2),
      m(2),
      m(2),
      m(3),
      m(4),
      m(5),
      m(6),
      m(7),
      m(8),
    ];
    const state = makePlayState({ hand, riichi: false });
    expect(canHumanKan(state, 0)).toBe(true);
  });

  it("returns true when kakan is possible", () => {
    const hand = [
      m(2),
      m(2),
      m(3),
      m(4),
      m(5),
      m(6),
      m(7),
      m(8),
      m(9),
      p(1),
      p(2),
      p(3),
      p(4),
      m(1),
    ];
    const melds: Meld[] = [{ type: MeldType.Poon, tiles: [m(1), m(1), m(1)], calledTile: m(1) }];
    const state = makePlayState({ hand, melds, riichi: false });
    expect(canHumanKan(state, hand.length - 1)).toBe(true); // last index = m(1)
  });

  it("returns false when neither ankan nor kakan", () => {
    const hand = [
      m(2),
      m(3),
      m(4),
      m(5),
      m(6),
      m(7),
      m(8),
      m(9),
      p(1),
      p(2),
      p(3),
      p(4),
      p(5),
      p(6),
    ];
    const state = makePlayState({ hand, riichi: false });
    // No 4 of same kind, no matching Poon
    expect(canHumanKan(state, 0)).toBe(false);
  });
});

// ── Test: canHumanKyuushu ────────────────────────────────────────

describe("canHumanKyuushu", () => {
  it("delegates to canDeclareKyuushuKyuuhai with player=0", () => {
    // Not possible with a normal hand (need 9+ yaochu kinds and first turn)
    const state = makePlayState({ hand: [] });
    // Just verify it runs without error and returns a boolean
    const result = canHumanKyuushu(state);
    expect(typeof result).toBe("boolean");
  });

  it("returns false for a non-yaochu hand on first turn", () => {
    // Hand of simples should not qualify
    const hand = [
      m(2),
      m(3),
      m(4),
      m(5),
      m(6),
      m(7),
      m(8),
      p(2),
      p(3),
      p(4),
      p(5),
      p(6),
      p(7),
      s(2),
    ];
    const state = makePlayState({ hand });
    expect(canHumanKyuushu(state)).toBe(false);
  });
});

// ── Test: computeHumanWaits ──────────────────────────────────────

describe("computeHumanWaits", () => {
  it("returns non-empty array when there are waits", () => {
    // 13 tiles in tenpai shape, plus drawn 14th tile
    // Hand before draw: 111m 222m 333m 45m 66m (13 tiles, wait on 3m or 6m)
    // After draw of m(1): 1111m 222m 333m 45m 66m (14 tiles)
    const hand = [
      m(1),
      m(1),
      m(1),
      m(1),
      m(2),
      m(2),
      m(2),
      m(3),
      m(3),
      m(3),
      m(4),
      m(5),
      m(6),
      m(6),
    ];
    const state = makePlayState({ hand, riichi: false });
    // turnTileCount = 14 (hand with 14 tiles, no melds), exclude riichi
    // selectedIndex 0 → simulating discarding m(1), waits should include 3m and 6m
    const waits = computeHumanWaits(state, 0);
    expect(waits.length).toBeGreaterThan(0);
    // 45 shape needs 3 or 6 to form 345 or 456
    const waitValues = waits.map((t) => `${t.suit}${t.value}`);
    expect(waitValues).toContain("m3");
    expect(waitValues).toContain("m6");
  });

  it("returns empty array when hand is not tenpai", () => {
    // Random isolated tiles → no waits regardless of which tile is selected
    const hand = [
      m(1),
      m(1),
      p(2),
      s(3),
      m(4),
      p(5),
      s(6),
      m(7),
      p(8),
      s(9),
      ton(),
      ton(),
      ton(),
      s(4),
    ];
    const state = makePlayState({ hand, riichi: false });
    const waits = computeHumanWaits(state, 0);
    expect(waits.length).toBe(0);
  });

  it("returns empty array when riichi", () => {
    const hand = [
      m(1),
      m(1),
      m(1),
      m(1),
      m(2),
      m(2),
      m(2),
      m(3),
      m(4),
      m(5),
      m(6),
      m(7),
      m(8),
      m(9),
    ];
    const state = makePlayState({ hand, riichi: true });
    expect(computeHumanWaits(state, 0)).toEqual([]);
  });

  it("returns empty array when not playing phase", () => {
    const hand = [
      m(1),
      m(1),
      m(1),
      m(1),
      m(2),
      m(2),
      m(2),
      m(3),
      m(4),
      m(5),
      m(6),
      m(7),
      m(8),
      m(9),
    ];
    const state = makePlayState({ hand, riichi: false }, { phase: "claiming" });
    expect(computeHumanWaits(state, 0)).toEqual([]);
  });

  it("returns empty array when turnTileCount !== 14", () => {
    const hand = [m(1), m(2), m(3), m(4), m(5), m(6), m(7), m(8), m(9), p(1), p(2), p(3), p(4)];
    const state = makePlayState({ hand, riichi: false }); // 13 tiles
    expect(computeHumanWaits(state, 0)).toEqual([]);
  });
});
