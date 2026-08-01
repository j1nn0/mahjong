import { describe, it, expect } from "vitest";
import { Suit, MeldType, type Tile, type Meld } from "../game/types.js";
import type { GameState, PlayerData } from "./types.js";
import { createInitialState } from "./roundSetup.js";
import { makePlayer } from "./players.js";
import { scoreTsumo, canScoreTsumo, ronScore } from "./winScoring.js";

function m(v: number): Tile {
  return { suit: Suit.Man, value: v as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 };
}
function s(v: number): Tile {
  return { suit: Suit.Sou, value: v as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 };
}
function p(v: number): Tile {
  return { suit: Suit.Pin, value: v as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 };
}
function pei(): Tile {
  return { suit: Suit.Wind, value: 3 };
}

function buildState(players: PlayerData[]): GameState {
  return {
    ...createInitialState(() => 0),
    firstTurnInterrupted: true, // 天和・地和を無効化して通常のツモ判定にする
    wall: [m(9)], // 海底摸月を無効化（役なし判定を正しく検証するため）
    players: players as unknown as [PlayerData, PlayerData, PlayerData, PlayerData],
  };
}

const others = () => [makePlayer(1, 25000), makePlayer(2, 25000), makePlayer(3, 25000)];

describe("scoreTsumo", () => {
  it("returns ok with a score for a complete scorable tsumo hand", () => {
    // 123m 456m 789m 111s 55s, win 5s (門前)
    const p0 = {
      ...makePlayer(0, 25000),
      hand: [m(1), m(2), m(3), m(4), m(5), m(6), m(7), m(8), m(9), s(1), s(1), s(1), s(5), s(5)],
    };
    const state = buildState([p0, ...others()]);
    const result = scoreTsumo(state, 0, s(5));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.score.score).toBeGreaterThan(0);
      expect(result.score.yaku.length).toBeGreaterThan(0);
    }
  });

  it("returns notWinning for an incomplete hand", () => {
    // 123m 456m 789m 11s 2s 55s — 2s が余り完成しない
    const p0 = {
      ...makePlayer(0, 25000),
      hand: [m(1), m(2), m(3), m(4), m(5), m(6), m(7), m(8), m(9), s(1), s(1), s(2), s(5), s(5)],
    };
    const state = buildState([p0, ...others()]);
    expect(scoreTsumo(state, 0, s(5))).toEqual({ ok: false, reason: "notWinning" });
  });

  it("returns unscorable for a complete hand with no yaku", () => {
    // チー123m + 456s 789s 123p 北北、6s ツモ — 役なし
    const chi: Meld = { type: MeldType.Chi, tiles: [m(1), m(2), m(3)], calledTile: m(3) };
    const p0 = {
      ...makePlayer(0, 25000),
      melds: [chi],
      hand: [s(4), s(5), s(6), s(7), s(8), s(9), p(1), p(2), p(3), pei(), pei()],
    };
    const state = buildState([p0, ...others()]);
    expect(scoreTsumo(state, 0, s(6))).toEqual({ ok: false, reason: "unscorable" });
  });

  it("canScoreTsumo mirrors the ok flag", () => {
    const p0 = {
      ...makePlayer(0, 25000),
      hand: [m(1), m(2), m(3), m(4), m(5), m(6), m(7), m(8), m(9), s(1), s(1), s(1), s(5), s(5)],
    };
    const state = buildState([p0, ...others()]);
    expect(canScoreTsumo(state, 0, s(5))).toBe(true);
    expect(canScoreTsumo(state, 0, s(4))).toBe(false);
  });
});

describe("ronScore", () => {
  it("returns null without a last discard", () => {
    const p0 = {
      ...makePlayer(0, 25000),
      riichi: true,
      hand: [m(1), m(2), m(3), m(4), m(5), m(6), m(7), m(8), m(9), s(1), s(1), s(1), s(5)],
    };
    const state = buildState([p0, ...others()]);
    expect(ronScore(state, 0)).toBeNull();
  });

  it("scores a winning ron hand", () => {
    const p0 = {
      ...makePlayer(0, 25000),
      riichi: true,
      hand: [m(1), m(2), m(3), m(4), m(5), m(6), m(7), m(8), m(9), s(1), s(1), s(1), s(5)],
    };
    const state = { ...buildState([p0, ...others()]), lastDiscard: { tile: s(5), player: 1 } };
    const score = ronScore(state, 0);
    expect(score).not.toBeNull();
    expect(score!.score).toBeGreaterThan(0);
    expect(score!.yaku.some((y) => y.id === "riichi")).toBe(true);
  });
});
