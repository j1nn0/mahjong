import { Suit, Wind, Dragon, MeldType, type Tile, type Meld } from './types.js';
import { tileToIndex, tilesToCounts } from './agari.js';

// ── Yaku definitions ──────────────────────────────────────────────

export enum YakuId {
  Riichi = 'riichi',
  Ippatsu = 'ippatsu',
  MenzenTsumo = 'mentsumo',
  Tanyao = 'tanyao',
  Pinfu = 'pinfu',
  Iipeiko = 'iipeiko',
  Yakuhai = 'yakuhai',
  Haitei = 'haitei',
  Houtei = 'houtei',
  Rinshan = 'rinshan',
  Chankan = 'chankan',
  DoubleRiichi = 'dblriichi',
  Chiitoitsu = 'chiitoitsu',
  Chanta = 'chanta',
  Ittsuu = 'ittsuu',
  SanshokuDoujun = 'sanshokudou',
  Toitoi = 'toitoi',
  Sanankou = 'sanankou',
  SanshokuDoukou = 'sanshokudok',
  Sankantsu = 'sankantsu',
  Shousangen = 'shousangen',
  Honroutou = 'honroutou',
  Ryanpeiko = 'ryanpeiko',
  Junchan = 'junchan',
  Honitsu = 'honitsu',
  Chinitsu = 'chinitsu',
  // Yakuman
  Suuankou = 'suuankou',
  Kokushi = 'kokushi',
  DaiSanGen = 'daisangen',
  Suushii = 'suushii',
  TsuuIisou = 'tsuuiisou',
  Ryuuiisou = 'ryuuiisou',
  Chuuren = 'chuuren',
  Chinroutou = 'chinroutou',
  Suukantsu = 'suukantsu',
  // Double yakuman
  Kokushi13 = 'kokushi13',
  SuuankouTanki = 'suuankoutanki',
  DaiSuushii = 'daisuushii',
  Chuuren9 = 'chuuren9',
}

interface YakuMeta {
  name: string;
  hanClosed: number;
  hanOpen: number;
  yakuman: boolean;
  doubleYakuman: boolean;
}

