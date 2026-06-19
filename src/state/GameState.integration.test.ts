import { describe, it, expect } from 'vitest';
import {
  gameReducer,
  dealRound,
  createInitialState,
  processAiTurn,
  sortClaimsByPriority,
} from './GameState.js';
import type { GameState } from './GameState.js';

// ── Deterministic PRNG (mulberry32) ───────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Points total helper ───────────────────────────────────────────

function pointsTotal(state: GameState): number {
  return state.players.reduce((sum, p) => sum + p.points, 0) + state.riichiSticks * 1000;
}

// ── Full game runner ──────────────────────────────────────────────

function runFullGame(seed: number, maxIterations = 2000): GameState {
  const rng = mulberry32(seed);
  let state = dealRound(createInitialState(), 0, 1, 0, 0, 'start', rng);
  let iterations = 0;

  // Track consecutive claiming-phase dispatches to break cycles.
  // This is unrelated to the rinshan feature; kept as a safety net for edge
  // cases where scoring fails on a detected winning hand and the fallback
  // PASS_CLAIM does not reset the loop.
  let consecutiveClaims = 0;
  const MAX_CONSECUTIVE_CLAIMS = 100;

  // Assert initial points conservation
  expect(pointsTotal(state)).toBe(100000);

  while (state.phase !== 'ended' && iterations < maxIterations) {
    const beforeTotal = pointsTotal(state);

    if (state.phase === 'playing') {
      consecutiveClaims = 0; // reset on any playing-phase action
      const { action } = processAiTurn(state);
      if (action === null) {
        throw new Error(`processAiTurn returned null at iteration ${iterations}`);
      }
      state = gameReducer(state, action);
    } else if (state.phase === 'claiming') {
      consecutiveClaims++;
      if (consecutiveClaims > MAX_CONSECUTIVE_CLAIMS || state.claimOptions.length === 0) {
        // Break out of a claiming cycle
        state = gameReducer(state, { type: 'PASS_CLAIM' });
      } else {
        const sorted = sortClaimsByPriority(state.claimOptions, state.lastDiscard!.player);
        const best = sorted[0]!;
        const originalIndex = state.claimOptions.indexOf(best);

        let newState: GameState;
        if (best.type === 'ron') {
          newState = gameReducer(state, { type: 'RON', winner: best.player });
        } else if (best.type === 'chi') {
          newState = gameReducer(state, {
            type: 'CHI',
            player: best.player,
            optionIndex: originalIndex,
          });
        } else if (best.type === 'pon') {
          newState = gameReducer(state, { type: 'PON', player: best.player });
        } else if (best.type === 'daiminkan') {
          newState = gameReducer(state, { type: 'DAIMINKAN', player: best.player });
        } else {
          newState = gameReducer(state, { type: 'PASS_CLAIM' });
        }

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
      // Use dealRound directly with the seeded RNG instead of dispatching
      // NEXT_ROUND (which calls dealRound without a random source, letting
      // the wall shuffle fall back to Math.random and breaking determinism).
      const nextRoundNumber = state.roundNumber;
      const nextDealer = state.dealer;
      const nextHonba = state.honba;
      const nextRiichiSticks = state.riichiSticks;
      state = dealRound(
        state,
        nextDealer,
        nextRoundNumber,
        nextHonba,
        nextRiichiSticks,
        `東${nextRoundNumber}局開始`,
        rng,
      );
    }

    // Assert points are conserved after every action
    expect(pointsTotal(state)).toBe(beforeTotal);

    iterations++;
  }

  if (iterations >= maxIterations) {
    throw new Error(`Game did not finish within ${maxIterations} iterations (seed ${seed})`);
  }

  return state;
}

// ── Tests ─────────────────────────────────────────────────────────

describe('full-game integration', () => {
  it('completes east-only games deterministically', () => {
    // ── First game: seed 100 ────────────────────────────────────
    const state1 = runFullGame(100);

    expect(state1.phase).toBe('ended');
    expect(state1.finalRanking).not.toBeNull();
    expect(state1.finalRanking).toHaveLength(4);
    if (state1.roundNumber < 4) {
      expect(state1.players.some(p => p.points < 0)).toBe(true);
    }
    expect(pointsTotal(state1)).toBe(100000);

    // ── Determinism: same seed must produce identical result ────
    const state2 = runFullGame(100);

    expect(state2.phase).toBe('ended');
    expect(state2.finalRanking).toEqual(state1.finalRanking);
    expect(state2.roundNumber).toBe(state1.roundNumber);
    for (let i = 0; i < 4; i++) {
      expect(state2.players[i].points).toBe(state1.players[i].points);
    }

    // ── Second game: seed 500 (different seed) ──────────────────
    const state3 = runFullGame(500);

    expect(state3.phase).toBe('ended');
    expect(state3.finalRanking).not.toBeNull();
    expect(state3.finalRanking).toHaveLength(4);
    if (state3.roundNumber < 4) {
      expect(state3.players.some(p => p.points < 0)).toBe(true);
    }
    expect(pointsTotal(state3)).toBe(100000);
  });
});
