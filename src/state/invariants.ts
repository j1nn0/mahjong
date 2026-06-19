import type { GameState } from './types.js';

export const INITIAL_POINTS_TOTAL = 100000;

export function pointsTotal(state: GameState): number {
  return state.players.reduce((sum, player) => sum + player.points, 0) + state.riichiSticks * 1000;
}

export function isValidFinalRanking(state: GameState): boolean {
  if (!state.finalRanking || state.finalRanking.length !== 4) return false;
  const uniquePlayers = new Set(state.finalRanking);
  if (uniquePlayers.size !== 4) return false;
  return [0, 1, 2, 3].every((player) => uniquePlayers.has(player));
}

export function progressionInvariantErrors(state: GameState): string[] {
  const errors: string[] = [];

  if (pointsTotal(state) !== INITIAL_POINTS_TOTAL) {
    errors.push(`points total is ${pointsTotal(state)}, expected ${INITIAL_POINTS_TOTAL}`);
  }

  if (state.roundNumber < 1 || state.roundNumber > 5) {
    errors.push(`roundNumber is ${state.roundNumber}, expected 1..5`);
  }

  if (state.phase === 'ended' && !isValidFinalRanking(state)) {
    errors.push('finalRanking must contain each player exactly once when ended');
  }

  return errors;
}
