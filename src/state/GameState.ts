import { type Tile, type Meld, MeldType, Wind, Suit } from '../game/types.js';
import { buildWall, drawFromWall, sortHand, formatTile, getDoraIndicators, getUraDoraIndicators } from '../game/tiles.js';
import { tilesToCounts, isWinningHand, findTenpaiTiles, indexToTile, tileToIndex } from '../game/agari.js';
import { fullScore, type ScoreResult } from '../game/scoring.js';
import { aiChooseDiscard } from '../game/ai.js';

// ── Types ─────────────────────────────────────────────────────────

export interface PlayerData {
  hand: readonly Tile[];
  melds: readonly Meld[];
  discards: readonly Tile[];
  riichi: boolean;
  temporaryFuriten: boolean;
  riichiFuriten: boolean;
  points: number;
  wind: Wind;
}

export interface DeadWallState {
  tiles: readonly Tile[];
  doraCount: number;
}

export type ClaimOption = RonClaimOption | MeldClaimOption;

export interface RonClaimOption {
  type: 'ron';
  player: number;
  tiles: readonly Tile[];
  calledTile: Tile;
  display: string;
}

export interface MeldClaimOption {
  type: 'chi' | 'pon' | 'daiminkan';
  player: number;
  tiles: readonly Tile[];
  calledTile: Tile;
  meld: Meld;
  display: string;
}

function isMeldClaimOption(option: ClaimOption, type: MeldClaimOption['type'], player: number): option is MeldClaimOption {
  return option.type === type && option.player === player;
}

export interface GameState {
  players: readonly [PlayerData, PlayerData, PlayerData, PlayerData];
  wall: readonly Tile[];
  deadWall: DeadWallState;
  roundWind: number;
  roundNumber: number;
  dealer: number;
  honba: number;
  riichiSticks: number;
  currentPlayer: number;
  lastDiscard: { readonly tile: Tile; readonly player: number } | null;
  winner: number | null;
  phase: 'playing' | 'claiming' | 'roundEnded' | 'ended';
  claimOptions: readonly ClaimOption[];
  /** 直近の和了スコア (表示用) */
  /** 最後にツモった牌 (表示用、TSUMO時のwinTile特定用) */
  lastDrawnTile: Tile | null;
  lastScoreResult: ScoreResult | null;
  finalRanking: readonly number[] | null;
  message: string;
}

// ── Actions ────────────────────────────────────────────────────────

export type GameAction =
  | { type: 'START_GAME' }
  | { type: 'DRAW'; player: number }
  | { type: 'DISCARD'; player: number; tile: Tile }
  | { type: 'DECLARE_RIICHI'; player: number; discardTile: Tile }
  | { type: 'CHI'; player: number; optionIndex: number }
  | { type: 'PON'; player: number }
  | { type: 'DAIMINKAN'; player: number }
  | { type: 'PASS_CLAIM' }
  | { type: 'RON'; winner: number }
  | { type: 'TSUMO'; player: number }
  | { type: 'END_ROUND'; message?: string }
  | { type: 'NEXT_ROUND' }
  | { type: 'RESTORE'; state: GameState };

// ── Helpers ────────────────────────────────────────────────────────

function isSameTile(a: Tile, b: Tile): boolean {
  return a.suit === b.suit && a.value === b.value && (a.red ?? false) === (b.red ?? false);
}

function makePlayer(wind: number, points: number): PlayerData {
  return {
    hand: [], melds: [], discards: [],
    riichi: false, temporaryFuriten: false, riichiFuriten: false, points, wind: wind as Wind,
  };
}

function updPlayer(player: PlayerData, overrides: Partial<PlayerData>): PlayerData {
  return { ...player, ...overrides };
}

function removeOneTile(hand: readonly Tile[], tile: Tile): Tile[] {
  const idx = hand.findIndex(t => isSameTile(t, tile));
  if (idx === -1) return [...hand];
  return [...hand.slice(0, idx), ...hand.slice(idx + 1)];
}

function turnTileCount(player: PlayerData): number {
  return player.hand.length + player.melds.reduce((sum, meld) => sum + meld.tiles.length, 0);
}

function allPlayerTiles(player: PlayerData): readonly Tile[] {
  return [...player.hand, ...player.melds.flatMap(meld => meld.tiles)];
}