const YAKU_META: Record<string, YakuMeta> = {
  [YakuId.Riichi]:        { name: 'リーチ', hanClosed: 1, hanOpen: 0, yakuman: false, doubleYakuman: false },
  [YakuId.Ippatsu]:       { name: '一発', hanClosed: 1, hanOpen: 0, yakuman: false, doubleYakuman: false },
  [YakuId.MenzenTsumo]:   { name: '門前清自摸和', hanClosed: 1, hanOpen: 0, yakuman: false, doubleYakuman: false },
  [YakuId.Tanyao]:        { name: '断么九', hanClosed: 1, hanOpen: 1, yakuman: false, doubleYakuman: false },
  [YakuId.Pinfu]:         { name: '平和', hanClosed: 1, hanOpen: 0, yakuman: false, doubleYakuman: false },
  [YakuId.Iipeiko]:       { name: '一盃口', hanClosed: 1, hanOpen: 0, yakuman: false, doubleYakuman: false },
  [YakuId.Yakuhai]:       { name: '役牌', hanClosed: 1, hanOpen: 1, yakuman: false, doubleYakuman: false },
  [YakuId.Haitei]:        { name: '海底摸月', hanClosed: 1, hanOpen: 1, yakuman: false, doubleYakuman: false },
  [YakuId.Houtei]:        { name: '河底撈月', hanClosed: 1, hanOpen: 1, yakuman: false, doubleYakuman: false },
  [YakuId.Rinshan]:       { name: '嶺上開花', hanClosed: 1, hanOpen: 1, yakuman: false, doubleYakuman: false },
  [YakuId.Chankan]:       { name: '槍槓', hanClosed: 1, hanOpen: 1, yakuman: false, doubleYakuman: false },
  [YakuId.DoubleRiichi]:  { name: 'ダブルリーチ', hanClosed: 2, hanOpen: 0, yakuman: false, doubleYakuman: false },
  [YakuId.Chiitoitsu]:    { name: '七対子', hanClosed: 2, hanOpen: 0, yakuman: false, doubleYakuman: false },
  [YakuId.Chanta]:        { name: '混全帯么九', hanClosed: 2, hanOpen: 1, yakuman: false, doubleYakuman: false },
  [YakuId.Ittsuu]:        { name: '一気通貫', hanClosed: 2, hanOpen: 1, yakuman: false, doubleYakuman: false },
  [YakuId.SanshokuDoujun]:{ name: '三色同順', hanClosed: 2, hanOpen: 1, yakuman: false, doubleYakuman: false },
  [YakuId.Toitoi]:        { name: '対々和', hanClosed: 2, hanOpen: 2, yakuman: false, doubleYakuman: false },
  [YakuId.Sanankou]:      { name: '三暗刻', hanClosed: 2, hanOpen: 2, yakuman: false, doubleYakuman: false },
  [YakuId.SanshokuDoukou]:{ name: '三色同刻', hanClosed: 2, hanOpen: 2, yakuman: false, doubleYakuman: false },
  [YakuId.Sankantsu]:     { name: '三槓子', hanClosed: 2, hanOpen: 2, yakuman: false, doubleYakuman: false },
  [YakuId.Shousangen]:    { name: '小三元', hanClosed: 2, hanOpen: 2, yakuman: false, doubleYakuman: false },
  [YakuId.Honroutou]:     { name: '混老頭', hanClosed: 2, hanOpen: 2, yakuman: false, doubleYakuman: false },
  [YakuId.Ryanpeiko]:     { name: '二盃口', hanClosed: 3, hanOpen: 0, yakuman: false, doubleYakuman: false },
  [YakuId.Junchan]:       { name: '純全帯么九', hanClosed: 3, hanOpen: 2, yakuman: false, doubleYakuman: false },
  [YakuId.Honitsu]:       { name: '混一色', hanClosed: 3, hanOpen: 2, yakuman: false, doubleYakuman: false },
  [YakuId.Chinitsu]:      { name: '清一色', hanClosed: 6, hanOpen: 5, yakuman: false, doubleYakuman: false },
  [YakuId.Suuankou]:         { name: '四暗刻', hanClosed: 0, hanOpen: 0, yakuman: true, doubleYakuman: false },
  [YakuId.Kokushi]:          { name: '国士無双', hanClosed: 0, hanOpen: 0, yakuman: true, doubleYakuman: false },
  [YakuId.DaiSanGen]:        { name: '大三元', hanClosed: 0, hanOpen: 0, yakuman: true, doubleYakuman: false },
  [YakuId.Suushii]:          { name: '四喜和', hanClosed: 0, hanOpen: 0, yakuman: true, doubleYakuman: false },
  [YakuId.TsuuIisou]:        { name: '字一色', hanClosed: 0, hanOpen: 0, yakuman: true, doubleYakuman: false },
  [YakuId.Ryuuiisou]:        { name: '緑一色', hanClosed: 0, hanOpen: 0, yakuman: true, doubleYakuman: false },
  [YakuId.Chuuren]:          { name: '九蓮宝燈', hanClosed: 0, hanOpen: 0, yakuman: true, doubleYakuman: false },
  [YakuId.Chinroutou]:       { name: '清老頭', hanClosed: 0, hanOpen: 0, yakuman: true, doubleYakuman: false },
  [YakuId.Suukantsu]:        { name: '四槓子', hanClosed: 0, hanOpen: 0, yakuman: true, doubleYakuman: false },
  [YakuId.Kokushi13]:        { name: '国士無双十三面待ち', hanClosed: 0, hanOpen: 0, yakuman: true, doubleYakuman: true },
  [YakuId.SuuankouTanki]:    { name: '四暗刻単騎待ち', hanClosed: 0, hanOpen: 0, yakuman: true, doubleYakuman: true },
  [YakuId.DaiSuushii]:       { name: '大四喜', hanClosed: 0, hanOpen: 0, yakuman: true, doubleYakuman: true },
  [YakuId.Chuuren9]:         { name: '純正九蓮宝燈', hanClosed: 0, hanOpen: 0, yakuman: true, doubleYakuman: true },
};

