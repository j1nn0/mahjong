import { type Tile, type Meld, Suit } from "../game/types.js";
import { getDoraIndicators, getUraDoraIndicators } from "../game/tiles.js";
import { tilesToCounts, isWinningHand } from "../game/agari.js";
import { decomposeStandardHand } from "../game/yaku.js";
import { fullScore, type ScoreResult } from "../game/scoring.js";
import type {
  PlayerData,
  DeadWallState,
  GameState,
  AbortiveDrawReason,
  ClaimOption,
} from "./types.js";
import {
  isSameTileKind,
  tileKindKey,
  isYaochu,
  updPlayer,
  kanCount,
  emptyCalledDiscardKinds,
  findWaits,
  removeOneTile,
  updatePlayerInTuple,
} from "./GameState.js";

// ── Nagashi Mangan ─────────────────────────────────────────────────

function nagashiManganScore(
  winner: number,
  dealer: number,
  riichiSticks: number,
  honba: number,
): ScoreResult {
  return {
    han: 5,
    yakuman: 0,
    fu: 30,
    basePoints: 2000,
    doraHan: 0,
    score: (winner === dealer ? 12000 : 8000) + riichiSticks * 1000 + honba * 300,
    payment: {
      from:
        winner === dealer
          ? [0, 1, 2, 3]
              .filter((i) => i !== winner)
              .map((player) => ({ player, amount: 4000 + honba * 100 }))
          : [0, 1, 2, 3]
              .filter((i) => i !== winner)
              .map((player) => ({
                player,
                amount: player === dealer ? 4000 + honba * 100 : 2000 + honba * 100,
              })),
      winnerGets: (winner === dealer ? 12000 : 8000) + riichiSticks * 1000 + honba * 300,
    },
    yaku: [
      {
        id: "nagashiMangan" as never,
        name: "流し満貫",
        han: 5,
        yakuman: false,
        doubleYakuman: false,
      },
    ],
    limit: "mangan",
  };
}

// ── Abortive draw helpers ─────────────────────────────────────────

function abortiveDrawMessage(reason: AbortiveDrawReason): string {
  switch (reason) {
    case "kyuushuKyuuhai":
      return "途中流局: 九種九牌";
    case "suufonRenda":
      return "途中流局: 四風連打";
    case "suuchaRiichi":
      return "途中流局: 四家立直";
    case "suukanSanra":
      return "途中流局: 四槓散了";
    case "sanchaHou":
      return "途中流局: 三家和";
  }
}

// ── Dora helpers ────────────────────────────────────────────────────

/** 現在のstateからドラパラメータを抽出 */
export const doraParams = (state: GameState) => ({
  doraIndicators: getDoraIndicators(state.deadWall.tiles, state.deadWall.doraCount),
  uraDoraIndicators: getUraDoraIndicators(state.deadWall.tiles, state.deadWall.doraCount),
});

export function revealKanDora(deadWall: DeadWallState): DeadWallState {
  return {
    ...deadWall,
    doraCount: Math.min(deadWall.doraCount + 1, 5, deadWall.tiles.length),
  };
}

// ── Kan helpers ─────────────────────────────────────────────────────

export function totalKanCount(players: readonly PlayerData[]): number {
  return players.reduce((sum, player) => sum + kanCount(player), 0);
}

function playersWithKan(players: readonly PlayerData[]): number {
  return players.filter((player) => kanCount(player) > 0).length;
}

export function nextPendingAbortiveDrawAfterKan(
  players: readonly PlayerData[],
): AbortiveDrawReason | null {
  return totalKanCount(players) >= 4 && playersWithKan(players) > 1 ? "suukanSanra" : null;
}

// ── Suufon Renda ────────────────────────────────────────────────────

export function isSuufonRenda(
  players: readonly [PlayerData, PlayerData, PlayerData, PlayerData],
  firstTurnInterrupted: boolean,
): boolean {
  if (firstTurnInterrupted || players.some((player) => player.discards.length !== 1)) return false;
  const firstDiscards = players.map((player) => player.discards[0]!.tile);
  const first = firstDiscards[0]!;
  return first.suit === Suit.Wind && firstDiscards.every((tile) => isSameTileKind(tile, first));
}

