import { Wind, type AiPersonality } from "../game/types.js";
import type { PlayerData, GameState, GameAction } from "./types.js";
import { finishRound, finishAbortiveDraw, roundName } from "./finishRound.js";
import { canDeclareKyuushuKyuuhai } from "./claimPhase.js";
import { dealRound } from "./roundSetup.js";
import { normalizeGameState } from "./normalize.js";
import { handleDraw, handleDiscard, handleDeclareRiichi } from "./turnActions.js";
import {
  handleChi,
  handlePon,
  handleDaiminkan,
  handleAnkan,
  handleKakan,
  handlePassClaim,
} from "./meldActions.js";
import { handleRon, handleTsumo } from "./winActions.js";

// ── Reducer ────────────────────────────────────────────────────────

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "RESTORE":
      return normalizeGameState(
        (
          action as {
            type: "RESTORE";
            state: GameState;
          }
        ).state,
      );
    case "START_GAME": {
      const actionData = action as { type: "START_GAME"; dealer?: number; personalities?: readonly (AiPersonality | null)[] };
      const dealer = actionData.dealer ?? Math.floor(Math.random() * 4);
      const resetPlayers = state.players.map(
        (p) => ({ ...p, points: 25000, personality: null }),
      ) as unknown as [PlayerData, PlayerData, PlayerData, PlayerData];
      const personalities = actionData.personalities;
      if (personalities) {
        for (let i = 0; i < 4; i++) {
          if (i < personalities.length && personalities[i] != null) {
            resetPlayers[i] = { ...resetPlayers[i], personality: personalities[i] };
          }
        }
      }
      return dealRound(
        { ...state, players: resetPlayers, roundWind: Wind.Ton, startingDealer: dealer },
        dealer,
        1,
        0,
        0,
        "ゲーム開始！ 東1局",
      );
    }
    case "NEXT_ROUND": {
      if (state.phase !== "roundEnded") return state;
      return dealRound(
        state,
        state.dealer,
        state.roundNumber,
        state.honba,
        state.riichiSticks,
        `${roundName(state.roundNumber, state.roundWind)}開始`,
      );
    }
    case "DRAW":
      return handleDraw(state, action);
    case "DISCARD":
      return handleDiscard(state, action);
    case "CHI":
      return handleChi(state, action);
    case "PON":
      return handlePon(state, action);
    case "DAIMINKAN":
      return handleDaiminkan(state, action);
    case "ANKAN":
      return handleAnkan(state, action);
    case "KAKAN":
      return handleKakan(state, action);
    case "PASS_CLAIM":
      return handlePassClaim(state, action);
    case "DECLARE_RIICHI":
      return handleDeclareRiichi(state, action);
    case "RON":
      return handleRon(state, action);
    case "TSUMO":
      return handleTsumo(state, action);
    case "DECLARE_KYUUSHU_KYUUHAI":
      if (!canDeclareKyuushuKyuuhai(state, action.player)) {
        return { ...state, message: "九種九牌できません" };
      }
      return finishAbortiveDraw(state, "kyuushuKyuuhai");
    case "SET_MESSAGE":
      return { ...state, message: (action as { type: "SET_MESSAGE"; message: string }).message };
    case "END_ROUND":
      return finishRound(state, state.players, {
        winner: null,
        isDraw: true,
        dealerContinues: false,
        score: null,
        message: action.message ?? "局終了",
      });
    default:
      return state;
  }
}
