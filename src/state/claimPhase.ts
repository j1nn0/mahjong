import { type Tile, type Meld, MeldType, Suit } from "../game/types.js";
import { formatTile, sortHand, isSameTile, isSameTileKind, isYaochu, tileKindKey } from "../game/tiles.js";
import { tileToIndex } from "../game/agari.js";
import type { PlayerData, GameState, ClaimOption, MeldClaimOption } from "./types.js";
import { updPlayer, turnTileCount, expectedAfterDraw } from "./players.js";
import { isCompleteHand, findWaits } from "../game/winValidity.js";

// ── Declaration rules ────────────────────────────────────────────────

/** 九種九牌を宣言できるか */
export function canDeclareKyuushuKyuuhai(state: GameState, player: number): boolean {
  if (state.phase !== "playing" || state.currentPlayer !== player || state.firstTurnInterrupted)
    return false;
  const playerData = state.players[player];
  if (playerData.discards.length > 0 || turnTileCount(playerData) !== expectedAfterDraw(playerData))
    return false;
  const yaochuKinds = new Set(playerData.hand.filter(isYaochu).map(tileKindKey));
  return yaochuKinds.size >= 9;
}

/** リーチを宣言できるか（門前かつ暗槓のみ） */
export function canDeclareRiichi(player: PlayerData): boolean {
  return !player.riichi && player.melds.every((meld) => meld.type === MeldType.ClosedKan);
}

// ── Claim sorting ───────────────────────────────────────────────────

/** 要求を優先度順に並べる（ロン > ポン/カン > チー、同種は捨て主に近い順） */
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

// ── Type guard ─────────────────────────────────────────────────────

export function isMeldClaimOption(
  option: ClaimOption,
  type: MeldClaimOption["type"],
  player: number,
): option is MeldClaimOption {
  return option.type === type && option.player === player;
}

// ── Kuikae (change) prohibition ───────────────────────────────────

export function isKuikaeProhibited(state: GameState, player: number, tile: Tile): boolean {
  return (
    state.currentPlayer === player &&
    state.kuikaeProhibitedTiles.some((prohibited) => isSameTileKind(prohibited, tile))
  );
}

export function kuikaeMessage(tile: Tile): string {
  return `食い替え禁止: ${formatTile(tile)} は切れません`;
}

export function chiKuikaeProhibitedTiles(option: MeldClaimOption): readonly Tile[] {
  const called = option.calledTile;
  if (called.suit === Suit.Wind || called.suit === Suit.Dragon) return [called];
  const prohibited: Tile[] = [called];
  for (const offset of [-3, 3]) {
    const value = (called.value as number) + offset;
    if (value >= 1 && value <= 9) {
      prohibited.push({ suit: called.suit, value: value as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 });
    }
  }
  return prohibited;
}

// ── Chi options ─────────────────────────────────────────────────────

export function findChiOptions(
  discarded: Tile,
  hand: readonly Tile[],
  playerNum: number,
  discarder: number,
): readonly ClaimOption[] {
  if (discarded.suit === Suit.Wind || discarded.suit === Suit.Dragon) return [];
  const value = discarded.value as number;
  const suit = discarded.suit;
  const options: ClaimOption[] = [];
  for (let start = Math.max(1, value - 2); start <= Math.min(7, value); start++) {
    const neededVals = [start, start + 1, start + 2].filter((v) => v !== value);
    const fromHand: Tile[] = [];
    const remaining = [...hand];
    for (const nv of neededVals) {
      const idx = remaining.findIndex((t) => t.suit === suit && t.value === nv);
      if (idx === -1) break;
      fromHand.push(remaining[idx]!);
      remaining.splice(idx, 1);
    }
    if (fromHand.length === 2) {
      const meldTiles = [...fromHand, discarded];
      const meld: Meld = {
        type: MeldType.Chi,
        tiles: sortHand([...meldTiles]),
        calledTile: discarded,
        calledFrom: discarder,
      };
      options.push({
        type: "chi",
        player: playerNum,
        tiles: meldTiles,
        calledTile: discarded,
        meld,
        display: `チー ${meldTiles.map((t) => formatTile(t)).join("")}`,
      });
    }
  }
  return options;
}

export function canPonTile(discarded: Tile, hand: readonly Tile[]): boolean {
  return hand.filter((t) => isSameTile(t, discarded)).length >= 2;
}

export function canDaiminkanTile(discarded: Tile, hand: readonly Tile[]): boolean {
  return hand.filter((t) => isSameTile(t, discarded)).length >= 3;
}

// ── Collect claims ──────────────────────────────────────────────────

