import { type Tile, type Meld, MeldType, Wind } from "../game/types.js";
import {
  sortHand,
  isSameTileKind,
  removeOneTile,
  removeTileKind,
  isYaochu,
  getDoraIndicators,
} from "../game/tiles.js";
import { aiChooseDiscard, estimateMinPoints } from "../game/ai.js";
import { findWaits } from "../game/winValidity.js";
import { canScoreTsumo, ronScore } from "./winScoring.js";
import { chiKuikaeProhibitedTiles, canDeclareKyuushuKyuuhai, canDeclareRiichi } from "./claimPhase.js";
import { turnTileCount, expectedAfterDiscard, expectedAfterDraw } from "./players.js";
import type { PlayerData, GameState, GameAction, MeldClaimOption } from "./types.js";

// ── AI ──────────────────────────────────────────────────────────────

function isSimpleTile(tile: Tile): boolean {
  return !isYaochu(tile);
}

function simulateMeldClaim(
  player: PlayerData,
  option: MeldClaimOption,
): { hand: Tile[]; melds: Meld[] } {
  // The called tile comes from the discard; skip one matching tile so we only
  // remove the tiles actually contributed from the claimant's hand.
  let skipCalled = true;
  const tilesToRemove: Tile[] = [];
  for (const tile of option.tiles) {
    if (skipCalled && isSameTileKind(tile, option.calledTile)) {
      skipCalled = false;
      continue;
    }
    tilesToRemove.push(tile);
  }
  let newHand: Tile[] = [...player.hand];
  for (const tile of tilesToRemove) {
    newHand = removeOneTile(newHand, tile);
  }
  return { hand: newHand, melds: [...player.melds, option.meld] };
}

function isMeldTanyaoAiming(option: MeldClaimOption): boolean {
  return option.tiles.every(isSimpleTile);
}

function isMeldTenpaiMaking(simulated: { hand: Tile[]; melds: Meld[] }): boolean {
  return findWaits(simulated.hand, simulated.melds).length > 0;
}

function canDiscardAfterMeldClaim(option: MeldClaimOption, simulated: { hand: Tile[] }): boolean {
  const prohibited =
    option.type === "chi" ? chiKuikaeProhibitedTiles(option) : [option.calledTile];
  return simulated.hand.some(
    (tile) => !prohibited.some((prohibitedTile) => isSameTileKind(prohibitedTile, tile)),
  );
}

// ── Personality-based decisions (AI性格) ───────────────────────────

function isLegacyPersonality(personality: { aggression: number; riskTolerance: number; meldFrequency: number; riichiFrequency: number; handValueFocus: number }): boolean {
  return personality.aggression === 2
    && personality.riskTolerance === 2
    && personality.meldFrequency === 2
    && personality.riichiFrequency === 2
    && personality.handValueFocus === 3;
}

function riichiValueFloorForFocus(handValueFocus: number): number {
  if (handValueFocus >= 5) return 3900;
  if (handValueFocus === 4) return 2000;
  return 0;
}

/** 性格に基づくリーチ判断 */
function shouldDeclareRiichi(
  player: PlayerData,
  waits: readonly number[],
  minPoints: number,
): boolean {
  if (!canDeclareRiichi(player) || waits.length === 0 || player.points < 1000) return false;
  const p = player.personality;
  if (!p || isLegacyPersonality(p)) return waits.length >= 2; // 性格なし/標準: 従来通り

  // 打点志向が高いAIは、安い単騎・低打点リーチを抑制する。
  if (minPoints < riichiValueFloorForFocus(p.handValueFocus)) return false;

  // riichiFrequency に基づく判定
  const freq = p.riichiFrequency;
  if (freq >= 4) return true;      // 4以上: どんなテンパイでもリーチ
  if (freq === 3) return true;     // 3: 単騎でもリーチ
  if (freq === 2) return waits.length >= 2 || minPoints >= 2000; // 2: 多面 or 2000点以上
  // freq === 1: 多面待ちかつ2000点以上 or 3900点以上
  return (waits.length >= 2 && minPoints >= 2000) || minPoints >= 3900;
}

/** 性格に基づく副露判断 */
function aiShouldClaim(
  option: MeldClaimOption,
  player: PlayerData,
  simulated: { hand: Tile[]; melds: Meld[] },
): boolean {
  if (option.type === "daiminkan") return true; // 大明カンは常に
  const p = player.personality;
  if (!p) return isMeldTanyaoAiming(option) || isMeldTenpaiMaking(simulated); // 従来

  // meldFrequency に基づく判定
  if (p.meldFrequency >= 4) return true; // 4以上: どんな鳴きでもする
  if (p.meldFrequency === 3) return isMeldTenpaiMaking(simulated) || isMeldTanyaoAiming(option);
  // 1-2: 従来通り（タンヤオ or テンパイ）
  return isMeldTanyaoAiming(option) || isMeldTenpaiMaking(simulated);
}

