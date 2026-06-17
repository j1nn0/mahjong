import { type Tile, type Meld, MeldType, Wind, Suit } from '../game/types.js';
import { buildWall, drawFromWall, sortHand, formatTile, getDoraIndicators, getUraDoraIndicators } from '../game/tiles.js';
import { tilesToCounts, isWinningHand, findTenpaiTiles, indexToTile } from '../game/agari.js';
import { fullScore, type ScoreResult } from '../game/scoring.js';
import { aiChooseDiscard } from '../game/ai.js';

// ── Types ─────────────────────────────────────────────────────────

export interface PlayerData {
  hand: readonly Tile[];
  melds: readonly Meld[];
  discards: readonly Tile[];
  riichi: boolean;
  points: number;
  wind: Wind;
}

export interface DeadWallState {
  tiles: readonly Tile[];
  doraCount: number;
}

export interface ClaimOption {
  type: 'chi' | 'pon' | 'daiminkan';
  player: number;
  tiles: readonly Tile[];
  calledTile: Tile;
  meld: Meld;
  display: string;
}

export interface GameState {
  players: readonly [PlayerData, PlayerData, PlayerData, PlayerData];
  wall: readonly Tile[];
  deadWall: DeadWallState;
  roundWind: number;
  honba: number;
  riichiSticks: number;
  currentPlayer: number;
  lastDiscard: { readonly tile: Tile; readonly player: number } | null;
  winner: number | null;
  phase: 'playing' | 'claiming' | 'ended';
  claimOptions: readonly ClaimOption[];
  /** 直近の和了スコア (表示用) */
  /** 最後にツモった牌 (表示用、TSUMO時のwinTile特定用) */
  lastDrawnTile: Tile | null;
  lastScoreResult: ScoreResult | null;
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
  | { type: 'RESTORE'; state: GameState };

// ── Helpers ────────────────────────────────────────────────────────

function isSameTile(a: Tile, b: Tile): boolean {
  return a.suit === b.suit && a.value === b.value && (a.red ?? false) === (b.red ?? false);
}

function makePlayer(wind: number, points: number): PlayerData {
  return {
    hand: [], melds: [], discards: [],
    riichi: false, points, wind: wind as Wind,
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

/** 現在のstateからドラパラメータを抽出 */
const doraParams = (state: GameState) => ({
  doraIndicators: getDoraIndicators(state.deadWall.tiles, state.deadWall.doraCount),
  uraDoraIndicators: getUraDoraIndicators(state.deadWall.tiles, state.deadWall.doraCount),
});
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

  // 3000点ルール: 不聴者→聴牌者への支払い
  // 不聴の親(0)は1500×(聴牌人数)、子は1000×(聴牌人数)をプールに支払い
  // プールを聴牌者で均等分割
  if (tenpaiList.length > 0 && notenList.length > 0) {
    let pool = 0;
    for (const n of notenList) {
      const payment = (n === 0 ? 1500 : 1000) * tenpaiList.length;
      pool += payment;
      newPlayers[n] = updPlayer(newPlayers[n], {
        points: newPlayers[n].points - payment,
      });
    }
    const perTenpai = Math.floor(pool / tenpaiList.length / 100) * 100;
    for (const t of tenpaiList) {
      newPlayers[t] = updPlayer(newPlayers[t], {
        points: newPlayers[t].points + perTenpai,
      });
    }
  }

  const tenpaiStr = tenpaiList.map(i => `${i === 0 ? 'あなた' : `P${i + 1}`}`).join('・');
  const notenStr = notenList.map(i => `${i === 0 ? 'あなた' : `P${i + 1}`}`).join('・');
  const detail = tenpaiList.length > 0
    ? `聴牌: ${tenpaiStr}  不聴: ${notenStr || 'なし'}`
    : '全員不聴';

  return {
    ...state,
    players: newPlayers,
    phase: 'ended',
    message: `流局: ${detail}`,
  };
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
    const aiClaims = state.claimOptions.filter(c => c.player !== 0);
    if (aiClaims.length > 0) {
      const claim = aiClaims[0]!;
      if (claim.type === 'chi') return { state, action: { type: 'CHI', player: claim.player, optionIndex: 0 } };
      if (claim.type === 'pon') return { state, action: { type: 'PON', player: claim.player } };
      if (claim.type === 'daiminkan') return { state, action: { type: 'DAIMINKAN', player: claim.player } };
    }
    return { state, action: { type: 'PASS_CLAIM' } };
  }
  const player = state.players[state.currentPlayer];

  // Always draw before discarding: normal (13) and post-claim (<13)
  if (player.hand.length > 0 && player.hand.length <= 13) {
    const afterDraw = gameReducer(state, { type: 'DRAW', player: state.currentPlayer });
    if (afterDraw.phase === 'ended') {
      return { state: afterDraw, action: null };
    }
    const p = afterDraw.players[state.currentPlayer];

    const opponentDiscards = afterDraw.players.map(p => p.discards);
    const opponentRiichi = afterDraw.players.map(p => p.riichi);

    // Tsumo check: only for 13-hand normal turns
    if (player.hand.length === 13 && isWinningHand(tilesToCounts(p.hand))) {
      return { state: afterDraw, action: { type: 'TSUMO', player: state.currentPlayer } };
    }

    const discard = aiChooseDiscard(p.hand, opponentDiscards, opponentRiichi);
    const testHand = removeOneTile(p.hand, discard);

    // Riichi: only for 13-hand closed turns
    if (player.hand.length === 13 && !p.riichi && findTenpaiTiles(testHand).length > 0 && p.points >= 1000) {
      return { state: afterDraw, action: { type: 'DECLARE_RIICHI', player: state.currentPlayer, discardTile: discard } };
    }
    return { state: afterDraw, action: { type: 'DISCARD', player: state.currentPlayer, tile: discard } };
  }
  return { state, action: null };
}

// ── Reducer ────────────────────────────────────────────────────────

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'RESTORE':
      return (action as { type: 'RESTORE'; state: GameState }).state;
    case 'START_GAME': {
      const wallData = buildWall();
      const p0 = makePlayer(Wind.Ton, 25000);
      const p1 = makePlayer(Wind.Nan, 25000);
      const p2 = makePlayer(Wind.Sha, 25000);
      const p3 = makePlayer(Wind.Pei, 25000);

      const { drawn: dealerHand, remaining: afterDealer } = drawFromWall(wallData.wall, 14);
      let wallRemaining = afterDealer;
      p0.hand = sortHand([...dealerHand]);

      for (let i = 1; i < 4; i++) {
        const { drawn, remaining } = drawFromWall(wallRemaining, 13);
        [p0, p1, p2, p3][i]!.hand = [...drawn];
        wallRemaining = remaining;
      }

      return {
        players: [
          { ...p0, hand: sortHand([...p0.hand]) },
          { ...p1, hand: sortHand([...p1.hand]) },
          { ...p2, hand: sortHand([...p2.hand]) },
          { ...p3, hand: sortHand([...p3.hand]) },
        ] as unknown as [PlayerData, PlayerData, PlayerData, PlayerData],
        wall: wallRemaining,
        deadWall: { tiles: wallData.deadWall, doraCount: 1 },
        roundWind: 0, honba: 0, riichiSticks: 0,
        lastDrawnTile: null,
        currentPlayer: 0, lastDiscard: null, winner: null,
        lastScoreResult: null,
        phase: 'playing', claimOptions: [],
        message: 'ゲーム開始！ 東1局 あなたが親です',
      };
    }

