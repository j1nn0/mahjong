import { describe, it, expect } from "vitest";
import { gameReducer, createInitialState, type GameState, type PlayerData } from "./GameState.js";
import { MeldType, Suit, Wind, type Tile, type Meld } from "../game/types.js";

function m(v: number): Tile {
  return { suit: Suit.Man, value: v as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 };
}
function p(v: number): Tile {
  return { suit: Suit.Pin, value: v as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 };
}

function makePlayer(hand: Tile[], melds: Meld[] = [], points = 25000): PlayerData {
  return {
    hand,
    melds,
    discards: [],
    riichi: false,
    doubleRiichi: false,
    ippatsu: false,
    temporaryFuriten: false,
    riichiFuriten: false,
    points,
    wind: Wind.Ton,
  };
}

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

describe("GameState rule accuracy regressions", () => {
  it("exhaustive draw should not mark a melded hand tenpai via flexible tile reuse", () => {
    // Player 0: 1111m 2m 3p 4p + 副露5pポン・6pポン。
    // 副露を固定すると不聴だが、allTiles を柔軟に分解すると 3m 待ちと誤判定される。
    const p0 = makePlayer(
      [m(1), m(1), m(1), m(1), m(2), p(3), p(4)],
      [
        { type: MeldType.Poon, tiles: [p(5), p(5), p(5)], calledTile: p(5) },
        { type: MeldType.Poon, tiles: [p(6), p(6), p(6)], calledTile: p(6) },
      ],
    );
    // 他プレイヤーは全員不聴
    const notenHand = [
      m(1),
      m(2),
      m(4),
      m(4),
      m(5),
      m(5),
      m(6),
      m(6),
      m(7),
      m(8),
      m(8),
      m(9),
      m(9),
    ];
    const players = [p0, makePlayer(notenHand), makePlayer(notenHand), makePlayer(notenHand)] as [
      PlayerData,
      PlayerData,
      PlayerData,
      PlayerData,
    ];

    const state = makeState({ players });
    const next = gameReducer(state, { type: "DRAW", player: 0 });

    expect(next.phase).toBe("roundEnded");
    expect(next.message).toContain("全員不聴");
  });
});