function isFuritenFromOwnDiscards(player: PlayerData): boolean {
  if (player.temporaryFuriten || player.riichiFuriten) return true;
  const waits = new Set(findTenpaiTiles(allPlayerTiles(player)));
  if (waits.size === 0) return false;
  return player.discards.some(tile => waits.has(tileToIndex(tile)));
}

/** 現在のstateからドラパラメータを抽出 */
const doraParams = (state: GameState) => ({
  doraIndicators: getDoraIndicators(state.deadWall.tiles, state.deadWall.doraCount),
  uraDoraIndicators: getUraDoraIndicators(state.deadWall.tiles, state.deadWall.doraCount),
});

function playerWind(player: number, dealer: number): Wind {
  return ((player - dealer + 4) % 4) as Wind;
}

function roundName(roundNumber: number): string {
  return `東${roundNumber}局`;
}

function rankPlayers(players: readonly [PlayerData, PlayerData, PlayerData, PlayerData]): number[] {
  return [0, 1, 2, 3].sort((a, b) => {
    const pointDiff = players[b].points - players[a].points;
    return pointDiff !== 0 ? pointDiff : a - b;
  });
}

function dealRound(
  state: GameState,
  dealer: number,
  roundNumber: number,
  honba: number,
  riichiSticks: number,
  message: string,
): GameState {
  const wallData = buildWall();
  const players = state.players.map((player, i) => ({
    hand: [],
    melds: [],
    discards: [],
    riichi: false,
    temporaryFuriten: false,
    riichiFuriten: false,
    points: player.points,
    wind: playerWind(i, dealer),
  })) as unknown as [PlayerData, PlayerData, PlayerData, PlayerData];

  const { drawn: dealerHand, remaining: afterDealer } = drawFromWall(wallData.wall, 14);
  let wallRemaining = afterDealer;
  players[dealer] = updPlayer(players[dealer], { hand: sortHand([...dealerHand]) });

  for (let offset = 1; offset < 4; offset++) {
    const player = (dealer + offset) % 4;
    const { drawn, remaining } = drawFromWall(wallRemaining, 13);
    players[player] = updPlayer(players[player], { hand: sortHand([...drawn]) });
    wallRemaining = remaining;
  }

  return {
    ...state,
    players,
    wall: wallRemaining,
    deadWall: { tiles: wallData.deadWall, doraCount: 1 },
    roundWind: Wind.Ton,
    roundNumber,
    dealer,
    honba,
    riichiSticks,
    currentPlayer: dealer,
    lastDiscard: null,
    winner: null,
    lastScoreResult: null,
    lastDrawnTile: null,
    finalRanking: null,
    phase: 'playing',
    claimOptions: [],
    message,
  };
}

function finishRound(
  state: GameState,
  players: readonly [PlayerData, PlayerData, PlayerData, PlayerData],
  winner: number | null,
  isDraw: boolean,
  dealerContinues: boolean,
  score: ScoreResult | null,
  message: string,
): GameState {
  const nextDealer = dealerContinues ? state.dealer : (state.dealer + 1) % 4;
  const nextRoundNumber = dealerContinues ? state.roundNumber : state.roundNumber + 1;
  const nextHonba = dealerContinues || isDraw ? state.honba + 1 : 0;
  const nextRiichiSticks = winner === null ? state.riichiSticks : 0;
  const finalRanking = rankPlayers(players);
  const finalDealerTop = dealerContinues && state.roundNumber >= 4 && finalRanking[0] === state.dealer;
  const matchEnded = state.roundNumber >= 4 && (!dealerContinues || finalDealerTop);

  return {
    ...state,
    players,
    dealer: nextDealer,
    roundNumber: nextRoundNumber,
    honba: nextHonba,
    riichiSticks: nextRiichiSticks,
    winner,
    phase: matchEnded ? 'ended' : 'roundEnded',
    claimOptions: [],
    lastScoreResult: score,
    finalRanking: matchEnded ? finalRanking : null,
    message,
  };
}

function closedTilesForTsumo(hand: readonly Tile[], winTile: Tile): readonly Tile[] {
  return removeOneTile(hand, winTile);
}

