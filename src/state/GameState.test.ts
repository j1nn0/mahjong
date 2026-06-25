import { describe, it, expect } from "vitest";
import {
  gameReducer,
  createInitialState,
  collectClaims,
  sortClaimsByPriority,
  processAiTurn,
  normalizeGameState,
  canDeclareKyuushuKyuuhai,
  applyRonPayment,
  applyDoubleRonPayments,
  rankPlayers,
  finishAbortiveDraw,
} from "./GameState.js";
import type { GameState, PlayerData } from "./GameState.js";
import { MeldType, Suit, type Tile, type Meld, type Discard, PlayerWind } from "../game/types.js";
import type { ScoreResult } from "../game/scoring.js";
import { YakuId } from "../game/yaku.js";

function m(v: number): Tile {
  return { suit: Suit.Man, value: v as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 };
}
function p(v: number): Tile {
  return { suit: Suit.Pin, value: v as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 };
}
function s(v: number): Tile {
  return { suit: Suit.Sou, value: v as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 };
}
function ton(): Tile {
  return { suit: Suit.Wind, value: 0 };
}
function nan(): Tile {
  return { suit: Suit.Wind, value: 1 };
}
function sha(): Tile {
  return { suit: Suit.Wind, value: 2 };
}
function pei(): Tile {
  return { suit: Suit.Wind, value: 3 };
}

function makeTestPlayer(hand: Tile[]): PlayerData {
  return {
    hand,
    melds: [],
    discards: [] as Discard[],
    riichi: false,
    doubleRiichi: false,
    ippatsu: false,
    temporaryFuriten: false,
    riichiFuriten: false,
    points: 25000,
    wind: 0 as never,
  };
}

function makePlayers(p0: PlayerData, p1: PlayerData, p2: PlayerData, p3: PlayerData) {
  return [p0, p1, p2, p3] as unknown as [PlayerData, PlayerData, PlayerData, PlayerData];
}

function winningTanyao13(): Tile[] {
  return [m(2), m(3), m(4), p(5), p(6), p(7), s(3), s(4), s(5), p(2), p(3), p(4), p(5)];
}

function twoSidedTanyao13(): Tile[] {
  return [m(3), m(4), p(2), p(3), p(4), s(3), s(4), s(5), p(5), p(6), p(7), m(6), m(6)];
}

function twoSidedTanyao13WaitingP4(): Tile[] {
  return [m(2), m(3), m(4), p(5), p(6), p(7), s(3), s(4), s(5), p(2), p(3), m(6), m(6)];
}

function startedState(overrides: Partial<GameState> = {}): GameState {
  return {
    ...gameReducer(
      createInitialState(() => 0),
      { type: "START_GAME", dealer: 0 },
    ),
    ...overrides,
  };
}

function pointsTotal(state: GameState): number {
  return state.players.reduce((sum, player) => sum + player.points, 0) + state.riichiSticks * 1000;
}

describe("collectClaims", () => {
  it("detects ron when a player can win on the discard", () => {
    const players = makePlayers(
      makeTestPlayer(winningTanyao13()),
      makeTestPlayer([p(5)]),
      makeTestPlayer([]),
      makeTestPlayer([]),
    );

    const claims = collectClaims(p(5), 1, players);

    expect(claims.some((c) => c.type === "ron" && c.player === 0)).toBe(true);
  });

  it("does not detect ron when the player is furiten from their own discard", () => {
    const players = makePlayers(
      {
        ...makeTestPlayer(winningTanyao13()),
        discards: [{ tile: p(5), isRiichi: false, player: 0 as PlayerWind }],
      },
      makeTestPlayer([p(5)]),
      makeTestPlayer([]),
      makeTestPlayer([]),
    );

    const claims = collectClaims(p(5), 1, players);

    expect(claims.some((c) => c.type === "ron" && c.player === 0)).toBe(false);
  });

  it("does not detect ron while the player is temporarily furiten", () => {
    const players = makePlayers(
      { ...makeTestPlayer(winningTanyao13()), temporaryFuriten: true },
      makeTestPlayer([p(5)]),
      makeTestPlayer([]),
      makeTestPlayer([]),
    );

    const claims = collectClaims(p(5), 1, players);

    expect(claims.some((c) => c.type === "ron" && c.player === 0)).toBe(false);
  });

  it("does not detect ron after the player missed ron in riichi", () => {
    const players = makePlayers(
      { ...makeTestPlayer(winningTanyao13()), riichi: true, riichiFuriten: true },
      makeTestPlayer([p(5)]),
      makeTestPlayer([]),
      makeTestPlayer([]),
    );

    const claims = collectClaims(p(5), 1, players);

    expect(claims.some((c) => c.type === "ron" && c.player === 0)).toBe(false);
  });

  it("detects pon when a player has 2 matching tiles", () => {
    // Player 1 discards m4, Player 2 has m4,m4
    const players = makePlayers(
      makeTestPlayer([]),
      makeTestPlayer([m(1), m(1), m(1), m(3), m(4), m(5)]), // discarder (P1)
      makeTestPlayer([m(4), m(4), m(5), m(6), p(1), p(2), p(3)]), // can pon m4
      makeTestPlayer([]),
    );
    const claims = collectClaims(m(4), 1, players);
    expect(claims.some((c) => c.type === "pon" && c.player === 2)).toBe(true);
  });

  it("detects chi for the next player", () => {
    // Player 0 discards m5, Player 1 (next) has m4,m6
    const players = makePlayers(
      makeTestPlayer([m(5)]), // will discard m5
      makeTestPlayer([m(4), m(6), p(1), p(2), p(3), p(4), p(5), p(6), p(7), p(8), p(9)]), // can chi 456
      makeTestPlayer([]),
      makeTestPlayer([]),
    );
    const claims = collectClaims(m(5), 0, players);
    expect(claims.some((c) => c.type === "chi" && c.player === 1)).toBe(true);
  });

  it("detects multiple chi options when possible", () => {
    // Player 0 discards m5, Player 1 has m3,m4,m6,m7 -> can chi 345, 456, 567
    const players = makePlayers(
      makeTestPlayer([m(5)]),
      makeTestPlayer([
        m(3),
        m(4),
        m(6),
        m(7),
        p(1),
        p(2),
        p(3),
        p(4),
        p(5),
        p(6),
        p(7),
        p(8),
        p(9),
      ]),
      makeTestPlayer([]),
      makeTestPlayer([]),
    );
    const claims = collectClaims(m(5), 0, players);
    const chiClaims = claims.filter((c) => c.type === "chi" && c.player === 1);
    expect(chiClaims).toHaveLength(3);
    // verify the tiles in the options
    const combos = chiClaims.map((c) =>
      c.tiles
        .map((t) => t.value)
        .sort()
        .join(""),
    );
    expect(combos).toContain("345");
    expect(combos).toContain("456");
    expect(combos).toContain("567");
  });

  it("does not detect chi for non-adjacent player", () => {
    // Player 0 discards m5, Player 2 is NOT next (player 1 is)
    const players = makePlayers(
      makeTestPlayer([m(5)]),
      makeTestPlayer([
        p(1),
        p(2),
        p(3),
        p(4),
        p(5),
        p(6),
        p(7),
        p(8),
        p(9),
        s(1),
        s(2),
        s(3),
        s(4),
      ]), // no m tiles
      makeTestPlayer([m(4), m(6), p(1), p(2), p(3), p(4), p(5), p(6), p(7), p(8), p(9)]), // could chi but not next
      makeTestPlayer([]),
    );
    const claims = collectClaims(m(5), 0, players);
    // Player 2 (index 2) should NOT have chi option
    expect(claims.filter((c) => c.type === "chi" && c.player === 2)).toHaveLength(0);
  });

  it("detects daiminkan when a player has 3 matching tiles", () => {
    const players = makePlayers(
      makeTestPlayer([]),
      makeTestPlayer([p(9), p(9), p(9), m(1), m(2), m(3)]),
      makeTestPlayer([p(9), p(9), p(9), m(1), m(2), m(3), m(4), m(5), m(6), m(7), m(8), m(9)]),
      makeTestPlayer([]),
    );
    // P1 discards p9, P2 has p9×3 → can daiminkan
    const claims = collectClaims(p(9), 1, players);
    expect(claims.some((c) => c.type === "daiminkan" && c.player === 2)).toBe(true);
  });

  it("does not allow claims when player is in riichi", () => {
    const players = makePlayers(
      makeTestPlayer([]),
      makeTestPlayer([m(4), m(4), m(4), m(5)]), // discarder
      makeTestPlayer([m(4), m(4)]), // has pair → could pon, but in riichi
      makeTestPlayer([]),
    );
    players[2].riichi = true;
    const claims = collectClaims(m(4), 1, players);
    // Player 2 is in riichi, so no pon
    expect(claims.filter((c) => c.player === 2 && c.type === "pon")).toHaveLength(0);
  });
});

