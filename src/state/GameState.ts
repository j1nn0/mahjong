import { type Tile, type Meld, Wind, Suit } from '../game/types.js';
import { buildWall, drawFromWall, sortHand, formatTile } from '../game/tiles.js';
import { tilesToCounts, isWinningHand, findTenpaiTiles, tileToIndex, indexToTile } from '../game/agari.js';

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
  phase: 'playing' | 'ended';
  message: string;
}

// ── Actions ────────────────────────────────────────────────────────

export type GameAction =
  | { type: 'START_GAME' }
  | { type: 'DRAW'; player: number }
  | { type: 'DISCARD'; player: number; tile: Tile }
  | { type: 'DECLARE_RIICHI'; player: number; discardTile: Tile }
  | { type: 'RON'; winner: number }
  | { type: 'TSUMO'; player: number }
  | { type: 'END_ROUND'; message?: string };

// ── Helpers ────────────────────────────────────────────────────────

function isSameTile(a: Tile, b: Tile): boolean {
  return a.suit === b.suit && a.value === b.value && (a.red ?? false) === (b.red ?? false);
}
// ── Helpers ────────────────────────────────────────────────────────

function makePlayer(wind: number, points: number): PlayerData {
  return {
    hand: [],
    melds: [],
    discards: [],
    riichi: false,
    points,
    wind: wind as Wind,
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

// ── AI: simple discard strategy ────────────────────────────────────

function aiChooseDiscard(hand: readonly Tile[]): Tile {
  const sorted = sortHand([...hand]);

  const counts = new Map<string, number>();
  for (const t of sorted) {
    const key = `${t.suit}:${t.value}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  function isolationScore(tile: Tile): number {
    const key = `${tile.suit}:${tile.value}`;
    const count = counts.get(key) ?? 0;
    if (count >= 2) return 50;

    if (tile.suit === Suit.Wind || tile.suit === Suit.Dragon) {
      return 0;
    }

    const idx = tileToIndex(tile);
    let score = 10;
    if (idx % 9 > 0 && sorted.some(t => tileToIndex(t) === idx - 1)) score += 15;
    if (idx % 9 < 8 && sorted.some(t => tileToIndex(t) === idx + 1)) score += 15;
    if (idx % 9 > 1 && sorted.some(t => tileToIndex(t) === idx - 2)) score += 5;
    if (idx % 9 < 7 && sorted.some(t => tileToIndex(t) === idx + 2)) score += 5;

    return score;
  }

  let worst = sorted[0]!;
  let worstScore = isolationScore(worst);
  for (const t of sorted.slice(1)) {
    const s = isolationScore(t);
    if (s < worstScore) {
      worst = t;
      worstScore = s;
    }
  }
  return worst;
}

/** AIの手番を自動処理する。新しいGameStateと、AIが行ったアクションを返す */
export function processAiTurn(state: GameState): { state: GameState; action: GameAction | null } {
  const player = state.players[state.currentPlayer];
  const hand = player.hand;

  // AI draws if they have 13 tiles (not 14). The DRAW reducer adds one tile.
  if (hand.length === 13) {
    const drawAction: GameAction = { type: 'DRAW', player: state.currentPlayer };
    let afterDraw = gameReducer(state, drawAction);

    const p = afterDraw.players[state.currentPlayer];
    // Check tsumo
    if (isWinningHand(tilesToCounts(p.hand))) {
      return { state: afterDraw, action: { type: 'TSUMO', player: state.currentPlayer } };
    }

    // Decide on riichi
    const discard = aiChooseDiscard(p.hand);
    const testHand = removeOneTile(p.hand, discard);
    if (!p.riichi && findTenpaiTiles(testHand).length > 0 && p.points >= 1000) {
      return { state: afterDraw, action: { type: 'DECLARE_RIICHI', player: state.currentPlayer, discardTile: discard } };
    }

    return { state: afterDraw, action: { type: 'DISCARD', player: state.currentPlayer, tile: discard } };
  }

  return { state, action: null };
}

// ── Reducer ────────────────────────────────────────────────────────

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_GAME': {
      const wallData = buildWall();

      const p0 = makePlayer(Wind.Ton, 25000);
      const p1 = makePlayer(Wind.Nan, 25000);
      const p2 = makePlayer(Wind.Sha, 25000);
      const p3 = makePlayer(Wind.Pei, 25000);

      const { drawn: dealerHand, remaining: afterDealer } = drawFromWall(wallData.wall, 14);
      let wallRemaining = afterDealer;

      const players0: PlayerData = { ...p0, hand: sortHand([...dealerHand]) };
      let players = [players0, p1, p2, p3];

      for (let i = 1; i < 4; i++) {
        const { drawn, remaining } = drawFromWall(wallRemaining, 13);
        players[i] = { ...players[i]!, hand: [...drawn] };
        wallRemaining = remaining;
      }

      return {
        players: [
          { ...players[0]!, hand: sortHand([...players[0]!.hand]) },
          { ...players[1]!, hand: sortHand([...players[1]!.hand]) },
          { ...players[2]!, hand: sortHand([...players[2]!.hand]) },
          { ...players[3]!, hand: sortHand([...players[3]!.hand]) },
        ] as unknown as [PlayerData, PlayerData, PlayerData, PlayerData],
        wall: wallRemaining,
        deadWall: { tiles: wallData.deadWall, doraCount: 1 },
        roundWind: 0,
        honba: 0,
        riichiSticks: 0,
        currentPlayer: 0,
        lastDiscard: null,
        winner: null,
        phase: 'playing',
        message: 'ゲーム開始！ 東1局 あなたが親です',
      };
    }

    case 'DRAW': {
      if (state.wall.length === 0) {
        return { ...state, phase: 'ended', message: '流局: 牌山がなくなりました' };
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

      return {
        ...state,
        players: newPlayers,
        wall: remaining,
        message,
      };
    }

    case 'DISCARD': {
      const player = state.players[action.player];
      const tileStr = formatTile(action.tile);
      const fixedHand = removeOneTile(player.hand, action.tile);

      const updatedPlayer = updPlayer(player, {
        hand: sortHand(fixedHand),
        discards: [...player.discards, action.tile],
      });
      const newPlayers = updatePlayerInTuple(state.players, action.player, updatedPlayer);

      // Check ron for players in riichi
      for (let i = 0; i < 4; i++) {
        if (i === action.player) continue;
        const target = newPlayers[i];
        if (target.riichi) {
          const testHand = [...target.hand, action.tile];
          if (isWinningHand(tilesToCounts(testHand))) {
            return {
              ...state,
              players: newPlayers,
              lastDiscard: { tile: action.tile, player: action.player },
              winner: i,
              phase: 'ended',
              message: `${i === 0 ? 'あなた' : `プレイヤー${i + 1}`}がロン! ${tileStr}`,
            };
          }
        }
      }

      const nextPlayer = (action.player + 1) % 4;
      return {
        ...state,
        players: newPlayers,
        lastDiscard: { tile: action.tile, player: action.player },
        currentPlayer: nextPlayer,
        message: player.riichi
          ? `${tileStr} を切りました (リーチ中)`
          : `${tileStr} を切りました`,
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

      const updatedPlayer = updPlayer(player, {
        hand: sortHand(testHand),
        discards: [...player.discards, action.discardTile],
        riichi: true,
        points: player.points - 1000,
      });
      const newPlayers = updatePlayerInTuple(state.players, action.player, updatedPlayer);

      return {
        ...state,
        players: newPlayers,
        riichiSticks: state.riichiSticks + 1,
        lastDiscard: { tile: action.discardTile, player: action.player },
        currentPlayer: (action.player + 1) % 4,
        message: `リーチ! 待ち: ${tenpaiStr}`,
      };
    }

    case 'RON': {
      if (!state.lastDiscard) {
        return { ...state, message: 'ロンできません (捨て牌がありません)' };
      }
      const winner = state.players[action.winner];
      const testHand = [...winner.hand, state.lastDiscard.tile];
      if (!isWinningHand(tilesToCounts(testHand))) {
        return { ...state, message: 'ロンできません (和了形ではありません)' };
      }
      return {
        ...state,
        winner: action.winner,
        phase: 'ended',
        message: `${action.winner === 0 ? 'あなた' : `プレイヤー${action.winner + 1}`}がロン!`,
      };
    }

    case 'TSUMO': {
      const player = state.players[action.player];
      if (!isWinningHand(tilesToCounts(player.hand))) {
        return { ...state, message: 'ツモ和了できません (和了形ではありません)' };
      }
      return {
        ...state,
        winner: action.player,
        phase: 'ended',
        message: `${action.player === 0 ? 'あなた' : `プレイヤー${action.player + 1}`}がツモ和了!`,
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
  index: number,
  updated: PlayerData,
): [PlayerData, PlayerData, PlayerData, PlayerData] {
  const result: [PlayerData, PlayerData, PlayerData, PlayerData] = [
    index === 0 ? updated : players[0],
    index === 1 ? updated : players[1],
    index === 2 ? updated : players[2],
    index === 3 ? updated : players[3],
  ];
  return result;
}

// ── Initial state ──────────────────────────────────────────────────

export function createInitialState(): GameState {
  return {
    players: [
      makePlayer(Wind.Ton, 25000),
      makePlayer(Wind.Nan, 25000),
      makePlayer(Wind.Sha, 25000),
      makePlayer(Wind.Pei, 25000),
    ] as unknown as [PlayerData, PlayerData, PlayerData, PlayerData],
    wall: [],
    deadWall: { tiles: [], doraCount: 1 },
    roundWind: 0,
    honba: 0,
    riichiSticks: 0,
    currentPlayer: 0,
    lastDiscard: null,
    winner: null,
    phase: 'playing',
    message: '',
  };
}