export interface YakuResult {
  id: YakuId;
  name: string;
  han: number;
  yakuman: boolean;
  doubleYakuman: boolean;
}

// ── Group types for hand decomposition ────────────────────────────

export type GroupType = 'pair' | 'triplet' | 'sequence' | 'quad';

export interface Group {
  type: GroupType;
  tiles: readonly Tile[];
  isOpen: boolean;
  lowestIndex: number;
}

// ── Hand decomposition ────────────────────────────────────────────

export interface HandGroups {
  /** All groups (pair + triplet + sequence + quad) in the hand */
  groups: readonly Group[];
  /** True if no melds / calls were made (closed hand) */
  isClosed: boolean;
  /** The winning tile (can be from discard or drawn) */
  winTile: Tile;
  /** True if tsumo (self-draw win) */
  isTsumo: boolean;
}

// ── Terminal/honor helpers ────────────────────────────────────────

function isTerminal(value: number): boolean {
  return value === 1 || value === 9;
}

function isTerminalOrHonor(tile: Tile): boolean {
  if (tile.suit === Suit.Wind || tile.suit === Suit.Dragon) return true;
  return isTerminal(tile.value as number);
}

// ── Kokushi (13 orphans) helpers ──────────────────────────────────

const KOKUSHI_INDICES = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

function isKokushiHand(counts: number[]): boolean {
  for (const idx of KOKUSHI_INDICES) {
    if (counts[idx]! < 1) return false;
  }
  return true;
}

function isKokushi13Wait(counts: number[]): boolean {
  for (const idx of KOKUSHI_INDICES) {
    if (counts[idx] === 2) return true;
  }
  return false;
}

// ── 7 pairs check ─────────────────────────────────────────────────

function isChiitoitsuHand(counts: number[]): boolean {
  let pairs = 0;
  for (let i = 0; i < 34; i++) {
    if (counts[i]! % 2 !== 0) return false;
    pairs += counts[i]! / 2;
  }
  return pairs === 7;
}

// ── Decomposition: find groups in a winning hand ──────────────────

function decomposeByRemovingGroups(
  counts: number[], remainingGroups: number,
  collected: Group[],
): Group[] | null {
  if (remainingGroups === 0) {
    return counts.every(c => c === 0) ? [...collected] : null;
  }

  let first = -1;
  for (let i = 0; i < 34; i++) {
    if (counts[i]! > 0) { first = i; break; }
  }
  if (first === -1) return null;

  // Try triplet
  if (counts[first]! >= 3) {
    counts[first] -= 3;
    const g: Group = {
      type: 'triplet',
      tiles: [indexToTile(first, false), indexToTile(first, false), indexToTile(first, false)],
      isOpen: false,
      lowestIndex: first,
    };
    const result = decomposeByRemovingGroups(counts, remainingGroups - 1, [...collected, g]);
    if (result) { counts[first] += 3; return result; }
    counts[first] += 3;
  }

  // Try sequence (number tiles only, first ≤ 6 mod 9)
  if (first < 27 && first % 9 <= 6) {
    if (counts[first + 1]! > 0 && counts[first + 2]! > 0) {
      counts[first]--;
      counts[first + 1]--;
      counts[first + 2]--;
      const g: Group = {
        type: 'sequence',
        tiles: [indexToTile(first), indexToTile(first + 1), indexToTile(first + 2)],
        isOpen: false,
        lowestIndex: first,
      };
      const result = decomposeByRemovingGroups(counts, remainingGroups - 1, [...collected, g]);
      if (result) { counts[first]++; counts[first + 1]++; counts[first + 2]++; return result; }
      counts[first]++;
      counts[first + 1]++;
      counts[first + 2]++;
    }
  }

  return null;
}