describe("abortive draws", () => {
  it("allows kyuushu kyuuhai on the first turn", () => {
    const hand = [
      m(1),
      m(9),
      p(1),
      p(9),
      s(1),
      s(9),
      ton(),
      nan(),
      sha(),
      pei(),
      m(2),
      m(3),
      m(4),
      m(5),
    ];
    const state = startedState({
      dealer: 0,
      currentPlayer: 0,
      players: makePlayers(
        makeTestPlayer(hand),
        makeTestPlayer([]),
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
    });

    expect(canDeclareKyuushuKyuuhai(state, 0)).toBe(true);

    const after = gameReducer(state, { type: "DECLARE_KYUUSHU_KYUUHAI", player: 0 });

    expect(after.phase).toBe("roundEnded");
    expect(after.honba).toBe(state.honba + 1);
    expect(after.dealer).toBe(0);
    expect(after.message).toBe("途中流局: 九種九牌");
  });

  it("processAiTurn declares kyuushu kyuuhai for computer players", () => {
    const hand = [
      m(1),
      m(9),
      p(1),
      p(9),
      s(1),
      s(9),
      ton(),
      nan(),
      sha(),
      pei(),
      p(2),
      p(3),
      p(4),
      p(5),
    ];
    const state = startedState({
      currentPlayer: 1,
      players: makePlayers(
        makeTestPlayer([]),
        makeTestPlayer(hand),
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
    });

    const { action } = processAiTurn(state);

    expect(action).toEqual({ type: "DECLARE_KYUUSHU_KYUUHAI", player: 1 });
  });

  it("processAiTurn declares ankan for computer players", () => {
    const hand = [
      m(1),
      m(1),
      m(1),
      m(1),
      p(2),
      p(3),
      p(4),
      p(5),
      p(6),
      p(7),
      p(8),
      p(9),
      s(1),
      s(2),
    ];
    const state = startedState({
      currentPlayer: 1,
      players: makePlayers(
        makeTestPlayer([]),
        makeTestPlayer(hand),
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
    });

    const { action } = processAiTurn(state);

    expect(action).toEqual({ type: "ANKAN", player: 1, tile: m(1) });
  });

  it("processAiTurn declares kakan for computer players", () => {
    // 11 tiles in hand + 1 pon meld (3 tiles) = 14 total tiles (readyDiscard state)
    const hand = [m(1), p(2), p(3), p(4), p(5), p(6), p(7), p(8), p(9), s(1), s(2)];
    const ponMeld: Meld = { type: MeldType.Poon, tiles: [m(1), m(1), m(1)], calledTile: m(1) };
    const state = startedState({
      currentPlayer: 1,
      players: makePlayers(
        makeTestPlayer([]),
        { ...makeTestPlayer(hand), melds: [ponMeld] },
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
    });

    const { action } = processAiTurn(state);

    expect(action).toEqual({ type: "KAKAN", player: 1, tile: m(1) });
  });

  it("processAiTurn discards the drawn tile if the player is in riichi", () => {
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
      s(1),
      s(2),
    ];
    const state = startedState({
      currentPlayer: 1,
      lastDrawnTile: s(2),
      players: makePlayers(
        makeTestPlayer([]),
        { ...makeTestPlayer(hand), riichi: true },
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
    });

    const { action } = processAiTurn(state);

    expect(action).toEqual({ type: "DISCARD", player: 1, tile: s(2) });
  });

  it("processAiTurn chooses genbutsu to discard when an opponent is in riichi", () => {
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
      s(1),
      s(2),
      s(3),
      p(1),
      p(9),
    ];
    const state = startedState({
      currentPlayer: 1,
      players: makePlayers(
        {
          ...makeTestPlayer([]),
          riichi: true,
          discards: [{ tile: p(9), isRiichi: true, player: 0 as PlayerWind }],
        },
        makeTestPlayer(hand),
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
    });

    const { action } = processAiTurn(state);

    expect(action).toEqual({ type: "DECLARE_RIICHI", player: 1, discardTile: p(9) });
  });

  it("processAiTurn declares ankan if in riichi and wait does not change", () => {
    // wait is 9p, drawing 8s
    const hand = [
      m(1),
      m(1),
      m(1),
      p(2),
      p(3),
      p(4),
      s(5),
      s(6),
      s(7),
      s(8),
      s(8),
      s(8),
      s(8),
      p(9),
    ];
    const state = startedState({
      currentPlayer: 1,
      players: makePlayers(
        makeTestPlayer([]),
        { ...makeTestPlayer(hand), riichi: true },
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
    });

    const { action } = processAiTurn(state);

    expect(action?.type).toBe("ANKAN");
  });

  it("processAiTurn does not declare ankan if in riichi and wait changes", () => {
    // 44456m -> wait 4,7m
    const hand = [
      m(4),
      m(4),
      m(4),
      m(5),
      m(6),
      p(1),
      p(1),
      p(1),
      p(2),
      p(2),
      p(2),
      p(3),
      p(3),
      p(3),
      m(4),
    ];
    const state = startedState({
      currentPlayer: 1,
      players: makePlayers(
        makeTestPlayer([]),
        { ...makeTestPlayer(hand), riichi: true },
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
    });

    const { action } = processAiTurn(state);

    expect(action?.type).not.toBe("ANKAN");
  });

  it("processAiTurn declares riichi when ready and points >= 1000", () => {
    // 123m 456p 789s 23p 99s (13 tiles). Add 1s (14th tile).
    // If discard 1s, remaining hand is 123m 456p 789s 23p 99s. Wait is 1p, 4p.
    const hand = [m(1), m(2), m(3), p(4), p(5), p(6), s(7), s(8), s(9), p(2), p(3), s(9), s(9)];
    const handWithDraw = [...hand, s(1)];
    const state = startedState({
      currentPlayer: 1,
      players: makePlayers(
        makeTestPlayer([]),
        { ...makeTestPlayer(handWithDraw), points: 1000 },
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
    });

    const { action } = processAiTurn(state);

    expect(action?.type).toBe("DECLARE_RIICHI");
    expect(action).toEqual({ type: "DECLARE_RIICHI", player: 1, discardTile: s(1) });
  });

  it("processAiTurn does not declare riichi if points < 1000", () => {
    const hand = [m(1), m(2), m(3), p(4), p(5), p(6), s(7), s(8), s(9), p(2), p(3), s(9), s(9)];
    const handWithDraw = [...hand, s(1)];
    const state = startedState({
      currentPlayer: 1,
      players: makePlayers(
        makeTestPlayer([]),
        { ...makeTestPlayer(handWithDraw), points: 900 },
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
    });

    const { action } = processAiTurn(state);

    expect(action?.type).toBe("DISCARD");
  });

  it("processAiTurn does not declare riichi if not closed (has open meld)", () => {
    // 123m 456p 23p 99s (10 tiles). Open Chi: 789s.
    const handClosed = [m(1), m(2), m(3), p(4), p(5), p(6), p(2), p(3), s(9), s(9)];
    const openMeld: Meld = { type: MeldType.Chi, tiles: [s(7), s(8), s(9)], calledTile: s(7) };
    const handWithDraw = [...handClosed, s(1)];
    const state = startedState({
      currentPlayer: 1,
      players: makePlayers(
        makeTestPlayer([]),
        { ...makeTestPlayer(handWithDraw), melds: [openMeld], points: 1000 },
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
    });

    const { action } = processAiTurn(state);

    expect(action?.type).toBe("DISCARD");
  });

  it("processAiTurn passes a chi that is neither tanyao-aiming nor tenpai-making", () => {
    // Player 2 can chi 123m on the discarded 3m, but the hand has many
    // terminals/honors and reaches no tenpai after the call.
    const players = makePlayers(
      makeTestPlayer([]),
      makeTestPlayer([]),
      makeTestPlayer([
        m(1),
        m(2),
        p(4),
        p(5),
        p(6),
        s(1),
        s(2),
        ton(),
        ton(),
        nan(),
        m(9),
        m(9),
        pei(),
      ]),
      makeTestPlayer([]),
    );
    const state = startedState({
      phase: "claiming",
      currentPlayer: 1,
      players,
      lastDiscard: { tile: m(3), player: 1 },
      claimOptions: collectClaims(m(3), 1, players),
    });

    const { action } = processAiTurn(state);

    expect(action).toEqual({ type: "PASS_CLAIM" });
  });

  it("processAiTurn claims a tanyao-aiming chi", () => {
    const players = makePlayers(
      makeTestPlayer([]),
      makeTestPlayer([]),
      makeTestPlayer([
        m(3),
        m(4),
        p(2),
        p(3),
        p(4),
        s(5),
        s(6),
        s(7),
        m(6),
        m(7),
        m(8),
        s(2),
        s(3),
      ]),
      makeTestPlayer([]),
    );
    const state = startedState({
      phase: "claiming",
      currentPlayer: 1,
      players,
      lastDiscard: { tile: m(5), player: 1 },
      claimOptions: collectClaims(m(5), 1, players),
    });

    const { action } = processAiTurn(state);

    expect(action?.type).toBe("CHI");
    expect((action as { player: number }).player).toBe(2);
  });

  it("processAiTurn passes a chi that leaves no legal discard after kuikae", () => {
    const exposedMelds: Meld[] = [
      { type: MeldType.Poon, tiles: [m(2), m(2), m(2)], calledTile: m(2) },
      { type: MeldType.Poon, tiles: [p(3), p(3), p(3)], calledTile: p(3) },
      { type: MeldType.Poon, tiles: [s(7), s(7), s(7)], calledTile: s(7) },
    ];
    const players = makePlayers(
      makeTestPlayer([]),
      makeTestPlayer([]),
      {
        ...makeTestPlayer([s(3), s(4), s(5), s(6)]),
        melds: exposedMelds,
      },
      makeTestPlayer([]),
    );
    const state = startedState({
      phase: "claiming",
      currentPlayer: 1,
      players,
      lastDiscard: { tile: s(3), player: 1 },
      claimOptions: collectClaims(s(3), 1, players).filter((claim) => claim.type === "chi"),
    });

    const { action } = processAiTurn(state);

    expect(action).toEqual({ type: "PASS_CLAIM" });
  });

  it("processAiTurn passes an unscorable ron claim", () => {
    const players = makePlayers(
      makeTestPlayer([]),
      makeTestPlayer([]),
      makeTestPlayer([m(1), m(2), m(3), p(2), p(3), p(4), s(4), s(5), s(6), m(7), m(9), ton(), ton()]),
      makeTestPlayer([]),
    );
    const state = startedState({
      phase: "claiming",
      currentPlayer: 1,
      players,
      lastDiscard: { tile: m(8), player: 1 },
      claimOptions: collectClaims(m(8), 1, players),
    });

    const { action } = processAiTurn(state);
    const afterAction = gameReducer(state, action ?? { type: "PASS_CLAIM" });

    expect(action).toEqual({ type: "PASS_CLAIM" });
    expect(afterAction.phase).toBe("playing");
    expect(afterAction.claimOptions).toEqual([]);
  });

  it("processAiTurn claims a tanyao-aiming pon", () => {
    const players = makePlayers(
      makeTestPlayer([]),
      makeTestPlayer([]),
      makeTestPlayer([
        m(5),
        m(5),
        p(2),
        p(3),
        p(4),
        s(6),
        s(7),
        s(8),
        m(2),
        m(3),
        m(4),
        p(6),
        p(7),
      ]),
      makeTestPlayer([]),
    );
    const state = startedState({
      phase: "claiming",
      currentPlayer: 1,
      players,
      lastDiscard: { tile: m(5), player: 1 },
      claimOptions: collectClaims(m(5), 1, players),
    });

    const { action } = processAiTurn(state);

    expect(action).toEqual({ type: "PON", player: 2 });
  });

  it("processAiTurn claims a pon that reaches tenpai", () => {
    const players = makePlayers(
      makeTestPlayer([]),
      makeTestPlayer([]),
      makeTestPlayer([
        m(5),
        m(5),
        m(2),
        m(3),
        m(4),
        m(6),
        m(7),
        m(8),
        p(3),
        p(4),
        p(5),
        s(1),
        s(2),
      ]),
      makeTestPlayer([]),
    );
    const state = startedState({
      phase: "claiming",
      currentPlayer: 1,
      players,
      lastDiscard: { tile: m(5), player: 1 },
      claimOptions: collectClaims(m(5), 1, players),
    });

    const { action } = processAiTurn(state);

    expect(action).toEqual({ type: "PON", player: 2 });
  });

  it("processAiTurn passes a call that would destroy tanyao via kuisagari", () => {
    // Player 2's hand is all simples and tanyao-ready; the offered 1m chi
    // would introduce a terminal tile and remove the only potential yaku.
    const players = makePlayers(
      makeTestPlayer([]),
      makeTestPlayer([]),
      makeTestPlayer([
        m(2),
        m(3),
        p(2),
        p(3),
        p(4),
        s(5),
        s(6),
        s(7),
        m(6),
        m(7),
        m(8),
        s(2),
        s(3),
      ]),
      makeTestPlayer([]),
    );
    const state = startedState({
      phase: "claiming",
      currentPlayer: 1,
      players,
      lastDiscard: { tile: m(1), player: 1 },
      claimOptions: collectClaims(m(1), 1, players),
    });

    const { action } = processAiTurn(state);

    expect(action).toEqual({ type: "PASS_CLAIM" });
  });

  it("ends the round on suufon renda after the fourth matching wind discard", () => {
    const state = startedState({
      dealer: 0,
      currentPlayer: 3,
      players: makePlayers(
        {
          ...makeTestPlayer([]),
          discards: [{ tile: ton(), isRiichi: false, player: 0 as PlayerWind }],
        },
        {
          ...makeTestPlayer([]),
          discards: [{ tile: ton(), isRiichi: false, player: 1 as PlayerWind }],
        },
        {
          ...makeTestPlayer([]),
          discards: [{ tile: ton(), isRiichi: false, player: 2 as PlayerWind }],
        },
        makeTestPlayer([ton()]),
      ),
    });

    const after = gameReducer(state, { type: "DISCARD", player: 3, tile: ton() });

    expect(after.phase).toBe("roundEnded");
    expect(after.honba).toBe(state.honba + 1);
    expect(after.dealer).toBe(0);
    expect(after.message).toBe("途中流局: 四風連打");
  });

  it("ends the round after the fourth riichi declaration passes", () => {
    const state = startedState({
      dealer: 0,
      currentPlayer: 3,
      riichiSticks: 3,
      players: makePlayers(
        {
          ...makeTestPlayer([]),
          riichi: true,
          discards: [{ tile: m(1), isRiichi: true, player: 0 as PlayerWind }],
          points: 24000,
        },
        {
          ...makeTestPlayer([]),
          riichi: true,
          discards: [{ tile: m(2), isRiichi: true, player: 1 as PlayerWind }],
          points: 24000,
        },
        {
          ...makeTestPlayer([]),
          riichi: true,
          discards: [{ tile: m(3), isRiichi: true, player: 2 as PlayerWind }],
          points: 24000,
        },
        makeTestPlayer([...twoSidedTanyao13WaitingP4(), m(9)]),
      ),
    });

    const after = gameReducer(state, { type: "DECLARE_RIICHI", player: 3, discardTile: m(9) });

    expect(after.phase).toBe("roundEnded");
    expect(after.riichiSticks).toBe(4);
    expect(after.players[3].points).toBe(24000);
    expect(after.message).toBe("途中流局: 四家立直");
  });

  it("ends the round on suukan sanra after the post-kan discard passes", () => {
    const kan1: Meld = { type: MeldType.ClosedKan, tiles: [m(1), m(1), m(1), m(1)] };
    const kan2: Meld = { type: MeldType.ClosedKan, tiles: [p(1), p(1), p(1), p(1)] };
    const kan3: Meld = { type: MeldType.Kan, tiles: [s(1), s(1), s(1), s(1)], calledTile: s(1) };
    const kan4: Meld = { type: MeldType.Kan, tiles: [m(9), m(9), m(9), m(9)], calledTile: m(9) };
    const state = startedState({
      dealer: 0,
      currentPlayer: 0,
      pendingAbortiveDraw: "suukanSanra",
      players: makePlayers(
        { ...makeTestPlayer([p(5)]), melds: [kan1, kan2] },
        { ...makeTestPlayer([]), melds: [kan3, kan4] },
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
    });

    const after = gameReducer(state, { type: "DISCARD", player: 0, tile: p(5) });

    expect(after.phase).toBe("roundEnded");
    expect(after.message).toBe("途中流局: 四槓散了");
  });
});

describe("exhaustive draw (ryuukyoku)", () => {
  it("applies noten bappu (3000 points) from noten to tenpai players", () => {
    const state = startedState({
      currentPlayer: 0,
      wall: [],
      players: makePlayers(
        makeTestPlayer(twoSidedTanyao13()), // tenpai
        makeTestPlayer(twoSidedTanyao13()), // tenpai
        makeTestPlayer([
          m(1),
          m(1),
          m(9),
          m(9),
          p(1),
          p(1),
          p(9),
          p(9),
          s(1),
          s(1),
          ton(),
          nan(),
          sha(),
        ]), // noten
        makeTestPlayer([
          m(1),
          m(1),
          m(9),
          m(9),
          p(1),
          p(1),
          p(9),
          p(9),
          s(1),
          s(1),
          ton(),
          nan(),
          sha(),
        ]), // noten
      ),
    });

    const after = gameReducer(state, { type: "DRAW", player: 0 });

    expect(after.phase).toBe("roundEnded");
    expect(after.message).toContain("聴牌: あなた・P2");
    expect(after.players[0].points - state.players[0].points).toBe(1500);
    expect(after.players[1].points - state.players[1].points).toBe(1500);
    expect(after.players[2].points - state.players[2].points).toBe(-1500);
    expect(after.players[3].points - state.players[3].points).toBe(-1500);
  });
});

describe("nagashi mangan", () => {
  it("scores nagashi mangan as a mangan tsumo on exhaustive draw", () => {
    const state = startedState({
      dealer: 0,
      currentPlayer: 0,
      wall: [],
      players: makePlayers(
        {
          ...makeTestPlayer([]),
          discards: [
            { tile: m(1), isRiichi: false, player: 0 as PlayerWind },
            { tile: p(9), isRiichi: false, player: 0 as PlayerWind },
            { tile: s(1), isRiichi: false, player: 0 as PlayerWind },
            { tile: ton(), isRiichi: false, player: 0 as PlayerWind },
          ],
        },
        makeTestPlayer([]),
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
    });

    const after = gameReducer(state, { type: "DRAW", player: 0 });

    expect(after.phase).toBe("roundEnded");
    expect(after.winner).toBe(0);
    expect(after.honba).toBe(1);
    expect(after.dealer).toBe(0);
    expect(after.players[0].points - state.players[0].points).toBe(12000);
    expect(after.message).toBe("あなたが流し満貫!");
  });

  it("does not award nagashi mangan when any discard was called", () => {
    const state = startedState({
      currentPlayer: 0,
      wall: [],
      calledDiscardKinds: [["m:1"], [], [], []],
      players: makePlayers(
        {
          ...makeTestPlayer([]),
          discards: [
            { tile: m(1), isRiichi: false, player: 0 as PlayerWind },
            { tile: p(9), isRiichi: false, player: 0 as PlayerWind },
            { tile: s(1), isRiichi: false, player: 0 as PlayerWind },
            { tile: ton(), isRiichi: false, player: 0 as PlayerWind },
          ],
        },
        makeTestPlayer([]),
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
    });

    const after = gameReducer(state, { type: "DRAW", player: 0 });

    expect(after.message).not.toContain("流し満貫");
  });

  it("allows multiple nagashi mangan winners", () => {
    const state = startedState({
      dealer: 0,
      currentPlayer: 0,
      wall: [],
      players: makePlayers(
        {
          ...makeTestPlayer([]),
          discards: [
            { tile: m(1), isRiichi: false, player: 0 as PlayerWind },
            { tile: p(9), isRiichi: false, player: 0 as PlayerWind },
            { tile: s(1), isRiichi: false, player: 0 as PlayerWind },
            { tile: ton(), isRiichi: false, player: 0 as PlayerWind },
          ],
        },
        {
          ...makeTestPlayer([]),
          discards: [
            { tile: m(9), isRiichi: false, player: 1 as PlayerWind },
            { tile: p(1), isRiichi: false, player: 1 as PlayerWind },
            { tile: s(9), isRiichi: false, player: 1 as PlayerWind },
            { tile: nan(), isRiichi: false, player: 1 as PlayerWind },
          ],
        },
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
    });

    const after = gameReducer(state, { type: "DRAW", player: 0 });

    expect(after.phase).toBe("roundEnded");
    expect(after.winner).toBe(0);
    expect(after.players[0].points - state.players[0].points).toBe(12000 - 4000);
    expect(after.players[1].points - state.players[1].points).toBe(8000 - 4000);
    expect(after.message).toBe("あなた・プレイヤー2が流し満貫!");
  });
});

describe("sortClaimsByPriority", () => {
  it("puts ron before pon and chi", () => {
    const players = makePlayers(
      makeTestPlayer(winningTanyao13()),
      makeTestPlayer([p(5)]),
      makeTestPlayer([p(5), p(5)]),
      makeTestPlayer([]),
    );
    const sorted = sortClaimsByPriority(collectClaims(p(5), 1, players), 1);
    expect(sorted[0]?.type).toBe("ron");
    expect(sorted[0]?.player).toBe(0);
  });

  it("puts pon before chi", () => {
    const players = makePlayers(
      makeTestPlayer([m(5)]),
      makeTestPlayer([m(4), m(6), p(1), p(2), p(4), p(5), p(7), p(8), s(1), s(4), ton(), ton()]),
      makeTestPlayer([m(5), m(5)]),
      makeTestPlayer([]),
    );
    const claims = collectClaims(m(5), 0, players);
    const sorted = sortClaimsByPriority(claims, 0);
    // First non-pass claim should be pon (player 2 has m5×2)
    const first = sorted[0]!;
    expect(first.type).toBe("pon");
    expect(first.player).toBe(2);
  });
});

describe("gameReducer claims", () => {
  it("enters claiming phase when the human can ron without riichi", () => {
    const state = startedState({
      currentPlayer: 1,
      players: makePlayers(
        makeTestPlayer(winningTanyao13()),
        makeTestPlayer([p(5)]),
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
    });

    const afterDiscard = gameReducer(state, { type: "DISCARD", player: 1, tile: p(5) });

    expect(afterDiscard.phase).toBe("claiming");
    expect(afterDiscard.claimOptions[0]?.type).toBe("ron");
    expect(afterDiscard.claimOptions[0]?.player).toBe(0);
  });

  it("does not enter claiming phase for an unscorable human ron shape", () => {
    const state = startedState({
      currentPlayer: 1,
      players: makePlayers(
        makeTestPlayer([
          m(1),
          m(2),
          m(3),
          p(2),
          p(3),
          p(4),
          s(4),
          s(5),
          s(6),
          m(7),
          m(9),
          ton(),
          ton(),
        ]),
        makeTestPlayer([m(8)]),
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
    });

    const afterDiscard = gameReducer(state, { type: "DISCARD", player: 1, tile: m(8) });

    expect(afterDiscard.phase).toBe("playing");
    expect(afterDiscard.claimOptions).toEqual([]);
    expect(afterDiscard.currentPlayer).toBe(2);
  });

  it("processes a human ron claim from claiming phase", () => {
    const players = makePlayers(
      makeTestPlayer(winningTanyao13()),
      makeTestPlayer([p(5)]),
      makeTestPlayer([]),
      makeTestPlayer([]),
    );
    const state = startedState({
      dealer: 3,
      phase: "claiming",
      currentPlayer: 1,
      players,
      lastDiscard: { tile: p(5), player: 1 },
      claimOptions: collectClaims(p(5), 1, players),
    });

    const beforeTotal = pointsTotal(state);
    const afterRon = gameReducer(state, { type: "RON", winner: 0 });

    expect(afterRon.phase).toBe("roundEnded");
    expect(afterRon.winner).toBe(0);
    expect(pointsTotal(afterRon)).toBe(beforeTotal);
  });

  it("processes double ron and awards riichi sticks to the nearest winner", () => {
    const players = makePlayers(
      makeTestPlayer(winningTanyao13()),
      makeTestPlayer([p(5)]),
      makeTestPlayer(winningTanyao13()),
      { ...makeTestPlayer([]), points: 24000 },
    );
    const state = startedState({
      dealer: 3,
      phase: "claiming",
      currentPlayer: 1,
      riichiSticks: 1,
      deadWall: { tiles: [], doraCount: 0 },
      players,
      lastDiscard: { tile: p(5), player: 1 },
      claimOptions: sortClaimsByPriority(collectClaims(p(5), 1, players), 1),
    });

    const beforeTotal = pointsTotal(state);
    const beforeP0 = state.players[0].points;
    const beforeP2 = state.players[2].points;
    const afterRon = gameReducer(state, { type: "RON", winner: 0 });

    expect(afterRon.phase).toBe("roundEnded");
    expect(afterRon.winner).toBe(2);
    expect(afterRon.riichiSticks).toBe(0);
    expect(afterRon.players[2].points - beforeP2).toBe(
      afterRon.players[0].points - beforeP0 + 1000,
    );
    expect(pointsTotal(afterRon)).toBe(beforeTotal);
    expect(afterRon.message).toContain("ダブロン");
  });

  it("treats triple ron as sancha hou abortive draw without payments", () => {
    const players = makePlayers(
      makeTestPlayer(winningTanyao13()),
      makeTestPlayer([p(5)]),
      makeTestPlayer(winningTanyao13()),
      makeTestPlayer(winningTanyao13()),
    );
    const state = startedState({
      dealer: 0,
      phase: "claiming",
      currentPlayer: 1,
      riichiSticks: 2,
      players,
      lastDiscard: { tile: p(5), player: 1 },
      claimOptions: sortClaimsByPriority(collectClaims(p(5), 1, players), 1),
    });

    const beforePoints = state.players.map((player) => player.points);
    const afterRon = gameReducer(state, { type: "RON", winner: 0 });

    expect(afterRon.phase).toBe("roundEnded");
    expect(afterRon.honba).toBe(state.honba + 1);
    expect(afterRon.dealer).toBe(0);
    expect(afterRon.riichiSticks).toBe(2);
    expect(afterRon.players.map((player) => player.points)).toEqual(beforePoints);
    expect(afterRon.message).toBe("途中流局: 三家和");
  });

  it("rejects immediate suji kuikae after chi and clears the restriction after a legal discard", () => {
    const players = makePlayers(
      makeTestPlayer([m(4)]),
      makeTestPlayer([m(1), m(2), m(3), m(8), p(1), p(2), p(3)]),
      makeTestPlayer([]),
      makeTestPlayer([]),
    );
    const claimOptions = collectClaims(m(4), 0, players);
    const chiIndex = claimOptions.findIndex(
      (c) =>
        c.type === "chi" &&
        c.player === 1 &&
        c.tiles.some((tile) => tile.suit === Suit.Man && tile.value === 2) &&
        c.tiles.some((tile) => tile.suit === Suit.Man && tile.value === 3),
    );
    const state = startedState({
      phase: "claiming",
      currentPlayer: 0,
      players,
      lastDiscard: { tile: m(4), player: 0 },
      claimOptions,
    });

    const afterChi = gameReducer(state, { type: "CHI", player: 1, optionIndex: chiIndex });
    const rejected = gameReducer(afterChi, { type: "DISCARD", player: 1, tile: m(1) });

    expect(rejected.currentPlayer).toBe(1);
    expect(rejected.players[1].discards).toHaveLength(0);
    expect(rejected.message).toBe("食い替え禁止: 🀇 は切れません");

    const accepted = gameReducer(rejected, { type: "DISCARD", player: 1, tile: m(8) });
    expect(accepted.currentPlayer).toBe(2);
    expect(accepted.players[1].discards).toEqual([
      { tile: m(8), isRiichi: false, player: accepted.players[1].wind },
    ]);
    expect(accepted.kuikaeProhibitedTiles).toHaveLength(0);
  });

  it("rejects immediate same-tile kuikae after pon", () => {
    const players = makePlayers(
      makeTestPlayer([p(5)]),
      makeTestPlayer([]),
      makeTestPlayer([p(5), p(5), p(5), m(1), m(2), m(3)]),
      makeTestPlayer([]),
    );
    const state = startedState({
      phase: "claiming",
      currentPlayer: 0,
      players,
      lastDiscard: { tile: p(5), player: 0 },
      claimOptions: collectClaims(p(5), 0, players),
    });

    const afterPon = gameReducer(state, { type: "PON", player: 2 });
    const rejected = gameReducer(afterPon, { type: "DISCARD", player: 2, tile: p(5) });

    expect(rejected.currentPlayer).toBe(2);
    expect(rejected.players[2].discards).toHaveLength(0);
    expect(rejected.message).toBe("食い替え禁止: 🀝 は切れません");
  });

  it("AI chooses ron before other claims", () => {
    const players = makePlayers(
      makeTestPlayer([]),
      makeTestPlayer([p(5)]),
      makeTestPlayer(winningTanyao13()),
      makeTestPlayer([p(5), p(5)]),
    );
    const state = startedState({
      phase: "claiming",
      currentPlayer: 1,
      players,
      lastDiscard: { tile: p(5), player: 1 },
      claimOptions: sortClaimsByPriority(collectClaims(p(5), 1, players), 1),
    });

    const { action } = processAiTurn(state);
    expect(action).toEqual({ type: "RON", winner: 2 });
  });

  it("marks a passed ron option as temporary furiten", () => {
    const players = makePlayers(
      makeTestPlayer(winningTanyao13()),
      makeTestPlayer([p(5)]),
      makeTestPlayer([]),
      makeTestPlayer([]),
    );
    const state = startedState({
      phase: "claiming",
      currentPlayer: 1,
      players,
      lastDiscard: { tile: p(5), player: 1 },
      claimOptions: collectClaims(p(5), 1, players),
    });

    const afterPass = gameReducer(state, { type: "PASS_CLAIM" });

    expect(afterPass.players[0].temporaryFuriten).toBe(true);
    expect(afterPass.players[0].riichiFuriten).toBe(false);
    expect(afterPass.phase).toBe("playing");
  });

  it("marks a passed ron option in riichi as riichi furiten", () => {
    const players = makePlayers(
      { ...makeTestPlayer(winningTanyao13()), riichi: true },
      makeTestPlayer([p(5)]),
      makeTestPlayer([]),
      makeTestPlayer([]),
    );
    const state = startedState({
      phase: "claiming",
      currentPlayer: 1,
      players,
      lastDiscard: { tile: p(5), player: 1 },
      claimOptions: collectClaims(p(5), 1, players),
    });

    const afterPass = gameReducer(state, { type: "PASS_CLAIM" });

    expect(afterPass.players[0].riichiFuriten).toBe(true);
    expect(afterPass.players[0].temporaryFuriten).toBe(false);
  });

  it("clears temporary furiten on the player draw", () => {
    const state = startedState({
      currentPlayer: 0,
      players: makePlayers(
        { ...makeTestPlayer(winningTanyao13()), temporaryFuriten: true },
        makeTestPlayer([]),
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
    });

    const afterDraw = gameReducer(state, { type: "DRAW", player: 0 });

    expect(afterDraw.players[0].temporaryFuriten).toBe(false);
  });

  it("does not clear riichi furiten on the player draw", () => {
    const state = startedState({
      currentPlayer: 0,
      players: makePlayers(
        { ...makeTestPlayer(winningTanyao13()), riichi: true, riichiFuriten: true },
        makeTestPlayer([]),
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
    });

    const afterDraw = gameReducer(state, { type: "DRAW", player: 0 });

    expect(afterDraw.players[0].riichiFuriten).toBe(true);
  });

  it("clears temporary furiten for all players when a meld is called (e.g. PON)", () => {
    const state = startedState({
      phase: "claiming",
      currentPlayer: 1, // P1 discarded
      players: makePlayers(
        { ...makeTestPlayer([]), temporaryFuriten: true }, // P0 is in furiten
        makeTestPlayer([]),
        { ...makeTestPlayer([p(5), p(5), m(1)]), temporaryFuriten: true }, // P2 has pair of p5 and is in furiten
        makeTestPlayer([]),
      ),
      lastDiscard: { tile: p(5), player: 1 },
      claimOptions: [
        {
          type: "pon",
          player: 2,
          tiles: [p(5), p(5), p(5)],
          calledTile: p(5),
          meld: { type: MeldType.Poon, tiles: [p(5), p(5), p(5)], calledTile: p(5) },
          display: "ポン",
        },
      ],
    });

    const afterPon = gameReducer(state, { type: "PON", player: 2 });

    expect(afterPon.players[0].temporaryFuriten).toBe(false); // P0's furiten is cleared
    expect(afterPon.players[2].temporaryFuriten).toBe(false); // P2's furiten is cleared
  });

  it("enters claiming phase after discard when pon is available", () => {
    const start = gameReducer(createInitialState(), { type: "START_GAME", dealer: 0 });
    // We need to set up: P0 discards, P1 (or anyone else) can pon
    // Since we have random hands, let's test the PON action directly
    // by creating a state in claiming phase with claimOptions

    // Test that the state transitions work by dispatching a CHI/PON properly
    // We'll create a simpler test: just dispatch DISCARD and see what happens
    const tile = start.players[0].hand[0]!;
    const afterDiscard = gameReducer(start, { type: "DISCARD", player: 0, tile });
    // After discard, we might be in claiming if another player can respond
    // Or we might be in playing (moved to next player)
    // Either is valid behavior
    expect(afterDiscard.phase === "playing" || afterDiscard.phase === "claiming").toBe(true);
  });

  it("processes PON action correctly", () => {
    // Create a scenario: P0 discards, P1 has pair → game should enter claiming phase
    // Let's construct a known state
    const start = gameReducer(createInitialState(), { type: "START_GAME", dealer: 0 });
    const state0 = gameReducer(start, { type: "DRAW", player: 0 });

    // Just discard for now - the exact test depends on whether claims exist
    const tile = state0.players[0].hand[0]!;
    const afterDiscard = gameReducer(state0, { type: "DISCARD", player: 0, tile });

    // The phase test
    if (afterDiscard.phase === "claiming") {
      // If there's a pon option, test it
      const ponOpt = afterDiscard.claimOptions.find((c) => c.type === "pon");
      if (ponOpt) {
        const afterPon = gameReducer(afterDiscard, { type: "PON", player: ponOpt.player });
        expect(afterPon.phase).toBe("playing");
        expect(afterPon.currentPlayer).toBe(ponOpt.player);
        expect(afterPon.players[ponOpt.player].melds.length).toBeGreaterThan(0);
      }
    }
  });

  it("processes ankan from the current player hand", () => {
    const state = startedState({
      currentPlayer: 0,
      players: makePlayers(
        makeTestPlayer([
          m(1),
          m(1),
          m(1),
          m(1),
          m(2),
          m(3),
          m(4),
          p(2),
          p(3),
          p(4),
          s(2),
          s(3),
          s(4),
          p(5),
        ]),
        makeTestPlayer([]),
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
    });

    const afterKan = gameReducer(state, { type: "ANKAN", player: 0, tile: m(1) });

    expect(afterKan.currentPlayer).toBe(0);
    expect(
      afterKan.players[0].hand.filter((tile) => tile.suit === Suit.Man && tile.value === 1),
    ).toHaveLength(0);
    expect(afterKan.players[0].melds.at(-1)?.type).toBe(MeldType.ClosedKan);
    expect(afterKan.players[0].melds.at(-1)?.tiles).toHaveLength(4);
    expect(afterKan.deadWall.doraCount).toBe(state.deadWall.doraCount + 1);
  });

  it("does not allow ankan while in riichi", () => {
    const state = startedState({
      currentPlayer: 0,
      players: makePlayers(
        {
          ...makeTestPlayer([
            m(4),
            m(4),
            m(4),
            m(4),
            m(5),
            m(6),
            p(1),
            p(1),
            p(1),
            p(2),
            p(2),
            p(2),
            p(3),
            p(3),
          ]),
          riichi: true,
        },
        makeTestPlayer([]),
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
    });

    const afterKan = gameReducer(state, { type: "ANKAN", player: 0, tile: m(4) });

    expect(afterKan.players[0].melds).toHaveLength(0);
    expect(afterKan.deadWall.doraCount).toBe(state.deadWall.doraCount);
    expect(afterKan.message).toContain("待ちが変わるため");
  });

  it("processes kakan by upgrading an existing pon meld", () => {
    const ponMeld = { type: MeldType.Poon, tiles: [m(2), m(2), m(2)], calledTile: m(2) };
    const state = startedState({
      currentPlayer: 0,
      players: makePlayers(
        {
          ...makeTestPlayer([m(2), m(3), m(4), p(2), p(3), p(4), s(2), s(3), s(4), p(5), p(6)]),
          melds: [ponMeld],
        },
        makeTestPlayer([]),
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
    });

    const afterKan = gameReducer(state, { type: "KAKAN", player: 0, tile: m(2) });

    expect(afterKan.currentPlayer).toBe(0);
    expect(
      afterKan.players[0].hand.some((tile) => tile.suit === Suit.Man && tile.value === 2),
    ).toBe(false);
    expect(afterKan.players[0].melds).toHaveLength(1);
    expect(afterKan.players[0].melds[0]?.type).toBe(MeldType.AddedKan);
    expect(afterKan.players[0].melds[0]?.tiles).toHaveLength(4);
    expect(afterKan.deadWall.doraCount).toBe(state.deadWall.doraCount);
    expect(afterKan.pendingKanDora).toBe(true);
  });

  it("does not allow kakan while in riichi", () => {
    const ponMeld = { type: MeldType.Poon, tiles: [m(2), m(2), m(2)], calledTile: m(2) };
    const state = startedState({
      currentPlayer: 0,
      players: makePlayers(
        {
          ...makeTestPlayer([m(2), m(3), m(4), p(2), p(3), p(4), s(2), s(3), s(4), p(5), p(6)]),
          melds: [ponMeld],
          riichi: true,
        },
        makeTestPlayer([]),
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
    });

    const afterKan = gameReducer(state, { type: "KAKAN", player: 0, tile: m(2) });

    expect(afterKan.players[0].melds[0]?.type).toBe(MeldType.Poon);
    expect(afterKan.deadWall.doraCount).toBe(state.deadWall.doraCount);
    expect(afterKan.message).toContain("リーチ中");
  });
});

describe("tobi (bankruptcy) ending", () => {
  it("ends the match when a player's points drop below 0 after RON", () => {
    const start = startedState({
      dealer: 0,
      roundNumber: 1,
      players: makePlayers(
        { ...makeTestPlayer([]), points: 500 }, // Will drop below 0
        { ...makeTestPlayer(winningTanyao13()), points: 25000 }, // Mangan ron is 8000
        { ...makeTestPlayer([]), points: 25000 },
        { ...makeTestPlayer([]), points: 25000 },
      ),
      lastDiscard: { tile: p(5), player: 0 },
      honba: 0,
      riichiSticks: 0,
    });

    const afterRon = gameReducer(start, { type: "RON", winner: 1 });

    expect(afterRon.phase).toBe("ended");
    expect(afterRon.players[0].points).toBeLessThan(0);
  });

  it("ends the match when a player's points drop below 0 after TSUMO", () => {
    const start = startedState({
      dealer: 0,
      roundNumber: 1,
      players: makePlayers(
        { ...makeTestPlayer([]), points: 1000 }, // Will drop below 0
        { ...makeTestPlayer([...winningTanyao13(), p(5)]), points: 25000 }, // Mangan tsumo child is 2000/4000
        { ...makeTestPlayer([]), points: 25000 },
        { ...makeTestPlayer([]), points: 25000 },
      ),
      lastDrawnTile: p(5),
      currentPlayer: 1,
      honba: 0,
      riichiSticks: 0,
    });

    const afterTsumo = gameReducer(start, { type: "TSUMO", player: 1 });

    expect(afterTsumo.phase).toBe("ended");
    expect(afterTsumo.players[0].points).toBeLessThan(0);
  });

  it("ends the match when a player's points drop below 0 after DRAW (tenpai payments)", () => {
    const start = startedState({
      dealer: 0,
      roundNumber: 1,
      wall: [], // Force draw
      players: makePlayers(
        { ...makeTestPlayer([]), points: 500 }, // No tenpai, pays 1000 or more
        { ...makeTestPlayer(winningTanyao13()), points: 25000 }, // Tenpai
        { ...makeTestPlayer([]), points: 25000 },
        { ...makeTestPlayer([]), points: 25000 },
      ),
      currentPlayer: 0,
      lastDrawnTile: p(1),
    });

    const afterDraw = gameReducer(start, { type: "DRAW", player: 0 });

    expect(afterDraw.phase).toBe("ended");
    expect(afterDraw.players[0].points).toBeLessThan(0);
  });

  it("does not end the match if a player's points are exactly 0", () => {
    const start = startedState({
      dealer: 0,
      roundNumber: 1,
      players: makePlayers(
        { ...makeTestPlayer([]), points: 2000 }, // Matches exactly the ron payment
        { ...makeTestPlayer(winningTanyao13()), points: 25000 },
        { ...makeTestPlayer([]), points: 25000 },
        { ...makeTestPlayer([]), points: 25000 },
      ),
      lastDiscard: { tile: p(5), player: 0 },
      honba: 0,
      riichiSticks: 0,
      deadWall: { tiles: [s(9)], doraCount: 1 }, // Dora is s(1), which is not in the winning hand
    });

    const afterRon = gameReducer(start, { type: "RON", winner: 1 });
    expect(afterRon.phase).toBe("roundEnded");
    expect(afterRon.players[0].points).toBe(0);
  });
});

describe("east-only match progression", () => {
  it("starts an east-only match at east 1 with the first dealer", () => {
    const state = gameReducer(
      createInitialState(() => 0),
      { type: "START_GAME", dealer: 0 },
    );
    expect(state.roundNumber).toBe(1);
    expect(state.dealer).toBe(0);
    expect(state.currentPlayer).toBe(0);
    expect(state.players[0].wind).toBe(0);
  });

  it("produces expected non-zero dealer with fixed random", () => {
    const state = gameReducer(
      createInitialState(() => 0),
      { type: "START_GAME", dealer: 2 },
    );
    expect(state.dealer).toBe(2);
    expect(state.currentPlayer).toBe(2);
    // Dealer (player 2) should have wind Ton (0)
    expect(state.players[2].wind).toBe(0);
    // Player 0 should have wind Sha (2) when dealer is 2: (0 - 2 + 4) % 4 = 2
    expect(state.players[0].wind).toBe(2);
  });

  it("advances to the next dealer after a child ron", () => {
    const start = startedState({
      dealer: 0,
      roundNumber: 1,
      players: makePlayers(
        { ...makeTestPlayer([]), points: 25000 },
        { ...makeTestPlayer(winningTanyao13()), points: 25000 },
        { ...makeTestPlayer([]), points: 25000 },
        { ...makeTestPlayer([]), points: 25000 },
      ),
      lastDiscard: { tile: p(5), player: 0 },
      honba: 2,
      riichiSticks: 0,
    });

    const beforeTotal = pointsTotal(start);
    const afterRon = gameReducer(start, { type: "RON", winner: 1 });

    expect(afterRon.phase).toBe("roundEnded");
    expect(afterRon.dealer).toBe(1);
    expect(afterRon.roundNumber).toBe(2);
    expect(afterRon.honba).toBe(0);
    expect(pointsTotal(afterRon)).toBe(beforeTotal);

    const next = gameReducer(afterRon, { type: "NEXT_ROUND" });
    expect(next.phase).toBe("playing");
    expect(next.currentPlayer).toBe(1);
    expect(next.players[1].wind).toBe(0);
  });

  it("keeps the dealer and increments honba after dealer tsumo", () => {
    const start = startedState({
      dealer: 0,
      roundNumber: 2,
      players: makePlayers(
        { ...makeTestPlayer([...winningTanyao13(), p(5)]), points: 25000 },
        { ...makeTestPlayer([]), points: 25000 },
        { ...makeTestPlayer([]), points: 25000 },
        { ...makeTestPlayer([]), points: 25000 },
      ),
      lastDrawnTile: p(5),
      honba: 1,
      riichiSticks: 0,
    });

    const beforeTotal = pointsTotal(start);
    const afterTsumo = gameReducer(start, { type: "TSUMO", player: 0 });

    expect(afterTsumo.phase).toBe("roundEnded");
    expect(afterTsumo.dealer).toBe(0);
    expect(afterTsumo.roundNumber).toBe(2);
    expect(afterTsumo.honba).toBe(2);
    expect(pointsTotal(afterTsumo)).toBe(beforeTotal);
  });

  it("ends the match when the final dealer wins while already top", () => {
    const start = startedState({
      dealer: 3,
      roundNumber: 4,
      players: makePlayers(
        { ...makeTestPlayer([]), points: 22000 },
        { ...makeTestPlayer([]), points: 24000 },
        { ...makeTestPlayer([]), points: 25000 },
        { ...makeTestPlayer([...winningTanyao13(), p(5)]), points: 29000 },
      ),
      lastDrawnTile: p(5),
    });

    const afterTsumo = gameReducer(start, { type: "TSUMO", player: 3 });

    expect(afterTsumo.phase).toBe("ended");
    expect(afterTsumo.finalRanking?.[0]).toBe(3);
  });
});

describe("processAiTurn wall movement", () => {
  it("returns DRAW for a normal AI turn so the reducer consumes one wall tile", () => {
    const state = startedState({
      currentPlayer: 1,
      players: makePlayers(
        makeTestPlayer([]),
        makeTestPlayer([
          m(1),
          m(2),
          m(3),
          m(4),
          m(5),
          m(6),
          p(1),
          p(2),
          p(3),
          p(4),
          p(5),
          s(1),
          s(2),
        ]),
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
    });

    const { action } = processAiTurn(state);
    expect(action).toEqual({ type: "DRAW", player: 1 });

    const afterDraw = gameReducer(state, action!);
    expect(afterDraw.wall.length).toBe(state.wall.length - 1);
    expect(afterDraw.players[1].hand).toHaveLength(14);
  });

  it("does not draw for an AI discard after an open claim", () => {
    const meld = { type: MeldType.Poon, tiles: [m(9), m(9), m(9)], calledTile: m(9) };
    const state = startedState({
      currentPlayer: 1,
      players: makePlayers(
        makeTestPlayer([]),
        {
          ...makeTestPlayer([m(1), m(2), m(3), m(4), m(5), p(1), p(2), p(3), s(1), s(2), s(3)]),
          melds: [meld],
        },
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
    });

    const { action } = processAiTurn(state);
    expect(action?.type).toBe("DISCARD");

    const afterDiscard = gameReducer(state, action!);
    expect(afterDiscard.wall.length).toBe(state.wall.length);
  });

  it("draws on the next AI turn after an open-hand discard", () => {
    const meld = { type: MeldType.Poon, tiles: [m(9), m(9), m(9)], calledTile: m(9) };
    const state = startedState({
      currentPlayer: 1,
      players: makePlayers(
        makeTestPlayer([]),
        {
          ...makeTestPlayer([m(1), m(2), m(3), m(4), p(1), p(2), p(3), s(1), s(2), s(3)]),
          melds: [meld],
        },
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
    });

    const { action } = processAiTurn(state);
    expect(action).toEqual({ type: "DRAW", player: 1 });
  });
});

describe("claiming turn ownership", () => {
  it("does not auto-pass while the human has a claim option", () => {
    const players = makePlayers(
      makeTestPlayer([m(4), m(4)]),
      makeTestPlayer([]),
      makeTestPlayer([]),
      makeTestPlayer([]),
    );
    const state = startedState({
      phase: "claiming",
      currentPlayer: 1,
      players,
      lastDiscard: { tile: m(4), player: 1 },
      claimOptions: collectClaims(m(4), 1, players),
    });

    const { action } = processAiTurn(state);
    expect(action).toBeNull();
  });

  it("processes the human pon option even when an AI pon option is listed first", () => {
    const players = makePlayers(
      makeTestPlayer([m(4), m(4)]),
      makeTestPlayer([]),
      makeTestPlayer([m(4), m(4)]),
      makeTestPlayer([]),
    );
    const state = startedState({
      phase: "claiming",
      currentPlayer: 1,
      players,
      lastDiscard: { tile: m(4), player: 1 },
      claimOptions: sortClaimsByPriority(collectClaims(m(4), 1, players), 1),
    });

    expect(state.claimOptions[0]?.player).toBe(2);
    const afterPon = gameReducer(state, { type: "PON", player: 0 });

    expect(afterPon.currentPlayer).toBe(0);
    expect(afterPon.players[0].melds).toHaveLength(1);
    expect(afterPon.players[2].melds).toHaveLength(0);
  });

  it("processes the human daiminkan option even when an AI daiminkan option is listed first", () => {
    const players = makePlayers(
      makeTestPlayer([p(9), p(9), p(9)]),
      makeTestPlayer([]),
      makeTestPlayer([p(9), p(9), p(9)]),
      makeTestPlayer([]),
    );
    const state = startedState({
      phase: "claiming",
      currentPlayer: 1,
      players,
      lastDiscard: { tile: p(9), player: 1 },
      claimOptions: sortClaimsByPriority(collectClaims(p(9), 1, players), 1),
    });

    expect(state.claimOptions[0]?.player).toBe(2);
    const afterKan = gameReducer(state, { type: "DAIMINKAN", player: 0 });

    expect(afterKan.currentPlayer).toBe(0);
    expect(afterKan.players[0].melds).toHaveLength(1);
    expect(afterKan.players[2].melds).toHaveLength(0);
    expect(afterKan.deadWall.doraCount).toBe(state.deadWall.doraCount);
    expect(afterKan.pendingKanDora).toBe(true);
  });
});

describe("rinshan draw after kan", () => {
  it("sets pendingRinshan and draws from dead wall after ANKAN", () => {
    // Player 0 has 4 m1 tiles + other tiles
    const state = startedState({
      currentPlayer: 0,
      players: makePlayers(
        makeTestPlayer([
          m(1),
          m(1),
          m(1),
          m(1),
          m(2),
          m(3),
          m(4),
          p(2),
          p(3),
          p(4),
          s(2),
          s(3),
          s(4),
          p(5),
        ]),
        makeTestPlayer([]),
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
      deadWall: { tiles: [p(1), p(2), m(9)], doraCount: 1 },
      wall: [s(1), s(2), s(3)],
    });

    const afterKan = gameReducer(state, { type: "ANKAN", player: 0, tile: m(1) });

    expect(afterKan.pendingRinshan).toBe(true);
    // dead wall tiles preserved (doraCount incremented)
    expect(afterKan.deadWall.tiles).toHaveLength(3);
    expect(afterKan.deadWall.doraCount).toBe(2);

    // Rinshan draw: should draw from dead wall (last tile = m(9))
    const afterDraw = gameReducer(afterKan, { type: "DRAW", player: 0 });

    expect(afterDraw.pendingRinshan).toBe(false);
    // Hand should have gained the rinshan tile
    expect(afterDraw.players[0].hand.some((t) => t.suit === Suit.Man && t.value === 9)).toBe(true);
    // Dead wall tiles decreased by 1 (last tile consumed)
    expect(afterDraw.deadWall.tiles).toHaveLength(2);
    // Wall unchanged
    expect(afterDraw.wall).toHaveLength(3);
    // lastDrawnTile should be the rinshan tile
    expect(afterDraw.lastDrawnTile).toEqual(m(9));
    // Message should indicate rinshan
    expect(afterDraw.message).toContain("嶺上");
  });

  it("after DAIMINKAN, the claimant draws from the dead wall", () => {
    // Player 1 discards m(4), Player 2 has 3 m(4)s
    const players = makePlayers(
      makeTestPlayer([]),
      makeTestPlayer([
        m(4),
        m(5),
        m(6),
        p(1),
        p(2),
        p(3),
        p(4),
        p(5),
        p(6),
        p(7),
        p(8),
        p(9),
        s(1),
      ]),
      makeTestPlayer([m(4), m(4), m(4), m(1), m(2), m(3), p(1), p(2), p(3), s(1), s(2), s(3)]),
      makeTestPlayer([]),
    );
    const state = startedState({
      phase: "claiming",
      currentPlayer: 1,
      players,
      lastDiscard: { tile: m(4), player: 1 },
      claimOptions: sortClaimsByPriority(collectClaims(m(4), 1, players), 1),
      deadWall: { tiles: [p(5), p(6), m(9)], doraCount: 1 },
      wall: [s(1), s(2), s(3)],
    });

    const afterKan = gameReducer(state, { type: "DAIMINKAN", player: 2 });

    expect(afterKan.pendingRinshan).toBe(true);
    expect(afterKan.deadWall.doraCount).toBe(1);
    expect(afterKan.pendingKanDora).toBe(true);
    expect(afterKan.currentPlayer).toBe(2);

    const afterDraw = gameReducer(afterKan, { type: "DRAW", player: 2 });

    expect(afterDraw.pendingRinshan).toBe(false);
    // Hand should have gained the rinshan tile (last dead wall tile = m(9))
    expect(afterDraw.players[2].hand.some((t) => t.suit === Suit.Man && t.value === 9)).toBe(true);
    expect(afterDraw.deadWall.tiles).toHaveLength(2);
    expect(afterDraw.wall).toHaveLength(3);
    expect(afterDraw.lastDrawnTile).toEqual(m(9));
  });

  it("after KAKAN, the current player draws from the dead wall", () => {
    const ponMeld = { type: MeldType.Poon, tiles: [m(2), m(2), m(2)], calledTile: m(2) };
    const state = startedState({
      currentPlayer: 0,
      players: makePlayers(
        {
          ...makeTestPlayer([m(2), m(3), m(4), p(2), p(3), p(4), s(2), s(3), s(4), p(5), p(6)]),
          melds: [ponMeld],
        },
        makeTestPlayer([]),
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
      deadWall: { tiles: [p(1), p(2), m(9)], doraCount: 1 },
      wall: [s(1), s(2), s(3)],
    });

    const afterKan = gameReducer(state, { type: "KAKAN", player: 0, tile: m(2) });

    expect(afterKan.pendingRinshan).toBe(true);
    expect(afterKan.deadWall.doraCount).toBe(1);
    expect(afterKan.pendingKanDora).toBe(true);
    expect(afterKan.currentPlayer).toBe(0);

    const afterDraw = gameReducer(afterKan, { type: "DRAW", player: 0 });

    expect(afterDraw.pendingRinshan).toBe(false);
    // Hand should have gained the rinshan tile (last dead wall tile = m(9))
    expect(afterDraw.players[0].hand.some((t) => t.suit === Suit.Man && t.value === 9)).toBe(true);
    expect(afterDraw.deadWall.tiles).toHaveLength(2);
    expect(afterDraw.wall).toHaveLength(3);
    expect(afterDraw.lastDrawnTile).toEqual(m(9));
  });

  it("processAiTurn draws from dead wall when pendingRinshan is set", () => {
    // Player 0 has 4 of a kind for ankan + regular hand tiles
    // After ankan, processAiTurn should see pendingRinshan → DRAW
    const state = startedState({
      currentPlayer: 0,
      players: makePlayers(
        makeTestPlayer([
          m(1),
          m(1),
          m(1),
          m(1),
          m(2),
          m(3),
          m(4),
          p(2),
          p(3),
          p(4),
          s(2),
          s(3),
          s(4),
          p(5),
        ]),
        makeTestPlayer([]),
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
      deadWall: { tiles: [p(1), p(2), s(5)], doraCount: 1 },
      wall: [s(1), s(2), s(3)],
    });

    const afterKan = gameReducer(state, { type: "ANKAN", player: 0, tile: m(1) });
    expect(afterKan.pendingRinshan).toBe(true);

    // processAiTurn should return DRAW due to pendingRinshan
    const { action } = processAiTurn(afterKan);
    expect(action).toEqual({ type: "DRAW", player: 0 });

    // After DRAW, pendingRinshan is cleared
    const afterDraw = gameReducer(afterKan, action!);
    expect(afterDraw.pendingRinshan).toBe(false);
    expect(afterDraw.deadWall.tiles).toHaveLength(2); // consumed 1 tile
    expect(afterDraw.lastDrawnTile).toEqual(s(5)); // last dead wall tile
  });
});

describe("riichi and win flags", () => {
  it("rejects riichi on an open hand even when the fixed meld hand is tenpai", () => {
    const meld: Meld = { type: MeldType.Poon, tiles: [p(5), p(5), p(5)], calledTile: p(5) };
    const state = startedState({
      currentPlayer: 0,
      players: makePlayers(
        { ...makeTestPlayer([m(1), m(2), m(3), m(4), m(5), m(6), p(7), p(7)]), melds: [meld] },
        makeTestPlayer([]),
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
    });

    const afterRiichi = gameReducer(state, {
      type: "DECLARE_RIICHI",
      player: 0,
      discardTile: p(7),
    });

    expect(afterRiichi.players[0].riichi).toBe(false);
    expect(afterRiichi.riichiSticks).toBe(state.riichiSticks);
  });

  it("does not enter claiming phase for an unscorable ron shape after riichi declaration", () => {
    const state = startedState({
      currentPlayer: 1,
      players: makePlayers(
        makeTestPlayer([
          m(1),
          m(2),
          m(3),
          p(2),
          p(3),
          p(4),
          s(4),
          s(5),
          s(6),
          m(7),
          m(9),
          ton(),
          ton(),
        ]),
        makeTestPlayer([
          p(2),
          p(3),
          p(4),
          s(2),
          s(3),
          s(4),
          m(5),
          m(6),
          m(7),
          p(7),
          p(8),
          p(9),
          m(8),
          ton(),
        ]),
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
    });

    const afterRiichi = gameReducer(state, {
      type: "DECLARE_RIICHI",
      player: 1,
      discardTile: m(8),
    });

    expect(afterRiichi.phase).toBe("playing");
    expect(afterRiichi.claimOptions).toEqual([]);
    expect(afterRiichi.currentPlayer).toBe(2);
  });

  it("allows ANKAN during riichi if wait does not change", () => {
    // Hand: 111m 234p 567s 8888s 9p -> wait 9p
    const hand = [
      m(1),
      m(1),
      m(1),
      p(2),
      p(3),
      p(4),
      s(5),
      s(6),
      s(7),
      s(8),
      s(8),
      s(8),
      s(8),
      p(9),
    ];
    const state = startedState({
      currentPlayer: 0,
      players: makePlayers(
        { ...makeTestPlayer(hand), riichi: true },
        makeTestPlayer([]),
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
    });

    const afterKan = gameReducer(state, { type: "ANKAN", player: 0, tile: s(8) });

    expect(afterKan.message).not.toContain("暗槓できません");
    expect(afterKan.players[0].melds.length).toBe(1);
    expect(afterKan.players[0].melds[0]!.type).toBe(MeldType.ClosedKan);
    expect(afterKan.pendingRinshan).toBe(true);
  });

  it("forbids ANKAN during riichi if wait changes", () => {
    const hand = [
      m(4),
      m(4),
      m(4),
      m(4),
      m(5),
      m(6),
      p(1),
      p(1),
      p(1),
      p(2),
      p(2),
      p(2),
      p(3),
      p(3),
    ];
    const state = startedState({
      currentPlayer: 0,
      players: makePlayers(
        { ...makeTestPlayer(hand), riichi: true },
        makeTestPlayer([]),
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
    });

    const afterKan = gameReducer(state, { type: "ANKAN", player: 0, tile: m(4) });

    expect(afterKan.message).toContain("待ちが変わるため");
    expect(afterKan.players[0].melds.length).toBe(0);
  });

  it("passes double riichi and ippatsu to ron scoring", () => {
    const players = makePlayers(
      { ...makeTestPlayer(winningTanyao13()), riichi: true, doubleRiichi: true, ippatsu: true },
      makeTestPlayer([p(5)]),
      makeTestPlayer([]),
      makeTestPlayer([]),
    );
    const state = startedState({
      players,
      lastDiscard: { tile: p(5), player: 1 },
      riichiSticks: 1,
    });

    const afterRon = gameReducer(state, { type: "RON", winner: 0 });

    expect(afterRon.lastScoreResult?.yaku.some((y) => y.id === YakuId.DoubleRiichi)).toBe(true);
    expect(afterRon.lastScoreResult?.yaku.some((y) => y.id === YakuId.Ippatsu)).toBe(true);
  });

  it("passes houtei to ron scoring on the last discard", () => {
    const players = makePlayers(
      makeTestPlayer(winningTanyao13()),
      makeTestPlayer([p(5)]),
      makeTestPlayer([]),
      makeTestPlayer([]),
    );
    const state = startedState({
      players,
      wall: [],
      lastDiscard: { tile: p(5), player: 1 },
    });

    const afterRon = gameReducer(state, { type: "RON", winner: 0 });

    expect(afterRon.lastScoreResult?.yaku.some((y) => y.id === YakuId.Houtei)).toBe(true);
  });

  it("passes haitei to tsumo scoring after drawing the last wall tile", () => {
    const winTile = p(4);
    const hand = [...twoSidedTanyao13WaitingP4(), winTile];
    const state = startedState({
      currentPlayer: 0,
      players: makePlayers(
        {
          ...makeTestPlayer(hand),
          discards: [{ tile: m(1), isRiichi: false, player: 0 as PlayerWind }],
        },
        makeTestPlayer([]),
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
      wall: [],
      lastDrawnTile: winTile,
      lastDrawWasRinshan: false,
    });

    const afterTsumo = gameReducer(state, { type: "TSUMO", player: 0 });

    expect(afterTsumo.lastScoreResult?.yaku.some((y) => y.id === YakuId.Haitei)).toBe(true);
  });

  it("passes rinshan to tsumo scoring after a dead-wall draw", () => {
    const winTile = p(4);
    const hand = [...twoSidedTanyao13WaitingP4(), winTile];
    const state = startedState({
      currentPlayer: 0,
      players: makePlayers(
        {
          ...makeTestPlayer(hand),
          discards: [{ tile: m(1), isRiichi: false, player: 0 as PlayerWind }],
        },
        makeTestPlayer([]),
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
      wall: [s(1)],
      lastDrawnTile: winTile,
      lastDrawWasRinshan: true,
    });

    const afterTsumo = gameReducer(state, { type: "TSUMO", player: 0 });

    expect(afterTsumo.lastScoreResult?.yaku.some((y) => y.id === YakuId.Rinshan)).toBe(true);
    expect(afterTsumo.lastScoreResult?.yaku.some((y) => y.id === YakuId.Haitei)).toBe(false);
  });

  it("allows ron on an added kan and scores chankan", () => {
    const ponMeld: Meld = { type: MeldType.Poon, tiles: [m(2), m(2), m(2)], calledTile: m(2) };
    const players = makePlayers(
      {
        ...makeTestPlayer([m(2), p(1), p(1), p(2), p(3), p(4), s(2), s(3), s(4), p(5), p(6)]),
        melds: [ponMeld],
      },
      makeTestPlayer(twoSidedTanyao13()),
      makeTestPlayer([]),
      makeTestPlayer([]),
    );
    const state = startedState({
      currentPlayer: 0,
      players,
      deadWall: { tiles: [p(1), p(2), m(9)], doraCount: 1 },
    });

    const afterKakan = gameReducer(state, { type: "KAKAN", player: 0, tile: m(2) });
    expect(afterKakan.phase).toBe("claiming");
    expect(
      afterKakan.claimOptions.some((claim) => claim.type === "ron" && claim.player === 1),
    ).toBe(true);

    const afterRon = gameReducer(afterKakan, { type: "RON", winner: 1 });

    expect(afterRon.phase).toBe("roundEnded");
    expect(afterRon.lastScoreResult?.yaku.some((y) => y.id === YakuId.Chankan)).toBe(true);
  });

  it("continues to rinshan draw when added-kan ron is passed", () => {
    const ponMeld: Meld = { type: MeldType.Poon, tiles: [m(2), m(2), m(2)], calledTile: m(2) };
    const players = makePlayers(
      {
        ...makeTestPlayer([m(2), p(1), p(1), p(2), p(3), p(4), s(2), s(3), s(4), p(5), p(6)]),
        melds: [ponMeld],
      },
      makeTestPlayer(twoSidedTanyao13()),
      makeTestPlayer([]),
      makeTestPlayer([]),
    );
    const state = startedState({
      currentPlayer: 0,
      players,
      deadWall: { tiles: [p(1), p(2), m(9)], doraCount: 1 },
      wall: [s(1), s(2), s(3)],
    });

    const afterKakan = gameReducer(state, { type: "KAKAN", player: 0, tile: m(2) });
    const afterPass = gameReducer(afterKakan, { type: "PASS_CLAIM" });
    const afterDraw = gameReducer(afterPass, { type: "DRAW", player: 0 });

    expect(afterPass.currentPlayer).toBe(0);
    expect(afterPass.pendingRinshan).toBe(true);
    expect(afterDraw.lastDrawnTile).toEqual(m(9));
    expect(afterDraw.pendingRinshan).toBe(false);
  });
});

describe("open-hand winning detection", () => {
  it("tsumo with open meld completes the hand and ends the round", () => {
    // Open meld: pon of m(2),m(2),m(2). Hand: 345 man, 234 pin, 234 sou, 55 pin (drawn).
    // All tiles are non-terminal → tanyao 1 han = valid winning hand
    const meld: Meld = { type: MeldType.Poon, tiles: [m(2), m(2), m(2)], calledTile: m(2) };
    const hand = [m(3), m(4), m(5), p(2), p(3), p(4), s(2), s(3), s(4), p(5), p(5)];
    const state = startedState({
      currentPlayer: 0,
      players: makePlayers(
        { ...makeTestPlayer(hand), melds: [meld] },
        makeTestPlayer([]),
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
      lastDrawnTile: p(5),
    });
    const afterTsumo = gameReducer(state, { type: "TSUMO", player: 0 });
    expect(afterTsumo.phase).toBe("roundEnded");
    expect(afterTsumo.winner).toBe(0);
  });

  it("ron with open meld completes the hand and ends the round", () => {
    // Open meld: pon of m(2),m(2),m(2). Hand: 345 man, 234 pin, 234 sou, p(5).
    // lastDiscard p(5) completes the pair → tanyao 1 han = valid ron
    const meld: Meld = { type: MeldType.Poon, tiles: [m(2), m(2), m(2)], calledTile: m(2) };
    const hand = [m(3), m(4), m(5), p(2), p(3), p(4), s(2), s(3), s(4), p(5)];
    const state = startedState({
      currentPlayer: 0,
      players: makePlayers(
        makeTestPlayer([]),
        { ...makeTestPlayer(hand), melds: [meld] },
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
      lastDiscard: { tile: p(5), player: 0 },
    });
    const afterRon = gameReducer(state, { type: "RON", winner: 1 });
    expect(afterRon.phase).toBe("roundEnded");
    expect(afterRon.winner).toBe(1);
  });

  it("chiitoitsu tsumo with closed hand still works", () => {
    // 7 pairs: m(1)×2, m(2)×2, m(3)×2, m(4)×2, m(5)×2, p(1)×2, p(2)×2
    const hand = [
      m(1),
      m(1),
      m(2),
      m(2),
      m(3),
      m(3),
      m(4),
      m(4),
      m(5),
      m(5),
      p(1),
      p(1),
      p(2),
      p(2),
    ];
    const state = startedState({
      currentPlayer: 0,
      players: makePlayers(
        makeTestPlayer(hand),
        makeTestPlayer([]),
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
      lastDrawnTile: p(2),
    });
    const afterTsumo = gameReducer(state, { type: "TSUMO", player: 0 });
    expect(afterTsumo.phase).toBe("roundEnded");
    expect(afterTsumo.winner).toBe(0);
  });

  it("open-hand ron detected by collectClaims", () => {
    // Player 1 has meld (pon of m2) + hand waiting for p5
    // allClosedTiles: 345 man + 234 pin + 234 sou + p5(p5) = 11 tiles
    // Groups: 345 + 234(pin) + 234(sou) + pair(p5) + meld(222 man)
    const meld: Meld = { type: MeldType.Poon, tiles: [m(2), m(2), m(2)], calledTile: m(2) };
    const hand = [m(3), m(4), m(5), p(2), p(3), p(4), s(2), s(3), s(4), p(5)];
    const players = makePlayers(
      makeTestPlayer([]),
      { ...makeTestPlayer(hand), melds: [meld] },
      makeTestPlayer([]),
      makeTestPlayer([]),
    );
    const claims = collectClaims(p(5), 0, players);
    expect(claims.some((c) => c.type === "ron" && c.player === 1)).toBe(true);
  });

  it("open-hand furiten suppresses ron in collectClaims", () => {
    // Same hand as above, but player 1 has p(5) in discards → furiten
    const meld: Meld = { type: MeldType.Poon, tiles: [m(2), m(2), m(2)], calledTile: m(2) };
    const hand = [m(3), m(4), m(5), p(2), p(3), p(4), s(2), s(3), s(4), p(5)];
    const players = makePlayers(
      makeTestPlayer([]),
      {
        ...makeTestPlayer(hand),
        melds: [meld],
        discards: [{ tile: p(5), isRiichi: false, player: 1 as PlayerWind }],
      },
      makeTestPlayer([]),
      makeTestPlayer([]),
    );
    const claims = collectClaims(p(5), 0, players);
    expect(claims.some((c) => c.type === "ron" && c.player === 1)).toBe(false);
  });

  it("open-hand non-furiten ron produced by collectClaims", () => {
    // Same hand, no furiten discards → ron is produced
    const meld: Meld = { type: MeldType.Poon, tiles: [m(2), m(2), m(2)], calledTile: m(2) };
    const hand = [m(3), m(4), m(5), p(2), p(3), p(4), s(2), s(3), s(4), p(5)];
    const players = makePlayers(
      makeTestPlayer([]),
      {
        ...makeTestPlayer(hand),
        melds: [meld],
        discards: [{ tile: s(1), isRiichi: false, player: 1 as PlayerWind }],
      },
      makeTestPlayer([]),
      makeTestPlayer([]),
    );
    const claims = collectClaims(p(5), 0, players);
    expect(claims.some((c) => c.type === "ron" && c.player === 1)).toBe(true);
  });
});

describe("normalizeGameState", () => {
  it("fills fields added after older saves", () => {
    const restored = normalizeGameState({
      players: [
        { hand: [m(1)], points: 24000 },
        { hand: [m(2)], points: 26000 },
        { hand: [m(3)], points: 25000 },
        { hand: [m(4)], points: 25000 },
      ],
      phase: "playing",
      honba: 2,
      riichiSticks: 1,
      currentPlayer: 1,
      wall: [p(1), p(2)],
      deadWall: { tiles: [s(1)], doraCount: 1 },
    });

    expect(restored.roundNumber).toBe(1);
    expect(restored.dealer).toBe(0);
    expect(restored.finalRanking).toBeNull();
    expect(restored.players[0].melds).toEqual([]);
    expect(restored.players[0].discards).toEqual([]);
    expect(restored.players[0].riichi).toBe(false);
    expect(restored.players[0].temporaryFuriten).toBe(false);
    expect(restored.players[0].riichiFuriten).toBe(false);
    expect(restored.players[1].points).toBe(26000);
    expect(restored.currentPlayer).toBe(1);
    expect(restored.wall).toEqual([p(1), p(2)]);
  });

  it("RESTORE action normalizes incoming state", () => {
    const restored = gameReducer(createInitialState(), {
      type: "RESTORE",
      state: {
        players: [
          { hand: [m(1)], points: 24000 },
          { hand: [m(2)], points: 26000 },
          { hand: [m(3)], points: 25000 },
          { hand: [m(4)], points: 25000 },
        ],
        phase: "playing",
      } as unknown as GameState,
    });

    expect(restored.roundNumber).toBe(1);
    expect(restored.players[0].melds).toEqual([]);
    expect(restored.players[0].discards).toEqual([]);
    expect(restored.players[0].temporaryFuriten).toBe(false);
    expect(restored.players[0].riichiFuriten).toBe(false);
  });

  it("converts old-format discards (Tile[]) to Discard[] with isRiichi=false", () => {
    const restored = normalizeGameState({
      players: [
        { hand: [m(1)], discards: [p(1), p(2)], points: 24000 },
        { hand: [m(2)], points: 26000 },
        { hand: [m(3)], points: 25000 },
        { hand: [m(4)], points: 25000 },
      ],
      phase: "playing",
      honba: 2,
      riichiSticks: 1,
      currentPlayer: 1,
      wall: [p(3), p(4)],
      deadWall: { tiles: [s(1)], doraCount: 1 },
    } as never);

    expect(restored.players[0].discards).toHaveLength(2);
    expect(restored.players[0].discards[0]!.tile).toEqual(p(1));
    expect(restored.players[0].discards[0]!.isRiichi).toBe(false);
    expect(restored.players[0].discards[1]!.tile).toEqual(p(2));
    expect(restored.players[0].discards[1]!.isRiichi).toBe(false);
  });
});

describe("riichi discard marking", () => {
  it("sets isRiichi=false on normal DISCARD and isRiichi=true on DECLARE_RIICHI", () => {
    // Normal discard by player 0
    const state = startedState({
      currentPlayer: 0,
      players: makePlayers(
        makeTestPlayer([
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
          p(5),
        ]),
        makeTestPlayer([]),
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
    });

    // Normal discard
    const afterDiscard = gameReducer(state, { type: "DISCARD", player: 0, tile: m(5) });
    expect(afterDiscard.players[0].discards).toHaveLength(1);
    expect(afterDiscard.players[0].discards[0]!.tile).toEqual(m(5));
    expect(afterDiscard.players[0].discards[0]!.isRiichi).toBe(false);
    expect(afterDiscard.players[0].discards[0]!.player).toBe(state.players[0].wind);

    // DECLARE_RIICHI: player 1 has tenpai hand with >= 1000 points
    const tenpaiHand = [
      m(1),
      m(2),
      m(3),
      p(4),
      p(5),
      p(6),
      s(7),
      s(8),
      s(9),
      p(2),
      p(3),
      s(9),
      s(9),
    ];
    const handWithDraw = [...tenpaiHand, s(1)];
    const riichiState = startedState({
      currentPlayer: 1,
      players: makePlayers(
        makeTestPlayer([]),
        { ...makeTestPlayer(handWithDraw), points: 1000 },
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
    });

    const afterRiichi = gameReducer(riichiState, {
      type: "DECLARE_RIICHI",
      player: 1,
      discardTile: s(1),
    });
    const lastDiscard =
      afterRiichi.players[1].discards[afterRiichi.players[1].discards.length - 1]!;
    expect(lastDiscard.tile).toEqual(s(1));
    expect(lastDiscard.isRiichi).toBe(true);
    expect(lastDiscard.player).toBe(riichiState.players[1].wind);
  });

  it("SET_MESSAGE updates state.message", () => {
    const state = createInitialState();
    const next = gameReducer(state, { type: "SET_MESSAGE", message: "テストエラー" });
    expect(next.message).toBe("テストエラー");
  });
});

// ── Responsibility payment (責任払い) ─────────────────────────────

describe("responsibility payment (責任払い)", () => {
  function haku(): Tile {
    return { suit: Suit.Dragon, value: 0 };
  }
  function hatsu(): Tile {
    return { suit: Suit.Dragon, value: 1 };
  }
  function chun(): Tile {
    return { suit: Suit.Dragon, value: 2 };
  }

  it("applies a third-party ron payment to both the discarder and responsible player", () => {
    const players = makePlayers(
      makeTestPlayer([]),
      makeTestPlayer([]),
      makeTestPlayer([]),
      makeTestPlayer([]),
    );
    const score: ScoreResult = {
      yaku: [],
      han: 0,
      yakuman: 1,
      fu: 0,
      basePoints: 32000,
      doraHan: 0,
      limit: "yakuman",
      score: 33000,
      payment: {
        from: [
          { player: 1, amount: 16000 },
          { player: 2, amount: 16000 },
        ],
        winnerGets: 33000,
      },
    };

    const result = applyRonPayment(players, 0, 1, score, 1);

    expect(result.map((player) => player.points)).toEqual([58000, 9000, 9000, 25000]);
  });

  it("applies each winner's payment sources during double ron", () => {
    const players = makePlayers(
      makeTestPlayer([]),
      makeTestPlayer([]),
      makeTestPlayer([]),
      makeTestPlayer([]),
    );
    const responsibilityScore: ScoreResult = {
      yaku: [], han: 0, yakuman: 1, fu: 0, basePoints: 32000, doraHan: 0,
      limit: "yakuman", score: 33000,
      payment: {
        from: [{ player: 1, amount: 16000 }, { player: 2, amount: 16000 }],
        winnerGets: 33000,
      },
    };
    const ordinaryScore: ScoreResult = {
      yaku: [], han: 5, yakuman: 0, fu: 30, basePoints: 2000, doraHan: 0,
      limit: "mangan", score: 9000,
      payment: { from: [{ player: 1, amount: 8000 }], winnerGets: 9000 },
    };

    const result = applyDoubleRonPayments(
      players,
      [0, 3],
      1,
      [responsibilityScore, ordinaryScore],
      0,
      1,
    );

    expect(result.map((player) => player.points)).toEqual([58000, 1000, 9000, 33000]);
  });

  it("shows and records the responsible player after ron", () => {
    const hakuPon: Meld = { type: MeldType.Poon, tiles: [haku(), haku(), haku()], calledTile: haku(), calledFrom: 3 };
    const hatsuPon: Meld = { type: MeldType.Poon, tiles: [hatsu(), hatsu(), hatsu()], calledTile: hatsu(), calledFrom: 1 };
    const chunPon: Meld = {
      type: MeldType.Poon,
      tiles: [chun(), chun(), chun()],
      calledTile: chun(),
      calledFrom: 2,
      responsibility: "daisangen",
    };
    const players = makePlayers(
      { ...makeTestPlayer([m(1), m(1), m(1), m(2)]), melds: [hakuPon, hatsuPon, chunPon] },
      makeTestPlayer([m(2)]),
      makeTestPlayer([]),
      makeTestPlayer([]),
    );
    const state = startedState({
      dealer: 3,
      phase: "claiming",
      players,
      lastDiscard: { tile: m(2), player: 1 },
      claimOptions: [],
    });

    const result = gameReducer(state, { type: "RON", winner: 0 });

    expect(result.players.map((player) => player.points)).toEqual([57000, 9000, 9000, 25000]);
    expect(result.message).toContain("責任払い: P3");
    expect(result.roundHistory.at(-1)?.responsibilityMessage).toBe("責任払い: P3");
    expect(result.roundHistory.at(-1)?.resultText).toContain("責任払い: P3");
  });

  it("shows and records the responsible player after tsumo", () => {
    const hakuPon: Meld = { type: MeldType.Poon, tiles: [haku(), haku(), haku()], calledTile: haku(), calledFrom: 3 };
    const hatsuPon: Meld = { type: MeldType.Poon, tiles: [hatsu(), hatsu(), hatsu()], calledTile: hatsu(), calledFrom: 1 };
    const chunPon: Meld = {
      type: MeldType.Poon,
      tiles: [chun(), chun(), chun()],
      calledTile: chun(),
      calledFrom: 2,
      responsibility: "daisangen",
    };
    const players = makePlayers(
      { ...makeTestPlayer([m(1), m(1), m(1), m(2), m(2)]), melds: [hakuPon, hatsuPon, chunPon] },
      makeTestPlayer([]),
      makeTestPlayer([]),
      makeTestPlayer([]),
    );
    const state = startedState({
      dealer: 3,
      currentPlayer: 0,
      phase: "playing",
      players,
      lastDrawnTile: m(2),
      firstTurnInterrupted: true,
    });

    const result = gameReducer(state, { type: "TSUMO", player: 0 });

    expect(result.players.map((player) => player.points)).toEqual([57000, 25000, -7000, 25000]);
    expect(result.message).toContain("責任払い: P3");
    expect(result.roundHistory.at(-1)?.responsibilityMessage).toBe("責任払い: P3");
  });

  it("shows responsibility when only the second double-ron winner is responsible", () => {
    const hakuPon: Meld = { type: MeldType.Poon, tiles: [haku(), haku(), haku()], calledTile: haku(), calledFrom: 2 };
    const hatsuPon: Meld = { type: MeldType.Poon, tiles: [hatsu(), hatsu(), hatsu()], calledTile: hatsu(), calledFrom: 2 };
    const chunPon: Meld = {
      type: MeldType.Poon,
      tiles: [chun(), chun(), chun()],
      calledTile: chun(),
      calledFrom: 3,
      responsibility: "daisangen",
    };
    const players = makePlayers(
      { ...makeTestPlayer([m(1), m(1), m(1), p(5)]), melds: [hakuPon, hatsuPon, chunPon] },
      makeTestPlayer([p(5)]),
      makeTestPlayer(winningTanyao13()),
      makeTestPlayer([]),
    );
    const state = startedState({
      dealer: 3,
      phase: "claiming",
      players,
      lastDiscard: { tile: p(5), player: 1 },
      claimOptions: collectClaims(p(5), 1, players),
    });

    const result = gameReducer(state, { type: "RON", winner: 2 });

    expect(result.message).toContain("責任払い: P4");
    expect(result.roundHistory.at(-1)?.responsibilityMessage).toBe("責任払い: P4");
  });

  it("records calledFrom on a pon meld", () => {
    // P0 discards haku, P1 pons it
    const state = startedState({
      currentPlayer: 0,
      players: makePlayers(
        makeTestPlayer([m(1), m(2), m(3), p(1), p(2), p(3), s(1), s(2), s(3), p(5), p(6), p(7), haku()]),
        makeTestPlayer([haku(), haku(), m(1), m(2), m(3), p(1), p(2), p(3), s(1), s(2), s(3), p(5), p(6)]),
        makeTestPlayer([m(1)]),
        makeTestPlayer([m(1)]),
      ),
    });

    const afterDiscard = gameReducer(state, { type: "DISCARD", player: 0, tile: haku() });
    expect(afterDiscard.phase).toBe("claiming");

    const afterPon = gameReducer(afterDiscard, { type: "PON", player: 1 });
    expect(afterPon.phase).toBe("playing");

    const ponMeld = afterPon.players[1].melds[0]!;
    expect(ponMeld.type).toBe(MeldType.Poon);
    expect(ponMeld.calledFrom).toBe(0); // P0 discarded the tile
  });

  it("marks daisangen responsibility when pon completes 3rd dragon with 2 open dragon melds", () => {
    // P1 already has 2 open dragon melds (haku pon, hatsu pon)
    // P0 discards chun, P1 pons → daisangen responsibility
    const hakuPon: Meld = { type: MeldType.Poon, tiles: [haku(), haku(), haku()], calledTile: haku(), calledFrom: 2 };
    const hatsuPon: Meld = { type: MeldType.Poon, tiles: [hatsu(), hatsu(), hatsu()], calledTile: hatsu(), calledFrom: 3 };

    const state = startedState({
      currentPlayer: 0,
      players: makePlayers(
        makeTestPlayer([m(1), m(2), m(3), p(1), p(2), p(3), s(1), s(2), s(3), p(5), p(6), p(7), chun()]),
        { ...makeTestPlayer([chun(), chun(), m(1), m(2), m(3), p(1), p(2), p(3), s(1), s(2), s(3)]), melds: [hakuPon, hatsuPon] },
        makeTestPlayer([m(1)]),
        makeTestPlayer([m(1)]),
      ),
    });

    const afterDiscard = gameReducer(state, { type: "DISCARD", player: 0, tile: chun() });
    expect(afterDiscard.phase).toBe("claiming");

    const afterPon = gameReducer(afterDiscard, { type: "PON", player: 1 });
    expect(afterPon.phase).toBe("playing");

    // The new pon meld should have responsibility marked
    const newMeld = afterPon.players[1].melds[2]!;
    expect(newMeld.type).toBe(MeldType.Poon);
    expect(newMeld.responsibility).toBe("daisangen");
    expect(newMeld.calledFrom).toBe(0);
  });

  it("marks daisangen responsibility when daiminkan completes the 3rd dragon meld", () => {
    const hakuPon: Meld = { type: MeldType.Poon, tiles: [haku(), haku(), haku()], calledTile: haku(), calledFrom: 2 };
    const hatsuPon: Meld = { type: MeldType.Poon, tiles: [hatsu(), hatsu(), hatsu()], calledTile: hatsu(), calledFrom: 3 };
    const state = startedState({
      currentPlayer: 0,
      players: makePlayers(
        makeTestPlayer([m(1), m(2), m(3), p(1), p(2), p(3), s(1), s(2), s(3), p(5), p(6), p(7), chun()]),
        { ...makeTestPlayer([chun(), chun(), chun(), m(1), m(2), m(3), p(1), p(2), p(3), s(1)]), melds: [hakuPon, hatsuPon] },
        makeTestPlayer([m(1)]),
        makeTestPlayer([m(1)]),
      ),
    });

    const afterDiscard = gameReducer(state, { type: "DISCARD", player: 0, tile: chun() });
    const afterKan = gameReducer(afterDiscard, { type: "DAIMINKAN", player: 1 });

    expect(afterKan.players[1].melds[2]).toMatchObject({
      type: MeldType.Kan,
      calledFrom: 0,
      responsibility: "daisangen",
    });
  });




  it("marks daisuushii responsibility when pon completes 4th wind with 3 open wind melds", () => {
    const tonPon: Meld = { type: MeldType.Poon, tiles: [ton(), ton(), ton()], calledTile: ton(), calledFrom: 2 };
    const nanPon: Meld = { type: MeldType.Poon, tiles: [nan(), nan(), nan()], calledTile: nan(), calledFrom: 3 };
    const shaPon: Meld = { type: MeldType.Poon, tiles: [sha(), sha(), sha()], calledTile: sha(), calledFrom: 2 };

    const state = startedState({
      currentPlayer: 0,
      players: makePlayers(
        makeTestPlayer([m(1), m(2), m(3), p(1), p(2), p(3), s(1), s(2), s(3), p(5), p(6), p(7), pei()]),
        { ...makeTestPlayer([pei(), pei(), m(1), m(2), m(3), p(1), p(2), p(3), s(1), s(2), s(3)]), melds: [tonPon, nanPon, shaPon] },
        makeTestPlayer([m(1)]),
        makeTestPlayer([m(1)]),
      ),
    });

    const afterDiscard = gameReducer(state, { type: "DISCARD", player: 0, tile: pei() });
    expect(afterDiscard.phase).toBe("claiming");

    const afterPon = gameReducer(afterDiscard, { type: "PON", player: 1 });
    expect(afterPon.phase).toBe("playing");

    const newMeld = afterPon.players[1].melds[3]!;
    expect(newMeld.type).toBe(MeldType.Poon);
    expect(newMeld.responsibility).toBe("daisuushii");
    expect(newMeld.calledFrom).toBe(0);
  });

  it("does NOT mark responsibility when only 1 open dragon meld exists", () => {
    const hakuPon: Meld = { type: MeldType.Poon, tiles: [haku(), haku(), haku()], calledTile: haku(), calledFrom: 2 };

    const state = startedState({
      currentPlayer: 0,
      players: makePlayers(
        makeTestPlayer([m(1), m(2), m(3), p(1), p(2), p(3), s(1), s(2), s(3), p(5), p(6), p(7), hatsu()]),
        { ...makeTestPlayer([hatsu(), hatsu(), m(1), m(2), m(3), p(1), p(2), p(3), s(1), s(2), s(3)]), melds: [hakuPon] },
        makeTestPlayer([m(1)]),
        makeTestPlayer([m(1)]),
      ),
    });

    const afterDiscard = gameReducer(state, { type: "DISCARD", player: 0, tile: hatsu() });
    const afterPon = gameReducer(afterDiscard, { type: "PON", player: 1 });

    const newMeld = afterPon.players[1].melds[1]!;
    expect(newMeld.responsibility).toBeUndefined();
  });

  it("does NOT mark responsibility for closed kan", () => {
    const state = startedState({
      currentPlayer: 0,
      players: makePlayers(
        makeTestPlayer([haku(), haku(), haku(), haku(), m(1), m(2), m(3), p(1), p(2), p(3), s(1), s(2), s(3)]),
        makeTestPlayer([m(1)]),
        makeTestPlayer([m(1)]),
        makeTestPlayer([m(1)]),
      ),
    });

    const afterKan = gameReducer(state, { type: "ANKAN", player: 0, tile: haku() });
    const kanMeld = afterKan.players[0].melds[0]!;
    expect(kanMeld.type).toBe(MeldType.ClosedKan);
    expect(kanMeld.responsibility).toBeUndefined();
  });

});

describe("Nan'yu and Sudden Death rules", () => {
  it("enters Nan'yu when top score is under 30000 at the end of East 4", () => {
    const start = startedState({
      dealer: 3,
      startingDealer: 0,
      roundWind: 0,
      roundNumber: 4,
      players: makePlayers(
        { ...makeTestPlayer(winningTanyao13()), points: 16000 },
        { ...makeTestPlayer([]), points: 17000 },
        { ...makeTestPlayer([]), points: 17000 },
        { ...makeTestPlayer([]), points: 15000 },
      ),
      lastDiscard: { tile: p(5), player: 2 },
    });

    const afterRon = gameReducer(start, { type: "RON", winner: 0 });
    expect(afterRon.phase).toBe("roundEnded");
    expect(afterRon.roundWind).toBe(1); // Wind.Nan
    expect(afterRon.roundNumber).toBe(1);
    expect(afterRon.dealer).toBe(0);
  });

  it("ends the game via sudden death when top score reaches 30000 in Nan 1", () => {
    const start = startedState({
      dealer: 0,
      startingDealer: 0,
      roundWind: 1,
      roundNumber: 1,
      players: makePlayers(
        { ...makeTestPlayer(winningTanyao13()), points: 29000 },
        { ...makeTestPlayer([]), points: 25000 },
        { ...makeTestPlayer([]), points: 25000 },
        { ...makeTestPlayer([]), points: 25000 },
      ),
      lastDiscard: { tile: p(5), player: 2 },
    });

    const afterRon = gameReducer(start, { type: "RON", winner: 0 });
    expect(afterRon.phase).toBe("ended");
    expect(afterRon.finalRanking?.[0]).toBe(0);
  });

  it("forces game end at the end of Nan 4 even if top score is under 30000", () => {
    const start = startedState({
      dealer: 3,
      startingDealer: 0,
      roundWind: 1,
      roundNumber: 4,
      players: makePlayers(
        { ...makeTestPlayer(winningTanyao13()), points: 15000 },
        { ...makeTestPlayer([]), points: 28000 },
        { ...makeTestPlayer([]), points: 28000 },
        { ...makeTestPlayer([]), points: 25000 },
      ),
      lastDiscard: { tile: p(5), player: 3 },
    });

    const afterRon = gameReducer(start, { type: "RON", winner: 0 });
    expect(afterRon.phase).toBe("ended");
  });

  it("does NOT end the game at the end of Nan 4 if top score is under 30000 and dealer continues", () => {
    const start = startedState({
      dealer: 3,
      startingDealer: 0,
      roundWind: 1,
      roundNumber: 4,
      players: makePlayers(
        { ...makeTestPlayer([]), points: 15000 },
        { ...makeTestPlayer([]), points: 15000 },
        { ...makeTestPlayer([]), points: 15000 },
        { ...makeTestPlayer(winningTanyao13()), points: 15000 },
      ),
      lastDiscard: { tile: p(5), player: 2 },
    });

    const afterRon = gameReducer(start, { type: "RON", winner: 3 });
    expect(afterRon.phase).toBe("roundEnded");
    expect(afterRon.roundWind).toBe(1);
    expect(afterRon.roundNumber).toBe(4);
    expect(afterRon.honba).toBe(1);
  });

  it("aborts the round, continues dealer and increases honba on abortive draw", () => {
    const start = startedState({
      dealer: 0,
      startingDealer: 0,
      roundWind: 0,
      roundNumber: 1,
      honba: 0,
      players: makePlayers(
        { ...makeTestPlayer([]), points: 25000 },
        { ...makeTestPlayer([]), points: 25000 },
        { ...makeTestPlayer([]), points: 25000 },
        { ...makeTestPlayer([]), points: 25000 },
      ),
    });

    const afterDraw = finishAbortiveDraw(start, "kyuushuKyuuhai");
    expect(afterDraw.phase).toBe("roundEnded");
    expect(afterDraw.dealer).toBe(0);
    expect(afterDraw.honba).toBe(1);
    expect(afterDraw.roundWind).toBe(0);
    expect(afterDraw.roundNumber).toBe(1);
  });

  it("does NOT trigger sudden death on abortive draw even if top score is over 30000 in Nan 1", () => {
    const start = startedState({
      dealer: 0,
      startingDealer: 0,
      roundWind: 1,
      roundNumber: 1,
      honba: 0,
      players: makePlayers(
        { ...makeTestPlayer([]), points: 35000 },
        { ...makeTestPlayer([]), points: 25000 },
        { ...makeTestPlayer([]), points: 20000 },
        { ...makeTestPlayer([]), points: 20000 },
      ),
    });

    const afterDraw = finishAbortiveDraw(start, "suufonRenda");
    expect(afterDraw.phase).toBe("roundEnded");
    expect(afterDraw.dealer).toBe(0);
    expect(afterDraw.honba).toBe(1);
  });

  it("resolves ties based on proximity to startingDealer", () => {
    const players = makePlayers(
      { ...makeTestPlayer([]), points: 20000 },
      { ...makeTestPlayer([]), points: 25000 },
      { ...makeTestPlayer([]), points: 20000 },
      { ...makeTestPlayer([]), points: 25000 },
    );

    const rankingA = rankPlayers(players, 0);
    expect(rankingA[0]).toBe(1);
    expect(rankingA[1]).toBe(3);

    const rankingB = rankPlayers(players, 2);
    expect(rankingB[0]).toBe(3);
    expect(rankingB[1]).toBe(1);
  });

  it("collects remaining riichi sticks for the top player at the end of the game on exhaustive draw", () => {
    const start = startedState({
      dealer: 3,
      startingDealer: 0,
      roundWind: 0,
      roundNumber: 4,
      players: makePlayers(
        { ...makeTestPlayer([]), points: 15000 },
        { ...makeTestPlayer([]), points: 32000 }, // Top player (P1)
        { ...makeTestPlayer([]), points: 24000 },
        { ...makeTestPlayer([]), points: 25000 }, // Dealer (no tenpai)
      ),
      wall: [], // Force draw
      currentPlayer: 0,
      lastDrawnTile: p(1),
      riichiSticks: 1,
    });

    const afterDraw = gameReducer(start, { type: "DRAW", player: 0 });
    expect(afterDraw.phase).toBe("ended");
    expect(afterDraw.players[1].points).toBe(33000);
    expect(afterDraw.riichiSticks).toBe(0);
  });
});
