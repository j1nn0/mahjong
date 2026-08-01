import { MeldType, type Discard, type Wind, type AiPersonality } from "../game/types.js";
import type { PlayerData } from "./types.js";

// ── Player construction / updates ─────────────────────────────────

export function makePlayer(
  wind: number,
  points: number,
  personality: AiPersonality | null = null,
): PlayerData {
  return {
    hand: [],
    melds: [],
    discards: [] as Discard[],
    riichi: false,
    doubleRiichi: false,
    ippatsu: false,
    temporaryFuriten: false,
    riichiFuriten: false,
    points,
    personality,
    wind: wind as Wind,
  };
}

export function updPlayer(player: PlayerData, overrides: Partial<PlayerData>): PlayerData {
  return { ...player, ...overrides };
}

export function updatePlayerInTuple(
  players: readonly [PlayerData, PlayerData, PlayerData, PlayerData],
  index: number,
  updated: PlayerData,
): [PlayerData, PlayerData, PlayerData, PlayerData] {
  return [
    index === 0 ? updated : players[0],
    index === 1 ? updated : players[1],
    index === 2 ? updated : players[2],
    index === 3 ? updated : players[3],
  ];
}

// ── Player stats ──────────────────────────────────────────────────

/** プレイヤーのカン(明槓・暗槓・加槓)面子の数 */
export function kanCount(player: PlayerData): number {
  const kanTypes = [MeldType.Kan, MeldType.ClosedKan, MeldType.AddedKan];
  return player.melds.filter((m) => kanTypes.includes(m.type)).length;
}

/** 手牌 + 面子の合計枚数 */
export function turnTileCount(player: PlayerData): number {
  return player.hand.length + player.melds.reduce((sum, meld) => sum + meld.tiles.length, 0);
}

/** 空の「宣言された捨て牌種」リスト（フリテン・流し満貫判定用） */
export function emptyCalledDiscardKinds(): readonly (readonly string[])[] {
  return [[], [], [], []];
}

/** 打牌後の手牌枚数の期待値 */
export function expectedAfterDiscard(player: PlayerData): number {
  return 13 + kanCount(player);
}

/** ツモ後の手牌枚数の期待値 */
export function expectedAfterDraw(player: PlayerData): number {
  return expectedAfterDiscard(player) + 1;
}
