import {
  canDeclareKyuushuKyuuhai,
  findWaits,
  removeOneTile,
  tileKindKey,
  turnTileCount,
} from "./GameState.js";
import type { GameState } from "./GameState.js";
import type { Tile } from "../game/types.js";
import { MeldType, type Meld } from "../game/types.js";
import { indexToTile } from "../game/agari.js";

export function getHumanHand(state: GameState): readonly Tile[] {
  return state.players[0].hand;
}

export function canHumanTsumo(state: GameState): boolean {
  return (
    state.phase === "playing" && state.currentPlayer === 0 && turnTileCount(state.players[0]) === 14
  );
}

export function canHumanRiichi(state: GameState): boolean {
  if (state.phase !== "playing" || state.currentPlayer !== 0) return false;
  const p = state.players[0];
  return !p.riichi && p.points >= 1000;
}

export function canHumanAnkan(state: GameState, selectedIndex: number): boolean {
  if (state.phase !== "playing" || state.currentPlayer !== 0) return false;
  const p = state.players[0];
  const tile = p.hand[selectedIndex];
  if (!tile) return false;
  const count = p.hand.filter((t) => tileKindKey(t) === tileKindKey(tile)).length;
  if (count < 4) return false;

  if (p.riichi) {
    const currentWaits = findWaits(removeOneTile(p.hand, tile), p.melds);
    const newHand = p.hand.filter((t) => tileKindKey(t) !== tileKindKey(tile));
    const newMeld: Meld = {
      type: MeldType.ClosedKan,
      tiles: p.hand.filter((t) => tileKindKey(t) === tileKindKey(tile)),
    };
    const newWaits = findWaits(newHand, [...p.melds, newMeld]);

    if (
      currentWaits.length !== newWaits.length ||
      !currentWaits.every((cw) => newWaits.includes(cw))
    ) {
      return false;
    }
  }
  return true;
}

export function canHumanKakan(state: GameState, selectedIndex: number): boolean {
  if (state.phase !== "playing" || state.currentPlayer !== 0 || state.players[0].riichi)
    return false;
  const p = state.players[0];
  const tile = p.hand[selectedIndex];
  if (!tile) return false;
  return p.melds.some(
    (meld) =>
      meld.type === MeldType.Poon &&
      meld.tiles.some((meldTile) => tileKindKey(meldTile) === tileKindKey(tile)),
  );
}

export function canHumanKan(state: GameState, selectedIndex: number): boolean {
  return canHumanAnkan(state, selectedIndex) || canHumanKakan(state, selectedIndex);
}

export function canHumanKyuushu(state: GameState): boolean {
  return canDeclareKyuushuKyuuhai(state, 0);
}

export function computeHumanWaits(state: GameState, selectedIndex: number): Tile[] {
  if (state.phase !== "playing" || state.currentPlayer !== 0 || state.players[0].riichi) return [];
  if (turnTileCount(state.players[0]) !== 14) return [];
  const hand = state.players[0].hand;
  const selectedTile = hand[selectedIndex];
  if (!selectedTile) return [];
  const testHand = removeOneTile(hand, selectedTile);
  const waits = findWaits(testHand, state.players[0].melds);
  return waits.map((w) => indexToTile(w));
}
