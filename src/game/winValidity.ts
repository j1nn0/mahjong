import { type Tile, type Meld } from "./types.js";
import { removeOneTile } from "./tiles.js";
import { isWinningHand, tilesToCounts, findTenpaiTiles, indexToTile } from "./agari.js";
import { decomposeStandardHand } from "./yaku.js";

// ── Win-validity check (あがり判定) ───────────────────────────────

/** ツモ和了のための手牌から和了牌を除いた牌列を返す */
export function closedTilesForTsumo(hand: readonly Tile[], winTile: Tile): readonly Tile[] {
  return removeOneTile(hand, winTile);
}

/** 手牌・面子・和了牌からあがり形の成立を判定する（門前は七対子・国士無双も含む） */
export function isCompleteHand(
  closedTiles: readonly Tile[],
  melds: readonly Meld[],
  winTile: Tile,
  isTsumo = true,
): boolean {
  const allClosedTiles = [...closedTiles, winTile];
  if (melds.length === 0) {
    return isWinningHand(tilesToCounts(allClosedTiles));
  }
  return decomposeStandardHand(allClosedTiles, melds, winTile, isTsumo) !== null;
}

/** 待ち牌の配列を返す (既存の面子を固定して計算) */
export function findWaits(closedTiles: readonly Tile[], melds: readonly Meld[] = []): number[] {
  if (melds.length === 0) {
    return findTenpaiTiles(closedTiles);
  }
  const waits: number[] = [];
  for (let i = 0; i < 34; i++) {
    const tile = indexToTile(i);
    if (isCompleteHand(closedTiles, melds, tile)) {
      waits.push(i);
    }
  }
  return waits;
}
