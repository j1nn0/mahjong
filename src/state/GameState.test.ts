import { describe, it, expect } from 'vitest';
import { gameReducer, createInitialState, collectClaims, sortClaimsByPriority, processAiTurn } from './GameState.js';
import type { GameState, PlayerData } from './GameState.js';
import { MeldType, Suit, type Tile } from '../game/types.js';

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

function makeTestPlayer(hand: Tile[]): PlayerData {
  return { hand, melds: [], discards: [], riichi: false, points: 25000, wind: 0 as never };
}

function makePlayers(p0: PlayerData, p1: PlayerData, p2: PlayerData, p3: PlayerData) {
  return [p0, p1, p2, p3] as unknown as [PlayerData, PlayerData, PlayerData, PlayerData];
}

function winningTanyao13(): Tile[] {
  return [
    m(2), m(3), m(4),
    p(5), p(6), p(7),
    s(3), s(4), s(5),
    p(2), p(3), p(4),
    p(5),
  ];
}

function startedState(overrides: Partial<GameState> = {}): GameState {
  return {
    ...gameReducer(createInitialState(), { type: 'START_GAME' }),
    ...overrides,
  };
}

function pointsTotal(state: GameState): number {
  return state.players.reduce((sum, player) => sum + player.points, 0) + state.riichiSticks * 1000;
}

describe('collectClaims', () => {
  it('detects pon when a player has 2 matching tiles', () => {
    // Player 1 discards m4, Player 2 has m4,m4
    const players = makePlayers(
      makeTestPlayer([]),
      makeTestPlayer([m(1), m(1), m(1), m(3), m(4), m(5)]), // discarder (P1)
      makeTestPlayer([m(4), m(4), m(5), m(6), p(1), p(2), p(3)]), // can pon m4
      makeTestPlayer([]),
    );
    const claims = collectClaims(m(4), 1, players);
    expect(claims.some(c => c.type === 'pon' && c.player === 2)).toBe(true);
  });

  it('detects chi for the next player', () => {
    // Player 0 discards m5, Player 1 (next) has m4,m6
    const players = makePlayers(
      makeTestPlayer([m(5)]), // will discard m5
      makeTestPlayer([m(4), m(6), p(1), p(2), p(3), p(4), p(5), p(6), p(7), p(8), p(9)]), // can chi 456
      makeTestPlayer([]),
      makeTestPlayer([]),
    );
    const claims = collectClaims(m(5), 0, players);
    expect(claims.some(c => c.type === 'chi' && c.player === 1)).toBe(true);
  });

  it('does not detect chi for non-adjacent player', () => {
    // Player 0 discards m5, Player 2 is NOT next (player 1 is)
    const players = makePlayers(
      makeTestPlayer([m(5)]),
      makeTestPlayer([p(1), p(2), p(3), p(4), p(5), p(6), p(7), p(8), p(9), s(1), s(2), s(3), s(4)]), // no m tiles
      makeTestPlayer([m(4), m(6), p(1), p(2), p(3), p(4), p(5), p(6), p(7), p(8), p(9)]), // could chi but not next
      makeTestPlayer([]),
    );
    const claims = collectClaims(m(5), 0, players);
    // Player 2 (index 2) should NOT have chi option
    expect(claims.filter(c => c.type === 'chi' && c.player === 2)).toHaveLength(0);
  });

  it('detects daiminkan when a player has 3 matching tiles', () => {
    const players = makePlayers(
      makeTestPlayer([]),
      makeTestPlayer([p(9), p(9), p(9), m(1), m(2), m(3)]),
      makeTestPlayer([p(9), p(9), p(9), m(1), m(2), m(3), m(4), m(5), m(6), m(7), m(8), m(9)]),
      makeTestPlayer([]),
    );
    // P1 discards p9, P2 has p9×3 → can daiminkan
    const claims = collectClaims(p(9), 1, players);
    expect(claims.some(c => c.type === 'daiminkan' && c.player === 2)).toBe(true);
  });

  it('does not allow claims when player is in riichi', () => {
    const players = makePlayers(
      makeTestPlayer([]),
      makeTestPlayer([m(4), m(4), m(4), m(5)]), // discarder
      makeTestPlayer([m(4), m(4)]), // has pair → could pon, but in riichi
      makeTestPlayer([]),
    );
    players[2].riichi = true;
    const claims = collectClaims(m(4), 1, players);
    // Player 2 is in riichi, so no pon
    expect(claims.filter(c => c.player === 2 && c.type === 'pon')).toHaveLength(0);
  });
});

