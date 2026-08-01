import { type Discard, Wind } from "../game/types.js";
import { buildWall, drawFromWall, sortHand, removeOneTile } from "../game/tiles.js";
import { fullScore } from "../game/scoring.js";
import { isCompleteHand } from "../game/winValidity.js";
import { doraParams } from "./winScoring.js";
import { applyTsumoPayment, finishRound } from "./finishRound.js";
import { makePlayer, updPlayer, emptyCalledDiscardKinds } from "./players.js";
import type { PlayerData, GameState } from "./types.js";

// ── Deal round ──────────────────────────────────────────────────────

function playerWind(player: number, dealer: number): Wind {
  return ((player - dealer + 4) % 4) as Wind;
}

export function dealRound(
  state: GameState,
  dealer: number,
  roundNumber: number,
  honba: number,
  riichiSticks: number,
  message: string,
  random?: () => number,
): GameState {
  const wallData = buildWall(random);
  const players = state.players.map((player, i) => ({
    hand: [],
    melds: [],
    discards: [] as Discard[],
    riichi: false,
    doubleRiichi: false,
    ippatsu: false,
    temporaryFuriten: false,
    riichiFuriten: false,
    points: player.points,
    personality: i === 0 ? null : (player.personality ?? null),
    wind: playerWind(i, dealer),
  })) as unknown as [PlayerData, PlayerData, PlayerData, PlayerData];
  const { drawn: dealerHand, remaining: afterDealer } = drawFromWall(wallData.wall, 14);
  let wallRemaining = afterDealer;
  players[dealer] = updPlayer(players[dealer], { hand: sortHand([...dealerHand]) });
  for (let offset = 1; offset < 4; offset++) {
    const player = (dealer + offset) % 4;
    const { drawn, remaining } = drawFromWall(wallRemaining, 13);
    players[player] = updPlayer(players[player], { hand: sortHand([...drawn]) });
    wallRemaining = remaining;
  }
  const initialState: GameState = {
    ...state,
    players,
    wall: wallRemaining,
    deadWall: { tiles: wallData.deadWall, doraCount: 1 },
    roundWind: state.roundWind ?? Wind.Ton,
    roundNumber,
    dealer,
    startingDealer: state.startingDealer ?? dealer,
    honba,
    riichiSticks,
    currentPlayer: dealer,
    lastDiscard: null,
    winner: null,
    lastScoreResult: null,
    lastDrawnTile: null,
    finalRanking: null,
    phase: "playing",
    claimOptions: [],
    message,
    pendingRinshan: false,
    lastDrawWasRinshan: false,
    lastDiscardWasChankan: false,
    kuikaeProhibitedTiles: [],
    firstTurnInterrupted: false,
    pendingAbortiveDraw: null,
    calledDiscardKinds: emptyCalledDiscardKinds(),
  };

  // Auto-detect Tenhou
  const winTile = dealerHand[13]!;
  const closedTiles = removeOneTile(dealerHand, winTile);
  if (isCompleteHand(closedTiles, [], winTile)) {
    const score = fullScore({
      closedTiles,
      melds: [],
      winTile,
      isTsumo: true,
      roundWind: Wind.Ton,
      playerSeat: dealer,
      dealer: dealer,
      isRiichi: false,
      riichiSticks: riichiSticks,
      honba: honba,
      ...doraParams(initialState),
      isDoubleRiichi: false,
      isIppatsu: false,
      isHaitei: false,
      isHoutei: false,
      isRinshan: false,
      isChankan: false,
      isTenhou: true,
      isChiihou: false,
    });
    if (score) {
      const nextPlayers = applyTsumoPayment(players, dealer, score);
      return finishRound(initialState, nextPlayers, {
        winner: dealer,
        isDraw: false,
        dealerContinues: true,
        score,
        message: "天和！",
      });
    }
  }

  return initialState;
}

// ── Initial state ──────────────────────────────────────────────────

export function createInitialState(random?: (() => number) | null): GameState {
  const rng = random ?? Math.random;
  const dealer = Math.floor(rng() * 4);
  return {
    players: [
      makePlayer(playerWind(0, dealer), 25000),
      makePlayer(playerWind(1, dealer), 25000),
      makePlayer(playerWind(2, dealer), 25000),
      makePlayer(playerWind(3, dealer), 25000),
    ] as unknown as [PlayerData, PlayerData, PlayerData, PlayerData],
    wall: [],
    deadWall: { tiles: [], doraCount: 0 },
    roundWind: 0,
    roundNumber: 1,
    dealer,
    startingDealer: dealer,
    honba: 0,
    riichiSticks: 0,
    currentPlayer: dealer,
    lastDiscard: null,
    winner: null,
    lastScoreResult: null,
    lastDrawnTile: null,
    finalRanking: null,
    phase: "playing",
    claimOptions: [],
    message: "",
    pendingRinshan: false,
    lastDrawWasRinshan: false,
    lastDiscardWasChankan: false,
    kuikaeProhibitedTiles: [],
    firstTurnInterrupted: false,
    pendingAbortiveDraw: null,
    calledDiscardKinds: emptyCalledDiscardKinds(),
    pendingKanDora: false,
    roundHistory: [],
  };
}
