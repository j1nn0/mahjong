import { type Tile, type Meld, Suit } from './types.js';
import {
  type HandGroups,
  type YakuResult,
  detectYaku,
  totalHan,
  totalYakuman,
  YakuId,
} from './yaku.js';
import { countDora } from './tiles.js';

// ── Scoring result ────────────────────────────────────────────────

export interface Payment {
  from: Array<{ player: number; amount: number }>;
  winnerGets: number;
}

export interface ScoreResult {
  yaku: readonly YakuResult[];
  han: number;
  yakuman: number;
  fu: number;
  basePoints: number;
  doraHan: number;
  limit: 'none' | 'mangan' | 'haneman' | 'baiman' | 'sanbaiman' | 'yakuman';
  score: number;
  payment: Payment;
}

// ── Fu calculation ────────────────────────────────────────────────

export function calculateFu(
  handGroups: HandGroups,
  detectedYaku: readonly YakuResult[],
  roundWind: number,
  playerWind: number,
): number {
  // Special hand types
  if (detectedYaku.some((y) => y.id === YakuId.Chiitoitsu)) return 25;
  if (detectedYaku.some((y) => y.id === YakuId.Kokushi || y.id === YakuId.Kokushi13)) return 0;

  const groups = handGroups.groups;
  const pairs = groups.filter((g) => g.type === 'pair');
  const triplets = groups.filter((g) => g.type === 'triplet' || g.type === 'quad');
  const isMenzen = handGroups.isClosed;
  const isTsumo = handGroups.isTsumo;
  const isPinfu = detectedYaku.some((y) => y.id === YakuId.Pinfu);

  let fu = 20;

  // Menzen ron
  if (!isTsumo && isMenzen) fu += 10;

  // Tsumo (not for pinfu)
  if (isTsumo && !isPinfu) fu += 2;

  // Triplet / quad fu
  for (const g of triplets) {
    const isTerminal = g.tiles.some(
      (t) => t.suit === Suit.Wind || t.suit === Suit.Dragon || t.value === 1 || t.value === 9,
    );
    const isQuad = g.type === 'quad';
    const isClosed = !g.isOpen;

    if (isQuad) {
      fu += isClosed ? (isTerminal ? 32 : 16) : isTerminal ? 16 : 8;
    } else {
      fu += isClosed ? (isTerminal ? 8 : 4) : isTerminal ? 4 : 2;
    }
  }

  // Pair fu
  if (pairs.length === 1) {
    const pairIdx = pairs[0]!.lowestIndex;
    if (pairIdx >= 31) fu += 2;
    else if (pairIdx >= 27) {
      const wind = pairIdx - 27;
      if (wind === roundWind) fu += 2;
      if (wind === playerWind) fu += 2;
    }
  }

  // Special pinfu adjustment: if it has any fu from triplets/pair, it's not pinfu
  // But we already check this via detectYaku returning Pinfu

  // Round up to next 10
  return Math.ceil(fu / 10) * 10;
}

// ── Score calculation ─────────────────────────────────────────────

const MANGAN = 2000;

export function calculateScore(
  handGroups: HandGroups,
  detectedYaku: readonly YakuResult[],
  winner: number,
  dealer: number,
  roundWind: number,
  playerWind: number,
  riichiSticks: number,
  honba: number,
  doraIndicators?: readonly Tile[],
  uraDoraIndicators?: readonly Tile[],
  loser?: number,
): ScoreResult {
  // Yakuman
  const yakumanCount = totalYakuman(detectedYaku);
  if (yakumanCount > 0) {
    const basePoints = MANGAN * 4 * yakumanCount;
    const payment = calcPayment(
      winner,
      dealer,
      handGroups.isTsumo,
      basePoints,
      riichiSticks,
      honba,
      loser,
    );
    return {
      yaku: detectedYaku,
      han: 0,
      yakuman: yakumanCount,
      fu: 0,
      basePoints,
      doraHan: 0,
      limit: 'yakuman',
      score: payment.winnerGets,
      payment,
    };
  }

  // Normal score
  const yakuHan = totalHan(detectedYaku);
  const fu = calculateFu(handGroups, detectedYaku, roundWind, playerWind);

  // Dora count (not included in hand yaku - purely additive)
  const doraIndicatorsList = doraIndicators ?? [];
  const uraDoraIndicatorsList = uraDoraIndicators ?? [];
  const allHandTiles = [...handGroups.groups.flatMap((g) => g.tiles)];
  const doraCounted = countDora(allHandTiles, doraIndicatorsList, true, uraDoraIndicatorsList);
  const han = yakuHan + doraCounted;

  let basePoints = fu * Math.pow(2, han + 2);
  let limit: ScoreResult['limit'] = 'none';

  if (han >= 13) {
    limit = 'yakuman';
    basePoints = MANGAN * 4;
  } else if (han >= 11) {
    limit = 'sanbaiman';
    basePoints = MANGAN * 3;
  } else if (han >= 8) {
    limit = 'baiman';
    basePoints = MANGAN * 2;
  } else if (han >= 6) {
    limit = 'haneman';
    basePoints = Math.floor(MANGAN * 1.5);
  } else if (basePoints >= MANGAN) {
    limit = 'mangan';
    basePoints = MANGAN;
  }

  const payment = calcPayment(winner, dealer, handGroups.isTsumo, basePoints, riichiSticks, honba, loser);
  const score = payment.winnerGets;

  return {
    yaku: detectedYaku,
    han,
    yakuman: 0,
    fu,
    basePoints,
    doraHan: doraCounted,
    limit,
    score,
    payment,
  };
}