// ── Ranking ─────────────────────────────────────────────────────────

export function rankPlayers(
  players: readonly [PlayerData, PlayerData, PlayerData, PlayerData],
): number[] {
  return [0, 1, 2, 3].sort((a, b) => {
    const pointDiff = players[b].points - players[a].points;
    return pointDiff !== 0 ? pointDiff : a - b;
  });
}

// ── Claim sorting ───────────────────────────────────────────────────

export function sortClaimsByPriority(
  options: readonly ClaimOption[],
  discarder: number,
): readonly ClaimOption[] {
  return [...options].sort((a, b) => {
    // Ron > pon/kan > chi
    if (a.type === "ron" && b.type !== "ron") return -1;
    if (a.type !== "ron" && b.type === "ron") return 1;
    // Pon/kan > chi (even across different players)
    const aStrong = a.type === "pon" || a.type === "daiminkan";
    const bStrong = b.type === "pon" || b.type === "daiminkan";
    if (aStrong && !bStrong) return -1;
    if (!aStrong && bStrong) return 1;
    // Within same type group: turn order (closer to discarder first)
    const turnOrder = [1, 2, 3];
    const aOrder = turnOrder.indexOf((a.player - discarder + 4) % 4);
    const bOrder = turnOrder.indexOf((b.player - discarder + 4) % 4);
    return aOrder - bOrder;
  });
}

// ── Ron score / payments ────────────────────────────────────────────

export function ronScore(state: GameState, winner: number): ScoreResult | null {
  if (!state.lastDiscard) return null;
  const winTile = state.lastDiscard.tile;
  if (!isCompleteHand(state.players[winner].hand, state.players[winner].melds, winTile)) {
    return null;
  }
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
  });
}

export function ronClaimPlayers(state: GameState): number[] {
  return sortClaimsByPriority(
    state.claimOptions.filter((claim) => claim.type === "ron"),
    state.lastDiscard?.player ?? 0,
  ).map((claim) => claim.player);
}

export function applyRonPayment(
  players: readonly [PlayerData, PlayerData, PlayerData, PlayerData],
  winner: number,
  discarder: number,
  score: ScoreResult,
  riichiSticks: number,
): [PlayerData, PlayerData, PlayerData, PlayerData] {
  const loserPays = score.score - riichiSticks * 1000;
  const afterLoser = updatePlayerInTuple(
    players,
    discarder,
    updPlayer(players[discarder], {
      points: players[discarder].points - loserPays,
    }),
  );
  return updatePlayerInTuple(
    afterLoser,
    winner,
    updPlayer(afterLoser[winner], {
      points: afterLoser[winner].points + score.score,
    }),
  );
}

export function applyDoubleRonPayments(
  players: readonly [PlayerData, PlayerData, PlayerData, PlayerData],
  winners: readonly [number, number],
  discarder: number,
  scores: readonly [ScoreResult, ScoreResult],
  riichiReceiver: number,
  riichiSticks: number,
): [PlayerData, PlayerData, PlayerData, PlayerData] {
  let updated = players as [PlayerData, PlayerData, PlayerData, PlayerData];
  let loserPays = 0;
  for (let i = 0; i < winners.length; i++) {
    const winner = winners[i]!;
    const score = scores[i]!;
    const receivesRiichi = winner === riichiReceiver;
    const ronPayment = score.score - riichiSticks * 1000;
    const winnerGain = receivesRiichi ? score.score : ronPayment;
    loserPays += ronPayment;
    updated = updatePlayerInTuple(
      updated,
      winner,
      updPlayer(updated[winner], {
        points: updated[winner].points + winnerGain,
      }),
    );
  }
  return updatePlayerInTuple(
    updated,
    discarder,
    updPlayer(updated[discarder], {
      points: updated[discarder].points - loserPays,
    }),
  );
}

// ── Tsumo payment ───────────────────────────────────────────────────