function applyRonPayment(
  players: readonly [PlayerData, PlayerData, PlayerData, PlayerData],
  winner: number,
  discarder: number,
  score: ScoreResult,
  riichiSticks: number,
): [PlayerData, PlayerData, PlayerData, PlayerData] {
  const loserPays = score.score - riichiSticks * 1000;
  const afterLoser = updatePlayerInTuple(players, discarder, updPlayer(players[discarder], {
    points: players[discarder].points - loserPays,
  }));
  return updatePlayerInTuple(afterLoser, winner, updPlayer(afterLoser[winner], {
    points: afterLoser[winner].points + score.score,
  }));
}

function applyTsumoPayment(
  players: readonly [PlayerData, PlayerData, PlayerData, PlayerData],
  winner: number,
  score: ScoreResult,
): [PlayerData, PlayerData, PlayerData, PlayerData] {
  return players.map((player, i) => {
    if (i === winner) return updPlayer(player, { points: player.points + score.score });
    const payment = score.payment.from.find(f => f.player === i);
    return updPlayer(player, { points: player.points - (payment?.amount ?? 0) });
  }) as unknown as [PlayerData, PlayerData, PlayerData, PlayerData];
}

/** 流局時の聴牌確認と点棒移動 */
function handleExhaustiveDraw(state: GameState): GameState {
  const tenpaiList: number[] = [];
  const notenList: number[] = [];

  for (let i = 0; i < 4; i++) {
    const p = state.players[i];
    const allTiles = [...p.hand];
    for (const meld of p.melds) {
      allTiles.push(...meld.tiles);
    }
    if (findTenpaiTiles(allTiles).length > 0) {
      tenpaiList.push(i);
    } else {
      notenList.push(i);
    }
  }

  const newPlayers = [...state.players] as unknown as [PlayerData, PlayerData, PlayerData, PlayerData];

  if (tenpaiList.length > 0 && notenList.length > 0) {
    const notenPays = 3000 / notenList.length;
    const tenpaiGets = 3000 / tenpaiList.length;
    for (const n of notenList) {
      newPlayers[n] = updPlayer(newPlayers[n], {
        points: newPlayers[n].points - notenPays,
      });
    }
    for (const t of tenpaiList) {
      newPlayers[t] = updPlayer(newPlayers[t], {
        points: newPlayers[t].points + tenpaiGets,
      });
    }
  }

  const tenpaiStr = tenpaiList.map(i => `${i === 0 ? 'あなた' : `P${i + 1}`}`).join('・');
  const notenStr = notenList.map(i => `${i === 0 ? 'あなた' : `P${i + 1}`}`).join('・');
  const detail = tenpaiList.length > 0
    ? `聴牌: ${tenpaiStr}  不聴: ${notenStr || 'なし'}`
    : '全員不聴';

  return finishRound(
    state,
    newPlayers,
    null,
    true,
    tenpaiList.includes(state.dealer),
    null,
    `流局: ${detail}`,
  );
}

// ── Claim checking ─────────────────────────────────────────────────

function findChiOptions(discarded: Tile, hand: readonly Tile[], playerNum: number): readonly ClaimOption[] {
  if (discarded.suit === Suit.Wind || discarded.suit === Suit.Dragon) return [];
  const value = discarded.value as number;
  const suit = discarded.suit;
  const options: ClaimOption[] = [];

  for (let start = Math.max(1, value - 2); start <= Math.min(7, value); start++) {
    const neededVals = [start, start + 1, start + 2].filter(v => v !== value);
    const fromHand: Tile[] = [];
    const remaining = [...hand];
    for (const nv of neededVals) {
      const idx = remaining.findIndex(t => t.suit === suit && t.value === nv);
      if (idx === -1) break;
      fromHand.push(remaining[idx]!);
      remaining.splice(idx, 1);
    }
    if (fromHand.length === 2) {
      const meldTiles = [...fromHand, discarded];
      const meld: Meld = { type: MeldType.Chi, tiles: sortHand([...meldTiles]), calledTile: discarded };
      options.push({
        type: 'chi', player: playerNum, tiles: meldTiles, calledTile: discarded, meld,
        display: `チー ${meldTiles.map(t => formatTile(t)).join('')}`,
      });
    }
  }
  return options;
}

