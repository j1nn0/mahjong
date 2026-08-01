import { type Tile, PlayerWind } from "../game/types.js";
import {
  formatTile,
  sortHand,
  drawFromWall,
  drawDeadWall,
  removeOneTile,
} from "../game/tiles.js";
import { indexToTile } from "../game/agari.js";
import { isCompleteHand, findWaits } from "../game/winValidity.js";
import {
  finishAbortiveDraw,
  handleExhaustiveDraw,
  isSuufonRenda,
  revealKanDora,
} from "./finishRound.js";
import {
  collectClaims,
  isKuikaeProhibited,
  kuikaeMessage,
  canDeclareRiichi,
  sortClaimsByPriority,
} from "./claimPhase.js";
import { ronScore } from "./winScoring.js";
import { updPlayer, updatePlayerInTuple } from "./players.js";
import type { PlayerData, GameState, GameAction } from "./types.js";

// ── Turn flow (draw / discard / riichi) ────────────────────────────

function scoreableClaimsForDiscard(
  state: GameState,
  players: readonly [PlayerData, PlayerData, PlayerData, PlayerData],
  tile: Tile,
  discarder: number,
  overrides: Partial<GameState> = {},
) {
  const claimState = {
    ...state,
    ...overrides,
    players,
    lastDiscard: { tile, player: discarder },
    lastDiscardWasChankan: false,
  };
  return collectClaims(tile, discarder, players).filter(
    (claim) => claim.type !== "ron" || ronScore(claimState, claim.player) !== null,
  );
}

export function handleDraw(
  state: GameState,
  action: Extract<GameAction, { type: "DRAW" }>,
): GameState {
  if (state.wall.length === 0) {
    // 流局処理: 聴牌確認と点棒移動
    return handleExhaustiveDraw(state);
  }
  const player = state.players[action.player];
  if (state.pendingRinshan) {
    // Rinshan draw: draw from the dead wall (last tile)
    const rinshanResult = drawDeadWall(state.deadWall.tiles);
    let drawn: readonly Tile[];
    let newDeadWall: readonly Tile[];
    if (rinshanResult) {
      drawn = [rinshanResult.drawn];
      newDeadWall = rinshanResult.remaining;
    } else {
      // Fallback: dead wall empty, draw from normal wall
      const fallback = drawFromWall(state.wall, 1);
      drawn = fallback.drawn;
      newDeadWall = state.deadWall.tiles;
    }
    const newHand = sortHand([...player.hand, ...drawn]);
    const updatedPlayer = updPlayer(player, { hand: newHand, temporaryFuriten: false });
    const newPlayers = updatePlayerInTuple(state.players, action.player, updatedPlayer);
    let message = `嶺上ツモ: ${formatTile(drawn[0]!)}`;
    if (isCompleteHand(updatedPlayer.hand, updatedPlayer.melds, drawn[0]!)) {
      message = `嶺上ツモ! ${formatTile(drawn[0]!)} をツモりました。和了できます！`;
    }
    return {
      ...state,
      players: newPlayers,
      deadWall: { ...state.deadWall, tiles: newDeadWall },
      lastDrawnTile: drawn[0]!,
      pendingRinshan: false,
      lastDrawWasRinshan: true,
      lastDiscardWasChankan: false,
      message,
    };
  }
  const { drawn, remaining } = drawFromWall(state.wall, 1);
  const newHand = sortHand([...player.hand, ...drawn]);
  const updatedPlayer = updPlayer(player, { hand: newHand, temporaryFuriten: false });
  const newPlayers = updatePlayerInTuple(state.players, action.player, updatedPlayer);
  let message = `ツモ: ${formatTile(drawn[0]!)}`;
  if (isCompleteHand(updatedPlayer.hand, updatedPlayer.melds, drawn[0]!)) {
    message = `ツモ! ${formatTile(drawn[0]!)} をツモりました。和了できます！`;
  }
  return {
    ...state,
    players: newPlayers,
    wall: remaining,
    lastDrawnTile: drawn[0]!,
    lastDrawWasRinshan: false,
    lastDiscardWasChankan: false,
    message,
  };
}