function decomposeStandardHand(tiles: readonly Tile[], melds: readonly Meld[]): Group[] | null {
  const counts = tilesToCounts(tiles);
  const meldGroups: Group[] = melds.map(m => ({
    type: m.type === MeldType.Chi ? 'sequence' as const :
          m.type === MeldType.Kan || m.type === MeldType.ClosedKan || m.type === MeldType.AddedKan ? 'quad' as const :
          'triplet' as const,
    tiles: m.tiles,
    isOpen: m.type !== MeldType.ClosedKan,
    lowestIndex: tileToIndex(m.tiles[0]!),
  }));

  for (let i = 0; i < 34; i++) {
    if (counts[i]! >= 2) {
      counts[i] -= 2;
      const pairGroup: Group = {
        type: 'pair',
        tiles: [indexToTile(i), indexToTile(i)],
        isOpen: false,
        lowestIndex: i,
      };
      const groups = decomposeByRemovingGroups(counts, 4 - melds.length, [pairGroup, ...meldGroups]);
      counts[i] += 2;
      if (groups) return groups;
    }
  }
  return null;
}

// ── Yaku detection ────────────────────────────────────────────────

export interface DetectYakuParams {
  closedTiles: readonly Tile[];
  melds: readonly Meld[];
  winTile: Tile;
  isTsumo: boolean;
  roundWind: number;
  playerWind: number;
  isRiichi: boolean;
  isDoubleRiichi: boolean;
  isIppatsu: boolean;
  isHaitei: boolean;
  isHoutei: boolean;
  isRinshan: boolean;
  isChankan: boolean;
}

/**
 * Main yaku detection entry point.
 * Returns all yaku applicable to the hand + groups for fu calculation.
 */
