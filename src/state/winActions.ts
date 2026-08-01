import { type ScoreResult } from "../game/scoring.js";
import { closedTilesForTsumo, isCompleteHand } from "../game/winValidity.js";
import {
  finishRound,
  finishAbortiveDraw,
  applyRonPayment,
  applyDoubleRonPayments,
  applyTsumoPayment,
  formatResponsibilityMessage,
} from "./finishRound.js";
import { ronScore, ronClaimPlayers, scoreTsumo, getResponsibilityInfo } from "./winScoring.js";
import type { GameState, GameAction } from "./types.js";

// ── Winning actions (ron / tsumo) ──────────────────────────────────

export function handleRon(
  state: GameState,
  action: Extract<GameAction, { type: "RON" }>,
): GameState {
  if (!state.lastDiscard) return { ...state, message: "ロンできません" };
  const claimWinners = ronClaimPlayers(state);
  const winners = claimWinners.length > 0 ? claimWinners : [action.winner];
  if (winners.length >= 3) {
    return finishAbortiveDraw(state, "sanchaHou");
  }
  const scores = winners.map((winner) => ronScore(state, winner));
  if (scores.some((score) => score === null)) {
    return { ...state, message: "スコア計算できません" };
  }
  if (winners.length === 2) {
    const doubleWinners = winners as [number, number];
    const doubleScores = scores as [ScoreResult, ScoreResult];
    const riichiReceiver = doubleWinners[0];
    const players1 = applyDoubleRonPayments(
      state.players,
      doubleWinners,
      doubleScores,
      riichiReceiver,
      state.riichiSticks,
    );
    const names = doubleWinners
      .map((winner) => (winner === 0 ? "あなた" : `プレイヤー${winner + 1}`))
      .join("・");
    const scoreSummary = doubleScores
      .map((score) => `${score.fu}符${score.han}飜 ${score.score}点`)
      .join(" / ");
    const respMsgD = [...new Set(doubleWinners.flatMap((winner) => {
      const info = getResponsibilityInfo(state.players[winner].melds);
      return info.responsiblePlayer !== undefined && info.responsibilityType
        ? [formatResponsibilityMessage(info.responsiblePlayer)]
        : [];
    }))].join(" / ");
    return finishRound(
      state,
      players1,
      {
        winner: riichiReceiver,
        isDraw: false,
        dealerContinues: doubleWinners.includes(state.dealer),
        score: doubleScores[0],
        message: `${names}がダブロン! ${scoreSummary}`,
        ...(respMsgD ? { responsibilityMessage: respMsgD } : {}),
      },
    );
  }
  const winner = winners[0]!;
  const score = scores[0]!;
  const players1 = applyRonPayment(state.players, winner, score);
  const yakuStr = score.yaku.map((y) => y.name).join("・");
  const respInfo = getResponsibilityInfo(state.players[winner].melds);
  const respMessage = respInfo.responsiblePlayer !== undefined && respInfo.responsibilityType
    ? formatResponsibilityMessage(respInfo.responsiblePlayer)
    : undefined;
  return finishRound(
    state,
    players1,
    {
      winner,
      isDraw: false,
      dealerContinues: winner === state.dealer,
      score,
      message: `${winner === 0 ? "あなた" : `プレイヤー${winner + 1}`}がロン! ${score.fu}符${score.han}飜 ${score.score}点 (${yakuStr})`,
      ...(respMessage ? { responsibilityMessage: respMessage } : {}),
    },
  );
}

export function handleTsumo(
  state: GameState,
  action: Extract<GameAction, { type: "TSUMO" }>,
): GameState {
  const player = action.player;
  const winTile =
    state.lastDrawnTile ?? state.players[player].hand[state.players[player].hand.length - 1]!;
  const closedTiles = closedTilesForTsumo(state.players[player].hand, winTile);
  if (!isCompleteHand(closedTiles, state.players[player].melds, winTile)) {
    return { ...state, message: "ツモ和了できません" };
  }
  const score = scoreTsumo(state, player, winTile);
  if (!score) {
    return { ...state, message: "スコア計算できません" };
  }
  const updatedTsPlayers = applyTsumoPayment(state.players, player, score);
  const yakuStr = score.yaku.map((y) => y.name).join("・");
  const resp = getResponsibilityInfo(state.players[player].melds);
  const respMessage = resp.responsiblePlayer !== undefined && resp.responsibilityType
    ? formatResponsibilityMessage(resp.responsiblePlayer)
    : undefined;
  return finishRound(
    state,
    updatedTsPlayers,
    {
      winner: player,
      isDraw: false,
      dealerContinues: player === state.dealer,
      score,
      message: `${player === 0 ? "あなた" : `プレイヤー${player + 1}`}がツモ和了! ${score.fu}符${score.han}飜 ${score.score}点 (${yakuStr})`,
      ...(respMessage ? { responsibilityMessage: respMessage } : {}),
    },
  );
}
