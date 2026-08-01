import { useEffect, useRef, type Dispatch } from "react";
import { processAiTurn } from "../state/aiTurn.js";
import { turnTileCount } from "../state/players.js";
import type { GameAction, GameState } from "../state/types.js";

const AI_DELAY = parseInt(process.env.MAHJONG_AI_DELAY ?? "600", 10);

/**
 * AI プレイヤーのターン/鳴きを自動処理する。
 * enabled が false の間は何もしない（セーブ復元選択画面など）。
 */
export function useAiTurn(
  state: GameState,
  dispatch: Dispatch<GameAction>,
  enabled = true,
): void {
  const processingRef = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    if (state.phase === "ended" || state.phase === "roundEnded") return;
    if (processingRef.current) return;

    const isAiTurn = state.phase === "playing" && state.currentPlayer !== 0;
    const isAiClaim =
      state.phase === "claiming" && !state.claimOptions.some((c) => c.player === 0);

    if (isAiTurn || isAiClaim) {
      processingRef.current = true;
      const timer = setTimeout(() => {
        try {
          const { action } = processAiTurn(state);
          processingRef.current = false;
          if (action) dispatch(action);
        } catch (err) {
          processingRef.current = false;
          const message = err instanceof Error ? err.message : String(err);
          dispatch({ type: "SET_MESSAGE", message: `AIエラー: ${message}` });
        }
      }, AI_DELAY);
      return () => {
        clearTimeout(timer);
        processingRef.current = false;
      };
    }
  }, [state, enabled]);
}

/** 人間プレイヤーの手番開始時に自動ツモする。 */
export function useAutoDraw(
  state: GameState,
  dispatch: Dispatch<GameAction>,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;
    if (state.phase !== "playing") return;
    if (state.currentPlayer !== 0) return;
    if (turnTileCount(state.players[0]) === 13) {
      dispatch({ type: "DRAW", player: 0 });
    }
  }, [enabled, state.phase, state.currentPlayer, state.players]);
}
