import { Suit, Wind } from "../game/types.js";
import { isSameTileKind, tileKindKey, isYaochu } from "../game/tiles.js";
import { findWaits } from "../game/winValidity.js";
import type { ScoreResult } from "../game/scoring.js";
import type {
  PlayerData,
  DeadWallState,
  GameState,
  AbortiveDrawReason,
} from "./types.js";
import { updPlayer, kanCount, emptyCalledDiscardKinds, updatePlayerInTuple } from "./players.js";

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
  startingDealer: number,
): number[] {
  return [0, 1, 2, 3].sort((a, b) => {
    const pointDiff = players[b].points - players[a].points;
    if (pointDiff !== 0) return pointDiff;
    const distA = (a - startingDealer + 4) % 4;
    const distB = (b - startingDealer + 4) % 4;
    return distA - distB;
  });
}

// ── Ron / tsumo payments ────────────────────────────────────────────

export function applyRonPayment(
  players: readonly [PlayerData, PlayerData, PlayerData, PlayerData],
  winner: number,
  score: ScoreResult,
): [PlayerData, PlayerData, PlayerData, PlayerData] {
  return players.map((player, i) => {
    if (i === winner) return updPlayer(player, { points: player.points + score.score });
    const payment = score.payment.from.find((entry) => entry.player === i);
    return updPlayer(player, { points: player.points - (payment?.amount ?? 0) });
  }) as unknown as [PlayerData, PlayerData, PlayerData, PlayerData];
}

