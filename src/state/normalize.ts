import { type Tile, type Meld, type Discard, type Wind, PlayerWind, type AiPersonality } from "../game/types.js";
import type { ScoreResult } from "../game/scoring.js";
import { createInitialState } from "./roundSetup.js";
import type { PlayerData, GameState, ClaimOption, RoundHistoryItem } from "./types.js";

// ── Normalization (save-file restore) ───────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizePlayer(value: unknown, fallback: PlayerData): PlayerData {
  if (!isRecord(value)) return fallback;
  return {
    hand: Array.isArray(value.hand) ? (value.hand as Tile[]) : fallback.hand,
    melds: Array.isArray(value.melds) ? (value.melds as Meld[]) : fallback.melds,
    discards: Array.isArray(value.discards)
      ? (value.discards as unknown[]).map((d): Discard => {
          if (d && typeof d === "object" && "tile" in d) {
            return d as Discard;
          }
          return { tile: d as Tile, isRiichi: false, player: 0 as PlayerWind };
        })
      : fallback.discards,
    riichi: typeof value.riichi === "boolean" ? value.riichi : fallback.riichi,
    doubleRiichi:
      typeof value.doubleRiichi === "boolean" ? value.doubleRiichi : fallback.doubleRiichi,
    ippatsu: typeof value.ippatsu === "boolean" ? value.ippatsu : fallback.ippatsu,
    temporaryFuriten:
      typeof value.temporaryFuriten === "boolean"
        ? value.temporaryFuriten
        : fallback.temporaryFuriten,
    riichiFuriten:
      typeof value.riichiFuriten === "boolean" ? value.riichiFuriten : fallback.riichiFuriten,
    points: typeof value.points === "number" ? value.points : fallback.points,
    personality:
      value.personality && typeof value.personality === "object"
        ? (value.personality as AiPersonality)
        : null,
    wind: typeof value.wind === "number" ? (value.wind as Wind) : fallback.wind,
  };
}

export function normalizeGameState(value: unknown): GameState {
  const base = createInitialState(() => 0);
  if (!isRecord(value)) return base;
  const rawPlayers = value.players;
  const players =
    Array.isArray(rawPlayers) && rawPlayers.length === 4
      ? ([0, 1, 2, 3].map((i) => normalizePlayer(rawPlayers[i], base.players[i])) as unknown as [
          PlayerData,
          PlayerData,
          PlayerData,
          PlayerData,
        ])
      : base.players;
  const rawDeadWall = isRecord(value.deadWall) ? value.deadWall : null;
  return {
    ...base,
    ...value,
    players,
    wall: Array.isArray(value.wall) ? (value.wall as Tile[]) : base.wall,
    deadWall: {
      tiles:
        rawDeadWall && Array.isArray(rawDeadWall.tiles)
          ? (rawDeadWall.tiles as Tile[])
          : base.deadWall.tiles,
      doraCount:
        rawDeadWall && typeof rawDeadWall.doraCount === "number"
          ? rawDeadWall.doraCount
          : base.deadWall.doraCount,
    },
    roundHistory: Array.isArray(value.roundHistory)
      ? (value.roundHistory as RoundHistoryItem[])
      : base.roundHistory,
    roundWind: typeof value.roundWind === "number" ? value.roundWind : base.roundWind,
    roundNumber: typeof value.roundNumber === "number" ? value.roundNumber : base.roundNumber,
    dealer: typeof value.dealer === "number" ? value.dealer : base.dealer,
    startingDealer: typeof value.startingDealer === "number" ? value.startingDealer : base.startingDealer,
    honba: typeof value.honba === "number" ? value.honba : base.honba,
    riichiSticks: typeof value.riichiSticks === "number" ? value.riichiSticks : base.riichiSticks,
    currentPlayer:
      typeof value.currentPlayer === "number" ? value.currentPlayer : base.currentPlayer,
    lastDiscard: isRecord(value.lastDiscard)
      ? (value.lastDiscard as GameState["lastDiscard"])
      : null,
    winner: typeof value.winner === "number" ? value.winner : null,
    phase:
      value.phase === "playing" ||
      value.phase === "claiming" ||
      value.phase === "roundEnded" ||
      value.phase === "ended"
        ? value.phase
        : base.phase,
    claimOptions: Array.isArray(value.claimOptions)
      ? (value.claimOptions as ClaimOption[])
      : base.claimOptions,
    lastDrawnTile: isRecord(value.lastDrawnTile) ? (value.lastDrawnTile as Tile) : null,
    lastScoreResult: isRecord(value.lastScoreResult)
      ? (value.lastScoreResult as unknown as ScoreResult)
      : null,
    finalRanking: Array.isArray(value.finalRanking) ? (value.finalRanking as number[]) : null,
    message: typeof value.message === "string" ? value.message : base.message,
    pendingRinshan:
      typeof value.pendingRinshan === "boolean" ? value.pendingRinshan : base.pendingRinshan,
    lastDrawWasRinshan:
      typeof value.lastDrawWasRinshan === "boolean"
        ? value.lastDrawWasRinshan
        : base.lastDrawWasRinshan,
    lastDiscardWasChankan:
      typeof value.lastDiscardWasChankan === "boolean"
        ? value.lastDiscardWasChankan
        : base.lastDiscardWasChankan,
    kuikaeProhibitedTiles: Array.isArray(value.kuikaeProhibitedTiles)
      ? (value.kuikaeProhibitedTiles as Tile[])
      : base.kuikaeProhibitedTiles,
    firstTurnInterrupted:
      typeof value.firstTurnInterrupted === "boolean"
        ? value.firstTurnInterrupted
        : base.firstTurnInterrupted,
    pendingAbortiveDraw:
      value.pendingAbortiveDraw === "kyuushuKyuuhai" ||
      value.pendingAbortiveDraw === "suufonRenda" ||
      value.pendingAbortiveDraw === "suuchaRiichi" ||
      value.pendingAbortiveDraw === "suukanSanra" ||
      value.pendingAbortiveDraw === "sanchaHou"
        ? value.pendingAbortiveDraw
        : base.pendingAbortiveDraw,
    calledDiscardKinds: Array.isArray(value.calledDiscardKinds)
      ? (value.calledDiscardKinds as string[][])
      : base.calledDiscardKinds,
    pendingKanDora:
      typeof value.pendingKanDora === "boolean" ? value.pendingKanDora : base.pendingKanDora,
  };
}
