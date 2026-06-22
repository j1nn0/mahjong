import {
  type Tile,
  type Meld,
  type Discard,
  MeldType,
  Wind,
  Suit,
  PlayerWind,
} from "../game/types.js";
import { buildWall, drawFromWall, sortHand } from "../game/tiles.js";
import { findTenpaiTiles, indexToTile, tileToIndex } from "../game/agari.js";
import { fullScore, type ScoreResult } from "../game/scoring.js";
import { aiChooseDiscard } from "../game/ai.js";
import type {
  PlayerData,
  GameState,
  GameAction,
  ClaimOption,
  MeldClaimOption,
  RoundHistoryItem,
} from "./types.js";
import {
  isCompleteHand,
  doraParams,
  applyTsumoPayment,
  finishRound,
  canScoreTsumo,
  ronScore,
} from "./finishRound.js";
import { chiKuikaeProhibitedTiles } from "./claimPhase.js";

// ── Re-exports (preserve existing import paths) ────────────────────

// Types
export type {
  PlayerData,
  DeadWallState,
  ClaimOption,
  RonClaimOption,
  MeldClaimOption,
  AbortiveDrawReason,
  RoundHistoryItem,
  GameState,
  GameAction,
} from "./types.js";

// Finish round functions
export {
  finishRound,
  finishAbortiveDraw,
  handleExhaustiveDraw,
  isCompleteHand,
  canScoreTsumo,
  ronScore,
  ronClaimPlayers,
  applyRonPayment,
  applyDoubleRonPayments,
  applyTsumoPayment,
  applyNagashiManganPayments,
  nagashiManganWinners,
  isSuufonRenda,
  nextPendingAbortiveDrawAfterKan,
  totalKanCount,
  doraParams,
  revealKanDora,
  rankPlayers,
  sortClaimsByPriority,
  closedTilesForTsumo,
} from "./finishRound.js";

// Claim phase functions
export {
  collectClaims,
  clearTemporaryFuritenAndIppatsu,
  isKuikaeProhibited,
  kuikaeMessage,
  chiKuikaeProhibitedTiles,
  detectResponsibility,
  isMeldClaimOption,
  findChiOptions,
  canPonTile,
  canDaiminkanTile,
} from "./claimPhase.js";


/** プレイヤーの副露から責任払い情報を抽出 */
export function getResponsibilityInfo(melds: readonly Meld[]): {
  responsiblePlayer?: number;
  responsibilityType?: 'daisangen' | 'daisuushii';
} {
  for (const meld of melds) {
    if (meld.responsibility && meld.calledFrom !== undefined) {
      return {
        responsiblePlayer: meld.calledFrom,
        responsibilityType: meld.responsibility,
      };
    }
  }
  return {};
}


/** 責任払いメッセージを生成（表示用） */
export function formatResponsibilityMessage(
  responsiblePlayer: number,
  _responsibilityType: 'daisangen' | 'daisuushii',
): string {
  return `責任払い: P${responsiblePlayer + 1}`;
}

// Reducer
export { gameReducer } from "./reducer.js";

// ── Helpers ────────────────────────────────────────────────────────
function isSameTile(a: Tile, b: Tile): boolean {
  return a.suit === b.suit && a.value === b.value && (a.red ?? false) === (b.red ?? false);
}
export { isSameTile };

function isSameTileKind(a: Tile, b: Tile): boolean {
  return a.suit === b.suit && a.value === b.value;
}
export { isSameTileKind };

function makePlayer(wind: number, points: number): PlayerData {
  return {
    hand: [],
    melds: [],
    discards: [] as Discard[],
    riichi: false,
    doubleRiichi: false,
    ippatsu: false,
    temporaryFuriten: false,
    riichiFuriten: false,
    points,
    wind: wind as Wind,
  };
}

function updPlayer(player: PlayerData, overrides: Partial<PlayerData>): PlayerData {
  return { ...player, ...overrides };
}
export { updPlayer };

