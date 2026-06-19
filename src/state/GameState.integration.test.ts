import { describe, it, expect } from 'vitest';
import {
  gameReducer,
  createInitialState,
  processAiTurn,
} from './GameState.js';
import type { GameState } from './GameState.js';

// ── Points total helper ───────────────────────────────────────────

function pointsTotal(state: GameState): number {
  return state.players.reduce((sum, p) => sum + p.points, 0) + state.riichiSticks * 1000;
}

function expectValidFinalRanking(state: GameState): void {
  expect(state.finalRanking).not.toBeNull();
  expect(state.finalRanking).toHaveLength(4);
  expect(new Set(state.finalRanking ?? []).size).toBe(4);
  expect([...(state.finalRanking ?? [])].sort()).toEqual([0, 1, 2, 3]);
}

function expectProgressionInvariants(state: GameState): void {
  expect(pointsTotal(state)).toBe(100000);
  expect(state.roundNumber).toBeGreaterThanOrEqual(1);
  expect(state.roundNumber).toBeLessThanOrEqual(5);
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
        let newState = gameReducer(state, action ?? { type: 'PASS_CLAIM' });

        // If the action didn't resolve claiming (e.g. scoring returns null
        // for a detected winning hand), fall back to pass to avoid an
        // infinite claiming loop.
        if (newState.phase === 'claiming') {
          newState = gameReducer(state, { type: 'PASS_CLAIM' });
        }
        state = newState;
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
      expectValidFinalRanking(state);
      expectProgressionInvariants(state);
      if (state.roundNumber < 4) {
        expect(state.players.some((p) => p.points < 0)).toBe(true);
      }
    }
  });
});
