import { type Tile, type Meld, MeldType } from "../game/types.js";
import {
  formatTile,
  sortHand,
  removeDiscardByTile,
  removeOneTile,
  removeTileKind,
  isSameTile,
  isSameTileKind,
  tileKindKey,
  matchingTileKind,
} from "../game/tiles.js";
import { findWaits } from "../game/winValidity.js";
import {
  finishAbortiveDraw,
  revealKanDora,
  nextPendingAbortiveDrawAfterKan,
} from "./finishRound.js";
import {
  detectResponsibility,
  clearTemporaryFuritenAndIppatsu,
  chiKuikaeProhibitedTiles,
  isMeldClaimOption,
  collectClaims,
  sortClaimsByPriority,
} from "./claimPhase.js";
import { updPlayer, updatePlayerInTuple } from "./players.js";
import type { PlayerData, GameState, GameAction, MeldClaimOption } from "./types.js";

// ── Meld application (chi / pon / daiminkan) ───────────────────────

/** 副露適用の共通処理: 手牌から除去・面子追加・捨て牌修正・カンドラ */
function applyMeldClaim(
  state: GameState,
  option: MeldClaimOption,
  fromHand: readonly Tile[],
  kuikaeProhibitedTiles: readonly Tile[],
  message: string,
): GameState {
  const player = state.players[option.player];
  let newHand = [...player.hand];
  for (const t of fromHand) {
    newHand = removeOneTile(newHand, t);
  }
  // Update claimant: hand + melds
  const resp = detectResponsibility(player.melds, option.meld, option.calledTile);
  const responsibleMeld = resp ? { ...option.meld, responsibility: resp } : option.meld;
  const claimantUpd = updPlayer(player, {
    hand: sortHand(newHand),
    melds: [...player.melds, responsibleMeld],
  });
  let newPlayers = clearTemporaryFuritenAndIppatsu(
    updatePlayerInTuple(state.players, option.player, claimantUpd),
  );
  // Remove called tile from the discarder's discards
  if (state.lastDiscard) {
    const dIdx = state.lastDiscard.player;
    const dPlayer = newPlayers[dIdx];
    const fixedDiscs = removeDiscardByTile(dPlayer.discards, state.lastDiscard.tile);
    newPlayers = updatePlayerInTuple(
      newPlayers,
      dIdx,
      updPlayer(dPlayer, { discards: fixedDiscs }),
    );
  }
  const calledDiscardKinds = state.lastDiscard
    ? state.calledDiscardKinds.map((kinds, i) =>
        i === state.lastDiscard!.player
          ? [...kinds, tileKindKey(state.lastDiscard!.tile)]
          : kinds,
      )
    : state.calledDiscardKinds;
  let nextDeadWall = state.deadWall;
  let nextPendingKanDora = state.pendingKanDora;
  if (state.pendingKanDora) {
    nextDeadWall = revealKanDora(state.deadWall);
    nextPendingKanDora = false;
  }
  return {
    ...state,
    players: newPlayers,
    deadWall: nextDeadWall,
    pendingKanDora: nextPendingKanDora,
    currentPlayer: option.player,
    phase: "playing",
    claimOptions: [],
    lastDiscardWasChankan: false,
    kuikaeProhibitedTiles,
    firstTurnInterrupted: true,
    calledDiscardKinds,
    message,
  };
}

export function handleChi(
  state: GameState,
  action: Extract<GameAction, { type: "CHI" }>,
): GameState {
  const option = state.claimOptions[action.optionIndex];
  if (!option || option.type !== "chi") return { ...state, message: "チーできません" };
  const fromHand = option.tiles.filter((t) => !isSameTile(t, option.calledTile));
  return applyMeldClaim(state, option, fromHand, chiKuikaeProhibitedTiles(option), "チー！");
}

export function handlePon(
  state: GameState,
  action: Extract<GameAction, { type: "PON" }>,
): GameState {
  const option = state.claimOptions.find((c) => isMeldClaimOption(c, "pon", action.player));
  if (!option) return { ...state, message: "ポンできません" };
  const fromHand = option.tiles.slice(0, 2); // [hand1, hand2] 末尾がcalledTile
  return applyMeldClaim(
    state,
    option,
    fromHand,
    [option.calledTile],
    `ポン！ ${formatTile(option.calledTile)}`,
  );
}

export function handleDaiminkan(
  state: GameState,
  action: Extract<GameAction, { type: "DAIMINKAN" }>,
): GameState {
  const option = state.claimOptions.find((c) =>
    isMeldClaimOption(c, "daiminkan", action.player),
  );
  if (!option) return { ...state, message: "カンできません" };
  const fromHand = option.tiles.slice(0, 3); // [hand1, hand2, hand3] 末尾がcalledTile
  const result = applyMeldClaim(
    state,
    option,
    fromHand,
    [option.calledTile],
    `カン！ ${formatTile(option.calledTile)}`,
  );
  return {
    ...result,
    pendingKanDora: true,
    pendingRinshan: true,
    lastDrawWasRinshan: false,
    pendingAbortiveDraw: nextPendingAbortiveDrawAfterKan(result.players),
  };
}

