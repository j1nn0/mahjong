import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { saveGame, loadGame, clearSave } from './persistence.js';

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
