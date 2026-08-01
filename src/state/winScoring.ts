import { type Tile } from "../game/types.js";
import { fullScore, type ScoreResult } from "../game/scoring.js";
import { getDoraIndicators, getUraDoraIndicators } from "../game/tiles.js";
import { closedTilesForTsumo, isCompleteHand } from "../game/winValidity.js";
import type { GameState } from "./types.js";
import { getResponsibilityInfo, sortClaimsByPriority } from "./claimPhase.js";

// ── Win scoring (あがり判定・得点導出) ────────────────────────────

/** 現在のstateからドラパラメータを抽出 */
export const doraParams = (state: GameState) => ({
  doraIndicators: getDoraIndicators(state.deadWall.tiles, state.deadWall.doraCount),
  uraDoraIndicators: getUraDoraIndicators(state.deadWall.tiles, state.deadWall.doraCount),
});

export type TsumoResult =
  | { ok: true; score: ScoreResult }
  | { ok: false; reason: "notWinning" | "unscorable" };

/** ツモ和了の点数を計算する（あがれなければ理由付きで失敗を返す） */
export function scoreTsumo(state: GameState, player: number, winTile: Tile): TsumoResult {
  const playerData = state.players[player];
  const closedTiles = closedTilesForTsumo(playerData.hand, winTile);
  if (!isCompleteHand(closedTiles, playerData.melds, winTile)) {
    return { ok: false, reason: "notWinning" };
  }
  const resp = getResponsibilityInfo(playerData.melds);
  const score = fullScore({
    closedTiles,
    melds: playerData.melds,
    winTile,
    isTsumo: true,
    roundWind: state.roundWind,
    playerSeat: player,
    dealer: state.dealer,
    isRiichi: playerData.riichi,
    riichiSticks: state.riichiSticks,
    honba: state.honba,
    ...doraParams(state),
    isDoubleRiichi: playerData.doubleRiichi,
    isIppatsu: playerData.ippatsu,
    isHaitei: !state.lastDrawWasRinshan && state.wall.length === 0,
    isHoutei: false,
    isRinshan: state.lastDrawWasRinshan,
    isChankan: false,
    isTenhou:
      player === state.dealer && !state.firstTurnInterrupted && playerData.discards.length === 0,
    isChiihou:
      player !== state.dealer &&
      !state.firstTurnInterrupted &&
      playerData.discards.length === 0 &&
      playerData.melds.length === 0,
    ...resp,
  });
  return score ? { ok: true, score } : { ok: false, reason: "unscorable" };
}

/** ツモ和了できるか */
export function canScoreTsumo(state: GameState, player: number, winTile: Tile): boolean {
  return scoreTsumo(state, player, winTile).ok;
}

/** ロンの点数を計算する（あがれなければ null） */
export function ronScore(state: GameState, winner: number): ScoreResult | null {
  if (!state.lastDiscard) return null;
  const winTile = state.lastDiscard.tile;
  if (!isCompleteHand(state.players[winner].hand, state.players[winner].melds, winTile)) {
    return null;
  }
  const resp = getResponsibilityInfo(state.players[winner].melds);
  return fullScore({
    closedTiles: state.players[winner].hand,
    melds: state.players[winner].melds,
    winTile,
    isTsumo: false,
    roundWind: state.roundWind,
    playerSeat: winner,
    dealer: state.dealer,
    isRiichi: state.players[winner].riichi,
    riichiSticks: state.riichiSticks,
    honba: state.honba,
    ...doraParams(state),
    isDoubleRiichi: state.players[winner].doubleRiichi,
    isIppatsu: state.players[winner].ippatsu,
    isHaitei: false,
    isHoutei: !state.lastDiscardWasChankan && state.wall.length === 0,
    isRinshan: false,
    isChankan: state.lastDiscardWasChankan,
    loser: state.lastDiscard.player,
    ...resp,
  });
}

/** ロンできるプレイヤーを要求優先度順に返す */
export function ronClaimPlayers(state: GameState): number[] {
  return sortClaimsByPriority(
    state.claimOptions.filter((claim) => claim.type === "ron"),
    state.lastDiscard?.player ?? 0,
  ).map((claim) => claim.player);
}
