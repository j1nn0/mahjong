import { describe, it, expect } from 'vitest';
import { detectYaku, YakuId } from '../game/yaku.js';
import { Suit, MeldType, type Tile, type Meld } from '../game/types.js';

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
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('Sanankou', () => {
  it('detects Sanankou with 3 concealed triplets (no melds)', () => {
    // Hand: 111m 222p 333s 444m + 55p
    const closed = [
      m(1),
      m(1),
      m(1),
      p(2),
      p(2),
      p(2),
      s(3),
      s(3),
      s(3),
      m(4),
      m(4),
      m(4),
      p(5),
    ];
    const result = detectYaku(detectParams({ closed, winTile: p(5) }));
    expect(result.yaku.some((y) => y.id === YakuId.Sanankou)).toBe(true);
  });

  it('detects Sanankou with 2 concealed triplets + 1 ankan', () => {
    // Melds: [ClosedKan 5m×4]
    // Closed: 111m(triplet) 222p(triplet) 345s(seq) + pair 44m waiting
    const closed = [m(1), m(1), m(1), p(2), p(2), p(2), s(3), s(4), s(5), m(4)];
    const melds: Meld[] = [
      { type: MeldType.ClosedKan, tiles: [m(5), m(5), m(5), m(5)] },
    ];
    const result = detectYaku(detectParams({ closed, melds, winTile: m(4) }));
    expect(result.yaku.some((y) => y.id === YakuId.Sanankou)).toBe(true);
    // Sanankou should be the only non-tsumo yaku here
    expect(result.yaku.some((y) => y.id === YakuId.Suuankou)).toBe(false);
  });
});

describe('Suuankou', () => {
  it('detects SuuankouTanki with 4 concealed triplets (no melds, tanki)', () => {
    // Hand: 111m 222p 333s 444m + 55p (win on 5p to complete pair)
    const closed = [
      m(1),
      m(1),
      m(1),
      p(2),
      p(2),
      p(2),
      s(3),
      s(3),
      s(3),
      m(4),
      m(4),
      m(4),
      p(5),
    ];
    const result = detectYaku(detectParams({ closed, winTile: p(5) }));
    expect(result.yaku.some((y) => y.id === YakuId.SuuankouTanki)).toBe(true);
    expect(result.yaku.some((y) => y.id === YakuId.Suuankou)).toBe(false);
  });

  it('detects Suuankou with 4 concealed triplets (no melds, non-tanki)', () => {
    // Hand: 111m 222p 333s 44m (waiting for 4m to complete 4th triplet)
    // Closed: 1m×3 2p×3 3s×3 4m×2 5p×2 (pair 55p) → win on 4m for 444m
    // Actually need: 111m 222p 333s 444m + 55p, but win tile completes 444m
    // closed has 111m 222p 333s 44m 55p → wait for 4m to make 444m
    // Wait, 5p×2 is the pair, so we need 3 copies of 1m, 2p, 3s, 2 copies of 4m, 2 copies of 5p
    // closed: 1m×3 2p×3 3s×3 4m×2 5p×2 = 13 tiles
    const closed = [
      m(1),
      m(1),
      m(1),
      p(2),
      p(2),
      p(2),
      s(3),
      s(3),
      s(3),
      m(4),
      m(4),
      p(5),
      p(5),
    ];
    const result = detectYaku(detectParams({ closed, winTile: m(4) }));
    expect(result.yaku.some((y) => y.id === YakuId.Suuankou)).toBe(true);
    expect(result.yaku.some((y) => y.id === YakuId.SuuankouTanki)).toBe(false);
  });

  it('detects Suuankou with 3 concealed triplets + 1 ankan (tanki wait)', () => {
    // Melds: [ClosedKan 5m×4]
    // Closed: 111m 222p 333s (concealed triplets) + 4m (waiting for pair)
    const closed = [m(1), m(1), m(1), p(2), p(2), p(2), s(3), s(3), s(3), m(4)];
    const melds: Meld[] = [
      { type: MeldType.ClosedKan, tiles: [m(5), m(5), m(5), m(5)] },
    ];
    const result = detectYaku(detectParams({ closed, melds, winTile: m(4) }));
    expect(result.yaku.some((y) => y.id === YakuId.SuuankouTanki)).toBe(true);
    expect(result.yaku.some((y) => y.id === YakuId.Suuankou)).toBe(false);
  });

  it('detects Suuankou with 3 concealed triplets + 1 ankan (non-tanki)', () => {
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
    const closed: Tile[] = [
      p(2),
      p(2),
      p(2),
      s(3),
      s(3),
      s(3),
      m(4),
      m(4),
      p(5),
      p(5),
    ];
    const melds: Meld[] = [
      { type: MeldType.ClosedKan, tiles: [m(5), m(5), m(5), m(5)] },
    ];
    const result = detectYaku(detectParams({ closed, melds, winTile: m(4) }));
    expect(result.yaku.some((y) => y.id === YakuId.Suuankou)).toBe(true);
    expect(result.yaku.some((y) => y.id === YakuId.SuuankouTanki)).toBe(false);
  });

  it('does NOT award Suuankou when hand contains a daiminkan (open kan)', () => {
    // Same as above but using MeldType.Kan (daiminkan = open)
    const closed: Tile[] = [
      m(1),
      m(1),
      m(1),
      p(2),
      p(2),
      p(2),
      s(3),
      s(3),
      s(3),
      m(4),
    ];
    const melds: Meld[] = [
      { type: MeldType.Kan, tiles: [m(5), m(5), m(5), m(5)] },
    ];
    const result = detectYaku(detectParams({ closed, melds, winTile: m(4) }));
    expect(result.yaku.some((y) => y.id === YakuId.Suuankou)).toBe(false);
    expect(result.yaku.some((y) => y.id === YakuId.SuuankouTanki)).toBe(false);
    // Sanankou should still be detected (3 concealed triplets)
    expect(result.yaku.some((y) => y.id === YakuId.Sanankou)).toBe(true);
  });

  it('does NOT award Suuankou when hand contains an added kan', () => {
    // Same but using MeldType.AddedKan
    const closed: Tile[] = [
      m(1),
      m(1),
      m(1),
      p(2),
      p(2),
      p(2),
      s(3),
      s(3),
      s(3),
      m(4),
    ];
    const melds: Meld[] = [
      { type: MeldType.AddedKan, tiles: [m(5), m(5), m(5), m(5)] },
    ];
    const result = detectYaku(detectParams({ closed, melds, winTile: m(4) }));
    expect(result.yaku.some((y) => y.id === YakuId.Suuankou)).toBe(false);
    expect(result.yaku.some((y) => y.id === YakuId.SuuankouTanki)).toBe(false);
    // Sanankou should still be detected (3 concealed triplets)
    expect(result.yaku.some((y) => y.id === YakuId.Sanankou)).toBe(true);
  });
});