export function detectYaku(
  params: DetectYakuParams,
): { yaku: YakuResult[]; groups: HandGroups | null } {
  const { closedTiles, melds, winTile, isTsumo, roundWind, playerWind, isRiichi } = params;
  const allTiles = [...closedTiles, winTile, ...melds.flatMap(m => m.tiles)];
  const counts = tilesToCounts(allTiles);
  const isClosed = melds.length === 0;
  const resultingYaku: YakuResult[] = [];
  const handGroups: HandGroups = { groups: [], isClosed, winTile, isTsumo };

  // ── Riichi (checked before special pattern early returns) ──
  if (isRiichi) {
    resultingYaku.push(metaResult(params.isDoubleRiichi ? YakuId.DoubleRiichi : YakuId.Riichi));
    if (params.isIppatsu) resultingYaku.push(metaResult(YakuId.Ippatsu));
  }
  // Menzen Tsumo (before special pattern early returns)
  if (isClosed && isTsumo) {
    resultingYaku.push(metaResult(YakuId.MenzenTsumo));
  }


  // ── Special patterns ──

  // Kokushi (13 orphans)
  if (isClosed && isKokushiHand(counts)) {
    const is13Wait = isKokushi13Wait(counts);
    resultingYaku.push(metaResult(is13Wait ? YakuId.Kokushi13 : YakuId.Kokushi));
    const pairs: Group[] = [];
    for (const idx of KOKUSHI_INDICES) {
      const tile = indexToTile(idx);
      const cnt = counts[idx]!;
      for (let k = 0; k < cnt; k++) {
        pairs.push({ type: 'pair' as const, tiles: [tile, tile], isOpen: false, lowestIndex: idx });
      }
    }
    handGroups.groups = pairs;
    return { yaku: resultingYaku, groups: handGroups };
  }

  // Chiitoitsu (7 pairs)
  if (isClosed && isChiitoitsuHand(counts)) {
    resultingYaku.push(metaResult(YakuId.Chiitoitsu));
    const pairs: Group[] = [];
    for (let i = 0; i < 34; i++) {
      if (counts[i]! >= 2) {
        const tile = indexToTile(i);
        pairs.push({ type: 'pair', tiles: [tile, tile], isOpen: false, lowestIndex: i });
      }
    }
    handGroups.groups = pairs;
    return { yaku: resultingYaku, groups: handGroups };
  }

  // Standard decomposition
  const standardGroups = decomposeStandardHand(allTiles, melds);
  if (!standardGroups) return { yaku: [], groups: null };
  handGroups.groups = standardGroups;

  // ── Now detect yaku from groups ──

  const pairs = standardGroups.filter(g => g.type === 'pair');
  const triplets = standardGroups.filter(g => g.type === 'triplet');
  const sequences = standardGroups.filter(g => g.type === 'sequence');
  const quads = standardGroups.filter(g => g.type === 'quad');
  const allMelds = [...triplets, ...sequences, ...quads];
  const allNonPairTiles = allMelds.flatMap(g => g.tiles);
  const allHandTiles = [...allNonPairTiles, ...pairs.flatMap(g => g.tiles)];



  // Pinfu: 4 sequences + non-value pair
  if (allMelds.length === 4 && sequences.length === 4 && pairs.length === 1) {
    const pairIdx = pairs[0]!.lowestIndex;
    const isValuePair =
      (pairIdx >= 31) ||
      (pairIdx >= 27 && (pairIdx - 27 === roundWind || pairIdx - 27 === playerWind));
    if (!isValuePair) {
      resultingYaku.push(metaResult(YakuId.Pinfu));
    }
  }

  // Yakuhai (value tiles)
  for (const g of [...triplets, ...quads]) {
    const idx = g.lowestIndex;
    let isValue = false;
    if (idx >= 31) isValue = true;
    else if (idx >= 27) {
      const wind = idx - 27;
      if (wind === roundWind || wind === playerWind) isValue = true;
    }
    if (isValue) {
      resultingYaku.push(metaResult(YakuId.Yakuhai));
    }
  }

  // Tanyao (all non-terminal/honor)
  if (allHandTiles.every(t => !isTerminalOrHonor(t))) {
    resultingYaku.push(metaResult(YakuId.Tanyao));
  }

  // Honroutou / Chinroutou
  if (allHandTiles.every(t => isTerminalOrHonor(t))) {
    const hasHonor = allHandTiles.some(t => t.suit === Suit.Wind || t.suit === Suit.Dragon);
    if (!hasHonor) {
      resultingYaku.push(metaResult(YakuId.Chinroutou));
    } else if (allMelds.length === triplets.length + quads.length) {
      resultingYaku.push(metaResult(YakuId.Honroutou));
    }
  }

  // Toitoi (all triplets)
  if (allMelds.length > 0 && triplets.length + quads.length === allMelds.length && allMelds.length === 4) {
    resultingYaku.push(metaResult(YakuId.Toitoi));
  }

  // Sanankou (3+ concealed triplets)
  if (triplets.filter(g => !g.isOpen).length >= 3) {
    resultingYaku.push(metaResult(YakuId.Sanankou));
  }

  // Suuankou (4 concealed triplets, closed)
  if (isClosed && triplets.length === 4) {
    const winIdx = tileToIndex(winTile);
    const isTankiWait = pairs.some(g => tileToIndex(g.tiles[0]!) === winIdx);
    resultingYaku.push(metaResult(isTankiWait ? YakuId.SuuankouTanki : YakuId.Suuankou));
  }

  // Iipeiko / Ryanpeiko
  if (sequences.length > 0 && isClosed) {
    const seqCounts = new Map<number, number>();
    for (const seq of sequences) {
      const key = seq.lowestIndex;
      seqCounts.set(key, (seqCounts.get(key) ?? 0) + 1);
    }
    let identicalSeqPairs = 0;
    for (const count of seqCounts.values()) {
      if (count >= 2) identicalSeqPairs++;
    }
    if (identicalSeqPairs >= 2) resultingYaku.push(metaResult(YakuId.Ryanpeiko));
    else if (identicalSeqPairs >= 1) resultingYaku.push(metaResult(YakuId.Iipeiko));
  }

  // Chanta / Junchan
  const allMeldsHaveTerminalOrHonor = allMelds.every(g =>
    g.tiles.some(t => isTerminalOrHonor(t)),
  );
  if (allMeldsHaveTerminalOrHonor) {
    const hasHonor = allHandTiles.some(t => t.suit === Suit.Wind || t.suit === Suit.Dragon);
    if (hasHonor) {
      resultingYaku.push(metaResult(YakuId.Chanta));
    } else {
      resultingYaku.push(metaResult(YakuId.Junchan));
    }
  }

  // Ittsuu (full straight in one suit)
  for (const s of [Suit.Man, Suit.Pin, Suit.Sou]) {
    const seqsInSuit = sequences.filter(g => g.tiles[0]!.suit === s);
    const has123 = seqsInSuit.some(g => g.lowestIndex % 9 === 0);
    const has456 = seqsInSuit.some(g => g.lowestIndex % 9 === 3);
    const has789 = seqsInSuit.some(g => g.lowestIndex % 9 === 6);
    if (has123 && has456 && has789) {
      resultingYaku.push(metaResult(YakuId.Ittsuu));
      break;
    }
  }

  // Sanshoku Doujun (same sequence in 3 suits)
  for (let v = 0; v < 7; v++) {
    const hasMan = sequences.some(g => g.lowestIndex % 9 === v && g.tiles[0]!.suit === Suit.Man);
    const hasPin = sequences.some(g => g.lowestIndex % 9 === v && g.tiles[0]!.suit === Suit.Pin);
    const hasSou = sequences.some(g => g.lowestIndex % 9 === v && g.tiles[0]!.suit === Suit.Sou);
    if (hasMan && hasPin && hasSou) {
      resultingYaku.push(metaResult(YakuId.SanshokuDoujun));
      break;
    }
  }

  // Sanshoku Doukou (same triplet value in 3 suits)
  for (let v = 0; v < 9; v++) {
    const hasMan = triplets.some(g => g.lowestIndex % 9 === v && g.tiles[0]!.suit === Suit.Man);
    const hasPin = triplets.some(g => g.lowestIndex % 9 === v && g.tiles[0]!.suit === Suit.Pin);
    const hasSou = triplets.some(g => g.lowestIndex % 9 === v && g.tiles[0]!.suit === Suit.Sou);
    if (hasMan && hasPin && hasSou) {
      resultingYaku.push(metaResult(YakuId.SanshokuDoukou));
      break;
    }
  }

  // Honitsu / Chinitsu / Tsuu Iisou
  const suits = new Set(allHandTiles.map(t => t.suit));
  if (suits.size === 1) {
    const suit = [...suits][0]!;
    if (suit !== Suit.Wind && suit !== Suit.Dragon) {
      resultingYaku.push(metaResult(YakuId.Chinitsu));
    } else {
      resultingYaku.push(metaResult(YakuId.TsuuIisou));
    }
  } else if (suits.size === 2) {
    const hasSuit = suits.has(Suit.Man) || suits.has(Suit.Pin) || suits.has(Suit.Sou);
    const hasHonor = suits.has(Suit.Wind) || suits.has(Suit.Dragon);
    if (hasSuit && hasHonor) {
      resultingYaku.push(metaResult(YakuId.Honitsu));
    }
  }

  // Shousangen (2 dragon triplets + dragon pair)
  const dragonTripletCount = [...triplets, ...quads].filter(g => g.lowestIndex >= 31).length;
  const dragonPair = pairs.some(g => g.lowestIndex >= 31);
  if (dragonTripletCount >= 2 && dragonPair) {
    resultingYaku.push(metaResult(YakuId.Shousangen));
  }

  // Suushii / DaiSuushii
  const windTriplets = [...triplets, ...quads].filter(g => g.lowestIndex >= 27 && g.lowestIndex <= 30);
  if (windTriplets.length === 4) {
    const allFourWinds = [0, 1, 2, 3].every(w =>
      windTriplets.some(g => g.lowestIndex === 27 + w),
    );
    resultingYaku.push(metaResult(allFourWinds ? YakuId.DaiSuushii : YakuId.Suushii));
  }

  // DaiSanGen
  const dragonTriplets2 = [...triplets, ...quads].filter(g => g.lowestIndex >= 31);
  if (dragonTriplets2.length === 3) {
    const allThreeDragons = [0, 1, 2].every(d =>
      dragonTriplets2.some(g => g.lowestIndex === 31 + d),
    );
    if (allThreeDragons) resultingYaku.push(metaResult(YakuId.DaiSanGen));
  }

  // Ryuuiisou (all green)
  const greenIndices = new Set([18 + 1, 18 + 2, 18 + 3, 18 + 5, 18 + 7, 31 + 1]);
  if (allHandTiles.every(t => greenIndices.has(tileToIndex(t)))) {
    resultingYaku.push(metaResult(YakuId.Ryuuiisou));
  }

  // Chuuren Poutou
  if (isClosed) {
    for (const s of [Suit.Man, Suit.Pin, Suit.Sou]) {
      const base = s === Suit.Man ? 0 : s === Suit.Pin ? 9 : 18;
      const suitCounts = counts.slice(base, base + 9);
      if (suitCounts[0]! >= 3 && suitCounts[8]! >= 3) {
        let allPresent = true;
        for (let i = 1; i <= 7; i++) {
          if (suitCounts[i]! < 1) { allPresent = false; break; }
        }
        if (allPresent) {
          const total = suitCounts.reduce((a, b) => a + b, 0);
          if (total === 14) {
            const is9Wait = suitCounts[0] === 4 || suitCounts[8] === 4;
            resultingYaku.push(metaResult(is9Wait ? YakuId.Chuuren9 : YakuId.Chuuren));
          }
        }
      }
    }
  }

  // Suukantsu
  if (quads.length === 4) {
    resultingYaku.push(metaResult(YakuId.Suukantsu));
  }

  // Haitei / Houtei
  if (params.isHaitei) resultingYaku.push(metaResult(YakuId.Haitei));
  if (params.isHoutei) resultingYaku.push(metaResult(YakuId.Houtei));
  if (params.isRinshan) resultingYaku.push(metaResult(YakuId.Rinshan));
  if (params.isChankan) resultingYaku.push(metaResult(YakuId.Chankan));

  return { yaku: resultingYaku, groups: handGroups };
}