export function handleDiscard(
  state: GameState,
  action: Extract<GameAction, { type: "DISCARD" }>,
): GameState {
  const player = state.players[action.player];
  const tileStr = formatTile(action.tile);
  if (isKuikaeProhibited(state, action.player, action.tile)) {
    return { ...state, message: kuikaeMessage(action.tile) };
  }
  const fixedHand = removeOneTile(player.hand, action.tile);
  const updatedPlayer = updPlayer(player, {
    hand: sortHand(fixedHand),
    discards: [
      ...player.discards,
      { tile: action.tile, isRiichi: false, player: player.wind as unknown as PlayerWind },
    ],
    ippatsu: false,
  });
  const newPlayers = updatePlayerInTuple(state.players, action.player, updatedPlayer);
  // Check claims
  const claims = scoreableClaimsForDiscard(state, newPlayers, action.tile, action.player);
  const sorted = sortClaimsByPriority(claims, action.player);
  let nextDeadWall = state.deadWall;
  let nextPendingKanDora = state.pendingKanDora;
  if (state.pendingAbortiveDraw === "suukanSanra") {
    const ronClaims = sorted.filter((claim) => claim.type === "ron");
    if (ronClaims.length === 0) {
      return finishAbortiveDraw(
        {
          ...state,
          players: newPlayers,
          lastDiscard: { tile: action.tile, player: action.player },
        },
        "suukanSanra",
      );
    }
    if (state.pendingKanDora && ronClaims.length === 0) {
      nextDeadWall = revealKanDora(state.deadWall);
      nextPendingKanDora = false;
    }
    return {
      ...state,
      players: newPlayers,
      deadWall: nextDeadWall,
      pendingKanDora: nextPendingKanDora,
      lastDiscard: { tile: action.tile, player: action.player },
      lastDiscardWasChankan: false,
      claimOptions: ronClaims,
      phase: "claiming",
      kuikaeProhibitedTiles: [],
      message: `${tileStr} を切りました。`,
    };
  }
  if (sorted.length > 0) {
    const ronClaims = sorted.filter((claim) => claim.type === "ron");
    if (state.pendingKanDora && ronClaims.length === 0) {
      nextDeadWall = revealKanDora(state.deadWall);
      nextPendingKanDora = false;
    }
    return {
      ...state,
      players: newPlayers,
      deadWall: nextDeadWall,
      pendingKanDora: nextPendingKanDora,
      lastDiscard: { tile: action.tile, player: action.player },
      lastDiscardWasChankan: false,
      claimOptions: sorted,
      phase: "claiming",
      kuikaeProhibitedTiles: [],
      message: `${tileStr} を切りました。`,
    };
  }
  if (state.pendingKanDora) {
    nextDeadWall = revealKanDora(state.deadWall);
    nextPendingKanDora = false;
  }
  if (isSuufonRenda(newPlayers, state.firstTurnInterrupted)) {
    return finishAbortiveDraw(
      {
        ...state,
        players: newPlayers,
        deadWall: nextDeadWall,
        pendingKanDora: nextPendingKanDora,
        lastDiscard: { tile: action.tile, player: action.player },
      },
      "suufonRenda",
    );
  }
  return {
    ...state,
    players: newPlayers,
    deadWall: nextDeadWall,
    pendingKanDora: nextPendingKanDora,
    lastDiscard: { tile: action.tile, player: action.player },
    lastDiscardWasChankan: false,
    currentPlayer: (action.player + 1) % 4,
    claimOptions: [],
    kuikaeProhibitedTiles: [],
    message: player.riichi ? `${tileStr} を切りました (リーチ中)` : `${tileStr} を切りました`,
  };
}

