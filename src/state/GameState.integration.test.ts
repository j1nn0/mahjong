import { describe, it, expect } from 'vitest';
import {
  gameReducer,
  createInitialState,
  processAiTurn,
} from './GameState.js';
import type { GameState } from './GameState.js';
import { isValidFinalRanking, progressionInvariantErrors } from './invariants.js';

function expectProgressionInvariants(state: GameState): void {
  expect(progressionInvariantErrors(state)).toEqual([]);
}

// ── Full game runner ──────────────────────────────────────────────

function runFullGame(dealerRoll: number, maxIterations = 2000): GameState {
  let state = gameReducer(createInitialState(() => dealerRoll), { type: 'START_GAME' });
  let iterations = 0;

  // Track consecutive claiming-phase dispatches to break cycles.
  // This is unrelated to the rinshan feature; kept as a safety net for edge
  // cases where scoring fails on a detected winning hand and the fallback
  // PASS_CLAIM does not reset the loop.
  let consecutiveClaims = 0;
  const MAX_CONSECUTIVE_CLAIMS = 100;

  expectProgressionInvariants(state);

  while (state.phase !== 'ended' && iterations < maxIterations) {
    if (state.phase === 'playing') {
      consecutiveClaims = 0; // reset on any playing-phase action
      const { action } = processAiTurn(state);
      if (action === null) {
        throw new Error(
          `processAiTurn returned null at iteration ${iterations} ` +
            `(phase ${state.phase}, currentPlayer ${state.currentPlayer})`,
        );
      }
      state = gameReducer(state, action);
    } else if (state.phase === 'claiming') {
      consecutiveClaims++;
      if (consecutiveClaims > MAX_CONSECUTIVE_CLAIMS || state.claimOptions.length === 0) {
        // Break out of a claiming cycle
        state = gameReducer(state, { type: 'PASS_CLAIM' });
      } else {
        const { action } = processAiTurn(state);
        state = gameReducer(state, action ?? { type: 'PASS_CLAIM' });
      }
    } else if (state.phase === 'roundEnded') {
      consecutiveClaims = 0;
      state = gameReducer(state, { type: 'NEXT_ROUND' });
    } else {
      throw new Error(`Unexpected phase ${state.phase} at iteration ${iterations}`);
    }

    expectProgressionInvariants(state);

    iterations++;
  }

  if (iterations >= maxIterations) {
    throw new Error(
      `Game did not finish within ${maxIterations} iterations ` +
        `(dealerRoll ${dealerRoll}, phase ${state.phase}, round ${state.roundNumber}, ` +
        `honba ${state.honba}, currentPlayer ${state.currentPlayer})`,
    );
  }

  return state;
}

// ── Tests ─────────────────────────────────────────────────────────

describe('full-game integration', () => {
  it('completes east-only games through reducer round transitions', () => {
    for (const dealerRoll of [0, 0.25, 0.5, 0.75]) {
      const state = runFullGame(dealerRoll);

      expect(state.phase).toBe('ended');
      expect(isValidFinalRanking(state)).toBe(true);
      expectProgressionInvariants(state);
      if (state.roundNumber < 4) {
        expect(state.players.some((p) => p.points < 0)).toBe(true);
      }
    }
  });
});