function canPonTile(discarded: Tile, hand: readonly Tile[]): boolean {
  return hand.filter(t => isSameTile(t, discarded)).length >= 2;
}

function canDaiminkanTile(discarded: Tile, hand: readonly Tile[]): boolean {
  return hand.filter(t => isSameTile(t, discarded)).length >= 3;
}

export function collectClaims(
  discarded: Tile, discarder: number,
  players: readonly [PlayerData, PlayerData, PlayerData, PlayerData],
): readonly ClaimOption[] {
  const options: ClaimOption[] = [];

  for (let i = 0; i < 4; i++) {
    if (i === discarder) continue;
    const hand = players[i].hand;
    if (!isFuritenFromOwnDiscards(players[i]) && isWinningHand(tilesToCounts([...allPlayerTiles(players[i]), discarded]))) {
      options.push({
        type: 'ron',
        player: i,
        tiles: [discarded],
        calledTile: discarded,
        display: `ロン ${formatTile(discarded)}`,
      });
    }

    if (players[i].riichi) continue;

    if (canPonTile(discarded, hand)) {
      const pair = hand.filter(t => isSameTile(t, discarded)).slice(0, 2);
      const meldTiles = [...pair, discarded];
      const meld: Meld = { type: MeldType.Poon, tiles: meldTiles, calledTile: discarded };
      options.push({
        type: 'pon', player: i, tiles: meldTiles, calledTile: discarded, meld,
        display: `ポン ${formatTile(discarded)}`,
      });
    }

    if (canDaiminkanTile(discarded, hand)) {
      const triple = hand.filter(t => isSameTile(t, discarded)).slice(0, 3);
      const meldTiles = [...triple, discarded];
      const meld: Meld = { type: MeldType.Kan, tiles: meldTiles, calledTile: discarded };
      options.push({
        type: 'daiminkan', player: i, tiles: meldTiles, calledTile: discarded, meld,
        display: `カン ${formatTile(discarded)}`,
      });
    }

    if (i === (discarder + 1) % 4) {
      options.push(...findChiOptions(discarded, hand, i));
    }
  }
  return options;
}

export function sortClaimsByPriority(
  options: readonly ClaimOption[], discarder: number,
): readonly ClaimOption[] {
  return [...options].sort((a, b) => {
    // Ron > pon/kan > chi
    if (a.type === 'ron' && b.type !== 'ron') return -1;
    if (a.type !== 'ron' && b.type === 'ron') return 1;

    // Pon/kan > chi (even across different players)
    const aStrong = a.type === 'pon' || a.type === 'daiminkan';
    const bStrong = b.type === 'pon' || b.type === 'daiminkan';
    if (aStrong && !bStrong) return -1;
    if (!aStrong && bStrong) return 1;

    // Within same type group: turn order (closer to discarder first)
    const turnOrder = [1, 2, 3];
    const aOrder = turnOrder.indexOf((a.player - discarder + 4) % 4);
    const bOrder = turnOrder.indexOf((b.player - discarder + 4) % 4);
    return aOrder - bOrder;
  });
}


export function processAiTurn(state: GameState): { state: GameState; action: GameAction | null } {
  if (state.phase === 'claiming') {
    if (state.claimOptions.some(c => c.player === 0)) {
      return { state, action: null };
    }
    const aiClaims = state.claimOptions.filter(c => c.player !== 0);
    if (aiClaims.length > 0) {
      const claim = aiClaims[0]!;
      if (claim.type === 'ron') return { state, action: { type: 'RON', winner: claim.player } };
      if (claim.type === 'chi') return { state, action: { type: 'CHI', player: claim.player, optionIndex: 0 } };
      if (claim.type === 'pon') return { state, action: { type: 'PON', player: claim.player } };
      if (claim.type === 'daiminkan') return { state, action: { type: 'DAIMINKAN', player: claim.player } };
    }
    return { state, action: { type: 'PASS_CLAIM' } };
  }
  const player = state.players[state.currentPlayer];

  const totalTiles = turnTileCount(player);

  if (totalTiles <= 13) {
    return { state, action: { type: 'DRAW', player: state.currentPlayer } };
  }

  if (totalTiles === 14 && player.hand.length > 0) {
    if (isWinningHand(tilesToCounts(allPlayerTiles(player)))) {
      return { state, action: { type: 'TSUMO', player: state.currentPlayer } };
    }

    const discard = player.riichi && state.lastDrawnTile
      ? state.lastDrawnTile
      : aiChooseDiscard(player.hand, state.players.map(p => p.discards), state.players.map(p => p.riichi));
    const testHand = removeOneTile(player.hand, discard);

    if (!player.riichi && findTenpaiTiles(testHand).length > 0 && player.points >= 1000) {
      return { state, action: { type: 'DECLARE_RIICHI', player: state.currentPlayer, discardTile: discard } };
    }
    return { state, action: { type: 'DISCARD', player: state.currentPlayer, tile: discard } };
  }

  if (player.hand.length > 0) {
    const discard = aiChooseDiscard(player.hand, state.players.map(p => p.discards), state.players.map(p => p.riichi));
    return { state, action: { type: 'DISCARD', player: state.currentPlayer, tile: discard } };
  }
  return { state, action: null };
}