export function applyTsumoPayment(
  players: readonly [PlayerData, PlayerData, PlayerData, PlayerData],
  winner: number,
  score: ScoreResult,
): [PlayerData, PlayerData, PlayerData, PlayerData] {
  return players.map((player, i) => {
    if (i === winner) return updPlayer(player, { points: player.points + score.score });
    const payment = score.payment.from.find((f) => f.player === i);
    return updPlayer(player, { points: player.points - (payment?.amount ?? 0) });
  }) as unknown as [PlayerData, PlayerData, PlayerData, PlayerData];
}

// ── Nagashi mangan payments ─────────────────────────────────────────

function applyNagashiManganPayments(
  state: GameState,
  winners: readonly number[],
): {
  players: [PlayerData, PlayerData, PlayerData, PlayerData];
  scores: ScoreResult[];
} {
  let players = state.players as [PlayerData, PlayerData, PlayerData, PlayerData];
  const scores: ScoreResult[] = [];
  for (const winner of winners) {
    const score = nagashiManganScore(winner, state.dealer, 0, state.honba);
    scores.push(score);
    players = applyTsumoPayment(players, winner, score);
  }
  if (state.riichiSticks > 0 && winners.length > 0) {
    const receiver = winners[0]!;
    players = updatePlayerInTuple(
      players,
      receiver,
      updPlayer(players[receiver], {
        points: players[receiver].points + state.riichiSticks * 1000,
      }),
    );
  }
  return { players, scores };
}
export { applyNagashiManganPayments };

function nagashiManganWinners(state: GameState): number[] {
  const winners: number[] = [];
  for (let i = 0; i < 4; i++) {
    const player = state.players[i]!;
    if (player.discards.length === 0) continue;
    const calledKinds = new Set(state.calledDiscardKinds[i] ?? []);
    if (
      player.discards.every((d) => isYaochu(d.tile)) &&
      player.discards.every((d) => !calledKinds.has(tileKindKey(d.tile)))
    ) {
      winners.push(i);
    }
  }
  return winners;
}
export { nagashiManganWinners };

// ── Exhaustive draw ──────────────────────────────────────────────────

/** 流局時の聴牌確認と点棒移動 */
export function handleExhaustiveDraw(state: GameState): GameState {
  const nagashiWinners = nagashiManganWinners(state);
  if (nagashiWinners.length > 0) {
    const { players, scores } = applyNagashiManganPayments(state, nagashiWinners);
    const names = nagashiWinners
      .map((winner) => (winner === 0 ? "\u3042\u306A\u305F" : `プレイヤー${winner + 1}`))
      .join("\u30FB");
    return finishRound(
      state,
      players,
      nagashiWinners[0]!,
      false,
      nagashiWinners.includes(state.dealer),
      scores[0]!,
      `${names}が流し満貫!`,
    );
  }
  const tenpaiList: number[] = [];
  const notenList: number[] = [];
  for (let i = 0; i < 4; i++) {
    const p = state.players[i];
    const allTiles = [...p.hand];
    for (const meld of p.melds) {
      allTiles.push(...meld.tiles);
    }
    if (findWaits(p.hand, p.melds).length > 0) {
      tenpaiList.push(i);
    } else {
      notenList.push(i);
    }
  }
  const newPlayers = [...state.players] as unknown as [
    PlayerData,
    PlayerData,
    PlayerData,
    PlayerData,
  ];
  if (tenpaiList.length > 0 && notenList.length > 0) {
    const notenPays = 3000 / notenList.length;
    const tenpaiGets = 3000 / tenpaiList.length;
    for (const n of notenList) {
      newPlayers[n] = updPlayer(newPlayers[n], {
        points: newPlayers[n].points - notenPays,
      });
    }
    for (const t of tenpaiList) {
      newPlayers[t] = updPlayer(newPlayers[t], {
        points: newPlayers[t].points + tenpaiGets,
      });
    }
  }
  const tenpaiStr = tenpaiList
    .map((i) => `${i === 0 ? "\u3042\u306A\u305F" : `P${i + 1}`}`)
    .join("\u30FB");
  const notenStr = notenList
    .map((i) => `${i === 0 ? "\u3042\u306A\u305F" : `P${i + 1}`}`)
    .join("\u30FB");
  const detail =
    tenpaiList.length > 0
      ? `聴牌: ${tenpaiStr}  不聴: ${notenStr || "\u306A\u3057"}`
      : "\u5168\u54E1\u4E0D\u8074";
  return finishRound(
    state,
    newPlayers,
    null,
    true,
    tenpaiList.includes(state.dealer),
    null,
    `流局: ${detail}`,
  );
}