    case 'DRAW': {
      if (state.wall.length === 0) {
        // 流局処理: 聴牌確認と点棒移動
        return handleExhaustiveDraw(state);
      }
      const { drawn, remaining } = drawFromWall(state.wall, 1);
      const player = state.players[action.player];
      const newHand = sortHand([...player.hand, ...drawn]);
      const updatedPlayer = updPlayer(player, { hand: newHand });
      const newPlayers = updatePlayerInTuple(state.players, action.player, updatedPlayer);

      let message = `ツモ: ${formatTile(drawn[0]!)}`;
      if (isWinningHand(tilesToCounts(newHand))) {
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

      // Check ron (players in riichi)
      for (let i = 0; i < 4; i++) {
        if (i === action.player) continue;
        if (newPlayers[i].riichi) {
          const testHand = [...newPlayers[i].hand, action.tile];
          if (isWinningHand(tilesToCounts(testHand))) {
          const winner = i;
          const loser = action.player;
          const score = fullScore({
            closedTiles: newPlayers[winner].hand,
            melds: newPlayers[winner].melds,
            winTile: action.tile,
            isTsumo: false,
            roundWind: state.roundWind,
            playerSeat: winner,
            isRiichi: true,
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
            return {
              ...state, players: newPlayers,
              lastDiscard: { tile: action.tile, player: action.player },
              winner, phase: 'ended', claimOptions: [],
              message: `${winner === 0 ? 'あなた' : `プレイヤー${winner + 1}`}がロン!`,
            };
          }
          // Apply points
          const updatedPaymentPlayers = updatePlayerInTuple(
            newPlayers, loser,
            updPlayer(newPlayers[loser], {
              points: newPlayers[loser].points - score.score,
            }),
          );
          const finalPlayers = updatePlayerInTuple(
            updatedPaymentPlayers, winner,
            updPlayer(updatedPaymentPlayers[winner], {
              points: updatedPaymentPlayers[winner].points + score.score,
            }),
          );
          const yakuStr = score.yaku.map(y => y.name).join('・');
          return {
            ...state, players: finalPlayers,
            lastDiscard: { tile: action.tile, player: action.player },
            lastScoreResult: score,
            winner, phase: 'ended', claimOptions: [],
            message: `${winner === 0 ? 'あなた' : `プレイヤー${winner + 1}`}がロン! ${score.fu}符${score.han}飜 ${score.score}点 (${yakuStr})`,
          };
          }
        }
      }

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
      const option = state.claimOptions.find(c => c.type === 'pon');
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
      const option = state.claimOptions.find(c => c.type === 'daiminkan');
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
      return {
        ...state, phase: 'playing', claimOptions: [],
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
      if (!isWinningHand(tilesToCounts([...state.players[action.winner].hand, state.lastDiscard.tile]))) {
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
      const players1 = updatePlayerInTuple(state.players, winner, updPlayer(state.players[winner], {
        points: state.players[winner].points + score.score - (state.players[winner].riichi ? 0 : 0),
      }));
      // Deduct from discarder (simplified: ron = discarder pays full amount)
      // But for simplicity, we're not subtracting from all players
      const yakuStr = score.yaku.map(y => y.name).join('・');
      return {
        ...state, players: players1,
        lastScoreResult: score,
        winner, phase: 'ended', claimOptions: [],
        message: `${winner === 0 ? 'あなた' : `プレイヤー${winner + 1}`}がロン! ${score.fu}符${score.han}飜 ${score.score}点 (${yakuStr})`,
      };
    }

    case 'TSUMO': {
      if (!isWinningHand(tilesToCounts(state.players[action.player].hand))) {
        return { ...state, message: 'ツモ和了できません' };
      }
      const player = action.player;
      const score = fullScore({
        closedTiles: state.players[player].hand,
        melds: state.players[player].melds,
        winTile: state.lastDrawnTile ?? state.players[player].hand[0]!,
        isTsumo: true,
        roundWind: state.roundWind,
        playerSeat: player,
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
      // Tsumo: all other players pay
      const updatedTsPlayers = state.players.map((p, i) => {
        const payment = score.payment.from.find(f => f.player === i);
        return i === player
          ? updPlayer(p, { points: p.points + score.score })
          : updPlayer(p, { points: p.points - (payment?.amount ?? 0) });
      }) as unknown as [PlayerData, PlayerData, PlayerData, PlayerData];
      const yakuStr = score.yaku.map(y => y.name).join('・');
      return {
        ...state,
        players: updatedTsPlayers,
        lastScoreResult: score,
        winner: player, phase: 'ended', claimOptions: [],
        message: `${player === 0 ? 'あなた' : `プレイヤー${player + 1}`}がツモ和了! ${score.fu}符${score.han}飜 ${score.score}点 (${yakuStr})`,
      };
    }

    case 'END_ROUND':
      return { ...state, phase: 'ended', message: action.message ?? '局終了' };

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
    roundWind: 0, honba: 0, riichiSticks: 0,
    currentPlayer: 0, lastDiscard: null, winner: null,
    lastScoreResult: null,
    lastDrawnTile: null,
    phase: 'playing', claimOptions: [],
    message: '',
  };
}