export function processAiTurn(state: GameState): {
  state: GameState;
  action: GameAction | null;
} {
  if (state.phase === "claiming") {
    if (state.claimOptions.some((c) => c.player === 0)) {
      return { state, action: null };
    }
    const aiClaims = state.claimOptions.filter((c) => c.player !== 0);
    const claim = aiClaims.find((c) => {
      if (c.type === "ron") return ronScore(state, c.player) !== null;
      if (c.type === "daiminkan") return true;
      const myPlayer = state.players[c.player];
      const simulated = simulateMeldClaim(myPlayer, c as MeldClaimOption);
      if (!canDiscardAfterMeldClaim(c as MeldClaimOption, simulated)) return false;
      return aiShouldClaim(c as MeldClaimOption, myPlayer, simulated);
    });
    if (claim) {
      if (claim.type === "ron") return { state, action: { type: "RON", winner: claim.player } };
      if (claim.type === "chi") {
        const optionIndex = state.claimOptions.indexOf(claim);
        return { state, action: { type: "CHI", player: claim.player, optionIndex } };
      }
      if (claim.type === "pon") return { state, action: { type: "PON", player: claim.player } };
      if (claim.type === "daiminkan")
        return { state, action: { type: "DAIMINKAN", player: claim.player } };
    }
    return { state, action: { type: "PASS_CLAIM" } };
  }
  const player = state.players[state.currentPlayer];
  const totalTiles = turnTileCount(player);
  // Rinshan draw after a kan
  if (state.pendingRinshan) {
    return { state, action: { type: "DRAW", player: state.currentPlayer } };
  }
  const needDraw = expectedAfterDiscard(player);
  const readyDiscard = expectedAfterDraw(player);

  // ── Personality context ──────────────────────────────────────────
  const personality = player.personality;
  const doraIndicators = getDoraIndicators(state.deadWall.tiles, state.deadWall.doraCount);
  const roundWind = state.roundWind as Wind;
  const playerWind = player.wind;

  if (totalTiles <= needDraw) {
    return { state, action: { type: "DRAW", player: state.currentPlayer } };
  }
  if (totalTiles === readyDiscard && player.hand.length > 0) {
    if (canDeclareKyuushuKyuuhai(state, state.currentPlayer)) {
      return { state, action: { type: "DECLARE_KYUUSHU_KYUUHAI", player: state.currentPlayer } };
    }
    const winTile = state.lastDrawnTile ?? player.hand[player.hand.length - 1]!;
    if (canScoreTsumo(state, state.currentPlayer, winTile)) {
      return { state, action: { type: "TSUMO", player: state.currentPlayer } };
    }
    for (const tile of player.hand) {
      if (player.hand.filter((t) => isSameTileKind(t, tile)).length >= 4) {
        if (player.riichi) {
          const currentWaits = findWaits(removeOneTile(player.hand, tile), player.melds);
          const newHand = sortHand(removeTileKind(player.hand, tile, 4));
          const newMeld: Meld = {
            type: MeldType.ClosedKan,
            tiles: player.hand.filter((t) => isSameTileKind(t, tile)),
          };
          const newWaits = findWaits(newHand, [...player.melds, newMeld]);
          if (
            currentWaits.length === newWaits.length &&
            currentWaits.every((cw) => newWaits.includes(cw))
          ) {
            return { state, action: { type: "ANKAN", player: state.currentPlayer, tile } };
          }
        } else {
          return { state, action: { type: "ANKAN", player: state.currentPlayer, tile } };
        }
      }
    }
    if (!player.riichi) {
      for (const tile of player.hand) {
        if (
          player.melds.some(
            (m) => m.type === MeldType.Poon && m.calledTile && isSameTileKind(m.calledTile, tile),
          )
        ) {
          return { state, action: { type: "KAKAN", player: state.currentPlayer, tile } };
        }
      }
    }
    const discard =
      player.riichi && state.lastDrawnTile
        ? state.lastDrawnTile
        : aiChooseDiscard(
            player.hand,
            state.players.map((p) => p.discards.map((d) => d.tile)),
            state.players.map((p) => p.riichi),
            state.kuikaeProhibitedTiles,
            state.players.map((p) => p.melds),
            state.currentPlayer,
            personality ?? undefined,
            doraIndicators.length > 0 ? doraIndicators : undefined,
            roundWind,
            playerWind,
            player.riichi,
          );
    const testHand = removeOneTile(player.hand, discard);
    const waits = findWaits(testHand, player.melds);

    // 性格ベースのリーチ判断
    if (personality) {
      const estimate = estimateMinPoints(
        testHand, player.melds, doraIndicators, roundWind, playerWind, player.riichi,
      );
      if (shouldDeclareRiichi(player, waits, estimate.minPoints)) {
        return {
          state,
          action: { type: "DECLARE_RIICHI", player: state.currentPlayer, discardTile: discard },
        };
      }
    } else if (
      canDeclareRiichi(player) &&
      waits.length > 0 &&
      player.points >= 1000 &&
      // Tanki (single-wait) riichi: skip, too hard to win unless hand is valuable
      waits.length >= 2
    ) {
      return {
        state,
        action: { type: "DECLARE_RIICHI", player: state.currentPlayer, discardTile: discard },
      };
    }
    return { state, action: { type: "DISCARD", player: state.currentPlayer, tile: discard } };
  }
  if (player.hand.length > 0) {
    const discard = aiChooseDiscard(
      player.hand,
      state.players.map((p) => p.discards.map((d) => d.tile)),
      state.players.map((p) => p.riichi),
      state.kuikaeProhibitedTiles,
      state.players.map((p) => p.melds),
      state.currentPlayer,
      personality ?? undefined,
      doraIndicators.length > 0 ? doraIndicators : undefined,
      roundWind,
      playerWind,
      player.riichi,
    );
    return { state, action: { type: "DISCARD", player: state.currentPlayer, tile: discard } };
  }
  return { state, action: null };
}