describe('Rinshankai', () => {
  it('detects Rinshankai on rinshan tsumo', () => {
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
    ];
    const result = detectYaku(
      detectParams({ closed, winTile: p(5), rinshan: true, tsumo: true }),
    );
    expect(result.yaku.some((y) => y.id === YakuId.Rinshan)).toBe(true);
  });

  it('does NOT detect Rinshankai on rinshan ron (always tsumo in practice)', () => {
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
    ];
    const result = detectYaku(
      detectParams({ closed, winTile: p(5), rinshan: true, tsumo: false }),
    );
    expect(result.yaku.some((y) => y.id === YakuId.Rinshan)).toBe(false);
  });

  it('does not detect Rinshankai without rinshan flag', () => {
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
    ];
    const result = detectYaku(
      detectParams({ closed, winTile: p(5), tsumo: true }),
    );
    expect(result.yaku.some((y) => y.id === YakuId.Rinshan)).toBe(false);
  });
});

describe('Sanankou + Suuankou coexistence', () => {
  it('awards both Sanankou and Suuankou when applicable', () => {
    // Fully closed hand with 4 concealed triplets: Sanankou AND Suuankou apply
    const closed = [
      m(1),
      m(1),
      m(1),
      p(2),
      p(2),
      p(2),
      s(3),
      s(3),
      s(3),
      m(4),
      m(4),
      m(4),
      p(5),
    ];
    const result = detectYaku(detectParams({ closed, winTile: p(5) }));
    expect(result.yaku.some((y) => y.id === YakuId.Sanankou)).toBe(true);
    expect(result.yaku.some((y) => y.id === YakuId.SuuankouTanki)).toBe(true);
  });
});
