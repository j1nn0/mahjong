import { describe, it, expect } from "vitest";
import { detectYaku } from "./yaku.js";
import { findTenpaiTiles } from "./agari.js";
import { type Tile, Suit, Wind } from "./types.js";

function n(suit: string, value: number): Tile {
  return {
    suit: suit as Suit.Man | Suit.Pin | Suit.Sou,
    value: value as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
  };
}
function w(value: Wind): Tile {
  return { suit: Suit.Wind, value };
}
function d(value: 0 | 1 | 2): Tile {
  return { suit: Suit.Dragon, value };
}

describe("rule accuracy regression checks", () => {
  it("pinfu should require a two-sided wait (single wait)", () => {
    // 123m 456m 789m 123p + 5p single wait => NOT pinfu
    const closed = [
      n("m", 1),
      n("m", 2),
      n("m", 3),
      n("m", 4),
      n("m", 5),
      n("m", 6),
      n("m", 7),
      n("m", 8),
      n("m", 9),
      n("p", 1),
      n("p", 2),
      n("p", 3),
      n("p", 5),
    ];
    const r = detectYaku({
      closedTiles: closed,
      melds: [],
      winTile: n("p", 5),
      isTsumo: false,
      roundWind: Wind.Ton,
      playerWind: Wind.Nan,
      isRiichi: false,
      isDoubleRiichi: false,
      isIppatsu: false,
      isHaitei: false,
      isHoutei: false,
      isRinshan: false,
      isChankan: false,
    });
    expect(r.yaku.some((y) => y.id === "pinfu")).toBe(false);
  });

  it("pinfu should require a two-sided wait (edge wait)", () => {
    // 123m 456m 789m 12p + 66s, winTile=3p (edge wait) => NOT pinfu
    const closed = [
      n("m", 1),
      n("m", 2),
      n("m", 3),
      n("m", 4),
      n("m", 5),
      n("m", 6),
      n("m", 7),
      n("m", 8),
      n("m", 9),
      n("p", 1),
      n("p", 2),
      n("s", 6),
      n("s", 6),
    ];
    const r = detectYaku({
      closedTiles: closed,
      melds: [],
      winTile: n("p", 3),
      isTsumo: false,
      roundWind: Wind.Ton,
      playerWind: Wind.Nan,
      isRiichi: false,
      isDoubleRiichi: false,
      isIppatsu: false,
      isHaitei: false,
      isHoutei: false,
      isRinshan: false,
      isChankan: false,
    });
    expect(r.yaku.some((y) => y.id === "pinfu")).toBe(false);
  });

  it("pinfu should require a two-sided wait (closed wait)", () => {
    // 123m 456m 789m 24p + 66s, winTile=3p (closed wait) => NOT pinfu
    const closed = [
      n("m", 1),
      n("m", 2),
      n("m", 3),
      n("m", 4),
      n("m", 5),
      n("m", 6),
      n("m", 7),
      n("m", 8),
      n("m", 9),
      n("p", 2),
      n("p", 4),
      n("s", 6),
      n("s", 6),
    ];
    const r = detectYaku({
      closedTiles: closed,
      melds: [],
      winTile: n("p", 3),
      isTsumo: false,
      roundWind: Wind.Ton,
      playerWind: Wind.Nan,
      isRiichi: false,
      isDoubleRiichi: false,
      isIppatsu: false,
      isHaitei: false,
      isHoutei: false,
      isRinshan: false,
      isChankan: false,
    });
    expect(r.yaku.some((y) => y.id === "pinfu")).toBe(false);
  });


  it("pinfu should be allowed on a two-sided wait", () => {
    // 123m 456m 789m 23p + 22s, winTile=4p (two-sided wait) => pinfu
    const closed = [
      n("m", 1),
      n("m", 2),
      n("m", 3),
      n("m", 4),
      n("m", 5),
      n("m", 6),
      n("m", 7),
      n("m", 8),
      n("m", 9),
      n("p", 2),
      n("p", 3),
      n("s", 2),
      n("s", 2),
    ];
    const r = detectYaku({
      closedTiles: closed,
      melds: [],
      winTile: n("p", 4),
      isTsumo: false,
      roundWind: Wind.Ton,
      playerWind: Wind.Nan,
      isRiichi: false,
      isDoubleRiichi: false,
      isIppatsu: false,
      isHaitei: false,
      isHoutei: false,
      isRinshan: false,
      isChankan: false,
    });
    expect(r.yaku.some((y) => y.id === "pinfu")).toBe(true);
  });

  it("yakuhai should count once per triplet, not per matching condition", () => {
    // Dealer East round, player is East: a triplet of East winds is 1 han
    const closed = [
      w(Wind.Ton),
      w(Wind.Ton),
      w(Wind.Ton),
      n("m", 2),
      n("m", 3),
      n("m", 4),
      n("m", 5),
      n("m", 6),
      n("m", 7),
      n("p", 3),
      n("p", 4),
      n("p", 5),
      n("s", 2),
    ];
    const r = detectYaku({
      closedTiles: closed,
      melds: [],
      winTile: n("s", 2),
      isTsumo: true,
      roundWind: Wind.Ton,
      playerWind: Wind.Ton,
      isRiichi: false,
      isDoubleRiichi: false,
      isIppatsu: false,
      isHaitei: false,
      isHoutei: false,
      isRinshan: false,
      isChankan: false,
    });
    const yakuhaiCount = r.yaku.filter((y) => y.id === "yakuhai").length;
    expect(yakuhaiCount).toBe(1);
  });

  it("three dragon triplets should give yakuhai three times (one per triplet)", () => {
    const closed = [
      d(0),
      d(0),
      d(0),
      d(1),
      d(1),
      d(1),
      d(2),
      d(2),
      d(2),
      n("m", 2),
      n("m", 3),
      n("m", 4),
      n("p", 2),
    ];
    const r = detectYaku({
      closedTiles: closed,
      melds: [],
      winTile: n("p", 2),
      isTsumo: true,
      roundWind: Wind.Ton,
      playerWind: Wind.Nan,
      isRiichi: false,
      isDoubleRiichi: false,
      isIppatsu: false,
      isHaitei: false,
      isHoutei: false,
      isRinshan: false,
      isChankan: false,
    });
    const yakuhaiCount = r.yaku.filter((y) => y.id === "yakuhai").length;
    expect(yakuhaiCount).toBe(3);
  });

  it("findTenpaiTiles treats melded tiles as flexible, causing false tenpai", () => {
    // 手牌 7枚: 1m2m3m 4m5m6m 7p
    // 副露: 5p5p5p, 6p6p6p （ポン×2）
    // 実際の待ちは 7p のみ（7p を加えると 7p対子 + 1m2m3m + 4m5m6m + 5p刻子 + 6p刻子）。
    // しかし findTenpaiTiles は allTiles を一つの手牌として分解するため、
    // 4p を加えた 14枚を「7p対子 + 1m2m3m + 4m5m6m + 4p5p6p順子 + 5p刻子 + 6p刻子」と解釈して
    // 4p待ちと誤判定する（実際には 5p と 6p は副露面子に固定されているため 4p5p6p順子は作れない）。
    const hand = [n("m", 1), n("m", 2), n("m", 3), n("m", 4), n("m", 5), n("m", 6), n("p", 7)];
    const meldTiles = [n("p", 5), n("p", 5), n("p", 5), n("p", 6), n("p", 6), n("p", 6)];
    const allTiles = [...hand, ...meldTiles];
    const waits = findTenpaiTiles(allTiles);
    // 現在の実装では 5p(index 13) などが誤って待ちと判定される。
    // これは流局時の聴牌判定に findTenpaiTiles(allTiles) を使うことで
    // 副露あり手が誤聴牌と判定される原因となる。
    expect(waits).toContain(13);
  });
});