// ── Reducer ────────────────────────────────────────────────────────

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'RESTORE':
      return normalizeGameState((action as { type: 'RESTORE'; state: GameState }).state);
    case 'START_GAME': {
      return dealRound(createInitialState(), 0, 1, 0, 0, 'ゲーム開始！ 東1局 あなたが親です');
    }

    case 'NEXT_ROUND': {
      if (state.phase !== 'roundEnded') return state;
      return dealRound(
        state,
        state.dealer,
        state.roundNumber,
        state.honba,
        state.riichiSticks,
        `${roundName(state.roundNumber)}開始`,
      );
    }

    case 'DRAW': {
      if (state.wall.length === 0) {
        // 流局処理: 聴牌確認と点棒移動
        return handleExhaustiveDraw(state);
      }
      const { drawn, remaining } = drawFromWall(state.wall, 1);
      const player = state.players[action.player];
      const newHand = sortHand([...player.hand, ...drawn]);
      const updatedPlayer = updPlayer(player, { hand: newHand, temporaryFuriten: false });
      const newPlayers = updatePlayerInTuple(state.players, action.player, updatedPlayer);

      let message = `ツモ: ${formatTile(drawn[0]!)}`;
      if (isWinningHand(tilesToCounts(allPlayerTiles(updatedPlayer)))) {
        message = `ツモ! ${formatTile(drawn[0]!)} をツモりました。和了できます！`;
      }
      return { ...state, players: newPlayers, wall: remaining, lastDrawnTile: drawn[0]!, message };
    }

    case 'DISCARD': {
      const player = state.players[action.player];
      const tileStr = formatTile(action.tile);
      const fixedHand = removeOneTile(player.hand, action.tile);
      const updatedPlayer = updPlayer(player, {
        hand: sortHand(fixedHand), discards: [...player.discards, action.tile],
      });
      const newPlayers = updatePlayerInTuple(state.players, action.player, updatedPlayer);

      // Check claims
      const claims = collectClaims(action.tile, action.player, newPlayers);
      const sorted = sortClaimsByPriority(claims, action.player);

      if (sorted.length > 0) {
        return {
          ...state, players: newPlayers,
          lastDiscard: { tile: action.tile, player: action.player },
          claimOptions: sorted, phase: 'claiming',
          message: `${tileStr} を切りました。`,
        };
      }

      return {
        ...state, players: newPlayers,
        lastDiscard: { tile: action.tile, player: action.player },
        currentPlayer: (action.player + 1) % 4, claimOptions: [],
        message: player.riichi ? `${tileStr} を切りました (リーチ中)` : `${tileStr} を切りました`,
      };
    }

    case 'CHI': {
      const option = state.claimOptions[action.optionIndex];
      if (!option || option.type !== 'chi') return { ...state, message: 'チーできません' };

      const player = state.players[option.player];
      const fromHand = option.tiles.filter(t => !isSameTile(t, option.calledTile));
      let newHand = [...player.hand];
      for (const t of fromHand) { newHand = removeOneTile(newHand, t); }

      // Update claimant: hand + melds
      const claimantUpd = updPlayer(player, {
        hand: sortHand(newHand), melds: [...player.melds, option.meld],
      });
      let newPlayers = updatePlayerInTuple(state.players, option.player, claimantUpd);

      // Remove called tile from the discarder's discards
      if (state.lastDiscard) {
        const dIdx = state.lastDiscard.player;
        const dPlayer = state.players[dIdx];
        const fixedDiscs = removeOneTile(dPlayer.discards, state.lastDiscard.tile);
        newPlayers = updatePlayerInTuple(newPlayers, dIdx, updPlayer(dPlayer, { discards: fixedDiscs }));
      }

      return {
        ...state,
        players: newPlayers,
        currentPlayer: option.player, phase: 'playing', claimOptions: [],
        message: 'チー！',
      };
    }

    case 'PON': {
      const option = state.claimOptions.find(c => isMeldClaimOption(c, 'pon', action.player));
      if (!option) return { ...state, message: 'ポンできません' };

      const player = state.players[option.player];
      const fromHand = option.tiles.slice(0, 2); // [hand1, hand2] 末尾がcalledTile
      let newHand = [...player.hand];
      for (const t of fromHand) { newHand = removeOneTile(newHand, t); }

      const claimantUpd = updPlayer(player, {
        hand: sortHand(newHand), melds: [...player.melds, option.meld],
      });
      let newPlayers = updatePlayerInTuple(state.players, option.player, claimantUpd);

      // Remove called tile from the discarder's discards
      if (state.lastDiscard) {
        const dIdx = state.lastDiscard.player;
        const dPlayer = state.players[dIdx];
        const fixedDiscs = removeOneTile(dPlayer.discards, state.lastDiscard.tile);
        newPlayers = updatePlayerInTuple(newPlayers, dIdx, updPlayer(dPlayer, { discards: fixedDiscs }));
      }

      return {
        ...state,
        players: newPlayers,
        currentPlayer: option.player, phase: 'playing', claimOptions: [],
        message: `ポン！ ${formatTile(option.calledTile)}`,
      };
    }
    case 'DAIMINKAN': {
      const option = state.claimOptions.find(c => isMeldClaimOption(c, 'daiminkan', action.player));
      if (!option) return { ...state, message: 'カンできません' };
      const player = state.players[option.player];
      const fromHand = option.tiles.slice(0, 3); // [hand1, hand2, hand3] 末尾がcalledTile
      let newHand = [...player.hand];
      for (const t of fromHand) { newHand = removeOneTile(newHand, t); }

      const claimantUpd = updPlayer(player, {
        hand: sortHand(newHand), melds: [...player.melds, option.meld],
      });
      let newPlayers = updatePlayerInTuple(state.players, option.player, claimantUpd);

      // Remove called tile from the discarder's discards
      if (state.lastDiscard) {
        const dIdx = state.lastDiscard.player;
        const dPlayer = state.players[dIdx];
        const fixedDiscs = removeOneTile(dPlayer.discards, state.lastDiscard.tile);
        newPlayers = updatePlayerInTuple(newPlayers, dIdx, updPlayer(dPlayer, { discards: fixedDiscs }));
      }

      return {
        ...state,
        players: newPlayers,
        currentPlayer: option.player, phase: 'playing', claimOptions: [],
        message: `カン！ ${formatTile(option.calledTile)}`,
      };
    }

    case 'PASS_CLAIM': {
      const discarder = state.lastDiscard?.player;
      if (discarder === undefined) return state;
      const missedRonPlayers = new Set(state.claimOptions.filter(c => c.type === 'ron').map(c => c.player));
      const players = state.players.map((player, i) => (
        missedRonPlayers.has(i)
          ? updPlayer(player, player.riichi ? { riichiFuriten: true } : { temporaryFuriten: true })
          : player
      )) as unknown as [PlayerData, PlayerData, PlayerData, PlayerData];
      return {
        ...state, players, phase: 'playing', claimOptions: [],
        currentPlayer: (discarder + 1) % 4,
        message: '鳴きません',
      };
    }

    case 'DECLARE_RIICHI': {
      const player = state.players[action.player];
      if (player.points < 1000) {
        return { ...state, message: 'リーチできません (持ち点が1000点未満)' };
      }
      const testHand = removeOneTile(player.hand, action.discardTile);
      const tenpai = findTenpaiTiles(testHand);
      if (tenpai.length === 0) {
        return { ...state, message: 'リーチできません (テンパイしていません)' };
      }
      const tenpaiStr = tenpai.map(i => formatTile(indexToTile(i))).join(', ');
      return {
        ...state,
        players: updatePlayerInTuple(state.players, action.player, updPlayer(player, {
          hand: sortHand(testHand), discards: [...player.discards, action.discardTile],
          riichi: true, points: player.points - 1000,
        })),
        riichiSticks: state.riichiSticks + 1,
        lastDiscard: { tile: action.discardTile, player: action.player },
        currentPlayer: (action.player + 1) % 4,
        message: `リーチ! 待ち: ${tenpaiStr}`,
      };
    }

    case 'RON': {
      if (!state.lastDiscard) return { ...state, message: 'ロンできません' };
      if (!isWinningHand(tilesToCounts([...allPlayerTiles(state.players[action.winner]), state.lastDiscard.tile]))) {
        return { ...state, message: 'ロンできません (和了形ではありません)' };
      }
      const winner = action.winner;
      const score = fullScore({
        closedTiles: state.players[winner].hand,
        melds: state.players[winner].melds,
        winTile: state.lastDiscard.tile,
        isTsumo: false,
        roundWind: state.roundWind,
        playerSeat: winner,
        dealer: state.dealer,
        isRiichi: state.players[winner].riichi,
        riichiSticks: state.riichiSticks,
        honba: state.honba,
        ...doraParams(state),
        isDoubleRiichi: false,
        isIppatsu: false,
        isHaitei: false,
        isHoutei: false,
        isRinshan: false,
        isChankan: false,
      });
      if (!score) {
        return { ...state, message: 'スコア計算できません' };
      }
      const players1 = applyRonPayment(
        state.players,
        winner,
        state.lastDiscard.player,
        score,
        state.riichiSticks,
      );
      const yakuStr = score.yaku.map(y => y.name).join('・');
      return finishRound(
        state,
        players1,
        winner,
        false,
        winner === state.dealer,
        score,
        `${winner === 0 ? 'あなた' : `プレイヤー${winner + 1}`}がロン! ${score.fu}符${score.han}飜 ${score.score}点 (${yakuStr})`,
      );
    }

    case 'TSUMO': {
      if (!isWinningHand(tilesToCounts(allPlayerTiles(state.players[action.player])))) {
        return { ...state, message: 'ツモ和了できません' };
      }
      const player = action.player;
      const winTile = state.lastDrawnTile ?? state.players[player].hand[state.players[player].hand.length - 1]!;
      const score = fullScore({
        closedTiles: closedTilesForTsumo(state.players[player].hand, winTile),
        melds: state.players[player].melds,
        winTile,
        isTsumo: true,
        roundWind: state.roundWind,
        playerSeat: player,
        dealer: state.dealer,
        isRiichi: state.players[player].riichi,
        riichiSticks: state.riichiSticks,
        honba: state.honba,
        ...doraParams(state),
        isDoubleRiichi: false,
        isIppatsu: false,
        isHaitei: false,
        isHoutei: false,
        isRinshan: false,
        isChankan: false,
      });
      if (!score) {
        return { ...state, message: 'スコア計算できません' };
      }
      const updatedTsPlayers = applyTsumoPayment(state.players, player, score);
      const yakuStr = score.yaku.map(y => y.name).join('・');
      return finishRound(
        state,
        updatedTsPlayers,
        player,
        false,
        player === state.dealer,
        score,
        `${player === 0 ? 'あなた' : `プレイヤー${player + 1}`}がツモ和了! ${score.fu}符${score.han}飜 ${score.score}点 (${yakuStr})`,
      );
    }

    case 'END_ROUND':
      return finishRound(state, state.players, null, true, false, null, action.message ?? '局終了');

    default:
      return state;
  }
}

