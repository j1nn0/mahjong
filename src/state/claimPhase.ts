import { type Tile, type Meld, MeldType, Suit } from "../game/types.js";
import { formatTile, sortHand } from "../game/tiles.js";
import type { PlayerData, GameState, ClaimOption, MeldClaimOption } from "./types.js";
import { isSameTile, isSameTileKind, isFuritenFromOwnDiscards, updPlayer } from "./GameState.js";
import { isCompleteHand } from "./finishRound.js";

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
      const meld: Meld = { type: MeldType.Poon, tiles: meldTiles, calledTile: discarded };
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
      const meld: Meld = { type: MeldType.Kan, tiles: meldTiles, calledTile: discarded };
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
      options.push(...findChiOptions(discarded, hand, i));
    }
  }
  return options;
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