export function removeDiscardByTile(discards: readonly Discard[], tile: Tile): Discard[] {
  const idx = discards.findIndex((d) => isSameTile(d.tile, tile));
  if (idx === -1) return [...discards];
  return [...discards.slice(0, idx), ...discards.slice(idx + 1)];
}

function removeOneTile(hand: readonly Tile[], tile: Tile): Tile[] {
  const idx = hand.findIndex((t) => isSameTile(t, tile));
  if (idx === -1) return [...hand];
  return [...hand.slice(0, idx), ...hand.slice(idx + 1)];
}
export { removeOneTile };

function removeTileKind(hand: readonly Tile[], tile: Tile, count: number): Tile[] {
  let remaining = count;
  return hand.filter((t) => {
    if (remaining > 0 && isSameTileKind(t, tile)) {
      remaining--;
      return false;
    }
    return true;
  });
}
export { removeTileKind };

function matchingTileKind(hand: readonly Tile[], tile: Tile): Tile[] {
  return hand.filter((t) => isSameTileKind(t, tile));
}
export { matchingTileKind };

function isYaochu(tile: Tile): boolean {
  return (
    tile.suit === Suit.Wind || tile.suit === Suit.Dragon || tile.value === 1 || tile.value === 9
  );
}
export { isYaochu };

function isSimpleTile(tile: Tile): boolean {
  return !isYaochu(tile);
}

function simulateMeldClaim(
  player: PlayerData,
  option: MeldClaimOption,
): { hand: Tile[]; melds: Meld[] } {
  // The called tile comes from the discard; skip one matching tile so we only
  // remove the tiles actually contributed from the claimant's hand.
  let skipCalled = true;
  const tilesToRemove: Tile[] = [];
  for (const tile of option.tiles) {
    if (skipCalled && isSameTileKind(tile, option.calledTile)) {
      skipCalled = false;
      continue;
    }
    tilesToRemove.push(tile);
  }
  let newHand: Tile[] = [...player.hand];
  for (const tile of tilesToRemove) {
    newHand = removeOneTile(newHand, tile);
  }
  return { hand: newHand, melds: [...player.melds, option.meld] };
}

function isMeldTanyaoAiming(option: MeldClaimOption): boolean {
  return option.tiles.every(isSimpleTile);
}

function isMeldTenpaiMaking(simulated: { hand: Tile[]; melds: Meld[] }): boolean {
  return findWaits(simulated.hand, simulated.melds).length > 0;
}

function canDiscardAfterMeldClaim(option: MeldClaimOption, simulated: { hand: Tile[] }): boolean {
  const prohibited =
    option.type === "chi" ? chiKuikaeProhibitedTiles(option) : [option.calledTile];
  return simulated.hand.some(
    (tile) => !prohibited.some((prohibitedTile) => isSameTileKind(prohibitedTile, tile)),
  );
}

function tileKindKey(tile: Tile): string {
  return `${tile.suit}:${tile.value}`;
}
export { tileKindKey };

function emptyCalledDiscardKinds(): readonly (readonly string[])[] {
  return [[], [], [], []];
}
export { emptyCalledDiscardKinds };

export function canDeclareKyuushuKyuuhai(state: GameState, player: number): boolean {
  if (state.phase !== "playing" || state.currentPlayer !== player || state.firstTurnInterrupted)
    return false;
  const playerData = state.players[player];
  if (playerData.discards.length > 0 || turnTileCount(playerData) !== expectedAfterDraw(playerData))
    return false;
  const yaochuKinds = new Set(playerData.hand.filter(isYaochu).map(tileKindKey));
  return yaochuKinds.size >= 9;
}

function turnTileCount(player: PlayerData): number {
  return player.hand.length + player.melds.reduce((sum, meld) => sum + meld.tiles.length, 0);
}
export { turnTileCount };

function canDeclareRiichi(player: PlayerData): boolean {
  return !player.riichi && player.melds.every((meld) => meld.type === MeldType.ClosedKan);
}
export { canDeclareRiichi };

