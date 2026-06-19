import { type Tile, type Meld, MeldType, PlayerWind } from "../game/types.js";
import { formatTile, sortHand, drawFromWall, drawDeadWall } from "../game/tiles.js";
import { indexToTile } from "../game/agari.js";
import { fullScore, type ScoreResult } from "../game/scoring.js";
import type { PlayerData, GameState, GameAction } from "./types.js";
import {
  finishRound,
  finishAbortiveDraw,
  handleExhaustiveDraw,
  isCompleteHand,
  ronScore,
  ronClaimPlayers,
  applyRonPayment,
  applyDoubleRonPayments,
  applyTsumoPayment,
  isSuufonRenda,
  nextPendingAbortiveDrawAfterKan,
  revealKanDora,
  doraParams,
  sortClaimsByPriority,
  closedTilesForTsumo,
} from "./finishRound.js";
import {
  collectClaims,
  clearTemporaryFuritenAndIppatsu,
  isKuikaeProhibited,
  kuikaeMessage,
  chiKuikaeProhibitedTiles,
  isMeldClaimOption,
} from "./claimPhase.js";
import {
  removeDiscardByTile,
  removeOneTile,
  roundName,
  updPlayer,
  removeTileKind,
  isSameTile,
  isSameTileKind,
  tileKindKey,
  matchingTileKind,
  dealRound,
  findWaits,
  canDeclareKyuushuKyuuhai,
  canDeclareRiichi,
  normalizeGameState,
  updatePlayerInTuple,
} from "./GameState.js";

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
      const dealer = state.dealer;
      return dealRound(
        state,
        dealer,
        1,
        0,
        0,
        "\u30B2\u30FC\u30E0\u958B\u59CB\uFF01 \u67711\u5C40",
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
        `${roundName(state.roundNumber)}開始`,
      );
    }
    case "DRAW": {
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
    case "DISCARD": {
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
      const claims = collectClaims(action.tile, action.player, newPlayers);
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
    case "CHI": {
      const option = state.claimOptions[action.optionIndex];
      if (!option || option.type !== "chi")
        return { ...state, message: "\u30C1\u30FC\u3067\u304D\u307E\u305B\u3093" };
      const player = state.players[option.player];
      const fromHand = option.tiles.filter((t) => !isSameTile(t, option.calledTile));
      let newHand = [...player.hand];
      for (const t of fromHand) {
        newHand = removeOneTile(newHand, t);
      }
      // Update claimant: hand + melds
      const claimantUpd = updPlayer(player, {
        hand: sortHand(newHand),
        melds: [...player.melds, option.meld],
      });
      let newPlayers = clearTemporaryFuritenAndIppatsu(
        updatePlayerInTuple(state.players, option.player, claimantUpd),
      );
      // Remove called tile from the discarder's discards
      if (state.lastDiscard) {
        const dIdx = state.lastDiscard.player;
        const dPlayer = state.players[dIdx];
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
        kuikaeProhibitedTiles: chiKuikaeProhibitedTiles(option),
        firstTurnInterrupted: true,
        calledDiscardKinds,
        message: "\u30C1\u30FC\uFF01",
      };
    }
    case "PON": {
      const option = state.claimOptions.find((c) => isMeldClaimOption(c, "pon", action.player));
      if (!option) return { ...state, message: "\u30DD\u30F3\u3067\u304D\u307E\u305B\u3093" };
      const player = state.players[option.player];
      const fromHand = option.tiles.slice(0, 2); // [hand1, hand2] 末尾がcalledTile
      let newHand = [...player.hand];
      for (const t of fromHand) {
        newHand = removeOneTile(newHand, t);
      }
      const claimantUpd = updPlayer(player, {
        hand: sortHand(newHand),
        melds: [...player.melds, option.meld],
      });
      let newPlayers = clearTemporaryFuritenAndIppatsu(
        updatePlayerInTuple(state.players, option.player, claimantUpd),
      );
      // Remove called tile from the discarder's discards
      if (state.lastDiscard) {
        const dIdx = state.lastDiscard.player;
        const dPlayer = state.players[dIdx];
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
        kuikaeProhibitedTiles: [option.calledTile],
        firstTurnInterrupted: true,
        calledDiscardKinds,
        message: `ポン！ ${formatTile(option.calledTile)}`,
      };
    }
    case "DAIMINKAN": {
      const option = state.claimOptions.find((c) =>
        isMeldClaimOption(c, "daiminkan", action.player),
      );
      if (!option) return { ...state, message: "\u30AB\u30F3\u3067\u304D\u307E\u305B\u3093" };
      const player = state.players[option.player];
      const fromHand = option.tiles.slice(0, 3); // [hand1, hand2, hand3] 末尾がcalledTile
      let newHand = [...player.hand];
      for (const t of fromHand) {
        newHand = removeOneTile(newHand, t);
      }
      const claimantUpd = updPlayer(player, {
        hand: sortHand(newHand),
        melds: [...player.melds, option.meld],
      });
      let newPlayers = clearTemporaryFuritenAndIppatsu(
        updatePlayerInTuple(state.players, option.player, claimantUpd),
      );
      // Remove called tile from the discarder's discards
      if (state.lastDiscard) {
        const dIdx = state.lastDiscard.player;
        const dPlayer = state.players[dIdx];
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
      if (state.pendingKanDora) {
        nextDeadWall = revealKanDora(state.deadWall);
      }
      return {
        ...state,
        players: newPlayers,
        deadWall: nextDeadWall,
        pendingKanDora: true,
        currentPlayer: option.player,
        phase: "playing",
        claimOptions: [],
        pendingRinshan: true,
        lastDrawWasRinshan: false,
        lastDiscardWasChankan: false,
        kuikaeProhibitedTiles: [option.calledTile],
        firstTurnInterrupted: true,
        pendingAbortiveDraw: nextPendingAbortiveDrawAfterKan(newPlayers),
        calledDiscardKinds,
        message: `カン！ ${formatTile(option.calledTile)}`,
      };
    }
    case "ANKAN": {
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
    case "KAKAN": {
      const player = state.players[action.player];
      if (player.riichi)
        return {
          ...state,
          message: "\u52A0\u69D3\u3067\u304D\u307E\u305B\u3093 (\u30EA\u30FC\u30C1\u4E2D)",
        };
      const meldIndex = player.melds.findIndex(
        (meld) =>
          meld.type === MeldType.Poon &&
          meld.tiles.some((tile) => isSameTileKind(tile, action.tile)),
      );
      if (meldIndex === -1 || !player.hand.some((tile) => isSameTile(tile, action.tile))) {
        return { ...state, message: "\u52A0\u69D3\u3067\u304D\u307E\u305B\u3093" };
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
    case "PASS_CLAIM": {
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
        message: "\u9CF4\u304D\u307E\u305B\u3093",
      };
    }
    case "DECLARE_RIICHI": {
      const player = state.players[action.player];
      if (player.points < 1000) {
        return {
          ...state,
          message:
            "\u30EA\u30FC\u30C1\u3067\u304D\u307E\u305B\u3093 (\u6301\u3061\u70B9\u304C1000\u70B9\u672A\u6E80)",
        };
      }
      if (isKuikaeProhibited(state, action.player, action.discardTile)) {
        return { ...state, message: kuikaeMessage(action.discardTile) };
      }
      if (!canDeclareRiichi(player)) {
        return { ...state, message: "\u30EA\u30FC\u30C1\u3067\u304D\u307E\u305B\u3093" };
      }
      const testHand = removeOneTile(player.hand, action.discardTile);
      const tenpai = findWaits(testHand, player.melds);
      if (tenpai.length === 0) {
        return {
          ...state,
          message:
            "\u30EA\u30FC\u30C1\u3067\u304D\u307E\u305B\u3093 (\u30C6\u30F3\u30D1\u30A4\u3057\u3066\u3044\u307E\u305B\u3093)",
        };
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
      const claims = collectClaims(action.discardTile, action.player, newPlayers);
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
    case "RON": {
      if (!state.lastDiscard)
        return { ...state, message: "\u30ED\u30F3\u3067\u304D\u307E\u305B\u3093" };
      const claimWinners = ronClaimPlayers(state);
      const winners = claimWinners.length > 0 ? claimWinners : [action.winner];
      if (winners.length >= 3) {
        return finishAbortiveDraw(state, "sanchaHou");
      }
      const scores = winners.map((winner) => ronScore(state, winner));
      if (scores.some((score) => score === null)) {
        return {
          ...state,
          message: "\u30B9\u30B3\u30A2\u8A08\u7B97\u3067\u304D\u307E\u305B\u3093",
        };
      }
      if (winners.length === 2) {
        const doubleWinners = winners as [number, number];
        const doubleScores = scores as [ScoreResult, ScoreResult];
        const riichiReceiver = doubleWinners[0];
        const players1 = applyDoubleRonPayments(
          state.players,
          doubleWinners,
          state.lastDiscard.player,
          doubleScores,
          riichiReceiver,
          state.riichiSticks,
        );
        const names = doubleWinners
          .map((winner) => (winner === 0 ? "\u3042\u306A\u305F" : `プレイヤー${winner + 1}`))
          .join("\u30FB");
        const scoreSummary = doubleScores
          .map((score) => `${score.fu}符${score.han}飜 ${score.score}点`)
          .join(" / ");
        return finishRound(
          state,
          players1,
          riichiReceiver,
          false,
          doubleWinners.includes(state.dealer),
          doubleScores[0],
          `${names}がダブロン! ${scoreSummary}`,
        );
      }
      const winner = winners[0]!;
      const score = scores[0]!;
      const players1 = applyRonPayment(
        state.players,
        winner,
        state.lastDiscard.player,
        score,
        state.riichiSticks,
      );
      const yakuStr = score.yaku.map((y) => y.name).join("\u30FB");
      return finishRound(
        state,
        players1,
        winner,
        false,
        winner === state.dealer,
        score,
        `${winner === 0 ? "\u3042\u306A\u305F" : `プレイヤー${winner + 1}`}がロン! ${score.fu}符${score.han}飜 ${score.score}点 (${yakuStr})`,
      );
    }
    case "TSUMO": {
      const player = action.player;
      const winTile =
        state.lastDrawnTile ?? state.players[player].hand[state.players[player].hand.length - 1]!;
      const closedTiles = closedTilesForTsumo(state.players[player].hand, winTile);
      if (!isCompleteHand(closedTiles, state.players[player].melds, winTile)) {
        return { ...state, message: "\u30C4\u30E2\u548C\u4E86\u3067\u304D\u307E\u305B\u3093" };
      }
      const score = fullScore({
        closedTiles: closedTilesForTsumo(state.players[player].hand, winTile),
        melds: state.players[player].melds,
        winTile,
        isTsumo: true,
        roundWind: state.roundWind,
        playerSeat: player,
        dealer: state.dealer,
        isRiichi: state.players[player].riichi,
        riichiSticks: state.riichiSticks,
        honba: state.honba,
        ...doraParams(state),
        isDoubleRiichi: state.players[player].doubleRiichi,
        isIppatsu: state.players[player].ippatsu,
        isHaitei: !state.lastDrawWasRinshan && state.wall.length === 0,
        isHoutei: false,
        isRinshan: state.lastDrawWasRinshan,
        isChankan: false,
        isTenhou:
          player === state.dealer &&
          !state.firstTurnInterrupted &&
          state.players[player].discards.length === 0,
        isChiihou:
          player !== state.dealer &&
          !state.firstTurnInterrupted &&
          state.players[player].discards.length === 0 &&
          state.players[player].melds.length === 0,
      });
      if (!score) {
        return {
          ...state,
          message: "\u30B9\u30B3\u30A2\u8A08\u7B97\u3067\u304D\u307E\u305B\u3093",
        };
      }
      const updatedTsPlayers = applyTsumoPayment(state.players, player, score);
      const yakuStr = score.yaku.map((y) => y.name).join("\u30FB");
      return finishRound(
        state,
        updatedTsPlayers,
        player,
        false,
        player === state.dealer,
        score,
        `${player === 0 ? "\u3042\u306A\u305F" : `プレイヤー${player + 1}`}がツモ和了! ${score.fu}符${score.han}飜 ${score.score}点 (${yakuStr})`,
      );
    }
    case "DECLARE_KYUUSHU_KYUUHAI":
      if (!canDeclareKyuushuKyuuhai(state, action.player)) {
        return { ...state, message: "\u4E5D\u7A2E\u4E5D\u724C\u3067\u304D\u307E\u305B\u3093" };
      }
      return finishAbortiveDraw(state, "kyuushuKyuuhai");
    case "END_ROUND":
      return finishRound(
        state,
        state.players,
        null,
        true,
        false,
        null,
        action.message ?? "\u5C40\u7D42\u4E86",
      );
    default:
      return state;
  }
}
