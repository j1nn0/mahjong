import { type Tile, type Meld, type Discard, Wind } from "../game/types.js";
import { type ScoreResult } from "../game/scoring.js";

// ── Types ─────────────────────────────────────────────────────────

export interface PlayerData {
  hand: readonly Tile[];
  melds: readonly Meld[];
  discards: readonly Discard[];
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

export type AbortiveDrawReason =
  | "kyuushuKyuuhai"
  | "suufonRenda"
  | "suuchaRiichi"
  | "suukanSanra"
  | "sanchaHou";

export interface RoundHistoryItem {
  roundName: string;
  resultText: string;
  pointChanges: readonly number[];
  /** 責任払いの説明（例: "責任払い: P2"）。未発生時は undefined */
  responsibilityMessage?: string;
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
  pendingKanDora: boolean;
  roundHistory: readonly RoundHistoryItem[];
}

// ── Actions ────────────────────────────────────────────────────────

export type GameAction =
  | {
      type: "START_GAME";
    }
  | {
      type: "DRAW";
      player: number;
    }
  | {
      type: "DISCARD";
      player: number;
      tile: Tile;
    }
  | {
      type: "DECLARE_RIICHI";
      player: number;
      discardTile: Tile;
    }
  | {
      type: "CHI";
      player: number;
      optionIndex: number;
    }
  | {
      type: "PON";
      player: number;
    }
  | {
      type: "DAIMINKAN";
      player: number;
    }
  | {
      type: "ANKAN";
      player: number;
      tile: Tile;
    }
  | {
      type: "KAKAN";
      player: number;
      tile: Tile;
    }
  | {
      type: "PASS_CLAIM";
    }
  | {
      type: "RON";
      winner: number;
    }
  | {
      type: "TSUMO";
      player: number;
    }
  | {
      type: "DECLARE_KYUUSHU_KYUUHAI";
      player: number;
    }
  | {
      type: "END_ROUND";
      message?: string;
    }
  | {
      type: "NEXT_ROUND";
    }
  | {
      type: "RESTORE";
      state: GameState;
    }
  | {
      type: "SET_MESSAGE";
      message: string;
    };