// ── Finish round ─────────────────────────────────────────────────────

export function finishRound(
  state: GameState,
  players: readonly [PlayerData, PlayerData, PlayerData, PlayerData],
  winner: number | null,
  isDraw: boolean,
  dealerContinues: boolean,
  score: ScoreResult | null,
  message: string,
): GameState {
  const nextDealer = dealerContinues ? state.dealer : (state.dealer + 1) % 4;
  const nextRoundNumber = dealerContinues ? state.roundNumber : state.roundNumber + 1;
  const nextHonba = dealerContinues || isDraw ? state.honba + 1 : 0;
  const nextRiichiSticks = winner === null ? state.riichiSticks : 0;
  const finalRanking = rankPlayers(players);
  const finalDealerTop =
    dealerContinues && state.roundNumber >= 4 && finalRanking[0] === state.dealer;
  const isTobi = players.some((p) => p.points < 0);
  const matchEnded = isTobi || (state.roundNumber >= 4 && (!dealerContinues || finalDealerTop));
  return {
    ...state,
    players,
    dealer: nextDealer,
    roundNumber: nextRoundNumber,
    honba: nextHonba,
    riichiSticks: nextRiichiSticks,
    winner,
    phase: matchEnded ? "ended" : "roundEnded",
    claimOptions: [],
    lastScoreResult: score,
    finalRanking: matchEnded ? finalRanking : null,
    pendingRinshan: false,
    lastDrawWasRinshan: false,
    lastDiscardWasChankan: false,
    kuikaeProhibitedTiles: [],
    firstTurnInterrupted: false,
    pendingAbortiveDraw: null,
    calledDiscardKinds: emptyCalledDiscardKinds(),
    message,
    roundHistory: [
      ...state.roundHistory,
      {
        roundName: `${["東", "南", "西", "北"][state.roundWind]}${state.roundNumber}局 ${state.honba}本場`,
        resultText: score
          ? `和了: ${score.yakuman > 0 ? (score.yakuman === 1 ? "役満" : "ダブル役満") : score.limit && score.limit !== "none" ? { mangan: "満貫", haneman: "跳満", baiman: "倍満", sanbaiman: "三倍満", yakuman: "役満" }[score.limit] : `${score.han}飜${score.fu}符`}`
          : (message.split("!")[0] ?? message), // e.g. "流局", "途中流局: 九種九牌"
        pointChanges: players.map((p, i) => p.points - state.players[i].points),
      },
    ],
  };
}

export function finishAbortiveDraw(state: GameState, reason: AbortiveDrawReason): GameState {
  return finishRound(state, state.players, null, true, false, null, abortiveDrawMessage(reason));
}

// ── Complete hand check ─────────────────────────────────────────────

export function closedTilesForTsumo(hand: readonly Tile[], winTile: Tile): readonly Tile[] {
  return removeOneTile(hand, winTile);
}

export function isCompleteHand(
  closedTiles: readonly Tile[],
  melds: readonly Meld[],
  winTile: Tile,
): boolean {
  const allClosedTiles = [...closedTiles, winTile];
  if (melds.length === 0) {
    return isWinningHand(tilesToCounts(allClosedTiles));
  }
  return decomposeStandardHand(allClosedTiles, melds) !== null;
}

export function canScoreTsumo(state: GameState, player: number, winTile: Tile): boolean {
  const playerData = state.players[player];
  const closedTiles = closedTilesForTsumo(playerData.hand, winTile);
  if (!isCompleteHand(closedTiles, playerData.melds, winTile)) return false;
  return (
    fullScore({
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
    }) !== null
  );
}