/** 待ち牌の配列を返す (既存の面子を固定して計算) */
export function findWaits(closedTiles: readonly Tile[], melds: readonly Meld[] = []): number[] {
  if (melds.length === 0) {
    return findTenpaiTiles(closedTiles);
  }
  const waits: number[] = [];
  for (let i = 0; i < 34; i++) {
    const tile = indexToTile(i);
    if (isCompleteHand(closedTiles, melds, tile)) {
      waits.push(i);
    }
  }
  return waits;
}

function isFuritenFromOwnDiscards(player: PlayerData): boolean {
  if (player.temporaryFuriten || player.riichiFuriten) return true;
  const waits = new Set(findWaits(player.hand, player.melds));
  if (waits.size === 0) return false;
  return player.discards.some((d) => waits.has(tileToIndex(d.tile)));
}
export { isFuritenFromOwnDiscards };

function playerWind(player: number, dealer: number): Wind {
  return ((player - dealer + 4) % 4) as Wind;
}
export { playerWind };

function roundName(roundNumber: number): string {
  return `東${roundNumber}局`;
}
export { roundName };

/** Count kan melds for a player */
function kanCount(player: PlayerData): number {
  const kanTypes = [MeldType.Kan, MeldType.ClosedKan, MeldType.AddedKan];
  return player.melds.filter((m) => kanTypes.includes(m.type)).length;
}
export { kanCount };

function expectedAfterDiscard(player: PlayerData): number {
  return 13 + kanCount(player);
}

function expectedAfterDraw(player: PlayerData): number {
  return expectedAfterDiscard(player) + 1;
}

// ── Tuple helpers ─────────────────────────────────────────────────

function updatePlayerInTuple(
  players: readonly [PlayerData, PlayerData, PlayerData, PlayerData],
  index: number,
  updated: PlayerData,
): [PlayerData, PlayerData, PlayerData, PlayerData] {
  return [
    index === 0 ? updated : players[0],
    index === 1 ? updated : players[1],
    index === 2 ? updated : players[2],
    index === 3 ? updated : players[3],
  ];
}
export { updatePlayerInTuple };

// ── Deal round ──────────────────────────────────────────────────────

