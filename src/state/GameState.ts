import { type Tile, type Meld, MeldType, Wind, Suit } from "../game/types.js";
import { buildWall, drawFromWall, drawDeadWall, sortHand, formatTile, getDoraIndicators, getUraDoraIndicators, } from "../game/tiles.js";
import { tilesToCounts, isWinningHand, findTenpaiTiles, indexToTile, tileToIndex, } from "../game/agari.js";
import { fullScore, type ScoreResult } from "../game/scoring.js";
import { decomposeStandardHand } from "../game/yaku.js";
import { aiChooseDiscard } from "../game/ai.js";
// ── Types ─────────────────────────────────────────────────────────
export interface PlayerData {
    hand: readonly Tile[];
    melds: readonly Meld[];
    discards: readonly Tile[];
    riichi: boolean;
    doubleRiichi: boolean;
    ippatsu: boolean;
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
    type: "ron";
    player: number;
    tiles: readonly Tile[];
    calledTile: Tile;
    display: string;
}
export interface MeldClaimOption {
    type: "chi" | "pon" | "daiminkan";
    player: number;
    tiles: readonly Tile[];
    calledTile: Tile;
    meld: Meld;
    display: string;
}
export type AbortiveDrawReason = "kyuushuKyuuhai" | "suufonRenda" | "suuchaRiichi" | "suukanSanra" | "sanchaHou";
function isMeldClaimOption(option: ClaimOption, type: MeldClaimOption["type"], player: number): option is MeldClaimOption {
    return option.type === type && option.player === player;
}
export interface GameState {
    players: readonly [
        PlayerData,
        PlayerData,
        PlayerData,
        PlayerData
    ];
    wall: readonly Tile[];
    deadWall: DeadWallState;
    roundWind: number;
    roundNumber: number;
    dealer: number;
    honba: number;
    riichiSticks: number;
    currentPlayer: number;
    lastDiscard: {
        readonly tile: Tile;
        readonly player: number;
    } | null;
    winner: number | null;
    phase: "playing" | "claiming" | "roundEnded" | "ended";
    claimOptions: readonly ClaimOption[];
    /** 直近の和了スコア (表示用) */
    /** 最後にツモった牌 (表示用、TSUMO時のwinTile特定用) */
    lastDrawnTile: Tile | null;
    lastScoreResult: ScoreResult | null;
    finalRanking: readonly number[] | null;
    message: string;
    pendingRinshan: boolean;
    lastDrawWasRinshan: boolean;
    lastDiscardWasChankan: boolean;
    kuikaeProhibitedTiles: readonly Tile[];
    firstTurnInterrupted: boolean;
    pendingAbortiveDraw: AbortiveDrawReason | null;
    calledDiscardKinds: readonly (readonly string[])[];
    pendingKanDora?: boolean;
}
// ── Actions ────────────────────────────────────────────────────────
export type GameAction = {
    type: "START_GAME";
} | {
    type: "DRAW";
    player: number;
} | {
    type: "DISCARD";
    player: number;
    tile: Tile;
} | {
    type: "DECLARE_RIICHI";
    player: number;
    discardTile: Tile;
} | {
    type: "CHI";
    player: number;
    optionIndex: number;
} | {
    type: "PON";
    player: number;
} | {
    type: "DAIMINKAN";
    player: number;
} | {
    type: "ANKAN";
    player: number;
    tile: Tile;
} | {
    type: "KAKAN";
    player: number;
    tile: Tile;
} | {
    type: "PASS_CLAIM";
} | {
    type: "RON";
    winner: number;
} | {
    type: "TSUMO";
    player: number;
} | {
    type: "DECLARE_KYUUSHU_KYUUHAI";
    player: number;
} | {
    type: "END_ROUND";
    message?: string;
} | {
    type: "NEXT_ROUND";
} | {
    type: "RESTORE";
    state: GameState;
};
// ── Helpers ────────────────────────────────────────────────────────
function isSameTile(a: Tile, b: Tile): boolean {
    return a.suit === b.suit && a.value === b.value && (a.red ?? false) === (b.red ?? false);
}
function isSameTileKind(a: Tile, b: Tile): boolean {
    return a.suit === b.suit && a.value === b.value;
}
function makePlayer(wind: number, points: number): PlayerData {
    return {
        hand: [],
        melds: [],
        discards: [],
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
export function removeOneTile(hand: readonly Tile[], tile: Tile): Tile[] {
    const idx = hand.findIndex((t) => isSameTile(t, tile));
    if (idx === -1)
        return [...hand];
    return [...hand.slice(0, idx), ...hand.slice(idx + 1)];
}
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
function matchingTileKind(hand: readonly Tile[], tile: Tile): Tile[] {
    return hand.filter((t) => isSameTileKind(t, tile));
}
function isKuikaeProhibited(state: GameState, player: number, tile: Tile): boolean {
    return state.currentPlayer === player && state.kuikaeProhibitedTiles.some((prohibited) => isSameTileKind(prohibited, tile));
}
function kuikaeMessage(tile: Tile): string {
    return `食い替え禁止: ${formatTile(tile)} は切れません`;
}
function chiKuikaeProhibitedTiles(option: MeldClaimOption): readonly Tile[] {
    const called = option.calledTile;
    if (called.suit === Suit.Wind || called.suit === Suit.Dragon)
        return [called];
    const prohibited: Tile[] = [called];
    for (const offset of [-3, 3]) {
        const value = (called.value as number) + offset;
        if (value >= 1 && value <= 9) {
            prohibited.push({ suit: called.suit, value: value as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 });
        }
    }
    return prohibited;
}
function isYaochu(tile: Tile): boolean {
    return tile.suit === Suit.Wind || tile.suit === Suit.Dragon || tile.value === 1 || tile.value === 9;
}
function tileKindKey(tile: Tile): string {
    return `${tile.suit}:${tile.value}`;
}
function emptyCalledDiscardKinds(): readonly (readonly string[])[] {
    return [[], [], [], []];
}
export function canDeclareKyuushuKyuuhai(state: GameState, player: number): boolean {
    if (state.phase !== "playing" || state.currentPlayer !== player || state.firstTurnInterrupted)
        return false;
    const playerData = state.players[player];
    if (playerData.discards.length > 0 || turnTileCount(playerData) !== expectedAfterDraw(playerData))
        return false;
    const yaochuKinds = new Set(playerData.hand.filter(isYaochu).map(tileKindKey));
    return yaochuKinds.size >= 9;
}
function abortiveDrawMessage(reason: AbortiveDrawReason): string {
    switch (reason) {
        case "kyuushuKyuuhai":
            return "途中流局: 九種九牌";
        case "suufonRenda":
            return "途中流局: 四風連打";
        case "suuchaRiichi":
            return "途中流局: 四家立直";
        case "suukanSanra":
            return "途中流局: 四槓散了";
        case "sanchaHou":
            return "途中流局: 三家和";
    }
}
function nagashiManganScore(winner: number, dealer: number, riichiSticks: number, honba: number): ScoreResult {
    return {
        han: 5,
        yakuman: 0,
        fu: 30,
        basePoints: 2000,
        doraHan: 0,
        score: (winner === dealer ? 12000 : 8000) + riichiSticks * 1000 + honba * 300,
        payment: {
            from: winner === dealer
                ? [0, 1, 2, 3].filter((i) => i !== winner).map((player) => ({ player, amount: 4000 + honba * 100 }))
                : [0, 1, 2, 3].filter((i) => i !== winner).map((player) => ({ player, amount: player === dealer ? 4000 + honba * 100 : 2000 + honba * 100 })),
            winnerGets: (winner === dealer ? 12000 : 8000) + riichiSticks * 1000 + honba * 300,
        },
        yaku: [{ id: "nagashiMangan" as never, name: "流し満貫", han: 5, yakuman: false, doubleYakuman: false }],
        limit: "mangan",
    };
}
function turnTileCount(player: PlayerData): number {
    return player.hand.length + player.melds.reduce((sum, meld) => sum + meld.tiles.length, 0);
}
function canDeclareRiichi(player: PlayerData): boolean {
    return !player.riichi && player.melds.every((meld) => meld.type === MeldType.ClosedKan);
}
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
    if (player.temporaryFuriten || player.riichiFuriten)
        return true;
    const waits = new Set(findWaits(player.hand, player.melds));
    if (waits.size === 0)
        return false;
    return player.discards.some((tile) => waits.has(tileToIndex(tile)));
}
/** 現在のstateからドラパラメータを抽出 */
const doraParams = (state: GameState) => ({
    doraIndicators: getDoraIndicators(state.deadWall.tiles, state.deadWall.doraCount),
    uraDoraIndicators: getUraDoraIndicators(state.deadWall.tiles, state.deadWall.doraCount),
});
function revealKanDora(deadWall: DeadWallState): DeadWallState {
    return {
        ...deadWall,
        doraCount: Math.min(deadWall.doraCount + 1, 5, deadWall.tiles.length),
    };
}
function totalKanCount(players: readonly PlayerData[]): number {
    return players.reduce((sum, player) => sum + kanCount(player), 0);
}
function playersWithKan(players: readonly PlayerData[]): number {
    return players.filter((player) => kanCount(player) > 0).length;
}
function nextPendingAbortiveDrawAfterKan(players: readonly PlayerData[]): AbortiveDrawReason | null {
    return totalKanCount(players) >= 4 && playersWithKan(players) > 1 ? "suukanSanra" : null;
}
function isSuufonRenda(players: readonly [
    PlayerData,
    PlayerData,
    PlayerData,
    PlayerData
], firstTurnInterrupted: boolean): boolean {
    if (firstTurnInterrupted || players.some((player) => player.discards.length !== 1))
        return false;
    const firstDiscards = players.map((player) => player.discards[0]!);
    const first = firstDiscards[0]!;
    return first.suit === Suit.Wind && firstDiscards.every((tile) => isSameTileKind(tile, first));
}
function playerWind(player: number, dealer: number): Wind {
    return ((player - dealer + 4) % 4) as Wind;
}
function roundName(roundNumber: number): string {
    return `東${roundNumber}局`;
}
function rankPlayers(players: readonly [
    PlayerData,
    PlayerData,
    PlayerData,
    PlayerData
]): number[] {
    return [0, 1, 2, 3].sort((a, b) => {
        const pointDiff = players[b].points - players[a].points;
        return pointDiff !== 0 ? pointDiff : a - b;
    });
}
export function dealRound(state: GameState, dealer: number, roundNumber: number, honba: number, riichiSticks: number, message: string, random?: () => number): GameState {
    const wallData = buildWall(random);
    const players = state.players.map((player, i) => ({
        hand: [],
        melds: [],
        discards: [],
        riichi: false,
        doubleRiichi: false,
        ippatsu: false,
        temporaryFuriten: false,
        riichiFuriten: false,
        points: player.points,
        wind: playerWind(i, dealer),
    })) as unknown as [
        PlayerData,
        PlayerData,
        PlayerData,
        PlayerData
    ];
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
            const nextPlayers = [...players] as unknown as [PlayerData, PlayerData, PlayerData, PlayerData];
            const payment = score.payment;
            for (const p of payment.from) {
                nextPlayers[p.player] = updPlayer(nextPlayers[p.player], {
                    points: nextPlayers[p.player].points - p.amount,
                });
            }
            nextPlayers[dealer] = updPlayer(nextPlayers[dealer], {
                points: nextPlayers[dealer].points + payment.winnerGets,
            });
            return finishRound(initialState, nextPlayers, dealer, false, true, score, "天和！");
        }
    }

    return initialState;
}
function finishRound(state: GameState, players: readonly [
    PlayerData,
    PlayerData,
    PlayerData,
    PlayerData
], winner: number | null, isDraw: boolean, dealerContinues: boolean, score: ScoreResult | null, message: string): GameState {
    const nextDealer = dealerContinues ? state.dealer : (state.dealer + 1) % 4;
    const nextRoundNumber = dealerContinues ? state.roundNumber : state.roundNumber + 1;
    const nextHonba = dealerContinues || isDraw ? state.honba + 1 : 0;
    const nextRiichiSticks = winner === null ? state.riichiSticks : 0;
    const finalRanking = rankPlayers(players);
    const finalDealerTop = dealerContinues && state.roundNumber >= 4 && finalRanking[0] === state.dealer;
    const isTobi = players.some((p) => p.points < 0);
    const matchEnded = isTobi || (state.roundNumber >= 4 && (!dealerContinues || finalDealerTop));
    return {
        ...state,
        players,
        dealer: nextDealer,
        roundNumber: nextRoundNumber,
        honba: nextHonba,
        riichiSticks: nextRiichiSticks,
        winner,
        phase: matchEnded ? "ended" : "roundEnded",
        claimOptions: [],
        lastScoreResult: score,
        finalRanking: matchEnded ? finalRanking : null,
        pendingRinshan: false,
        lastDrawWasRinshan: false,
        lastDiscardWasChankan: false,
        kuikaeProhibitedTiles: [],
        firstTurnInterrupted: false,
        pendingAbortiveDraw: null,
        calledDiscardKinds: emptyCalledDiscardKinds(),
        message,
    };
}
function finishAbortiveDraw(state: GameState, reason: AbortiveDrawReason): GameState {
    return finishRound(state, state.players, null, true, false, null, abortiveDrawMessage(reason));
}
function closedTilesForTsumo(hand: readonly Tile[], winTile: Tile): readonly Tile[] {
    return removeOneTile(hand, winTile);
}
function isCompleteHand(closedTiles: readonly Tile[], melds: readonly Meld[], winTile: Tile): boolean {
    const allClosedTiles = [...closedTiles, winTile];
    if (melds.length === 0) {
        return isWinningHand(tilesToCounts(allClosedTiles));
    }
    return decomposeStandardHand(allClosedTiles, melds) !== null;
}
function canScoreTsumo(state: GameState, player: number, winTile: Tile): boolean {
    const playerData = state.players[player];
    const closedTiles = closedTilesForTsumo(playerData.hand, winTile);
    if (!isCompleteHand(closedTiles, playerData.melds, winTile))
        return false;
    return fullScore({
        closedTiles,
        melds: playerData.melds,
        winTile,
        isTsumo: true,
        roundWind: state.roundWind,
        playerSeat: player,
        dealer: state.dealer,
        isRiichi: playerData.riichi,
        riichiSticks: state.riichiSticks,
        honba: state.honba,
        ...doraParams(state),
        isDoubleRiichi: playerData.doubleRiichi,
        isIppatsu: playerData.ippatsu,
        isHaitei: !state.lastDrawWasRinshan && state.wall.length === 0,
        isHoutei: false,
        isRinshan: state.lastDrawWasRinshan,
        isChankan: false,
        isTenhou: player === state.dealer && !state.firstTurnInterrupted && playerData.discards.length === 0,
        isChiihou: player !== state.dealer && !state.firstTurnInterrupted && playerData.discards.length === 0 && playerData.melds.length === 0,
    }) !== null;
}
function applyRonPayment(players: readonly [
    PlayerData,
    PlayerData,
    PlayerData,
    PlayerData
], winner: number, discarder: number, score: ScoreResult, riichiSticks: number): [
    PlayerData,
    PlayerData,
    PlayerData,
    PlayerData
] {
    const loserPays = score.score - riichiSticks * 1000;
    const afterLoser = updatePlayerInTuple(players, discarder, updPlayer(players[discarder], {
        points: players[discarder].points - loserPays,
    }));
    return updatePlayerInTuple(afterLoser, winner, updPlayer(afterLoser[winner], {
        points: afterLoser[winner].points + score.score,
    }));
}
function applyDoubleRonPayments(players: readonly [
    PlayerData,
    PlayerData,
    PlayerData,
    PlayerData
], winners: readonly [number, number], discarder: number, scores: readonly [ScoreResult, ScoreResult], riichiReceiver: number, riichiSticks: number): [
    PlayerData,
    PlayerData,
    PlayerData,
    PlayerData
] {
    let updated = players as [
        PlayerData,
        PlayerData,
        PlayerData,
        PlayerData
    ];
    let loserPays = 0;
    for (let i = 0; i < winners.length; i++) {
        const winner = winners[i]!;
        const score = scores[i]!;
        const receivesRiichi = winner === riichiReceiver;
        const ronPayment = score.score - riichiSticks * 1000;
        const winnerGain = receivesRiichi ? score.score : ronPayment;
        loserPays += ronPayment;
        updated = updatePlayerInTuple(updated, winner, updPlayer(updated[winner], {
            points: updated[winner].points + winnerGain,
        }));
    }
    return updatePlayerInTuple(updated, discarder, updPlayer(updated[discarder], {
        points: updated[discarder].points - loserPays,
    }));
}
function ronScore(state: GameState, winner: number): ScoreResult | null {
    if (!state.lastDiscard)
        return null;
    const winTile = state.lastDiscard.tile;
    if (!isCompleteHand(state.players[winner].hand, state.players[winner].melds, winTile)) {
        return null;
    }
    return fullScore({
        closedTiles: state.players[winner].hand,
        melds: state.players[winner].melds,
        winTile,
        isTsumo: false,
        roundWind: state.roundWind,
        playerSeat: winner,
        dealer: state.dealer,
        isRiichi: state.players[winner].riichi,
        riichiSticks: state.riichiSticks,
        honba: state.honba,
        ...doraParams(state),
        isDoubleRiichi: state.players[winner].doubleRiichi,
        isIppatsu: state.players[winner].ippatsu,
        isHaitei: false,
        isHoutei: !state.lastDiscardWasChankan && state.wall.length === 0,
        isRinshan: false,
        isChankan: state.lastDiscardWasChankan,
    });
}
function ronClaimPlayers(state: GameState): number[] {
    return sortClaimsByPriority(state.claimOptions.filter((claim) => claim.type === "ron"), state.lastDiscard?.player ?? 0)
        .map((claim) => claim.player);
}
function applyTsumoPayment(players: readonly [
    PlayerData,
    PlayerData,
    PlayerData,
    PlayerData
], winner: number, score: ScoreResult): [
    PlayerData,
    PlayerData,
    PlayerData,
    PlayerData
] {
    return players.map((player, i) => {
        if (i === winner)
            return updPlayer(player, { points: player.points + score.score });
        const payment = score.payment.from.find((f) => f.player === i);
        return updPlayer(player, { points: player.points - (payment?.amount ?? 0) });
    }) as unknown as [
        PlayerData,
        PlayerData,
        PlayerData,
        PlayerData
    ];
}
function applyNagashiManganPayments(state: GameState, winners: readonly number[]): {
    players: [
        PlayerData,
        PlayerData,
        PlayerData,
        PlayerData
    ];
    scores: ScoreResult[];
} {
    let players = state.players as [
        PlayerData,
        PlayerData,
        PlayerData,
        PlayerData
    ];
    const scores: ScoreResult[] = [];
    for (const winner of winners) {
        const score = nagashiManganScore(winner, state.dealer, 0, state.honba);
        scores.push(score);
        players = applyTsumoPayment(players, winner, score);
    }
    if (state.riichiSticks > 0 && winners.length > 0) {
        const receiver = winners[0]!;
        players = updatePlayerInTuple(players, receiver, updPlayer(players[receiver], {
            points: players[receiver].points + state.riichiSticks * 1000,
        }));
    }
    return { players, scores };
}
function nagashiManganWinners(state: GameState): number[] {
    const winners: number[] = [];
    for (let i = 0; i < 4; i++) {
        const player = state.players[i]!;
        if (player.discards.length === 0)
            continue;
        const calledKinds = new Set(state.calledDiscardKinds[i] ?? []);
        if (player.discards.every(isYaochu) && player.discards.every((tile) => !calledKinds.has(tileKindKey(tile)))) {
            winners.push(i);
        }
    }
    return winners;
}
/** 流局時の聴牌確認と点棒移動 */
function handleExhaustiveDraw(state: GameState): GameState {
    const nagashiWinners = nagashiManganWinners(state);
    if (nagashiWinners.length > 0) {
        const { players, scores } = applyNagashiManganPayments(state, nagashiWinners);
        const names = nagashiWinners.map((winner) => winner === 0 ? "\u3042\u306A\u305F" : `プレイヤー${winner + 1}`).join("\u30FB");
        return finishRound(state, players, nagashiWinners[0]!, false, nagashiWinners.includes(state.dealer), scores[0]!, `${names}が流し満貫!`);
    }
    const tenpaiList: number[] = [];
    const notenList: number[] = [];
    for (let i = 0; i < 4; i++) {
        const p = state.players[i];
        const allTiles = [...p.hand];
        for (const meld of p.melds) {
            allTiles.push(...meld.tiles);
        }
        if (findWaits(p.hand, p.melds).length > 0) {
            tenpaiList.push(i);
        }
        else {
            notenList.push(i);
        }
    }
    const newPlayers = [...state.players] as unknown as [
        PlayerData,
        PlayerData,
        PlayerData,
        PlayerData
    ];
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
    const tenpaiStr = tenpaiList.map((i) => `${i === 0 ? "\u3042\u306A\u305F" : `P${i + 1}`}`).join("\u30FB");
    const notenStr = notenList.map((i) => `${i === 0 ? "\u3042\u306A\u305F" : `P${i + 1}`}`).join("\u30FB");
    const detail = tenpaiList.length > 0 ? `聴牌: ${tenpaiStr}  不聴: ${notenStr || "\u306A\u3057"}` : "\u5168\u54E1\u4E0D\u8074";
    return finishRound(state, newPlayers, null, true, tenpaiList.includes(state.dealer), null, `流局: ${detail}`);
}
// ── Claim checking ─────────────────────────────────────────────────
function findChiOptions(discarded: Tile, hand: readonly Tile[], playerNum: number): readonly ClaimOption[] {
    if (discarded.suit === Suit.Wind || discarded.suit === Suit.Dragon)
        return [];
    const value = discarded.value as number;
    const suit = discarded.suit;
    const options: ClaimOption[] = [];
    for (let start = Math.max(1, value - 2); start <= Math.min(7, value); start++) {
        const neededVals = [start, start + 1, start + 2].filter((v) => v !== value);
        const fromHand: Tile[] = [];
        const remaining = [...hand];
        for (const nv of neededVals) {
            const idx = remaining.findIndex((t) => t.suit === suit && t.value === nv);
            if (idx === -1)
                break;
            fromHand.push(remaining[idx]!);
            remaining.splice(idx, 1);
        }
        if (fromHand.length === 2) {
            const meldTiles = [...fromHand, discarded];
            const meld: Meld = {
                type: MeldType.Chi,
                tiles: sortHand([...meldTiles]),
                calledTile: discarded,
            };
            options.push({
                type: "chi",
                player: playerNum,
                tiles: meldTiles,
                calledTile: discarded,
                meld,
                display: `チー ${meldTiles.map((t) => formatTile(t)).join("")}`,
            });
        }
    }
    return options;
}
function canPonTile(discarded: Tile, hand: readonly Tile[]): boolean {
    return hand.filter((t) => isSameTile(t, discarded)).length >= 2;
}
function canDaiminkanTile(discarded: Tile, hand: readonly Tile[]): boolean {
    return hand.filter((t) => isSameTile(t, discarded)).length >= 3;
}
export function collectClaims(discarded: Tile, discarder: number, players: readonly [
    PlayerData,
    PlayerData,
    PlayerData,
    PlayerData
]): readonly ClaimOption[] {
    const options: ClaimOption[] = [];
    for (let i = 0; i < 4; i++) {
        if (i === discarder)
            continue;
        const hand = players[i].hand;
        if (!isFuritenFromOwnDiscards(players[i]) &&
            isCompleteHand(players[i].hand, players[i].melds, discarded)) {
            options.push({
                type: "ron",
                player: i,
                tiles: [discarded],
                calledTile: discarded,
                display: `ロン ${formatTile(discarded)}`,
            });
        }
        if (players[i].riichi)
            continue;
        if (canPonTile(discarded, hand)) {
            const pair = hand.filter((t) => isSameTile(t, discarded)).slice(0, 2);
            const meldTiles = [...pair, discarded];
            const meld: Meld = { type: MeldType.Poon, tiles: meldTiles, calledTile: discarded };
            options.push({
                type: "pon",
                player: i,
                tiles: meldTiles,
                calledTile: discarded,
                meld,
                display: `ポン ${formatTile(discarded)}`,
            });
        }
        if (canDaiminkanTile(discarded, hand)) {
            const triple = hand.filter((t) => isSameTile(t, discarded)).slice(0, 3);
            const meldTiles = [...triple, discarded];
            const meld: Meld = { type: MeldType.Kan, tiles: meldTiles, calledTile: discarded };
            options.push({
                type: "daiminkan",
                player: i,
                tiles: meldTiles,
                calledTile: discarded,
                meld,
                display: `カン ${formatTile(discarded)}`,
            });
        }
        if (i === (discarder + 1) % 4) {
            options.push(...findChiOptions(discarded, hand, i));
        }
    }
    return options;
}
export function sortClaimsByPriority(options: readonly ClaimOption[], discarder: number): readonly ClaimOption[] {
    return [...options].sort((a, b) => {
        // Ron > pon/kan > chi
        if (a.type === "ron" && b.type !== "ron")
            return -1;
        if (a.type !== "ron" && b.type === "ron")
            return 1;
        // Pon/kan > chi (even across different players)
        const aStrong = a.type === "pon" || a.type === "daiminkan";
        const bStrong = b.type === "pon" || b.type === "daiminkan";
        if (aStrong && !bStrong)
            return -1;
        if (!aStrong && bStrong)
            return 1;
        // Within same type group: turn order (closer to discarder first)
        const turnOrder = [1, 2, 3];
        const aOrder = turnOrder.indexOf((a.player - discarder + 4) % 4);
        const bOrder = turnOrder.indexOf((b.player - discarder + 4) % 4);
        return aOrder - bOrder;
    });
}
function clearIppatsu(players: readonly [
    PlayerData,
    PlayerData,
    PlayerData,
    PlayerData
]): [
    PlayerData,
    PlayerData,
    PlayerData,
    PlayerData
] {
    return players.map((player) => player.ippatsu ? updPlayer(player, { ippatsu: false }) : player) as unknown as [
        PlayerData,
        PlayerData,
        PlayerData,
        PlayerData
    ];
}
/** Count kan melds for a player */
function kanCount(player: PlayerData): number {
    const kanTypes = [MeldType.Kan, MeldType.ClosedKan, MeldType.AddedKan];
    return player.melds.filter((m) => kanTypes.includes(m.type)).length;
}
function expectedAfterDiscard(player: PlayerData): number {
    return 13 + kanCount(player);
}
function expectedAfterDraw(player: PlayerData): number {
    return expectedAfterDiscard(player) + 1;
}
export function processAiTurn(state: GameState): {
    state: GameState;
    action: GameAction | null;
} {
    if (state.phase === "claiming") {
        if (state.claimOptions.some((c) => c.player === 0)) {
            return { state, action: null };
        }
        const aiClaims = state.claimOptions.filter((c) => c.player !== 0);
        if (aiClaims.length > 0) {
            const claim = aiClaims[0]!;
            if (claim.type === "ron")
                return { state, action: { type: "RON", winner: claim.player } };
            if (claim.type === "chi")
                return { state, action: { type: "CHI", player: claim.player, optionIndex: 0 } };
            if (claim.type === "pon")
                return { state, action: { type: "PON", player: claim.player } };
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
        if (!player.riichi) {
            for (const tile of player.hand) {
                if (player.hand.filter((t) => isSameTileKind(t, tile)).length >= 4) {
                    return { state, action: { type: "ANKAN", player: state.currentPlayer, tile } };
                }
            }
            for (const tile of player.hand) {
                if (player.melds.some((m) => m.type === MeldType.Poon && m.calledTile && isSameTileKind(m.calledTile, tile))) {
                    return { state, action: { type: "KAKAN", player: state.currentPlayer, tile } };
                }
            }
        }
        const discard = player.riichi && state.lastDrawnTile
            ? state.lastDrawnTile
            : aiChooseDiscard(player.hand, state.players.map((p) => p.discards), state.players.map((p) => p.riichi), state.kuikaeProhibitedTiles);
        const testHand = removeOneTile(player.hand, discard);
        if (canDeclareRiichi(player) && findWaits(testHand, player.melds).length > 0 && player.points >= 1000) {
            return {
                state,
                action: { type: "DECLARE_RIICHI", player: state.currentPlayer, discardTile: discard },
            };
        }
        return { state, action: { type: "DISCARD", player: state.currentPlayer, tile: discard } };
    }
    if (player.hand.length > 0) {
        const discard = aiChooseDiscard(player.hand, state.players.map((p) => p.discards), state.players.map((p) => p.riichi), state.kuikaeProhibitedTiles);
        return { state, action: { type: "DISCARD", player: state.currentPlayer, tile: discard } };
    }
    return { state, action: null };
}
// ── Reducer ────────────────────────────────────────────────────────
export function gameReducer(state: GameState, action: GameAction): GameState {
    switch (action.type) {
        case "RESTORE":
            return normalizeGameState((action as {
                type: "RESTORE";
                state: GameState;
            }).state);
        case "START_GAME": {
            const dealer = state.dealer;
            return dealRound(state, dealer, 1, 0, 0, "\u30B2\u30FC\u30E0\u958B\u59CB\uFF01 \u67711\u5C40");
        }
        case "NEXT_ROUND": {
            if (state.phase !== "roundEnded")
                return state;
            return dealRound(state, state.dealer, state.roundNumber, state.honba, state.riichiSticks, `${roundName(state.roundNumber)}開始`);
        }
        case "DRAW": {
            if (state.wall.length === 0) {
                // 流局処理: 聴牌確認と点棒移動
                return handleExhaustiveDraw(state);
            }
            const player = state.players[action.player];
            if (state.pendingRinshan) {
                // Rinshan draw: draw from the dead wall (last tile)
                const rinshanResult = drawDeadWall(state.deadWall.tiles);
                let drawn: readonly Tile[];
                let newDeadWall: readonly Tile[];
                if (rinshanResult) {
                    drawn = [rinshanResult.drawn];
                    newDeadWall = rinshanResult.remaining;
                }
                else {
                    // Fallback: dead wall empty, draw from normal wall
                    const fallback = drawFromWall(state.wall, 1);
                    drawn = fallback.drawn;
                    newDeadWall = state.deadWall.tiles;
                }
                const newHand = sortHand([...player.hand, ...drawn]);
                const updatedPlayer = updPlayer(player, { hand: newHand, temporaryFuriten: false });
                const newPlayers = updatePlayerInTuple(state.players, action.player, updatedPlayer);
                let message = `嶺上ツモ: ${formatTile(drawn[0]!)}`;
                if (isCompleteHand(updatedPlayer.hand, updatedPlayer.melds, drawn[0]!)) {
                    message = `嶺上ツモ! ${formatTile(drawn[0]!)} をツモりました。和了できます！`;
                }
                return {
                    ...state,
                    players: newPlayers,
                    deadWall: { ...state.deadWall, tiles: newDeadWall },
                    lastDrawnTile: drawn[0]!,
                    pendingRinshan: false,
                    lastDrawWasRinshan: true,
                    lastDiscardWasChankan: false,
                    message,
                };
            }
            const { drawn, remaining } = drawFromWall(state.wall, 1);
            const newHand = sortHand([...player.hand, ...drawn]);
            const updatedPlayer = updPlayer(player, { hand: newHand, temporaryFuriten: false });
            const newPlayers = updatePlayerInTuple(state.players, action.player, updatedPlayer);
            let message = `ツモ: ${formatTile(drawn[0]!)}`;
            if (isCompleteHand(updatedPlayer.hand, updatedPlayer.melds, drawn[0]!)) {
                message = `ツモ! ${formatTile(drawn[0]!)} をツモりました。和了できます！`;
            }
            return { ...state, players: newPlayers, wall: remaining, lastDrawnTile: drawn[0]!, lastDrawWasRinshan: false, lastDiscardWasChankan: false, message };
        }
        case "DISCARD": {
            const player = state.players[action.player];
            const tileStr = formatTile(action.tile);
            if (isKuikaeProhibited(state, action.player, action.tile)) {
                return { ...state, message: kuikaeMessage(action.tile) };
            }
            const fixedHand = removeOneTile(player.hand, action.tile);
            const updatedPlayer = updPlayer(player, {
                hand: sortHand(fixedHand),
                discards: [...player.discards, action.tile],
                ippatsu: false,
            });
            const newPlayers = updatePlayerInTuple(state.players, action.player, updatedPlayer);
            // Check claims
            const claims = collectClaims(action.tile, action.player, newPlayers);
            const sorted = sortClaimsByPriority(claims, action.player);
            let nextDeadWall = state.deadWall;
            let nextPendingKanDora = state.pendingKanDora;
            if (state.pendingAbortiveDraw === "suukanSanra") {
                const ronClaims = sorted.filter((claim) => claim.type === "ron");
                if (ronClaims.length === 0) {
                    return finishAbortiveDraw({ ...state, players: newPlayers, lastDiscard: { tile: action.tile, player: action.player } }, "suukanSanra");
                }
                if (state.pendingKanDora && ronClaims.length === 0) {
                    nextDeadWall = revealKanDora(state.deadWall);
                    nextPendingKanDora = false;
                }
                return {
                    ...state,
                    players: newPlayers,
                    deadWall: nextDeadWall,
                    pendingKanDora: nextPendingKanDora,
                    lastDiscard: { tile: action.tile, player: action.player },
                    lastDiscardWasChankan: false,
                    claimOptions: ronClaims,
                    phase: "claiming",
                    kuikaeProhibitedTiles: [],
                    message: `${tileStr} を切りました。`,
                };
            }
            if (sorted.length > 0) {
                const ronClaims = sorted.filter((claim) => claim.type === "ron");
                if (state.pendingKanDora && ronClaims.length === 0) {
                    nextDeadWall = revealKanDora(state.deadWall);
                    nextPendingKanDora = false;
                }
                return {
                    ...state,
                    players: newPlayers,
                    deadWall: nextDeadWall,
                    pendingKanDora: nextPendingKanDora,
                    lastDiscard: { tile: action.tile, player: action.player },
                    lastDiscardWasChankan: false,
                    claimOptions: sorted,
                    phase: "claiming",
                    kuikaeProhibitedTiles: [],
                    message: `${tileStr} を切りました。`,
                };
            }
            if (state.pendingKanDora) {
                nextDeadWall = revealKanDora(state.deadWall);
                nextPendingKanDora = false;
            }
            if (isSuufonRenda(newPlayers, state.firstTurnInterrupted)) {
                return finishAbortiveDraw({
                    ...state,
                    players: newPlayers,
                    deadWall: nextDeadWall,
                    pendingKanDora: nextPendingKanDora,
                    lastDiscard: { tile: action.tile, player: action.player }
                }, "suufonRenda");
            }
            return {
                ...state,
                players: newPlayers,
                deadWall: nextDeadWall,
                pendingKanDora: nextPendingKanDora,
                lastDiscard: { tile: action.tile, player: action.player },
                lastDiscardWasChankan: false,
                currentPlayer: (action.player + 1) % 4,
                claimOptions: [],
                kuikaeProhibitedTiles: [],
                message: player.riichi ? `${tileStr} を切りました (リーチ中)` : `${tileStr} を切りました`,
            };
        }
        case "CHI": {
            const option = state.claimOptions[action.optionIndex];
            if (!option || option.type !== "chi")
                return { ...state, message: "\u30C1\u30FC\u3067\u304D\u307E\u305B\u3093" };
            const player = state.players[option.player];
            const fromHand = option.tiles.filter((t) => !isSameTile(t, option.calledTile));
            let newHand = [...player.hand];
            for (const t of fromHand) {
                newHand = removeOneTile(newHand, t);
            }
            // Update claimant: hand + melds
            const claimantUpd = updPlayer(player, {
                hand: sortHand(newHand),
                melds: [...player.melds, option.meld],
            });
            let newPlayers = clearIppatsu(updatePlayerInTuple(state.players, option.player, claimantUpd));
            // Remove called tile from the discarder's discards
            if (state.lastDiscard) {
                const dIdx = state.lastDiscard.player;
                const dPlayer = state.players[dIdx];
                const fixedDiscs = removeOneTile(dPlayer.discards, state.lastDiscard.tile);
                newPlayers = updatePlayerInTuple(newPlayers, dIdx, updPlayer(dPlayer, { discards: fixedDiscs }));
            }
            const calledDiscardKinds = state.lastDiscard
                ? state.calledDiscardKinds.map((kinds, i) => i === state.lastDiscard!.player ? [...kinds, tileKindKey(state.lastDiscard!.tile)] : kinds)
                : state.calledDiscardKinds;
            let nextDeadWall = state.deadWall;
            let nextPendingKanDora = state.pendingKanDora;
            if (state.pendingKanDora) {
                nextDeadWall = revealKanDora(state.deadWall);
                nextPendingKanDora = false;
            }
            return {
                ...state,
                players: newPlayers,
                deadWall: nextDeadWall,
                pendingKanDora: nextPendingKanDora,
                currentPlayer: option.player,
                phase: "playing",
                claimOptions: [],
                lastDiscardWasChankan: false,
                kuikaeProhibitedTiles: chiKuikaeProhibitedTiles(option),
                firstTurnInterrupted: true,
                calledDiscardKinds,
                message: "\u30C1\u30FC\uFF01",
            };
        }
        case "PON": {
            const option = state.claimOptions.find((c) => isMeldClaimOption(c, "pon", action.player));
            if (!option)
                return { ...state, message: "\u30DD\u30F3\u3067\u304D\u307E\u305B\u3093" };
            const player = state.players[option.player];
            const fromHand = option.tiles.slice(0, 2); // [hand1, hand2] 末尾がcalledTile
            let newHand = [...player.hand];
            for (const t of fromHand) {
                newHand = removeOneTile(newHand, t);
            }
            const claimantUpd = updPlayer(player, {
                hand: sortHand(newHand),
                melds: [...player.melds, option.meld],
            });
            let newPlayers = clearIppatsu(updatePlayerInTuple(state.players, option.player, claimantUpd));
            // Remove called tile from the discarder's discards
            if (state.lastDiscard) {
                const dIdx = state.lastDiscard.player;
                const dPlayer = state.players[dIdx];
                const fixedDiscs = removeOneTile(dPlayer.discards, state.lastDiscard.tile);
                newPlayers = updatePlayerInTuple(newPlayers, dIdx, updPlayer(dPlayer, { discards: fixedDiscs }));
            }
            const calledDiscardKinds = state.lastDiscard
                ? state.calledDiscardKinds.map((kinds, i) => i === state.lastDiscard!.player ? [...kinds, tileKindKey(state.lastDiscard!.tile)] : kinds)
                : state.calledDiscardKinds;
            let nextDeadWall = state.deadWall;
            let nextPendingKanDora = state.pendingKanDora;
            if (state.pendingKanDora) {
                nextDeadWall = revealKanDora(state.deadWall);
                nextPendingKanDora = false;
            }
            return {
                ...state,
                players: newPlayers,
                deadWall: nextDeadWall,
                pendingKanDora: nextPendingKanDora,
                currentPlayer: option.player,
                phase: "playing",
                claimOptions: [],
                lastDiscardWasChankan: false,
                kuikaeProhibitedTiles: [option.calledTile],
                firstTurnInterrupted: true,
                calledDiscardKinds,
                message: `ポン！ ${formatTile(option.calledTile)}`,
            };
        }
        case "DAIMINKAN": {
            const option = state.claimOptions.find((c) => isMeldClaimOption(c, "daiminkan", action.player));
            if (!option)
                return { ...state, message: "\u30AB\u30F3\u3067\u304D\u307E\u305B\u3093" };
            const player = state.players[option.player];
            const fromHand = option.tiles.slice(0, 3); // [hand1, hand2, hand3] 末尾がcalledTile
            let newHand = [...player.hand];
            for (const t of fromHand) {
                newHand = removeOneTile(newHand, t);
            }
            const claimantUpd = updPlayer(player, {
                hand: sortHand(newHand),
                melds: [...player.melds, option.meld],
            });
            let newPlayers = clearIppatsu(updatePlayerInTuple(state.players, option.player, claimantUpd));
            // Remove called tile from the discarder's discards
            if (state.lastDiscard) {
                const dIdx = state.lastDiscard.player;
                const dPlayer = state.players[dIdx];
                const fixedDiscs = removeOneTile(dPlayer.discards, state.lastDiscard.tile);
                newPlayers = updatePlayerInTuple(newPlayers, dIdx, updPlayer(dPlayer, { discards: fixedDiscs }));
            }
            const calledDiscardKinds = state.lastDiscard
                ? state.calledDiscardKinds.map((kinds, i) => i === state.lastDiscard!.player ? [...kinds, tileKindKey(state.lastDiscard!.tile)] : kinds)
                : state.calledDiscardKinds;
            let nextDeadWall = state.deadWall;
            if (state.pendingKanDora) {
                nextDeadWall = revealKanDora(state.deadWall);
            }
            return {
                ...state,
                players: newPlayers,
                deadWall: nextDeadWall,
                pendingKanDora: true,
                currentPlayer: option.player,
                phase: "playing",
                claimOptions: [],
                pendingRinshan: true,
                lastDrawWasRinshan: false,
                lastDiscardWasChankan: false,
                kuikaeProhibitedTiles: [option.calledTile],
                firstTurnInterrupted: true,
                pendingAbortiveDraw: nextPendingAbortiveDrawAfterKan(newPlayers),
                calledDiscardKinds,
                message: `カン！ ${formatTile(option.calledTile)}`,
            };
        }
        case "ANKAN": {
            const player = state.players[action.player];
            if (player.riichi)
                return { ...state, message: "\u6697\u69D3\u3067\u304D\u307E\u305B\u3093 (\u30EA\u30FC\u30C1\u4E2D)" };
            const tiles = matchingTileKind(player.hand, action.tile);
            if (tiles.length < 4)
                return { ...state, message: "\u6697\u69D3\u3067\u304D\u307E\u305B\u3093" };
            const meld: Meld = { type: MeldType.ClosedKan, tiles: tiles.slice(0, 4) };
            const updatedPlayer = updPlayer(player, {
                hand: sortHand(removeTileKind(player.hand, action.tile, 4)),
                melds: [...player.melds, meld],
            });
            const newPlayers = clearIppatsu(updatePlayerInTuple(state.players, action.player, updatedPlayer));
            return {
                ...state,
                players: newPlayers,
                deadWall: revealKanDora(state.deadWall),
                currentPlayer: action.player,
                phase: "playing",
                claimOptions: [],
                pendingRinshan: true,
                lastDrawWasRinshan: false,
                lastDiscardWasChankan: false,
                pendingAbortiveDraw: nextPendingAbortiveDrawAfterKan(newPlayers),
                message: `暗槓！ ${formatTile(action.tile)}`,
            };
        }
        case "KAKAN": {
            const player = state.players[action.player];
            if (player.riichi)
                return { ...state, message: "\u52A0\u69D3\u3067\u304D\u307E\u305B\u3093 (\u30EA\u30FC\u30C1\u4E2D)" };
            const meldIndex = player.melds.findIndex((meld) => meld.type === MeldType.Poon &&
                meld.tiles.some((tile) => isSameTileKind(tile, action.tile)));
            if (meldIndex === -1 || !player.hand.some((tile) => isSameTile(tile, action.tile))) {
                return { ...state, message: "\u52A0\u69D3\u3067\u304D\u307E\u305B\u3093" };
            }
            const meld = player.melds[meldIndex]!;
            const upgradedMeld: Meld = {
                type: MeldType.AddedKan,
                tiles: [...meld.tiles, action.tile],
                ...(meld.calledTile ? { calledTile: meld.calledTile } : {}),
            };
            const melds = [
                ...player.melds.slice(0, meldIndex),
                upgradedMeld,
                ...player.melds.slice(meldIndex + 1),
            ];
            const updatedPlayer = updPlayer(player, {
                hand: sortHand(removeOneTile(player.hand, action.tile)),
                melds,
            });
            const newPlayers = clearIppatsu(updatePlayerInTuple(state.players, action.player, updatedPlayer));
            const ronClaims = sortClaimsByPriority(collectClaims(action.tile, action.player, newPlayers), action.player)
                .filter((claim) => claim.type === "ron");
            let nextDeadWall = state.deadWall;
            if (state.pendingKanDora) {
                nextDeadWall = revealKanDora(state.deadWall);
            }
            if (ronClaims.length > 0) {
                return {
                    ...state,
                    players: newPlayers,
                    deadWall: nextDeadWall,
                    pendingKanDora: true,
                    currentPlayer: action.player,
                    lastDiscard: { tile: action.tile, player: action.player },
                    lastDiscardWasChankan: true,
                    phase: "claiming",
                    claimOptions: ronClaims,
                    pendingRinshan: true,
                    lastDrawWasRinshan: false,
                    pendingAbortiveDraw: nextPendingAbortiveDrawAfterKan(newPlayers),
                    message: `加槓！ ${formatTile(action.tile)}`,
                };
            }
            return {
                ...state,
                players: newPlayers,
                deadWall: nextDeadWall,
                pendingKanDora: true,
                currentPlayer: action.player,
                phase: "playing",
                claimOptions: [],
                pendingRinshan: true,
                lastDrawWasRinshan: false,
                lastDiscardWasChankan: false,
                pendingAbortiveDraw: nextPendingAbortiveDrawAfterKan(newPlayers),
                message: `加槓！ ${formatTile(action.tile)}`,
            };
        }
        case "PASS_CLAIM": {
            const discarder = state.lastDiscard?.player;
            if (discarder === undefined)
                return state;
            if (state.pendingAbortiveDraw) {
                return finishAbortiveDraw(state, state.pendingAbortiveDraw);
            }
            const missedRonPlayers = new Set(state.claimOptions.filter((c) => c.type === "ron").map((c) => c.player));
            const players = state.players.map((player, i) => missedRonPlayers.has(i)
                ? updPlayer(player, player.riichi ? { riichiFuriten: true } : { temporaryFuriten: true })
                : player) as unknown as [
                PlayerData,
                PlayerData,
                PlayerData,
                PlayerData
            ];
            let nextDeadWall = state.deadWall;
            let nextPendingKanDora = state.pendingKanDora;
            if (state.pendingKanDora) {
                nextDeadWall = revealKanDora(state.deadWall);
                nextPendingKanDora = false;
            }
            return {
                ...state,
                players,
                deadWall: nextDeadWall,
                pendingKanDora: nextPendingKanDora,
                phase: "playing",
                claimOptions: [],
                currentPlayer: state.lastDiscardWasChankan ? discarder : (discarder + 1) % 4,
                lastDiscardWasChankan: false,
                message: "\u9CF4\u304D\u307E\u305B\u3093",
            };
        }
        case "DECLARE_RIICHI": {
            const player = state.players[action.player];
            if (player.points < 1000) {
                return { ...state, message: "\u30EA\u30FC\u30C1\u3067\u304D\u307E\u305B\u3093 (\u6301\u3061\u70B9\u304C1000\u70B9\u672A\u6E80)" };
            }
            if (isKuikaeProhibited(state, action.player, action.discardTile)) {
                return { ...state, message: kuikaeMessage(action.discardTile) };
            }
            if (!canDeclareRiichi(player)) {
                return { ...state, message: "\u30EA\u30FC\u30C1\u3067\u304D\u307E\u305B\u3093" };
            }
            const testHand = removeOneTile(player.hand, action.discardTile);
            const tenpai = findWaits(testHand, player.melds);
            if (tenpai.length === 0) {
                return { ...state, message: "\u30EA\u30FC\u30C1\u3067\u304D\u307E\u305B\u3093 (\u30C6\u30F3\u30D1\u30A4\u3057\u3066\u3044\u307E\u305B\u3093)" };
            }
            const isDoubleRiichi = player.discards.length === 0;
            const tenpaiStr = tenpai.map((i) => formatTile(indexToTile(i))).join(", ");
            const newPlayers = updatePlayerInTuple(state.players, action.player, updPlayer(player, {
                hand: sortHand(testHand),
                discards: [...player.discards, action.discardTile],
                riichi: true,
                doubleRiichi: isDoubleRiichi,
                ippatsu: true,
                points: player.points - 1000,
            }));
            const nextRiichiSticks = state.riichiSticks + 1;
            const claims = collectClaims(action.discardTile, action.player, newPlayers);
            const sorted = sortClaimsByPriority(claims, action.player);
            const allRiichi = newPlayers.every((p) => p.riichi);
            const ronClaims = sorted.filter((claim) => claim.type === "ron");
            let nextDeadWall = state.deadWall;
            let nextPendingKanDora = state.pendingKanDora;
            if (state.pendingKanDora && ronClaims.length === 0) {
                nextDeadWall = revealKanDora(state.deadWall);
                nextPendingKanDora = false;
            }
            if (allRiichi) {
                const ronClaimsForRiichi = sorted.filter((claim) => claim.type === "ron");
                if (ronClaimsForRiichi.length === 0) {
                    return finishAbortiveDraw({
                        ...state,
                        players: newPlayers,
                        deadWall: nextDeadWall,
                        pendingKanDora: nextPendingKanDora,
                        riichiSticks: nextRiichiSticks,
                        lastDiscard: { tile: action.discardTile, player: action.player },
                    }, "suuchaRiichi");
                }
                return {
                    ...state,
                    players: newPlayers,
                    deadWall: nextDeadWall,
                    pendingKanDora: nextPendingKanDora,
                    riichiSticks: nextRiichiSticks,
                    lastDiscard: { tile: action.discardTile, player: action.player },
                    lastDiscardWasChankan: false,
                    phase: "claiming",
                    claimOptions: ronClaimsForRiichi,
                    currentPlayer: (action.player + 1) % 4,
                    kuikaeProhibitedTiles: [],
                    pendingAbortiveDraw: "suuchaRiichi",
                    message: `リーチ! 待ち: ${tenpaiStr}`,
                };
            }
            if (sorted.length > 0) {
                return {
                    ...state,
                    players: newPlayers,
                    deadWall: nextDeadWall,
                    pendingKanDora: nextPendingKanDora,
                    riichiSticks: nextRiichiSticks,
                    lastDiscard: { tile: action.discardTile, player: action.player },
                    lastDiscardWasChankan: false,
                    phase: "claiming",
                    claimOptions: sorted,
                    currentPlayer: (action.player + 1) % 4,
                    kuikaeProhibitedTiles: [],
                    message: `リーチ! 待ち: ${tenpaiStr}`,
                };
            }
            if (isSuufonRenda(newPlayers, state.firstTurnInterrupted)) {
                return finishAbortiveDraw({
                    ...state,
                    players: newPlayers,
                    deadWall: nextDeadWall,
                    pendingKanDora: nextPendingKanDora,
                    riichiSticks: nextRiichiSticks,
                    lastDiscard: { tile: action.discardTile, player: action.player },
                }, "suufonRenda");
            }
            return {
                ...state,
                players: newPlayers,
                deadWall: nextDeadWall,
                pendingKanDora: nextPendingKanDora,
                riichiSticks: nextRiichiSticks,
                lastDiscard: { tile: action.discardTile, player: action.player },
                lastDiscardWasChankan: false,
                currentPlayer: (action.player + 1) % 4,
                kuikaeProhibitedTiles: [],
                message: `リーチ! 待ち: ${tenpaiStr}`,
            };
        }
        case "RON": {
            if (!state.lastDiscard)
                return { ...state, message: "\u30ED\u30F3\u3067\u304D\u307E\u305B\u3093" };
            const claimWinners = ronClaimPlayers(state);
            const winners = claimWinners.length > 0 ? claimWinners : [action.winner];
            if (winners.length >= 3) {
                return finishAbortiveDraw(state, "sanchaHou");
            }
            const scores = winners.map((winner) => ronScore(state, winner));
            if (scores.some((score) => score === null)) {
                return { ...state, message: "\u30B9\u30B3\u30A2\u8A08\u7B97\u3067\u304D\u307E\u305B\u3093" };
            }
            if (winners.length === 2) {
                const doubleWinners = winners as [number, number];
                const doubleScores = scores as [ScoreResult, ScoreResult];
                const riichiReceiver = doubleWinners[0];
                const players1 = applyDoubleRonPayments(state.players, doubleWinners, state.lastDiscard.player, doubleScores, riichiReceiver, state.riichiSticks);
                const names = doubleWinners.map((winner) => winner === 0 ? "\u3042\u306A\u305F" : `プレイヤー${winner + 1}`).join("\u30FB");
                const scoreSummary = doubleScores.map((score) => `${score.fu}符${score.han}飜 ${score.score}点`).join(" / ");
                return finishRound(state, players1, riichiReceiver, false, doubleWinners.includes(state.dealer), doubleScores[0], `${names}がダブロン! ${scoreSummary}`);
            }
            const winner = winners[0]!;
            const score = scores[0]!;
            const players1 = applyRonPayment(state.players, winner, state.lastDiscard.player, score, state.riichiSticks);
            const yakuStr = score.yaku.map((y) => y.name).join("\u30FB");
            return finishRound(state, players1, winner, false, winner === state.dealer, score, `${winner === 0 ? "\u3042\u306A\u305F" : `プレイヤー${winner + 1}`}がロン! ${score.fu}符${score.han}飜 ${score.score}点 (${yakuStr})`);
        }
        case "TSUMO": {
            const player = action.player;
            const winTile = state.lastDrawnTile ?? state.players[player].hand[state.players[player].hand.length - 1]!;
            const closedTiles = closedTilesForTsumo(state.players[player].hand, winTile);
            if (!isCompleteHand(closedTiles, state.players[player].melds, winTile)) {
                return { ...state, message: "\u30C4\u30E2\u548C\u4E86\u3067\u304D\u307E\u305B\u3093" };
            }
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
                isDoubleRiichi: state.players[player].doubleRiichi,
                isIppatsu: state.players[player].ippatsu,
                isHaitei: !state.lastDrawWasRinshan && state.wall.length === 0,
                isHoutei: false,
                isRinshan: state.lastDrawWasRinshan,
                isChankan: false,
                isTenhou: player === state.dealer && !state.firstTurnInterrupted && state.players[player].discards.length === 0,
                isChiihou: player !== state.dealer && !state.firstTurnInterrupted && state.players[player].discards.length === 0 && state.players[player].melds.length === 0,
            });
            if (!score) {
                return { ...state, message: "\u30B9\u30B3\u30A2\u8A08\u7B97\u3067\u304D\u307E\u305B\u3093" };
            }
            const updatedTsPlayers = applyTsumoPayment(state.players, player, score);
            const yakuStr = score.yaku.map((y) => y.name).join("\u30FB");
            return finishRound(state, updatedTsPlayers, player, false, player === state.dealer, score, `${player === 0 ? "\u3042\u306A\u305F" : `プレイヤー${player + 1}`}がツモ和了! ${score.fu}符${score.han}飜 ${score.score}点 (${yakuStr})`);
        }
        case "DECLARE_KYUUSHU_KYUUHAI":
            if (!canDeclareKyuushuKyuuhai(state, action.player)) {
                return { ...state, message: "\u4E5D\u7A2E\u4E5D\u724C\u3067\u304D\u307E\u305B\u3093" };
            }
            return finishAbortiveDraw(state, "kyuushuKyuuhai");
        case "END_ROUND":
            return finishRound(state, state.players, null, true, false, null, action.message ?? "\u5C40\u7D42\u4E86");
        default:
            return state;
    }
}
// ── Tuple helpers ─────────────────────────────────────────────────
function updatePlayerInTuple(players: readonly [
    PlayerData,
    PlayerData,
    PlayerData,
    PlayerData
], index: number, updated: PlayerData): [
    PlayerData,
    PlayerData,
    PlayerData,
    PlayerData
] {
    return [
        index === 0 ? updated : players[0],
        index === 1 ? updated : players[1],
        index === 2 ? updated : players[2],
        index === 3 ? updated : players[3],
    ];
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
        ] as unknown as [
            PlayerData,
            PlayerData,
            PlayerData,
            PlayerData
        ],
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
    };
}
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}
function normalizePlayer(value: unknown, fallback: PlayerData): PlayerData {
    if (!isRecord(value))
        return fallback;
    return {
        hand: Array.isArray(value.hand) ? (value.hand as Tile[]) : fallback.hand,
        melds: Array.isArray(value.melds) ? (value.melds as Meld[]) : fallback.melds,
        discards: Array.isArray(value.discards) ? (value.discards as Tile[]) : fallback.discards,
        riichi: typeof value.riichi === "boolean" ? value.riichi : fallback.riichi,
        doubleRiichi: typeof value.doubleRiichi === "boolean" ? value.doubleRiichi : fallback.doubleRiichi,
        ippatsu: typeof value.ippatsu === "boolean" ? value.ippatsu : fallback.ippatsu,
        temporaryFuriten: typeof value.temporaryFuriten === "boolean"
            ? value.temporaryFuriten
            : fallback.temporaryFuriten,
        riichiFuriten: typeof value.riichiFuriten === "boolean" ? value.riichiFuriten : fallback.riichiFuriten,
        points: typeof value.points === "number" ? value.points : fallback.points,
        wind: typeof value.wind === "number" ? (value.wind as Wind) : fallback.wind,
    };
}
export function normalizeGameState(value: unknown): GameState {
    const base = createInitialState(() => 0);
    if (!isRecord(value))
        return base;
    const rawPlayers = value.players;
    const players = Array.isArray(rawPlayers) && rawPlayers.length === 4
        ? ([0, 1, 2, 3].map((i) => normalizePlayer(rawPlayers[i], base.players[i])) as unknown as [
            PlayerData,
            PlayerData,
            PlayerData,
            PlayerData
        ])
        : base.players;
    const rawDeadWall = isRecord(value.deadWall) ? value.deadWall : null;
    return {
        ...base,
        ...value,
        players,
        wall: Array.isArray(value.wall) ? (value.wall as Tile[]) : base.wall,
        deadWall: {
            tiles: rawDeadWall && Array.isArray(rawDeadWall.tiles)
                ? (rawDeadWall.tiles as Tile[])
                : base.deadWall.tiles,
            doraCount: rawDeadWall && typeof rawDeadWall.doraCount === "number"
                ? rawDeadWall.doraCount
                : base.deadWall.doraCount,
        },
        roundWind: typeof value.roundWind === "number" ? value.roundWind : base.roundWind,
        roundNumber: typeof value.roundNumber === "number" ? value.roundNumber : base.roundNumber,
        dealer: typeof value.dealer === "number" ? value.dealer : base.dealer,
        honba: typeof value.honba === "number" ? value.honba : base.honba,
        riichiSticks: typeof value.riichiSticks === "number" ? value.riichiSticks : base.riichiSticks,
        currentPlayer: typeof value.currentPlayer === "number" ? value.currentPlayer : base.currentPlayer,
        lastDiscard: isRecord(value.lastDiscard)
            ? (value.lastDiscard as GameState["lastDiscard"])
            : null,
        winner: typeof value.winner === "number" ? value.winner : null,
        phase: value.phase === "playing" ||
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
        pendingRinshan: typeof value.pendingRinshan === "boolean" ? value.pendingRinshan : base.pendingRinshan,
        lastDrawWasRinshan: typeof value.lastDrawWasRinshan === "boolean" ? value.lastDrawWasRinshan : base.lastDrawWasRinshan,
        lastDiscardWasChankan: typeof value.lastDiscardWasChankan === "boolean" ? value.lastDiscardWasChankan : base.lastDiscardWasChankan,
        kuikaeProhibitedTiles: Array.isArray(value.kuikaeProhibitedTiles)
            ? (value.kuikaeProhibitedTiles as Tile[])
            : base.kuikaeProhibitedTiles,
        firstTurnInterrupted: typeof value.firstTurnInterrupted === "boolean"
            ? value.firstTurnInterrupted
            : base.firstTurnInterrupted,
        pendingAbortiveDraw: value.pendingAbortiveDraw === "kyuushuKyuuhai" ||
            value.pendingAbortiveDraw === "suufonRenda" ||
            value.pendingAbortiveDraw === "suuchaRiichi" ||
            value.pendingAbortiveDraw === "suukanSanra" ||
            value.pendingAbortiveDraw === "sanchaHou"
            ? value.pendingAbortiveDraw
            : base.pendingAbortiveDraw,
        calledDiscardKinds: Array.isArray(value.calledDiscardKinds)
            ? (value.calledDiscardKinds as string[][])
            : base.calledDiscardKinds,
    };
}
