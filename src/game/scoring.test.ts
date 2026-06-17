import { describe, it, expect } from 'vitest';
import { detectYaku, totalHan, totalYakuman, YakuId } from '../game/yaku.js';
import { fullScore } from '../game/scoring.js';
import { Suit, type Tile, type Meld } from '../game/types.js';

// ── Tile helpers ───────────────────────────────────────────────────

function m(v: number, r?: boolean): Tile {
  return { suit: Suit.Man, value: v as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, red: r ?? false };
}
function p(v: number, r?: boolean): Tile {
  return { suit: Suit.Pin, value: v as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, red: r ?? false };
}
function s(v: number, r?: boolean): Tile {
  return { suit: Suit.Sou, value: v as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, red: r ?? false };
}
function ton(): Tile { return { suit: Suit.Wind, value: 0 }; }
function haku(): Tile { return { suit: Suit.Dragon, value: 0 }; }

function detectParams(opts: {
  closed: Tile[];
  melds?: Meld[];
  winTile: Tile;
  tsumo?: boolean;
  roundWind?: number;
  playerWind?: number;
  riichi?: boolean;
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
    isRinshan: false,
    isChankan: false,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('detectYaku', () => {
  it('detects riichi + tsumo on a standard hand', () => {
    // 13 tiles before draw: 123m 456p 789s 1p 2p 3p + 5p (waiting for second 5p)
    const closed13 = [
      m(1), m(2), m(3),
      p(4), p(5), p(6),
      s(7), s(8), s(9),
      p(1), p(2), p(3),
      p(5),
    ];
    const result = detectYaku(detectParams({ closed: closed13, winTile: p(5), riichi: true }));
    expect(result.groups).not.toBeNull();
    const ids = result.yaku.map(y => y.id);
    expect(ids).toContain(YakuId.Riichi);
    expect(ids).toContain(YakuId.MenzenTsumo);
  });

  it('detects riichi even on chiitoitsu', () => {
    const closed13 = [
      m(1), m(1), m(2), m(2), m(3), m(3),
      p(4), p(4), p(5), p(5),
      s(6), s(6), s(7),
    ];
    const result = detectYaku(detectParams({ closed: closed13, winTile: s(7), riichi: true }));
    expect(result.groups).not.toBeNull();
    const ids = result.yaku.map(y => y.id);
    expect(ids).toContain(YakuId.Chiitoitsu);
    expect(ids).toContain(YakuId.Riichi);
  });

  it('detects tanyao (all simples)', () => {
    // 234m 567p 345s 234p 55p = all 2-7
    // 13 tiles before tsumo 5p:
    const closed13 = [
      m(2), m(3), m(4),
      p(5), p(6), p(7),
      s(3), s(4), s(5),
      p(2), p(3), p(4),
      p(5),
    ];
    const result = detectYaku(detectParams({ closed: closed13, winTile: p(5) }));
    expect(result.groups).not.toBeNull();
    expect(result.yaku.some(y => y.id === YakuId.Tanyao)).toBe(true);
  });

  it('detects yakuhai (dragon triplet)', () => {
    // haku triplet + 123m 456p 789s + 11s
    const closed13 = [haku(), haku(), haku(), m(1), m(2), m(3), p(4), p(5), p(6), s(7), s(8), s(9), s(1)];
    const result = detectYaku(detectParams({ closed: closed13, winTile: s(1) }));
    expect(result.groups).not.toBeNull();
    const ids = result.yaku.map(y => y.id);
    expect(ids).toContain(YakuId.Yakuhai);
  });

  it('detects honitsu (one suit + honors)', () => {
    // 111m 234m 567m 888m ton ton → 13 tiles + win ton
    const closed13 = [m(1), m(1), m(1), m(2), m(3), m(4), m(5), m(6), m(7), m(8), m(8), m(8), ton()];
    const result = detectYaku(detectParams({ closed: closed13, winTile: ton() }));
    expect(result.groups).not.toBeNull();
    expect(result.yaku.some(y => y.id === YakuId.Honitsu)).toBe(true);
  });

  it('detects pinfu (4 sequences + non-value pair)', () => {
    // 123m 456m 789p 123s 44s
    const closed13 = [m(1), m(2), m(3), m(4), m(5), m(6), p(7), p(8), p(9), s(1), s(2), s(3), s(4)];
    const result = detectYaku(detectParams({ closed: closed13, winTile: s(4) }));
    expect(result.groups).not.toBeNull();
    expect(result.yaku.some(y => y.id === YakuId.Pinfu)).toBe(true);
  });

  it('detects ittsuu (full straight)', () => {
    // 123m 456m 789m 444p 88s
    const closed13 = [m(1), m(2), m(3), m(4), m(5), m(6), m(7), m(8), m(9), p(4), p(4), p(4), s(8)];
    const result = detectYaku(detectParams({ closed: closed13, winTile: s(8) }));
    expect(result.groups).not.toBeNull();
    expect(result.yaku.some(y => y.id === YakuId.Ittsuu)).toBe(true);
  });

  it('does not detect yaku for a non-winning hand', () => {
    // Invalid: 1m 1m 3p 4p (not a group)
    const closed13 = [m(1), m(1), m(3), m(3), m(5), m(5), p(1), p(2), p(4), s(1), s(2), s(3), s(5)];
    const result = detectYaku(detectParams({ closed: closed13, winTile: s(5) }));
    expect(result.groups).toBeNull();
  });

  it('detects toitoi (all triplets)', () => {
    // 111m 222m 333p 444s + 55s pair
    const closed13 = [m(1), m(1), m(1), m(2), m(2), m(2), p(3), p(3), p(3), s(4), s(4), s(4), s(5)];
    const result = detectYaku(detectParams({ closed: closed13, winTile: s(5) }));
    expect(result.groups).not.toBeNull();
    expect(result.yaku.some(y => y.id === YakuId.Toitoi)).toBe(true);
  });
});

describe('totalHan / totalYakuman', () => {
  it('sums han correctly for tanyao riichi tsumo (+ pinfu)', () => {
    // 234m 567p 345s 234p 55p → tanyao(1) + riichi(1) + mentsumo(1) + pinfu(1) = 4
    const closed13 = [
      m(2), m(3), m(4),
      p(5), p(6), p(7),
      s(3), s(4), s(5),
      p(2), p(3), p(4),
      p(5),
    ];
    const result = detectYaku(detectParams({ closed: closed13, winTile: p(5), riichi: true }));
    const han = totalHan(result.yaku);
    expect(han).toBe(4);
  });

  it('counts yakuman correctly', () => {
    expect(totalYakuman([{ id: YakuId.Kokushi, name: '国士無双', han: 0, yakuman: true, doubleYakuman: false }])).toBe(1);
    expect(totalYakuman([{ id: YakuId.Kokushi13, name: '国士無双十三面待ち', han: 0, yakuman: true, doubleYakuman: true }])).toBe(2);
    expect(totalYakuman([{ id: YakuId.DaiSanGen, name: '大三元', han: 0, yakuman: true, doubleYakuman: false },
      { id: YakuId.TsuuIisou, name: '字一色', han: 0, yakuman: true, doubleYakuman: false }])).toBe(2);
  });
});

describe('fullScore', () => {
  it('scores a tanyao riichi tsumo hand correctly (4 han)', () => {
    const closed13 = [
      m(2), m(3), m(4),
      p(5), p(6), p(7),
      s(3), s(4), s(5),
      p(2), p(3), p(4),
      p(5),
    ];
    const score = fullScore({
      closedTiles: closed13,
      melds: [],
      winTile: p(5),
      isTsumo: true,
      roundWind: 0,
      playerSeat: 0,
      isRiichi: true,
      isDoubleRiichi: false,
      isIppatsu: false,
      isHaitei: false,
      isHoutei: false,
      isRinshan: false,
      isChankan: false,
      riichiSticks: 0,
      honba: 0,
    });
    expect(score).not.toBeNull();
    expect(score!.yaku.some(y => y.id === YakuId.Tanyao)).toBe(true);
    expect(score!.yaku.some(y => y.id === YakuId.Riichi)).toBe(true);
    expect(score!.yaku.some(y => y.id === YakuId.MenzenTsumo)).toBe(true);
    // 4 han + pinfu = 4 han, 20 fu, base = 20 × 2^6 = 1280
    expect(score!.han).toBe(4);
    expect(score!.limit).toBe('none');
    expect(score!.score).toBeGreaterThan(0);
  });

  it('returns null for non-winning hand', () => {
    const closed13 = [m(1), m(2), m(4), p(5), p(5), p(5), s(3), s(4), s(5), p(2), p(3), p(4), p(5)];
    const score = fullScore({
      closedTiles: closed13, melds: [], winTile: m(1),
      isTsumo: true, roundWind: 0, playerSeat: 0,
      isRiichi: false, isDoubleRiichi: false, isIppatsu: false,
      isHaitei: false, isHoutei: false, isRinshan: false, isChankan: false,
      riichiSticks: 0, honba: 0,
    });
    expect(score).toBeNull();
  });

  it('assigns non-zero score for dealer', () => {
    const closed13 = [
      m(2), m(3), m(4),
      p(5), p(6), p(7),
      s(3), s(4), s(5),
      p(2), p(3), p(4),
      p(5),
    ];
    const score = fullScore({
      closedTiles: closed13, melds: [], winTile: p(5),
      isTsumo: true, roundWind: 0, playerSeat: 0,
      isRiichi: false, isDoubleRiichi: false, isIppatsu: false,
      isHaitei: false, isHoutei: false, isRinshan: false, isChankan: false,
      riichiSticks: 0, honba: 0,
    });
    expect(score).not.toBeNull();
    expect(score!.payment.from.length).toBe(3);
    expect(score!.payment.from.every(f => f.amount > 0)).toBe(true);
  });

  it('assigns correct payment structure for non-dealer', () => {
    const closed13 = [
      m(2), m(3), m(4),
      p(5), p(6), p(7),
      s(3), s(4), s(5),
      p(2), p(3), p(4),
      p(5),
    ];
    const score = fullScore({
      closedTiles: closed13, melds: [], winTile: p(5),
      isTsumo: true, roundWind: 0, playerSeat: 1,
      isRiichi: false, isDoubleRiichi: false, isIppatsu: false,
      isHaitei: false, isHoutei: false, isRinshan: false, isChankan: false,
      riichiSticks: 0, honba: 0,
    });
    expect(score).not.toBeNull();
    expect(score!.payment.from.some(f => f.player === 0)).toBe(true); // parent
    expect(score!.payment.from.some(f => f.player === 2)).toBe(true);
    expect(score!.payment.from.some(f => f.player === 3)).toBe(true);
  });
});
