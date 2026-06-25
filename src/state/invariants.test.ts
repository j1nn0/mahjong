import { describe, expect, it } from 'vitest';
import { createInitialState, gameReducer } from './GameState.js';
import type { GameState, PlayerData } from './types.js';
import {
  INITIAL_POINTS_TOTAL,
  isValidFinalRanking,
  pointsTotal,
  progressionInvariantErrors,
} from './invariants.js';

function startedState(overrides: Partial<GameState> = {}): GameState {
  return {
    ...gameReducer(createInitialState(() => 0), { type: 'START_GAME', dealer: 0 }),
    ...overrides,
  };
}

function updatePlayerPoints(
  players: readonly [PlayerData, PlayerData, PlayerData, PlayerData],
  player: number,
  delta: number,
): [PlayerData, PlayerData, PlayerData, PlayerData] {
  return [
    player === 0 ? { ...players[0], points: players[0].points + delta } : players[0],
    player === 1 ? { ...players[1], points: players[1].points + delta } : players[1],
    player === 2 ? { ...players[2], points: players[2].points + delta } : players[2],
    player === 3 ? { ...players[3], points: players[3].points + delta } : players[3],
  ];
}

describe('state invariants', () => {
  it('counts player points and carried riichi sticks as the conserved total', () => {
    const base = startedState();
    const state = startedState({
      riichiSticks: 2,
      players: updatePlayerPoints(base.players, 0, -2000),
    });

    expect(pointsTotal(state)).toBe(INITIAL_POINTS_TOTAL);
    expect(progressionInvariantErrors(state)).toEqual([]);
  });

  it('rejects ended states whose final ranking is missing or duplicated', () => {
    const missingRanking = startedState({ phase: 'ended', finalRanking: null });
    const duplicateRanking = startedState({ phase: 'ended', finalRanking: [0, 1, 1, 3] });

    expect(isValidFinalRanking(missingRanking)).toBe(false);
    expect(progressionInvariantErrors(missingRanking)).toContain(
      'finalRanking must contain each player exactly once when ended',
    );
    expect(isValidFinalRanking(duplicateRanking)).toBe(false);
    expect(progressionInvariantErrors(duplicateRanking)).toContain(
      'finalRanking must contain each player exactly once when ended',
    );
  });

  it('reports point drift and invalid round numbers', () => {
    const base = startedState();
    const state = startedState({
      roundNumber: 6,
      players: updatePlayerPoints(base.players, 0, 1000),
    });

    expect(progressionInvariantErrors(state)).toEqual([
      'points total is 101000, expected 100000',
      'roundNumber is 6, expected 1..5',
    ]);
  });
});