function calcPayment(
  winner: number,
  dealer: number,
  isTsumo: boolean,
  basePoints: number,
  riichiSticks: number,
  honba: number,
  loser?: number,
): Payment {
  const riichiBonus = riichiSticks * 1000;

  if (!isTsumo) {
    const multiplier = winner === dealer ? 6 : 4;
    const amount = Math.ceil((basePoints * multiplier) / 100) * 100 + honba * 300;
    const from = loser !== undefined ? [{ player: loser, amount }] : [];
    return { from, winnerGets: amount + riichiBonus };
  }

  if (winner === dealer) {
    const perPlayer = Math.ceil((basePoints * 2) / 100) * 100 + honba * 100;
    const from = [0, 1, 2, 3]
      .filter((i) => i !== winner)
      .map((i) => ({ player: i, amount: perPlayer }));
    const winnerGets = perPlayer * 3 + riichiBonus;
    return { from, winnerGets };
  } else {
    const parentAmount = Math.ceil((basePoints * 2) / 100) * 100 + honba * 100;
    const childAmount = Math.ceil(basePoints / 100) * 100 + honba * 100;
    const from = [0, 1, 2, 3]
      .filter((i) => i !== winner)
      .map((i) => ({ player: i, amount: i === dealer ? parentAmount : childAmount }));
    const winnerGets = from.reduce((sum, p) => sum + p.amount, 0) + riichiBonus;
    return { from, winnerGets };
  }
}

// ── Convenience API ───────────────────────────────────────────────

export interface ScoreParams {
  closedTiles: readonly Tile[];
  melds: readonly Meld[];
  winTile: Tile;
  isTsumo: boolean;
  roundWind: number;
  playerSeat: number;
  isRiichi: boolean;
  isDoubleRiichi: boolean;
  isIppatsu: boolean;
  isHaitei: boolean;
  isHoutei: boolean;
  isRinshan: boolean;
  isChankan: boolean;
  riichiSticks: number;
  honba: number;
  dealer?: number;
  doraIndicators?: readonly Tile[];
  uraDoraIndicators?: readonly Tile[];
  isTenhou?: boolean;
  isChiihou?: boolean;
  loser?: number;
}

export function fullScore(params: ScoreParams): ScoreResult | null {
  const dealer = params.dealer ?? 0;
  const playerWind = (params.playerSeat - dealer + 4) % 4;
  const { yaku, groups } = detectYaku({
    closedTiles: params.closedTiles,
    melds: params.melds,
    winTile: params.winTile,
    isTsumo: params.isTsumo,
    roundWind: params.roundWind,
    playerWind,
    isRiichi: params.isRiichi,
    isDoubleRiichi: params.isDoubleRiichi,
    isIppatsu: params.isIppatsu,
    isHaitei: params.isHaitei,
    isHoutei: params.isHoutei,
    isRinshan: params.isRinshan,
    isChankan: params.isChankan,
    isTenhou: params.isTenhou ?? false,
    isChiihou: params.isChiihou ?? false,
  });

  if (!groups || yaku.length === 0) return null;

  return calculateScore(
    groups,
    yaku,
    params.playerSeat,
    dealer,
    params.roundWind,
    playerWind,
    params.riichiSticks,
    params.honba,
    params.doraIndicators,
    params.uraDoraIndicators,
    params.loser,
  );
}
