import { describe, it, expect } from 'vitest';
import {
  gameReducer,
  dealRound,
  createInitialState,
  processAiTurn,
} from './GameState.js';
import type { GameState } from './GameState.js';
import { isValidFinalRanking, progressionInvariantErrors } from './invariants.js';

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function runSeededFullGame(seed: number, maxIterations = 5000): GameState {
  const rng = mulberry32(seed);
  let state = dealRound(createInitialState(() => rng()), 0, 1, 0, 0, 'start', rng);
  let iterations = 0;
  let consecutiveClaims = 0;
  const maxConsecutiveClaims = 100;

  while (state.phase !== 'ended' && iterations < maxIterations) {
    if (state.phase === 'playing') {
      consecutiveClaims = 0;
      const { action } = processAiTurn(state);
      if (action === null) {
        throw new Error(
          `processAiTurn returned null at iteration ${iterations} ` +
            `(seed ${seed}, currentPlayer ${state.currentPlayer})`,
        );
      }
      state = gameReducer(state, action);
    } else if (state.phase === 'claiming') {
      consecutiveClaims++;
      if (consecutiveClaims > maxConsecutiveClaims || state.claimOptions.length === 0) {
        state = gameReducer(state, { type: 'PASS_CLAIM' });
      } else {
        const { action } = processAiTurn(state);
        state = gameReducer(state, action ?? { type: 'PASS_CLAIM' });
      }
    } else if (state.phase === 'roundEnded') {
      consecutiveClaims = 0;
      state = dealRound(
        state,
        state.dealer,
        state.roundNumber,
        state.honba,
        state.riichiSticks,
        `東${state.roundNumber}局開始`,
        rng,
      );
    } else {
      throw new Error(`Unexpected phase ${state.phase} at iteration ${iterations} (seed ${seed})`);
    }

    expect(progressionInvariantErrors(state)).toEqual([]);
    iterations++;
  }

  if (iterations >= maxIterations) {
    throw new Error(
      `Game did not finish within ${maxIterations} iterations ` +
        `(seed ${seed}, phase ${state.phase}, round ${state.roundNumber}, ` +
        `honba ${state.honba}, currentPlayer ${state.currentPlayer})`,
    );
  }

  return state;
}

describe('full-game stress', () => {
  it.runIf(process.env.MAHJONG_STRESS === '1')(
    'completes many seeded east-only games',
    () => {
      for (let seed = 1; seed <= 200; seed++) {
        const state = runSeededFullGame(seed);

        expect(state.phase).toBe('ended');
        expect(isValidFinalRanking(state)).toBe(true);
        expect(progressionInvariantErrors(state)).toEqual([]);
      }
    },
  );
});