/** 自捨て牌によるフリテンか（テンパイ時のみ） */
export function isFuritenFromOwnDiscards(player: PlayerData): boolean {
  if (player.temporaryFuriten || player.riichiFuriten) return true;
  const waits = new Set(findWaits(player.hand, player.melds));
  if (waits.size === 0) return false;
  return player.discards.some((d) => waits.has(tileToIndex(d.tile)));
}

export function collectClaims(
  discarded: Tile,
  discarder: number,
  players: readonly [PlayerData, PlayerData, PlayerData, PlayerData],
): readonly ClaimOption[] {
  const options: ClaimOption[] = [];
  for (let i = 0; i < 4; i++) {
    if (i === discarder) continue;
    const hand = players[i].hand;
    if (
      !isFuritenFromOwnDiscards(players[i]) &&
      isCompleteHand(players[i].hand, players[i].melds, discarded)
    ) {
      options.push({
        type: "ron",
        player: i,
        tiles: [discarded],
        calledTile: discarded,
        display: `ロン ${formatTile(discarded)}`,
      });
    }
    if (players[i].riichi) continue;
    if (canPonTile(discarded, hand)) {
      const pair = hand.filter((t) => isSameTile(t, discarded)).slice(0, 2);
      const meldTiles = [...pair, discarded];
      const meld: Meld = { type: MeldType.Poon, tiles: meldTiles, calledTile: discarded, calledFrom: discarder };
      options.push({
        type: "pon",
        player: i,
        tiles: meldTiles,
        calledTile: discarded,
        meld,
        display: `ポン ${formatTile(discarded)}`,
      });
    }
    if (canDaiminkanTile(discarded, hand)) {
      const triple = hand.filter((t) => isSameTile(t, discarded)).slice(0, 3);
      const meldTiles = [...triple, discarded];
      const meld: Meld = { type: MeldType.Kan, tiles: meldTiles, calledTile: discarded, calledFrom: discarder };
      options.push({
        type: "daiminkan",
        player: i,
        tiles: meldTiles,
        calledTile: discarded,
        meld,
        display: `カン ${formatTile(discarded)}`,
      });
    }
    if (i === (discarder + 1) % 4) {
      options.push(...findChiOptions(discarded, hand, i, discarder));
    }
  }
  return options;
}


// ── Responsibility detection (責任払い) ───────────────────────────

export type ResponsibilityType = 'daisangen' | 'daisuushii';

/** ポン/大明カン時に責任払いが成立するか判定し、成立する場合は責任種別を返す */
export function detectResponsibility(
  playerMelds: readonly Meld[],
  newMeld: Meld,
  calledTile: Tile,
): ResponsibilityType | null {
  // 暗槓は対象外
  if (newMeld.type === MeldType.ClosedKan) return null;

  const suit = calledTile.suit;
  const value = calledTile.value as number;

  // 大三元チェック: 三元牌のポン/大明カン
  if (suit === Suit.Dragon) {
    const openDragonMelds = playerMelds.filter(
      (m) => m.type !== MeldType.ClosedKan &&
        m.tiles[0]!.suit === Suit.Dragon,
    );
    const existingTypes = new Set(openDragonMelds.map((m) => m.tiles[0]!.value));
    // 既存で2種類カバーしていて、今回が3種類目
    if (existingTypes.size >= 2 && !existingTypes.has(value)) {
      const allTypes = new Set([...existingTypes, value]);
      if (allTypes.size >= 3) return 'daisangen';
    }
  }

  // 大四喜チェック: 風牌のポン/大明カン
  if (suit === Suit.Wind) {
    const openWindMelds = playerMelds.filter(
      (m) => m.type !== MeldType.ClosedKan &&
        m.tiles[0]!.suit === Suit.Wind,
    );
    const existingTypes = new Set(openWindMelds.map((m) => m.tiles[0]!.value));
    // 既存で3種類カバーしていて、今回が4種類目
    if (existingTypes.size >= 3 && !existingTypes.has(value)) {
      const allTypes = new Set([...existingTypes, value]);
      if (allTypes.size >= 4) return 'daisuushii';
    }
  }

  return null;
}

// ── Clear temporary furiten and ippatsu ────────────────────────────

export function clearTemporaryFuritenAndIppatsu(
  players: readonly [PlayerData, PlayerData, PlayerData, PlayerData],
): [PlayerData, PlayerData, PlayerData, PlayerData] {
  return players.map((player) => {
    const update: Partial<PlayerData> = {};
    if (player.ippatsu) update.ippatsu = false;
    if (player.temporaryFuriten) update.temporaryFuriten = false;
    return Object.keys(update).length > 0 ? updPlayer(player, update) : player;
  }) as unknown as [PlayerData, PlayerData, PlayerData, PlayerData];
}