export function handleAnkan(
  state: GameState,
  action: Extract<GameAction, { type: "ANKAN" }>,
): GameState {
  const player = state.players[action.player];
  const tiles = matchingTileKind(player.hand, action.tile);
  if (tiles.length < 4) return { ...state, message: "暗槓できません" };

  if (player.riichi) {
    const currentWaits = findWaits(removeOneTile(player.hand, action.tile), player.melds);
    const newHand = sortHand(removeTileKind(player.hand, action.tile, 4));
    const newMeld: Meld = { type: MeldType.ClosedKan, tiles: tiles.slice(0, 4) };
    const newMelds = [...player.melds, newMeld];
    const newWaits = findWaits(newHand, newMelds);

    if (
      currentWaits.length !== newWaits.length ||
      !currentWaits.every((cw) => newWaits.includes(cw))
    ) {
      return { ...state, message: "暗槓できません (待ちが変わるため)" };
    }
  }
  const meld: Meld = { type: MeldType.ClosedKan, tiles: tiles.slice(0, 4) };
  const updatedPlayer = updPlayer(player, {
    hand: sortHand(removeTileKind(player.hand, action.tile, 4)),
    melds: [...player.melds, meld],
  });
  const newPlayers = clearTemporaryFuritenAndIppatsu(
    updatePlayerInTuple(state.players, action.player, updatedPlayer),
  );
  return {
    ...state,
    players: newPlayers,
    deadWall: revealKanDora(state.deadWall),
    currentPlayer: action.player,
    phase: "playing",
    claimOptions: [],
    pendingRinshan: true,
    lastDrawWasRinshan: false,
    lastDiscardWasChankan: false,
    pendingAbortiveDraw: nextPendingAbortiveDrawAfterKan(newPlayers),
    message: `暗槓！ ${formatTile(action.tile)}`,
  };
}

export function handleKakan(
  state: GameState,
  action: Extract<GameAction, { type: "KAKAN" }>,
): GameState {
  const player = state.players[action.player];
  if (player.riichi) {
    return { ...state, message: "加槓できません (リーチ中)" };
  }
  const meldIndex = player.melds.findIndex(
    (meld) =>
      meld.type === MeldType.Poon &&
      meld.tiles.some((tile) => isSameTileKind(tile, action.tile)),
  );
  if (meldIndex === -1 || !player.hand.some((tile) => isSameTile(tile, action.tile))) {
    return { ...state, message: "加槓できません" };
  }
  const meld = player.melds[meldIndex]!;
  const upgradedMeld: Meld = {
    type: MeldType.AddedKan,
    tiles: [...meld.tiles, action.tile],
    ...(meld.calledTile ? { calledTile: meld.calledTile } : {}),
  };
  const melds = [
    ...player.melds.slice(0, meldIndex),
    upgradedMeld,
    ...player.melds.slice(meldIndex + 1),
  ];
  const updatedPlayer = updPlayer(player, {
    hand: sortHand(removeOneTile(player.hand, action.tile)),
    melds,
  });
  const newPlayers = clearTemporaryFuritenAndIppatsu(
    updatePlayerInTuple(state.players, action.player, updatedPlayer),
  );
  const ronClaims = sortClaimsByPriority(
    collectClaims(action.tile, action.player, newPlayers),
    action.player,
  ).filter((claim) => claim.type === "ron");
  let nextDeadWall = state.deadWall;
  if (state.pendingKanDora) {
    nextDeadWall = revealKanDora(state.deadWall);
  }
  if (ronClaims.length > 0) {
    return {
      ...state,
      players: newPlayers,
      deadWall: nextDeadWall,
      pendingKanDora: true,
      currentPlayer: action.player,
      lastDiscard: { tile: action.tile, player: action.player },
      lastDiscardWasChankan: true,
      phase: "claiming",
      claimOptions: ronClaims,
      pendingRinshan: true,
      lastDrawWasRinshan: false,
      pendingAbortiveDraw: nextPendingAbortiveDrawAfterKan(newPlayers),
      message: `加槓！ ${formatTile(action.tile)}`,
    };
  }
  return {
    ...state,
    players: newPlayers,
    deadWall: nextDeadWall,
    pendingKanDora: true,
    currentPlayer: action.player,
    phase: "playing",
    claimOptions: [],
    pendingRinshan: true,
    lastDrawWasRinshan: false,
    lastDiscardWasChankan: false,
    pendingAbortiveDraw: nextPendingAbortiveDrawAfterKan(newPlayers),
    message: `加槓！ ${formatTile(action.tile)}`,
  };
}

export function handlePassClaim(
  state: GameState,
  _action: Extract<GameAction, { type: "PASS_CLAIM" }>,
): GameState {
  const discarder = state.lastDiscard?.player;
  if (discarder === undefined) return state;
  if (state.pendingAbortiveDraw) {
    return finishAbortiveDraw(state, state.pendingAbortiveDraw);
  }
  const missedRonPlayers = new Set(
    state.claimOptions.filter((c) => c.type === "ron").map((c) => c.player),
  );
  const players = state.players.map((player, i) =>
    missedRonPlayers.has(i)
      ? updPlayer(player, player.riichi ? { riichiFuriten: true } : { temporaryFuriten: true })
      : player,
  ) as unknown as [PlayerData, PlayerData, PlayerData, PlayerData];
  let nextDeadWall = state.deadWall;
  let nextPendingKanDora = state.pendingKanDora;
  if (state.pendingKanDora) {
    nextDeadWall = revealKanDora(state.deadWall);
    nextPendingKanDora = false;
  }
  return {
    ...state,
    players,
    deadWall: nextDeadWall,
    pendingKanDora: nextPendingKanDora,
    phase: "playing",
    claimOptions: [],
    currentPlayer: state.lastDiscardWasChankan ? discarder : (discarder + 1) % 4,
    lastDiscardWasChankan: false,
    message: "鳴きません",
  };
}