export function applyDoubleRonPayments(
  players: readonly [PlayerData, PlayerData, PlayerData, PlayerData],
  winners: readonly [number, number],
  scores: readonly [ScoreResult, ScoreResult],
  riichiReceiver: number,
  riichiSticks: number,
): [PlayerData, PlayerData, PlayerData, PlayerData] {
  let updated = players as [PlayerData, PlayerData, PlayerData, PlayerData];
  for (let i = 0; i < winners.length; i++) {
    const winner = winners[i]!;
    const score = scores[i]!;
    const receivesRiichi = winner === riichiReceiver;
    const winnerGain = receivesRiichi ? score.score : score.score - riichiSticks * 1000;
    updated = updatePlayerInTuple(
      updated,
      winner,
      updPlayer(updated[winner], {
        points: updated[winner].points + winnerGain,
      }),
    );
    for (const payment of score.payment.from) {
      updated = updatePlayerInTuple(
        updated,
        payment.player,
        updPlayer(updated[payment.player], {
          points: updated[payment.player].points - payment.amount,
        }),
      );
    }
  }
  return updated;
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

// ── Exhaustive draw ──────────────────────────────────────────────────

/** 流局時の聴牌確認と点棒移動 */
export function handleExhaustiveDraw(state: GameState): GameState {
  const nagashiWinners = nagashiManganWinners(state);
  if (nagashiWinners.length > 0) {
    const { players, scores } = applyNagashiManganPayments(state, nagashiWinners);
    const names = nagashiWinners
      .map((winner) => (winner === 0 ? "\u3042\u306A\u305F" : `プレイヤー${winner + 1}`))
      .join("\u30FB");
    return finishRound(state, players, {
      winner: nagashiWinners[0]!,
      isDraw: false,
      dealerContinues: nagashiWinners.includes(state.dealer),
      score: scores[0]!,
      message: `${names}が流し満貫!`,
    });
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
  return finishRound(state, newPlayers, {
    winner: null,
    isDraw: true,
    dealerContinues: tenpaiList.includes(state.dealer),
    score: null,
    message: `流局: ${detail}`,
  });
}

// ── Finish round ─────────────────────────────────────────────────────

export interface FinishRoundOptions {
  winner: number | null;
  isDraw: boolean;
  dealerContinues: boolean;
  score: ScoreResult | null;
  message: string;
  responsibilityMessage?: string;
  isAbortiveDraw?: boolean;
}

/** 局を終了し、試合終了判定・供託回収・局進行・履歴を処理する */
export function finishRound(
  state: GameState,
  players: readonly [PlayerData, PlayerData, PlayerData, PlayerData],
  options: FinishRoundOptions,
): GameState {
  const {
    winner,
    isDraw,
    dealerContinues,
    score,
    message,
    responsibilityMessage,
    isAbortiveDraw,
  } = options;
  const startingDealer = state.startingDealer ?? 0;
  const tempRanking = rankPlayers(players, startingDealer);
  const topPlayer = tempRanking[0]!;
  const topPoints = players[topPlayer].points;

  const isTobi = players.some((p) => p.points < 0);
  const tobiSuffix = isTobi ? " (トビ終了)" : "";

  let matchEnded = false;
  if (isTobi) {
    matchEnded = true;
  } else if (!isAbortiveDraw) {
    if (state.roundWind === Wind.Ton) {
      if (state.roundNumber >= 4) {
        if (topPoints >= 30000) {
          if (!dealerContinues) {
            matchEnded = true;
          } else if (topPlayer === state.dealer) {
            matchEnded = true; // 親のあがりやめ・テンパイやめ
          }
        }
      }
    } else if (state.roundWind === Wind.Nan) {
      if (topPoints >= 30000) {
        matchEnded = true;
      } else if (state.roundNumber >= 4 && !dealerContinues) {
        matchEnded = true; // 南4局終了で強制打ち切り（親が流れた場合）
      }
    }
  }

  // 供託回収
  let finalPlayers = [...players] as unknown as [PlayerData, PlayerData, PlayerData, PlayerData];
  let finalRiichiSticks = winner === null ? state.riichiSticks : 0;
  if (matchEnded && finalRiichiSticks > 0) {
    const topP = finalPlayers[topPlayer]!;
    finalPlayers[topPlayer] = {
      ...topP,
      points: topP.points + finalRiichiSticks * 1000,
    };
    finalRiichiSticks = 0;
  }

  const finalRanking = rankPlayers(finalPlayers, startingDealer);

  // 局進行の計算
  let nextRoundWind = state.roundWind;
  let nextRoundNumber = state.roundNumber;
  let nextDealer = state.dealer;
  let nextHonba = state.honba;

  if (!matchEnded) {
    if (dealerContinues) {
      nextDealer = state.dealer;
      nextRoundNumber = state.roundNumber;
      nextHonba = state.honba + 1;
    } else {
      nextDealer = (state.dealer + 1) % 4;
      nextRoundNumber = state.roundNumber + 1;
      nextHonba = isDraw ? state.honba + 1 : 0;
      if (nextRoundNumber > 4) {
        nextRoundWind = state.roundWind + 1;
        nextRoundNumber = 1;
      }
    }
  }

  const yakuStr = score ? score.yaku.map((y) => y.name).join("・") : "";
  const resultText = score
    ? `和了: ${yakuStr} (${score.yakuman > 0 ? (score.yakuman === 1 ? "役満" : `ダブル役満×${score.yakuman}`) : score.limit && score.limit !== "none" ? { mangan: "満貫", haneman: "跳満", baiman: "倍満", sanbaiman: "三倍満", yakuman: "役満" }[score.limit] : `${score.han}飜${score.fu}符`})`
    : (message.split("!")[0] ?? message); // e.g. "流局", "途中流局: 九種九牌"
  const historyResultText = responsibilityMessage
    ? `${resultText} [${responsibilityMessage}]`
    : resultText;
  return {
    ...state,
    players: finalPlayers,
    dealer: nextDealer,
    roundWind: nextRoundWind,
    roundNumber: nextRoundNumber,
    honba: nextHonba,
    riichiSticks: finalRiichiSticks,
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
    message: responsibilityMessage
      ? `${message}${tobiSuffix} [${responsibilityMessage}]`
      : `${message}${tobiSuffix}`,
    roundHistory: [
      ...state.roundHistory,
      {
        roundName: `${roundName(state.roundNumber, state.roundWind)} ${state.honba}本場`,
        resultText: historyResultText,
        pointChanges: finalPlayers.map((p, i) => p.points - state.players[i].points),
        ...(responsibilityMessage ? { responsibilityMessage } : {}),
      },
    ],
  };
}

export function finishAbortiveDraw(state: GameState, reason: AbortiveDrawReason): GameState {
  return finishRound(state, state.players, {
    winner: null,
    isDraw: true,
    dealerContinues: true,
    score: null,
    message: abortiveDrawMessage(reason),
    isAbortiveDraw: true,
  });
}

// ── Responsibility info ────────────────────────────────────────────

/** 局名（例: 東1局） */
export function roundName(roundNumber: number, roundWind = Wind.Ton): string {
  const windStr = ["東", "南", "西", "北"][roundWind] ?? "東";
  return `${windStr}${roundNumber}局`;
}


/** 責任払いメッセージを生成（表示用） */
export function formatResponsibilityMessage(responsiblePlayer: number): string {
  return `責任払い: P${responsiblePlayer + 1}`;
}