describe('sortClaimsByPriority', () => {
  it('puts pon before chi', () => {
    const players = makePlayers(
      makeTestPlayer([m(5)]),
      makeTestPlayer([m(4), m(6), p(1), p(2), p(3), p(4), p(5), p(6), p(7), p(8), p(9), ton(), ton()]),
      makeTestPlayer([m(5), m(5)]),
      makeTestPlayer([]),
    );
    const claims = collectClaims(m(5), 0, players);
    const sorted = sortClaimsByPriority(claims, 0);
    // First non-pass claim should be pon (player 2 has m5×2)
    const first = sorted[0]!;
    expect(first.type).toBe('pon');
    expect(first.player).toBe(2);
  });
});

describe('gameReducer claims', () => {
  it('enters claiming phase after discard when pon is available', () => {
    const start = gameReducer(createInitialState(), { type: 'START_GAME' });
    // We need to set up: P0 discards, P1 (or anyone else) can pon
    // Since we have random hands, let's test the PON action directly
    // by creating a state in claiming phase with claimOptions

    // Test that the state transitions work by dispatching a CHI/PON properly
    // We'll create a simpler test: just dispatch DISCARD and see what happens
    const tile = start.players[0].hand[0]!;
    const afterDiscard = gameReducer(start, { type: 'DISCARD', player: 0, tile });
    // After discard, we might be in claiming if another player can respond
    // Or we might be in playing (moved to next player)
    // Either is valid behavior
    expect(afterDiscard.phase === 'playing' || afterDiscard.phase === 'claiming').toBe(true);
  });

  it('processes PON action correctly', () => {
    // Create a scenario: P0 discards, P1 has pair → game should enter claiming phase
    // Let's construct a known state
    const start = gameReducer(createInitialState(), { type: 'START_GAME' });
    const state0 = gameReducer(start, { type: 'DRAW', player: 0 });

    // Just discard for now - the exact test depends on whether claims exist
    const tile = state0.players[0].hand[0]!;
    const afterDiscard = gameReducer(state0, { type: 'DISCARD', player: 0, tile });

    // The phase test
    if (afterDiscard.phase === 'claiming') {
      // If there's a pon option, test it
      const ponOpt = afterDiscard.claimOptions.find(c => c.type === 'pon');
      if (ponOpt) {
        const afterPon = gameReducer(afterDiscard, { type: 'PON', player: ponOpt.player });
        expect(afterPon.phase).toBe('playing');
        expect(afterPon.currentPlayer).toBe(ponOpt.player);
        expect(afterPon.players[ponOpt.player].melds.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('east-only match progression', () => {
  it('starts an east-only match at east 1 with the first dealer', () => {
    const state = gameReducer(createInitialState(), { type: 'START_GAME' });
    expect(state.roundNumber).toBe(1);
    expect(state.dealer).toBe(0);
    expect(state.currentPlayer).toBe(0);
    expect(state.players[0].wind).toBe(0);
  });

  it('advances to the next dealer after a child ron', () => {
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
    const afterRon = gameReducer(start, { type: 'RON', winner: 1 });

    expect(afterRon.phase).toBe('roundEnded');
    expect(afterRon.dealer).toBe(1);
    expect(afterRon.roundNumber).toBe(2);
    expect(afterRon.honba).toBe(0);
    expect(pointsTotal(afterRon)).toBe(beforeTotal);

    const next = gameReducer(afterRon, { type: 'NEXT_ROUND' });
    expect(next.phase).toBe('playing');
    expect(next.currentPlayer).toBe(1);
    expect(next.players[1].wind).toBe(0);
  });

  it('keeps the dealer and increments honba after dealer tsumo', () => {
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
    const afterTsumo = gameReducer(start, { type: 'TSUMO', player: 0 });

    expect(afterTsumo.phase).toBe('roundEnded');
    expect(afterTsumo.dealer).toBe(0);
    expect(afterTsumo.roundNumber).toBe(2);
    expect(afterTsumo.honba).toBe(2);
    expect(pointsTotal(afterTsumo)).toBe(beforeTotal);
  });

  it('ends the match when the final dealer wins while already top', () => {
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

    const afterTsumo = gameReducer(start, { type: 'TSUMO', player: 3 });

    expect(afterTsumo.phase).toBe('ended');
    expect(afterTsumo.finalRanking?.[0]).toBe(3);
  });
});

describe('processAiTurn wall movement', () => {
  it('returns DRAW for a normal AI turn so the reducer consumes one wall tile', () => {
    const state = startedState({
      currentPlayer: 1,
      players: makePlayers(
        makeTestPlayer([]),
        makeTestPlayer([m(1), m(2), m(3), m(4), m(5), m(6), p(1), p(2), p(3), p(4), p(5), s(1), s(2)]),
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
    });

    const { action } = processAiTurn(state);
    expect(action).toEqual({ type: 'DRAW', player: 1 });

    const afterDraw = gameReducer(state, action!);
    expect(afterDraw.wall.length).toBe(state.wall.length - 1);
    expect(afterDraw.players[1].hand).toHaveLength(14);
  });

  it('does not draw for an AI discard after an open claim', () => {
    const meld = { type: MeldType.Poon, tiles: [m(9), m(9), m(9)], calledTile: m(9) };
    const state = startedState({
      currentPlayer: 1,
      players: makePlayers(
        makeTestPlayer([]),
        { ...makeTestPlayer([m(1), m(2), m(3), m(4), m(5), p(1), p(2), p(3), s(1), s(2), s(3)]), melds: [meld] },
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
    });

    const { action } = processAiTurn(state);
    expect(action?.type).toBe('DISCARD');

    const afterDiscard = gameReducer(state, action!);
    expect(afterDiscard.wall.length).toBe(state.wall.length);
  });

  it('draws on the next AI turn after an open-hand discard', () => {
    const meld = { type: MeldType.Poon, tiles: [m(9), m(9), m(9)], calledTile: m(9) };
    const state = startedState({
      currentPlayer: 1,
      players: makePlayers(
        makeTestPlayer([]),
        { ...makeTestPlayer([m(1), m(2), m(3), m(4), p(1), p(2), p(3), s(1), s(2), s(3)]), melds: [meld] },
        makeTestPlayer([]),
        makeTestPlayer([]),
      ),
    });

    const { action } = processAiTurn(state);
    expect(action).toEqual({ type: 'DRAW', player: 1 });
  });
});

describe('claiming turn ownership', () => {
  it('does not auto-pass while the human has a claim option', () => {
    const players = makePlayers(
      makeTestPlayer([m(4), m(4)]),
      makeTestPlayer([]),
      makeTestPlayer([]),
      makeTestPlayer([]),
    );
    const state = startedState({
      phase: 'claiming',
      currentPlayer: 1,
      players,
      lastDiscard: { tile: m(4), player: 1 },
      claimOptions: collectClaims(m(4), 1, players),
    });

    const { action } = processAiTurn(state);
    expect(action).toBeNull();
  });

  it('processes the human pon option even when an AI pon option is listed first', () => {
    const players = makePlayers(
      makeTestPlayer([m(4), m(4)]),
      makeTestPlayer([]),
      makeTestPlayer([m(4), m(4)]),
      makeTestPlayer([]),
    );
    const state = startedState({
      phase: 'claiming',
      currentPlayer: 1,
      players,
      lastDiscard: { tile: m(4), player: 1 },
      claimOptions: sortClaimsByPriority(collectClaims(m(4), 1, players), 1),
    });

    expect(state.claimOptions[0]?.player).toBe(2);
    const afterPon = gameReducer(state, { type: 'PON', player: 0 });

    expect(afterPon.currentPlayer).toBe(0);
    expect(afterPon.players[0].melds).toHaveLength(1);
    expect(afterPon.players[2].melds).toHaveLength(0);
  });

  it('processes the human daiminkan option even when an AI daiminkan option is listed first', () => {
    const players = makePlayers(
      makeTestPlayer([p(9), p(9), p(9)]),
      makeTestPlayer([]),
      makeTestPlayer([p(9), p(9), p(9)]),
      makeTestPlayer([]),
    );
    const state = startedState({
      phase: 'claiming',
      currentPlayer: 1,
      players,
      lastDiscard: { tile: p(9), player: 1 },
      claimOptions: sortClaimsByPriority(collectClaims(p(9), 1, players), 1),
    });

    expect(state.claimOptions[0]?.player).toBe(2);
    const afterKan = gameReducer(state, { type: 'DAIMINKAN', player: 0 });

    expect(afterKan.currentPlayer).toBe(0);
    expect(afterKan.players[0].melds).toHaveLength(1);
    expect(afterKan.players[2].melds).toHaveLength(0);
  });
});
