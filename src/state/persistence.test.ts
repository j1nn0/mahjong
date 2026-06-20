import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { saveGame, loadGame, clearSave } from "./persistence.js";
import { normalizeGameState } from "./GameState.js";

const SAVE_PATH = path.resolve('.mahjong-save.json');

beforeEach(() => { clearSave(); });
afterEach(() => { clearSave(); });

describe('persistence', () => {
  it('saves and loads a simple object', () => {
    const data = { phase: 'playing', honba: 2, riichiSticks: 1 };
    saveGame(data);
    const loaded = loadGame<typeof data>();
    expect(loaded).not.toBeNull();
    expect(loaded!.phase).toBe('playing');
    expect(loaded!.honba).toBe(2);
  });

  it('returns null when no save file exists', () => {
    clearSave();
    const loaded = loadGame();
    expect(loaded).toBeNull();
  });

  it('roundtrips arrays and primitives', () => {
    const data = {
      players: [
        { hand: [1, 2, 3], points: 25000 },
        { hand: [4, 5, 6], points: 25000 },
      ],
      wall: [7, 8, 9],
      phase: 'playing' as const,
    };
    saveGame(data);
    const loaded = loadGame<typeof data>();
    expect(loaded).not.toBeNull();
    expect(loaded!.players).toHaveLength(2);
    expect(loaded!.players[0]!.hand).toEqual([1, 2, 3]);
    expect(loaded!.wall).toEqual([7, 8, 9]);
  });

  it('clearSave removes the save file', () => {
    saveGame({ test: true });
    expect(fs.existsSync(SAVE_PATH)).toBe(true);
    clearSave();
    expect(fs.existsSync(SAVE_PATH)).toBe(false);
  });
});

it("restores saved state with melds lacking calledFrom and responsibility (backward compat)", () => {
  // Old save data: melds without calledFrom/responsibility
  const oldSave = {
    players: [
      {
        hand: [{ suit: "m", value: 1 }, { suit: "m", value: 2 }],
        melds: [{ type: "poon", tiles: [{ suit: "d", value: 0 }, { suit: "d", value: 0 }, { suit: "d", value: 0 }], calledTile: { suit: "d", value: 0 } }],
        discards: [],
        riichi: false,
        doubleRiichi: false,
        ippatsu: false,
        temporaryFuriten: false,
        riichiFuriten: false,
        points: 25000,
        wind: 0,
      },
      { hand: [], melds: [], discards: [], riichi: false, doubleRiichi: false, ippatsu: false, temporaryFuriten: false, riichiFuriten: false, points: 25000, wind: 1 },
      { hand: [], melds: [], discards: [], riichi: false, doubleRiichi: false, ippatsu: false, temporaryFuriten: false, riichiFuriten: false, points: 25000, wind: 2 },
      { hand: [], melds: [], discards: [], riichi: false, doubleRiichi: false, ippatsu: false, temporaryFuriten: false, riichiFuriten: false, points: 25000, wind: 3 },
    ],
    wall: [],
    deadWall: { tiles: [], doraCount: 0 },
    dealer: 0,
    roundNumber: 1,
    honba: 0,
    riichiSticks: 0,
    phase: "playing",
    currentPlayer: 0,
    roundWind: 0,
    claimOptions: [],
    lastDiscard: null,
    lastDrawnTile: null,
    lastScoreResult: null,
    winner: null,
    finalRanking: null,
    pendingRinshan: false,
    lastDrawWasRinshan: false,
    lastDiscardWasChankan: false,
    kuikaeProhibitedTiles: [],
    firstTurnInterrupted: false,
    pendingAbortiveDraw: null,
    pendingKanDora: false,
    calledDiscardKinds: [[], [], [], []],
    message: "テスト",
    roundHistory: [],
  };

  const restored = normalizeGameState(oldSave);
  expect(restored.players[0].melds[0]!.type).toBe("poon");
  // calledFrom and responsibility should be undefined (not present in old save)
  expect(restored.players[0].melds[0]!.calledFrom).toBeUndefined();
  expect(restored.players[0].melds[0]!.responsibility).toBeUndefined();
});