// ── Tuple helpers ─────────────────────────────────────────────────

function updatePlayerInTuple(
  players: readonly [PlayerData, PlayerData, PlayerData, PlayerData],
  index: number, updated: PlayerData,
): [PlayerData, PlayerData, PlayerData, PlayerData] {
  return [
    index === 0 ? updated : players[0],
    index === 1 ? updated : players[1],
    index === 2 ? updated : players[2],
    index === 3 ? updated : players[3],
  ];
}

// ── Initial state ──────────────────────────────────────────────────

export function createInitialState(): GameState {
  return {
    players: [
      makePlayer(Wind.Ton, 25000), makePlayer(Wind.Nan, 25000),
      makePlayer(Wind.Sha, 25000), makePlayer(Wind.Pei, 25000),
    ] as unknown as [PlayerData, PlayerData, PlayerData, PlayerData],
    wall: [],
    deadWall: { tiles: [], doraCount: 0 },
    roundWind: 0, roundNumber: 1, dealer: 0, honba: 0, riichiSticks: 0,
    currentPlayer: 0, lastDiscard: null, winner: null,
    lastScoreResult: null,
    lastDrawnTile: null,
    finalRanking: null,
    phase: 'playing', claimOptions: [],
    message: '',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizePlayer(value: unknown, fallback: PlayerData): PlayerData {
  if (!isRecord(value)) return fallback;
  return {
    hand: Array.isArray(value.hand) ? value.hand as Tile[] : fallback.hand,
    melds: Array.isArray(value.melds) ? value.melds as Meld[] : fallback.melds,
    discards: Array.isArray(value.discards) ? value.discards as Tile[] : fallback.discards,
    riichi: typeof value.riichi === 'boolean' ? value.riichi : fallback.riichi,
    temporaryFuriten: typeof value.temporaryFuriten === 'boolean' ? value.temporaryFuriten : fallback.temporaryFuriten,
    riichiFuriten: typeof value.riichiFuriten === 'boolean' ? value.riichiFuriten : fallback.riichiFuriten,
    points: typeof value.points === 'number' ? value.points : fallback.points,
    wind: typeof value.wind === 'number' ? value.wind as Wind : fallback.wind,
  };
}

export function normalizeGameState(value: unknown): GameState {
  const base = createInitialState();
  if (!isRecord(value)) return base;

  const rawPlayers = value.players;
  const players = Array.isArray(rawPlayers) && rawPlayers.length === 4
    ? ([0, 1, 2, 3].map(i => normalizePlayer(rawPlayers[i], base.players[i])) as unknown as [PlayerData, PlayerData, PlayerData, PlayerData])
    : base.players;

  const rawDeadWall = isRecord(value.deadWall) ? value.deadWall : null;

  return {
    ...base,
    ...value,
    players,
    wall: Array.isArray(value.wall) ? value.wall as Tile[] : base.wall,
    deadWall: {
      tiles: rawDeadWall && Array.isArray(rawDeadWall.tiles) ? rawDeadWall.tiles as Tile[] : base.deadWall.tiles,
      doraCount: rawDeadWall && typeof rawDeadWall.doraCount === 'number' ? rawDeadWall.doraCount : base.deadWall.doraCount,
    },
    roundWind: typeof value.roundWind === 'number' ? value.roundWind : base.roundWind,
    roundNumber: typeof value.roundNumber === 'number' ? value.roundNumber : base.roundNumber,
    dealer: typeof value.dealer === 'number' ? value.dealer : base.dealer,
    honba: typeof value.honba === 'number' ? value.honba : base.honba,
    riichiSticks: typeof value.riichiSticks === 'number' ? value.riichiSticks : base.riichiSticks,
    currentPlayer: typeof value.currentPlayer === 'number' ? value.currentPlayer : base.currentPlayer,
    lastDiscard: isRecord(value.lastDiscard) ? value.lastDiscard as GameState['lastDiscard'] : null,
    winner: typeof value.winner === 'number' ? value.winner : null,
    phase: value.phase === 'playing' || value.phase === 'claiming' || value.phase === 'roundEnded' || value.phase === 'ended'
      ? value.phase
      : base.phase,
    claimOptions: Array.isArray(value.claimOptions) ? value.claimOptions as ClaimOption[] : base.claimOptions,
    lastDrawnTile: isRecord(value.lastDrawnTile) ? value.lastDrawnTile as Tile : null,
    lastScoreResult: isRecord(value.lastScoreResult) ? value.lastScoreResult as unknown as ScoreResult : null,
    finalRanking: Array.isArray(value.finalRanking) ? value.finalRanking as number[] : null,
    message: typeof value.message === 'string' ? value.message : base.message,
  };
}