// ── Helpers ───────────────────────────────────────────────────────

function metaResult(id: YakuId): YakuResult {
  const meta = YAKU_META[id];
  if (!meta) throw new Error(`Unknown yaku: ${id}`);
  return { id, name: meta.name, han: 0, yakuman: meta.yakuman, doubleYakuman: meta.doubleYakuman };
}

function indexToTile(index: number, red = false): Tile {
  if (index < 9)  return { suit: Suit.Man,   value: (index + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, red };
  if (index < 18) return { suit: Suit.Pin,   value: (index - 9 + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, red };
  if (index < 27) return { suit: Suit.Sou,   value: (index - 18 + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, red };
  if (index < 31) return { suit: Suit.Wind,  value: (index - 27) as Wind, red: false };
  return { suit: Suit.Dragon, value: (index - 31) as Dragon, red: false };
}

// ── Aggregation ───────────────────────────────────────────────────

export function totalHan(yaku: readonly YakuResult[]): number {
  return yaku.reduce((s, y) => {
    if (y.yakuman) return s;
    const meta = YAKU_META[y.id];
    return s + (meta?.hanClosed ?? meta?.hanOpen ?? 0);
  }, 0);
}

export function totalYakuman(yaku: readonly YakuResult[]): number {
  return yaku.reduce((s, y) => {
    if (y.doubleYakuman) return s + 2;
    if (y.yakuman) return s + 1;
    return s;
  }, 0);
}