export function dealRound(
  state: GameState,
  dealer: number,
  roundNumber: number,
  honba: number,
  riichiSticks: number,
  message: string,
  random?: () => number,
): GameState {
  const wallData = buildWall(random);
  const players = state.players.map((player, i) => ({
    hand: [],
    melds: [],
    discards: [] as Discard[],
    riichi: false,
    doubleRiichi: false,
    ippatsu: false,
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
  const initialState: GameState = {
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
    phase: "playing",
    claimOptions: [],
    message,
    pendingRinshan: false,
    lastDrawWasRinshan: false,
    lastDiscardWasChankan: false,
    kuikaeProhibitedTiles: [],
    firstTurnInterrupted: false,
    pendingAbortiveDraw: null,
    calledDiscardKinds: emptyCalledDiscardKinds(),
  };

  // Auto-detect Tenhou
  const winTile = dealerHand[13]!;
  const closedTiles = removeOneTile(dealerHand, winTile);
  if (isCompleteHand(closedTiles, [], winTile)) {
    const score = fullScore({
      closedTiles,
      melds: [],
      winTile,
      isTsumo: true,
      roundWind: Wind.Ton,
      playerSeat: dealer,
      dealer: dealer,
      isRiichi: false,
      riichiSticks: riichiSticks,
      honba: honba,
      ...doraParams(initialState),
      isDoubleRiichi: false,
      isIppatsu: false,
      isHaitei: false,
      isHoutei: false,
      isRinshan: false,
      isChankan: false,
      isTenhou: true,
      isChiihou: false,
    });
    if (score) {
      const nextPlayers = applyTsumoPayment(players, dealer, score);
      return finishRound(initialState, nextPlayers, dealer, false, true, score, "天和！");
    }
  }

  return initialState;
}

// ── AI ──────────────────────────────────────────────────────────────

export function processAiTurn(state: GameState): {
  state: GameState;
  action: GameAction | null;
} {
  if (state.phase === "claiming") {
    if (state.claimOptions.some((c) => c.player === 0)) {
      return { state, action: null };
    }
    const aiClaims = state.claimOptions.filter((c) => c.player !== 0);
    const claim = aiClaims.find((c) => {
      if (c.type === "ron") return ronScore(state, c.player) !== null;
      if (c.type === "daiminkan") return true;
      const simulated = simulateMeldClaim(state.players[c.player], c as MeldClaimOption);
      if (!canDiscardAfterMeldClaim(c as MeldClaimOption, simulated)) return false;
      return isMeldTanyaoAiming(c as MeldClaimOption) || isMeldTenpaiMaking(simulated);
    });
    if (claim) {
      if (claim.type === "ron") return { state, action: { type: "RON", winner: claim.player } };
      if (claim.type === "chi") {
        const optionIndex = state.claimOptions.indexOf(claim);
        return { state, action: { type: "CHI", player: claim.player, optionIndex } };
      }
      if (claim.type === "pon") return { state, action: { type: "PON", player: claim.player } };
      if (claim.type === "daiminkan")
        return { state, action: { type: "DAIMINKAN", player: claim.player } };
    }
    return { state, action: { type: "PASS_CLAIM" } };
  }
  const player = state.players[state.currentPlayer];
  const totalTiles = turnTileCount(player);
  // Rinshan draw after a kan
  if (state.pendingRinshan) {
    return { state, action: { type: "DRAW", player: state.currentPlayer } };
  }
  const needDraw = expectedAfterDiscard(player);
  const readyDiscard = expectedAfterDraw(player);
  if (totalTiles <= needDraw) {
    return { state, action: { type: "DRAW", player: state.currentPlayer } };
  }
  if (totalTiles === readyDiscard && player.hand.length > 0) {
    if (canDeclareKyuushuKyuuhai(state, state.currentPlayer)) {
      return { state, action: { type: "DECLARE_KYUUSHU_KYUUHAI", player: state.currentPlayer } };
    }
    const winTile = state.lastDrawnTile ?? player.hand[player.hand.length - 1]!;
    if (canScoreTsumo(state, state.currentPlayer, winTile)) {
      return { state, action: { type: "TSUMO", player: state.currentPlayer } };
    }
    for (const tile of player.hand) {
      if (player.hand.filter((t) => isSameTileKind(t, tile)).length >= 4) {
        if (player.riichi) {
          const currentWaits = findWaits(removeOneTile(player.hand, tile), player.melds);
          const newHand = sortHand(removeTileKind(player.hand, tile, 4));
          const newMeld: Meld = {
            type: MeldType.ClosedKan,
            tiles: player.hand.filter((t) => isSameTileKind(t, tile)),
          };
          const newWaits = findWaits(newHand, [...player.melds, newMeld]);
          if (
            currentWaits.length === newWaits.length &&
            currentWaits.every((cw) => newWaits.includes(cw))
          ) {
            return { state, action: { type: "ANKAN", player: state.currentPlayer, tile } };
          }
        } else {
          return { state, action: { type: "ANKAN", player: state.currentPlayer, tile } };
        }
      }
    }
    if (!player.riichi) {
      for (const tile of player.hand) {
        if (
          player.melds.some(
            (m) => m.type === MeldType.Poon && m.calledTile && isSameTileKind(m.calledTile, tile),
          )
        ) {
          return { state, action: { type: "KAKAN", player: state.currentPlayer, tile } };
        }
      }
    }
    const discard =
      player.riichi && state.lastDrawnTile
        ? state.lastDrawnTile
        : aiChooseDiscard(
            player.hand,
            state.players.map((p) => p.discards.map((d) => d.tile)),
            state.players.map((p) => p.riichi),
            state.kuikaeProhibitedTiles,
            state.players.map((p) => p.melds),
            state.currentPlayer,
          );
    const testHand = removeOneTile(player.hand, discard);
    if (
      canDeclareRiichi(player) &&
      findWaits(testHand, player.melds).length > 0 &&
      player.points >= 1000
    ) {
      return {
        state,
        action: { type: "DECLARE_RIICHI", player: state.currentPlayer, discardTile: discard },
      };
    }
    return { state, action: { type: "DISCARD", player: state.currentPlayer, tile: discard } };
  }
  if (player.hand.length > 0) {
    const discard = aiChooseDiscard(
      player.hand,
      state.players.map((p) => p.discards.map((d) => d.tile)),
      state.players.map((p) => p.riichi),
      state.kuikaeProhibitedTiles,
      state.players.map((p) => p.melds),
      state.currentPlayer,
    );
    return { state, action: { type: "DISCARD", player: state.currentPlayer, tile: discard } };
  }
  return { state, action: null };
}

// ── Initial state ──────────────────────────────────────────────────

export function createInitialState(random?: (() => number) | null): GameState {
  const rng = random ?? Math.random;
  const dealer = Math.floor(rng() * 4);
  return {
    players: [
      makePlayer(playerWind(0, dealer), 25000),
      makePlayer(playerWind(1, dealer), 25000),
      makePlayer(playerWind(2, dealer), 25000),
      makePlayer(playerWind(3, dealer), 25000),
    ] as unknown as [PlayerData, PlayerData, PlayerData, PlayerData],
    wall: [],
    deadWall: { tiles: [], doraCount: 0 },
    roundWind: 0,
    roundNumber: 1,
    dealer,
    honba: 0,
    riichiSticks: 0,
    currentPlayer: dealer,
    lastDiscard: null,
    winner: null,
    lastScoreResult: null,
    lastDrawnTile: null,
    finalRanking: null,
    phase: "playing",
    claimOptions: [],
    message: "",
    pendingRinshan: false,
    lastDrawWasRinshan: false,
    lastDiscardWasChankan: false,
    kuikaeProhibitedTiles: [],
    firstTurnInterrupted: false,
    pendingAbortiveDraw: null,
    calledDiscardKinds: emptyCalledDiscardKinds(),
    pendingKanDora: false,
    roundHistory: [],
  };
}

// ── Normalization ──────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizePlayer(value: unknown, fallback: PlayerData): PlayerData {
  if (!isRecord(value)) return fallback;
  return {
    hand: Array.isArray(value.hand) ? (value.hand as Tile[]) : fallback.hand,
    melds: Array.isArray(value.melds) ? (value.melds as Meld[]) : fallback.melds,
    discards: Array.isArray(value.discards)
      ? (value.discards as unknown[]).map((d): Discard => {
          if (d && typeof d === "object" && "tile" in d) {
            return d as Discard;
          }
          return { tile: d as Tile, isRiichi: false, player: 0 as PlayerWind };
        })
      : fallback.discards,
    riichi: typeof value.riichi === "boolean" ? value.riichi : fallback.riichi,
    doubleRiichi:
      typeof value.doubleRiichi === "boolean" ? value.doubleRiichi : fallback.doubleRiichi,
    ippatsu: typeof value.ippatsu === "boolean" ? value.ippatsu : fallback.ippatsu,
    temporaryFuriten:
      typeof value.temporaryFuriten === "boolean"
        ? value.temporaryFuriten
        : fallback.temporaryFuriten,
    riichiFuriten:
      typeof value.riichiFuriten === "boolean" ? value.riichiFuriten : fallback.riichiFuriten,
    points: typeof value.points === "number" ? value.points : fallback.points,
    wind: typeof value.wind === "number" ? (value.wind as Wind) : fallback.wind,
  };
}

export function normalizeGameState(value: unknown): GameState {
  const base = createInitialState(() => 0);
  if (!isRecord(value)) return base;
  const rawPlayers = value.players;
  const players =
    Array.isArray(rawPlayers) && rawPlayers.length === 4
      ? ([0, 1, 2, 3].map((i) => normalizePlayer(rawPlayers[i], base.players[i])) as unknown as [
          PlayerData,
          PlayerData,
          PlayerData,
          PlayerData,
        ])
      : base.players;
  const rawDeadWall = isRecord(value.deadWall) ? value.deadWall : null;
  return {
    ...base,
    ...value,
    players,
    wall: Array.isArray(value.wall) ? (value.wall as Tile[]) : base.wall,
    deadWall: {
      tiles:
        rawDeadWall && Array.isArray(rawDeadWall.tiles)
          ? (rawDeadWall.tiles as Tile[])
          : base.deadWall.tiles,
      doraCount:
        rawDeadWall && typeof rawDeadWall.doraCount === "number"
          ? rawDeadWall.doraCount
          : base.deadWall.doraCount,
    },
    roundHistory: Array.isArray(value.roundHistory)
      ? (value.roundHistory as RoundHistoryItem[])
      : base.roundHistory,
    roundWind: typeof value.roundWind === "number" ? value.roundWind : base.roundWind,
    roundNumber: typeof value.roundNumber === "number" ? value.roundNumber : base.roundNumber,
    dealer: typeof value.dealer === "number" ? value.dealer : base.dealer,
    honba: typeof value.honba === "number" ? value.honba : base.honba,
    riichiSticks: typeof value.riichiSticks === "number" ? value.riichiSticks : base.riichiSticks,
    currentPlayer:
      typeof value.currentPlayer === "number" ? value.currentPlayer : base.currentPlayer,
    lastDiscard: isRecord(value.lastDiscard)
      ? (value.lastDiscard as GameState["lastDiscard"])
      : null,
    winner: typeof value.winner === "number" ? value.winner : null,
    phase:
      value.phase === "playing" ||
      value.phase === "claiming" ||
      value.phase === "roundEnded" ||
      value.phase === "ended"
        ? value.phase
        : base.phase,
    claimOptions: Array.isArray(value.claimOptions)
      ? (value.claimOptions as ClaimOption[])
      : base.claimOptions,
    lastDrawnTile: isRecord(value.lastDrawnTile) ? (value.lastDrawnTile as Tile) : null,
    lastScoreResult: isRecord(value.lastScoreResult)
      ? (value.lastScoreResult as unknown as ScoreResult)
      : null,
    finalRanking: Array.isArray(value.finalRanking) ? (value.finalRanking as number[]) : null,
    message: typeof value.message === "string" ? value.message : base.message,
    pendingRinshan:
      typeof value.pendingRinshan === "boolean" ? value.pendingRinshan : base.pendingRinshan,
    lastDrawWasRinshan:
      typeof value.lastDrawWasRinshan === "boolean"
        ? value.lastDrawWasRinshan
        : base.lastDrawWasRinshan,
    lastDiscardWasChankan:
      typeof value.lastDiscardWasChankan === "boolean"
        ? value.lastDiscardWasChankan
        : base.lastDiscardWasChankan,
    kuikaeProhibitedTiles: Array.isArray(value.kuikaeProhibitedTiles)
      ? (value.kuikaeProhibitedTiles as Tile[])
      : base.kuikaeProhibitedTiles,
    firstTurnInterrupted:
      typeof value.firstTurnInterrupted === "boolean"
        ? value.firstTurnInterrupted
        : base.firstTurnInterrupted,
    pendingAbortiveDraw:
      value.pendingAbortiveDraw === "kyuushuKyuuhai" ||
      value.pendingAbortiveDraw === "suufonRenda" ||
      value.pendingAbortiveDraw === "suuchaRiichi" ||
      value.pendingAbortiveDraw === "suukanSanra" ||
      value.pendingAbortiveDraw === "sanchaHou"
        ? value.pendingAbortiveDraw
        : base.pendingAbortiveDraw,
    calledDiscardKinds: Array.isArray(value.calledDiscardKinds)
      ? (value.calledDiscardKinds as string[][])
      : base.calledDiscardKinds,
    pendingKanDora:
      typeof value.pendingKanDora === "boolean" ? value.pendingKanDora : base.pendingKanDora,
  };
}
