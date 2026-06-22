import { describe, it, expect } from "vitest";
import { detectYaku, YakuId } from "../game/yaku.js";
import { Suit, MeldType, Wind, Dragon, type Tile, type Meld } from "../game/types.js";

// ── Tile helpers ───────────────────────────────────────────────────

function m(v: number, r?: boolean): Tile {
  return {
    suit: Suit.Man,
    value: v as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
    red: r ?? false,
  };
}
function p(v: number, r?: boolean): Tile {
  return {
    suit: Suit.Pin,
    value: v as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
    red: r ?? false,
  };
}
function s(v: number, r?: boolean): Tile {
  return {
    suit: Suit.Sou,
    value: v as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
    red: r ?? false,
  };
}

// ── detectYaku params factory ──────────────────────────────────────

function detectParams(opts: {
  closed: Tile[];
  melds?: Meld[];
  winTile: Tile;
  tsumo?: boolean;
  roundWind?: number;
  playerWind?: number;
  riichi?: boolean;
  rinshan?: boolean;
  isTenhou?: boolean;
  isChiihou?: boolean;
}) {
  return {
    closedTiles: opts.closed,
    melds: opts.melds ?? [],
    winTile: opts.winTile,
    isTsumo: opts.tsumo ?? true,
    roundWind: opts.roundWind ?? 0,
    playerWind: opts.playerWind ?? 0,
    isRiichi: opts.riichi ?? false,
    isDoubleRiichi: false,
    isIppatsu: false,
    isHaitei: false,
    isHoutei: false,
    isRinshan: opts.rinshan ?? false,
    isChankan: false,
    isTenhou: opts.isTenhou ?? false,
    isChiihou: opts.isChiihou ?? false,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe("Sanankou", () => {
  it("detects Sanankou with 3 concealed triplets (no melds)", () => {
    // Hand: 111m 222p 333s 444m + 55p
    const closed = [m(1), m(1), m(1), p(2), p(2), p(2), s(3), s(3), s(3), m(4), m(4), m(4), p(5)];
    const result = detectYaku(detectParams({ closed, winTile: p(5) }));
    expect(result.yaku.some((y) => y.id === YakuId.Sanankou)).toBe(true);
  });

  it("detects Sanankou with 2 concealed triplets + 1 ankan", () => {
    // Melds: [ClosedKan 5m×4]
    // Closed: 111m(triplet) 222p(triplet) 345s(seq) + pair 44m waiting
    const closed = [m(1), m(1), m(1), p(2), p(2), p(2), s(3), s(4), s(5), m(4)];
    const melds: Meld[] = [{ type: MeldType.ClosedKan, tiles: [m(5), m(5), m(5), m(5)] }];
    const result = detectYaku(detectParams({ closed, melds, winTile: m(4) }));
    expect(result.yaku.some((y) => y.id === YakuId.Sanankou)).toBe(true);
    // Sanankou should be the only non-tsumo yaku here
    expect(result.yaku.some((y) => y.id === YakuId.Suuankou)).toBe(false);
  });
});

describe("Suuankou", () => {
  it("detects SuuankouTanki with 4 concealed triplets (no melds, tanki)", () => {
    // Hand: 111m 222p 333s 444m + 55p (win on 5p to complete pair)
    const closed = [m(1), m(1), m(1), p(2), p(2), p(2), s(3), s(3), s(3), m(4), m(4), m(4), p(5)];
    const result = detectYaku(detectParams({ closed, winTile: p(5) }));
    expect(result.yaku.some((y) => y.id === YakuId.SuuankouTanki)).toBe(true);
    expect(result.yaku.some((y) => y.id === YakuId.Suuankou)).toBe(false);
  });

  it("detects Suuankou with 4 concealed triplets (no melds, non-tanki)", () => {
    // Hand: 111m 222p 333s 44m (waiting for 4m to complete 4th triplet)
    // Closed: 1m×3 2p×3 3s×3 4m×2 5p×2 (pair 55p) → win on 4m for 444m
    // Actually need: 111m 222p 333s 444m + 55p, but win tile completes 444m
    // closed has 111m 222p 333s 44m 55p → wait for 4m to make 444m
    // Wait, 5p×2 is the pair, so we need 3 copies of 1m, 2p, 3s, 2 copies of 4m, 2 copies of 5p
    // closed: 1m×3 2p×3 3s×3 4m×2 5p×2 = 13 tiles
    const closed = [m(1), m(1), m(1), p(2), p(2), p(2), s(3), s(3), s(3), m(4), m(4), p(5), p(5)];
    const result = detectYaku(detectParams({ closed, winTile: m(4) }));
    expect(result.yaku.some((y) => y.id === YakuId.Suuankou)).toBe(true);
    expect(result.yaku.some((y) => y.id === YakuId.SuuankouTanki)).toBe(false);
  });

  it("detects Suuankou with 3 concealed triplets + 1 ankan (tanki wait)", () => {
    // Melds: [ClosedKan 5m×4]
    // Closed: 111m 222p 333s (concealed triplets) + 4m (waiting for pair)
    const closed = [m(1), m(1), m(1), p(2), p(2), p(2), s(3), s(3), s(3), m(4)];
    const melds: Meld[] = [{ type: MeldType.ClosedKan, tiles: [m(5), m(5), m(5), m(5)] }];
    const result = detectYaku(detectParams({ closed, melds, winTile: m(4) }));
    expect(result.yaku.some((y) => y.id === YakuId.SuuankouTanki)).toBe(true);
    expect(result.yaku.some((y) => y.id === YakuId.Suuankou)).toBe(false);
  });

  it("detects Suuankou with 3 concealed triplets + 1 ankan (non-tanki)", () => {
    // Melds: [ClosedKan 5m×4]
    // Closed: 1m×2 2p×3 3s×3 4m×2 (13 tiles before win: 1m 1m 2p 2p 2p 3s 3s 3s 4m 4m)
    // Hmm, that's 10 closed tiles. Let me recalculate.
    // closedTiles (10) + winTile (1) = 11 tiles for decomposeStandardHand
    // Need 2 triplets + 1 pair from those 11 tiles.
    // Actually we need: 3 concealed triplets (from closed hand) + pair.
    // 3 triplets = 9 tiles + pair = 2 tiles = 11 tiles total (closedTiles - 1 + winTile)
    // closedTiles = 10 = 9 tiles for triplets (excluding 1 waiting tile) + 1... no.
    // closedTiles has 11-1 = 10 tiles. Wait no:
    // [...] The win tile IS included in closedTiles
    // Actually: closedTiles = 10 tiles (the 13 you have minus 3 from the hand that is replaced by the meld, roughly)
    // But wait, let me just compute: we need allTiles = closedTiles + winTile + melds tiles = 14 (or 15 with a quad)
    // Actually it's 14 for standard, 15 with 1 quad meld.
    // With 1 quad meld (4 tiles), we need closedTiles (pre-win) + winTile = 11 tiles.
    // So closedTiles has 10 tiles, winTile adds 1 = 11 total.
    // 11 tiles = 3 groups + 1 pair (or 2 groups + 1 pair if the 3rd... no, always 4 groups with pair)
    // Standard: 4 groups including 1 pair = (3 groups × 3) + (1 pair × 2) = 11 ✓
    // So we need 3 groups from 11 tiles. Let's say all 3 are triplets.
    // 3 triplets = 9 tiles. The remaining 2 tiles = pair. Total = 11 ✓
    // 3 triplets are: 222p, 333s, 44m? No, 44m is a pair not a triplet. Let me redo.
    //
    // Groups from decomposed closed hand: [222p (triplet), 333s (triplet), 444m (triplet), 55p (pair)]
    // That's 3 triplets + 1 pair = 3×3 + 2 = 11 ✓
    // Plus the meld quad 5555m.
    // Total concealed: 3 triplets + 1 quad = 4
    // winTile should complete one of the triplets (not the pair) → non-tanki
    //
    // So winTile completes 444m. We need:
    // closedTiles (10): p(2)×3, s(3)×3, m(4)×2, p(5)×2 = 10 tiles
    // winTile: m(4) (completes 444m triplet)
    // melds: ClosedKan 5m×4
    const closed: Tile[] = [p(2), p(2), p(2), s(3), s(3), s(3), m(4), m(4), p(5), p(5)];
    const melds: Meld[] = [{ type: MeldType.ClosedKan, tiles: [m(5), m(5), m(5), m(5)] }];
    const result = detectYaku(detectParams({ closed, melds, winTile: m(4) }));
    expect(result.yaku.some((y) => y.id === YakuId.Suuankou)).toBe(true);
    expect(result.yaku.some((y) => y.id === YakuId.SuuankouTanki)).toBe(false);
  });

  it("does NOT award Suuankou when hand contains a daiminkan (open kan)", () => {
    // Same as above but using MeldType.Kan (daiminkan = open)
    const closed: Tile[] = [m(1), m(1), m(1), p(2), p(2), p(2), s(3), s(3), s(3), m(4)];
    const melds: Meld[] = [{ type: MeldType.Kan, tiles: [m(5), m(5), m(5), m(5)] }];
    const result = detectYaku(detectParams({ closed, melds, winTile: m(4) }));
    expect(result.yaku.some((y) => y.id === YakuId.Suuankou)).toBe(false);
    expect(result.yaku.some((y) => y.id === YakuId.SuuankouTanki)).toBe(false);
    // Sanankou should still be detected (3 concealed triplets)
    expect(result.yaku.some((y) => y.id === YakuId.Sanankou)).toBe(true);
  });

  it("does NOT award Suuankou when hand contains an added kan", () => {
    // Same but using MeldType.AddedKan
    const closed: Tile[] = [m(1), m(1), m(1), p(2), p(2), p(2), s(3), s(3), s(3), m(4)];
    const melds: Meld[] = [{ type: MeldType.AddedKan, tiles: [m(5), m(5), m(5), m(5)] }];
    const result = detectYaku(detectParams({ closed, melds, winTile: m(4) }));
    expect(result.yaku.some((y) => y.id === YakuId.Suuankou)).toBe(false);
    expect(result.yaku.some((y) => y.id === YakuId.SuuankouTanki)).toBe(false);
    // Sanankou should still be detected (3 concealed triplets)
    expect(result.yaku.some((y) => y.id === YakuId.Sanankou)).toBe(true);
  });
});

describe("Rinshankai", () => {
  it("detects Rinshankai on rinshan tsumo", () => {
    const closed = [m(2), m(3), m(4), p(5), p(6), p(7), s(3), s(4), s(5), p(2), p(3), p(4), p(5)];
    const result = detectYaku(detectParams({ closed, winTile: p(5), rinshan: true, tsumo: true }));
    expect(result.yaku.some((y) => y.id === YakuId.Rinshan)).toBe(true);
  });

  it("does NOT detect Rinshankai on rinshan ron (always tsumo in practice)", () => {
    const closed = [m(2), m(3), m(4), p(5), p(6), p(7), s(3), s(4), s(5), p(2), p(3), p(4), p(5)];
    const result = detectYaku(detectParams({ closed, winTile: p(5), rinshan: true, tsumo: false }));
    expect(result.yaku.some((y) => y.id === YakuId.Rinshan)).toBe(false);
  });

  it("does not detect Rinshankai without rinshan flag", () => {
    const closed = [
      m(2),
      m(3),
      m(4),
      p(5),
      p(6),
      p(7),
      s(3),
      s(4),
      s(5),
      p(2),
      p(3),
      p(4),
      p(5),
    ] as Tile[];
    const result = detectYaku(detectParams({ closed, winTile: p(5), tsumo: true }));
    expect(result.yaku.some((y) => y.id === YakuId.Rinshan)).toBe(false);
  });
});

describe("Sanankou + Suuankou coexistence", () => {
  it("awards both Sanankou and Suuankou when applicable", () => {
    // Fully closed hand with 4 concealed triplets: Sanankou AND Suuankou apply
    const closed = [m(1), m(1), m(1), p(2), p(2), p(2), s(3), s(3), s(3), m(4), m(4), m(4), p(5)];
    const result = detectYaku(detectParams({ closed, winTile: p(5) }));
    expect(result.yaku.some((y) => y.id === YakuId.Sanankou)).toBe(true);
    expect(result.yaku.some((y) => y.id === YakuId.SuuankouTanki)).toBe(true);
  });
});

describe("totalHan and Kuisa-gari", () => {
  it("calculates kuisa-gari correctly for open hands (e.g. Chinitsu + Ittsuu)", async () => {
    const { totalHan } = await import("../game/yaku.js");
    // Open Chinitsu + Ittsuu: 123m (chi) + 456m + 789m + 11m (pair) + 23m (wait on 1m/4m)
    // Chinitsu hanClosed: 6, hanOpen: 5
    // Ittsuu hanClosed: 2, hanOpen: 1
    const closed = [m(4), m(5), m(6), m(7), m(8), m(9), m(1), m(1), m(2), m(3)];
    const melds: Meld[] = [{ type: MeldType.Chi, tiles: [m(1), m(2), m(3)] }];
    const result = detectYaku(detectParams({ closed, melds, winTile: m(4) }));

    const chinitsu = result.yaku.find((y) => y.id === YakuId.Chinitsu);
    expect(chinitsu).toBeDefined();
    expect(chinitsu!.han).toBe(5); // Should be 5 for open

    const ittsuu = result.yaku.find((y) => y.id === YakuId.Ittsuu);
    expect(ittsuu).toBeDefined();
    expect(ittsuu!.han).toBe(1); // Should be 1 for open

    // Total han should use the correctly reduced han
    expect(totalHan(result.yaku)).toBe(6); // 5 + 1
  });
});

describe("Tenhou and Chiihou", () => {
  it("detects Tenhou as standalone yakuman when isTenhou is true", () => {
    // Hand that also qualifies for Kokushi, to test standalone nature
    const closed = [
      m(1),
      m(9),
      p(1),
      p(9),
      s(1),
      s(9),
      { suit: Suit.Wind, value: Wind.Ton },
      { suit: Suit.Wind, value: Wind.Nan },
      { suit: Suit.Wind, value: Wind.Sha },
      { suit: Suit.Wind, value: Wind.Pei },
      { suit: Suit.Dragon, value: Dragon.Haku },
      { suit: Suit.Dragon, value: Dragon.Hatsu },
      { suit: Suit.Dragon, value: Dragon.Chun },
    ] as Tile[];
    const winTile = { suit: Suit.Dragon, value: Dragon.Chun } as Tile; // kokushi pair
    const result = detectYaku(detectParams({ closed, winTile, isTenhou: true, tsumo: true }));
    expect(result.yaku.length).toBe(1);
    expect(result.yaku[0]!.id).toBe(YakuId.Tenhou);
  });

  it("detects Chiihou as standalone yakuman when isChiihou is true", () => {
    // Hand that also qualifies for Suuankou, to test standalone nature
    const closed = [m(1), m(1), m(1), p(2), p(2), p(2), s(3), s(3), s(3), m(4), m(4), m(4), p(5)];
    const winTile = p(5);
    const result = detectYaku(detectParams({ closed, winTile, isChiihou: true, tsumo: true }));
    expect(result.yaku.length).toBe(1);
    expect(result.yaku[0]!.id).toBe(YakuId.Chiihou);
  });
});

// ── T-023 regression tests ─────────────────────────────────────────

describe("Ron triplet open (shabo wait)", () => {
  it("does NOT award Sanankou/Suuankou on ron when win tile completes an open triplet", () => {
    // 11m 222p 333s 789s 55p, waiting 1m/5p (shabo). Ron on 1m.
    const closed = [
      m(1),
      m(1),
      p(2),
      p(2),
      p(2),
      s(3),
      s(3),
      s(3),
      s(7),
      s(8),
      s(9),
      p(5),
      p(5),
    ];
    const result = detectYaku(detectParams({ closed, winTile: m(1), tsumo: false }));
    expect(result.groups).not.toBeNull();
    expect(
      result.groups!.groups.find((group) => group.type === "triplet" && group.lowestIndex === 0)?.isOpen,
    ).toBe(true);
    expect(result.yaku.some((y) => y.id === YakuId.Sanankou)).toBe(false);
    expect(result.yaku.some((y) => y.id === YakuId.Suuankou)).toBe(false);
    expect(result.yaku.some((y) => y.id === YakuId.SuuankouTanki)).toBe(false);
  });

  it("keeps the triplet concealed when the ron tile can complete a sequence instead", () => {
    // 111m 23m 222p 333s 55p, ron on 1m can complete 123m without opening 111m.
    const closed = [
      m(1),
      m(1),
      m(1),
      m(2),
      m(3),
      p(2),
      p(2),
      p(2),
      s(3),
      s(3),
      s(3),
      p(5),
      p(5),
    ];
    const result = detectYaku(detectParams({ closed, winTile: m(1), tsumo: false }));
    expect(result.yaku.some((y) => y.id === YakuId.Sanankou)).toBe(true);
    expect(
      result.groups!.groups.find((group) => group.type === "triplet" && group.lowestIndex === 0)?.isOpen,
    ).toBe(false);
  });

  it("does NOT award Suuankou/SuuankouTanki on ron when win tile completes the 4th triplet", () => {
    // 111m 222p 333s 44m 55p waiting 4m (non-tanki). Ron on 4m.
    const closed = [m(1), m(1), m(1), p(2), p(2), p(2), s(3), s(3), s(3), m(4), m(4), p(5), p(5)];
    const result = detectYaku(detectParams({ closed, winTile: m(4), tsumo: false }));
    expect(result.yaku.some((y) => y.id === YakuId.Suuankou)).toBe(false);
    expect(result.yaku.some((y) => y.id === YakuId.SuuankouTanki)).toBe(false);
  });
});

describe("Kokushi wait type", () => {
  it("awards Kokushi (single yakuman) on 1-sided wait", () => {
    // 13-tile tenpai: all kokushi tiles once + Chun pair, win on Haku (1-sided wait)
    const closed = [
      m(1),
      m(9),
      p(1),
      p(9),
      s(1),
      s(9),
      { suit: Suit.Wind, value: Wind.Ton },
      { suit: Suit.Wind, value: Wind.Nan },
      { suit: Suit.Wind, value: Wind.Sha },
      { suit: Suit.Wind, value: Wind.Pei },
      { suit: Suit.Dragon, value: Dragon.Hatsu },
      { suit: Suit.Dragon, value: Dragon.Chun },
      { suit: Suit.Dragon, value: Dragon.Chun },
    ] as Tile[];
    const winTile = { suit: Suit.Dragon, value: Dragon.Haku } as Tile;
    const result = detectYaku(detectParams({ closed, winTile, tsumo: false }));
    expect(result.yaku.some((y) => y.id === YakuId.Kokushi)).toBe(true);
    expect(result.yaku.some((y) => y.id === YakuId.Kokushi13)).toBe(false);
  });

  it("awards Kokushi13 (double yakuman) on 13-sided wait", () => {
    // 13-tile tenpai: one of each kokushi tile, win on Haku (13-sided wait)
    const closed = [
      m(1),
      m(9),
      p(1),
      p(9),
      s(1),
      s(9),
      { suit: Suit.Wind, value: Wind.Ton },
      { suit: Suit.Wind, value: Wind.Nan },
      { suit: Suit.Wind, value: Wind.Sha },
      { suit: Suit.Wind, value: Wind.Pei },
      { suit: Suit.Dragon, value: Dragon.Haku },
      { suit: Suit.Dragon, value: Dragon.Hatsu },
      { suit: Suit.Dragon, value: Dragon.Chun },
    ] as Tile[];
    const winTile = { suit: Suit.Dragon, value: Dragon.Haku } as Tile;
    const result = detectYaku(detectParams({ closed, winTile, tsumo: false }));
    expect(result.yaku.some((y) => y.id === YakuId.Kokushi13)).toBe(true);
    expect(result.yaku.some((y) => y.id === YakuId.Kokushi)).toBe(false);
  });
});

describe("Chuuren wait type", () => {
  it("awards Chuuren (single yakuman) on 1-sided wait", () => {
    // 13-tile tenpai: 1112345678899m, win on 9m (1-sided wait)
    // After removing win tile, the 13 tiles are NOT the perfect 3-1-...-1-3 pattern.
    const closed = [m(1), m(1), m(1), m(2), m(3), m(4), m(5), m(6), m(7), m(8), m(8), m(9), m(9)];
    const winTile = m(9);
    const result = detectYaku(detectParams({ closed, winTile, tsumo: true }));
    expect(result.yaku.some((y) => y.id === YakuId.Chuuren)).toBe(true);
    expect(result.yaku.some((y) => y.id === YakuId.Chuuren9)).toBe(false);
  });

  it("awards Chuuren9 (double yakuman) on 9-sided wait", () => {
    // 13-tile tenpai: 1112345678999m, win on 5m (9-sided wait)
    // After removing win tile, the 13 tiles are exactly the perfect 3-1-...-1-3 pattern.
    const closed = [m(1), m(1), m(1), m(2), m(3), m(4), m(5), m(6), m(7), m(8), m(9), m(9), m(9)];
    const winTile = m(5);
    const result = detectYaku(detectParams({ closed, winTile, tsumo: true }));
    expect(result.yaku.some((y) => y.id === YakuId.Chuuren9)).toBe(true);
    expect(result.yaku.some((y) => y.id === YakuId.Chuuren)).toBe(false);
  });
});

describe("Suushii / DaiSuushii", () => {
  it("awards Suushii (yakuman) for 3 wind triplets + 1 wind pair", () => {
    // Ton triplet, Nan triplet, Sha triplet, Pei pair + a sequence for standard shape
    const closed = [
      { suit: Suit.Wind, value: Wind.Ton },
      { suit: Suit.Wind, value: Wind.Ton },
      { suit: Suit.Wind, value: Wind.Ton },
      { suit: Suit.Wind, value: Wind.Nan },
      { suit: Suit.Wind, value: Wind.Nan },
      { suit: Suit.Wind, value: Wind.Nan },
      { suit: Suit.Wind, value: Wind.Sha },
      { suit: Suit.Wind, value: Wind.Sha },
      { suit: Suit.Wind, value: Wind.Sha },
      { suit: Suit.Wind, value: Wind.Pei },
      { suit: Suit.Wind, value: Wind.Pei },
      m(2),
      m(3),
    ] as Tile[];
    const winTile = m(4);
    const result = detectYaku(detectParams({ closed, winTile, tsumo: true }));
    expect(result.yaku.some((y) => y.id === YakuId.Suushii)).toBe(true);
    expect(result.yaku.some((y) => y.id === YakuId.DaiSuushii)).toBe(false);
  });

  it("awards DaiSuushii (double yakuman) for 4 wind triplets", () => {
    const closed = [
      { suit: Suit.Wind, value: Wind.Ton },
      { suit: Suit.Wind, value: Wind.Ton },
      { suit: Suit.Wind, value: Wind.Ton },
      { suit: Suit.Wind, value: Wind.Nan },
      { suit: Suit.Wind, value: Wind.Nan },
      { suit: Suit.Wind, value: Wind.Nan },
      { suit: Suit.Wind, value: Wind.Sha },
      { suit: Suit.Wind, value: Wind.Sha },
      { suit: Suit.Wind, value: Wind.Sha },
      { suit: Suit.Wind, value: Wind.Pei },
      { suit: Suit.Wind, value: Wind.Pei },
      { suit: Suit.Wind, value: Wind.Pei },
      m(5),
    ] as Tile[];
    const winTile = m(5);
    const result = detectYaku(detectParams({ closed, winTile, tsumo: true }));
    expect(result.yaku.some((y) => y.id === YakuId.DaiSuushii)).toBe(true);
    expect(result.yaku.some((y) => y.id === YakuId.Suushii)).toBe(false);
  });
});

describe("Pinfu closed-only", () => {
  it("does NOT award Pinfu for an open hand", () => {
    // Open: 123m chi, 345p, 456s, 789m + pair 22s, wait 3s/6s via 45s
    // Wait on 3s completes 345? No, pair 22s means we need sequences.
    // Use: meld 123m, closed 345p 456s 22s 45m, wait on 3m/6m
    const closed = [p(3), p(4), p(5), s(4), s(5), s(6), s(2), s(2), m(4), m(5)];
    const melds: Meld[] = [{ type: MeldType.Chi, tiles: [m(1), m(2), m(3)] }];
    const result = detectYaku(detectParams({ closed, melds, winTile: m(6), tsumo: false }));
    expect(result.yaku.some((y) => y.id === YakuId.Pinfu)).toBe(false);
  });
});