export function handleDeclareRiichi(
  state: GameState,
  action: Extract<GameAction, { type: "DECLARE_RIICHI" }>,
): GameState {
  const player = state.players[action.player];
  if (player.points < 1000) {
    return { ...state, message: "リーチできません (持ち点が1000点未満)" };
  }
  if (isKuikaeProhibited(state, action.player, action.discardTile)) {
    return { ...state, message: kuikaeMessage(action.discardTile) };
  }
  if (!canDeclareRiichi(player)) {
    return { ...state, message: "リーチできません" };
  }
  const testHand = removeOneTile(player.hand, action.discardTile);
  const tenpai = findWaits(testHand, player.melds);
  if (tenpai.length === 0) {
    return { ...state, message: "リーチできません (テンパイしていません)" };
  }
  const isDoubleRiichi = player.discards.length === 0;
  const tenpaiStr = tenpai.map((i) => formatTile(indexToTile(i))).join(", ");
  const newPlayers = updatePlayerInTuple(
    state.players,
    action.player,
    updPlayer(player, {
      hand: sortHand(testHand),
      discards: [
        ...player.discards,
        {
          tile: action.discardTile,
          isRiichi: true,
          player: player.wind as unknown as PlayerWind,
        },
      ],
      riichi: true,
      doubleRiichi: isDoubleRiichi,
      ippatsu: true,
      points: player.points - 1000,
    }),
  );
  const nextRiichiSticks = state.riichiSticks + 1;
  const claims = scoreableClaimsForDiscard(
    state,
    newPlayers,
    action.discardTile,
    action.player,
    { riichiSticks: nextRiichiSticks },
  );
  const sorted = sortClaimsByPriority(claims, action.player);
  const allRiichi = newPlayers.every((p) => p.riichi);
  const ronClaims = sorted.filter((claim) => claim.type === "ron");
  let nextDeadWall = state.deadWall;
  let nextPendingKanDora = state.pendingKanDora;
  if (state.pendingKanDora && ronClaims.length === 0) {
    nextDeadWall = revealKanDora(state.deadWall);
    nextPendingKanDora = false;
  }
  if (allRiichi) {
    const ronClaimsForRiichi = sorted.filter((claim) => claim.type === "ron");
    if (ronClaimsForRiichi.length === 0) {
      return finishAbortiveDraw(
        {
          ...state,
          players: newPlayers,
          deadWall: nextDeadWall,
          pendingKanDora: nextPendingKanDora,
          riichiSticks: nextRiichiSticks,
          lastDiscard: { tile: action.discardTile, player: action.player },
        },
        "suuchaRiichi",
      );
    }
    return {
      ...state,
      players: newPlayers,
      deadWall: nextDeadWall,
      pendingKanDora: nextPendingKanDora,
      riichiSticks: nextRiichiSticks,
      lastDiscard: { tile: action.discardTile, player: action.player },
      lastDiscardWasChankan: false,
      phase: "claiming",
      claimOptions: ronClaimsForRiichi,
      currentPlayer: (action.player + 1) % 4,
      kuikaeProhibitedTiles: [],
      pendingAbortiveDraw: "suuchaRiichi",
      message: `リーチ! 待ち: ${tenpaiStr}`,
    };
  }
  if (sorted.length > 0) {
    return {
      ...state,
      players: newPlayers,
      deadWall: nextDeadWall,
      pendingKanDora: nextPendingKanDora,
      riichiSticks: nextRiichiSticks,
      lastDiscard: { tile: action.discardTile, player: action.player },
      lastDiscardWasChankan: false,
      phase: "claiming",
      claimOptions: sorted,
      currentPlayer: (action.player + 1) % 4,
      kuikaeProhibitedTiles: [],
      message: `リーチ! 待ち: ${tenpaiStr}`,
    };
  }
  if (isSuufonRenda(newPlayers, state.firstTurnInterrupted)) {
    return finishAbortiveDraw(
      {
        ...state,
        players: newPlayers,
        deadWall: nextDeadWall,
        pendingKanDora: nextPendingKanDora,
        riichiSticks: nextRiichiSticks,
        lastDiscard: { tile: action.discardTile, player: action.player },
      },
      "suufonRenda",
    );
  }
  return {
    ...state,
    players: newPlayers,
    deadWall: nextDeadWall,
    pendingKanDora: nextPendingKanDora,
    riichiSticks: nextRiichiSticks,
    lastDiscard: { tile: action.discardTile, player: action.player },
    lastDiscardWasChankan: false,
    currentPlayer: (action.player + 1) % 4,
    kuikaeProhibitedTiles: [],
    message: `リーチ! 待ち: ${tenpaiStr}`,
  };
}
