/** 牌の種類 (0-33) */
export enum Suit {
  Man = 'm',
  Pin = 'p',
  Sou = 's',
  Wind = 'w',
  Dragon = 'd',
}

export enum Wind {
  Ton = 0,
  Nan = 1,
  Sha = 2,
  Pei = 3,
}

export enum Dragon {
  Haku = 0,
  Hatsu = 1,
  Chun = 2,
}

/** 数牌 (1-9) */
export interface NumberTile {
  suit: Suit.Man | Suit.Pin | Suit.Sou;
  value: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  red?: boolean;
}

/** 字牌 (風牌・三元牌) */
export type HonorTile =
  | { suit: Suit.Wind; value: Wind; red?: false }
  | { suit: Suit.Dragon; value: Dragon; red?: false };

export type Tile = NumberTile | HonorTile;

/** プレイヤー位置 */
export enum PlayerWind {
  Ton = 0, // 東家 (親)
  Nan = 1, // 南家
  Sha = 2, // 西家
  Pei = 3, // 北家
}

/** 面子の種類 */
export enum MeldType {
  Chi = 'chi',       // チー
  Poon = 'poon',     // ポン
  Kan = 'kan',       // カン
  ClosedKan = 'closedKan', // 暗カン
  AddedKan = 'addedKan',   // 加カン
}

/** 副露された面子 */
export interface Meld {
  type: MeldType;
  tiles: readonly Tile[];
  /** チーの場合、どの牌を他家からもらったか（順序維持のため） */
  calledTile?: Tile;
  /** 鳴いた牌の打牌者（0-3）。ポン・大明カン・チーで設定 */
  calledFrom?: number;
  /** 責任払いの種類（包成立時に設定） */
  responsibility?: 'daisangen' | 'daisuushii';
}

export interface Hand {
  /** 手牌 (門前の牌、暗カン含む) */
  closed: readonly Tile[];
  /** 副露面子 */
  melds: readonly Meld[];
}

/** 捨て牌1枚 */
export interface Discard {
  tile: Tile;
  isRiichi: boolean;
  player: PlayerWind;
}

/** 河 (1人の捨て牌) */
export interface DiscardRiver {
  discards: readonly Discard[];
}

/** 牌山 */
export interface Wall {
  /** 残りの牌 */
  tiles: readonly Tile[];
  /** 王牌 (ドラ表示牌・裏ドラ表示牌を含む) */
  deadWall: readonly Tile[];
  /** 現在のドラ表示牌インデックス (何枚めくり済みか) */
  doraIndicatorIndex: number;
}

/** 局の状態 */
export interface RoundState {
  round: number;      // 0=東, 1=南, 2=西, 3=北
  honba: number;      // 本場数
  riichiSticks: number; // 供託リーチ棒
  playerWind: PlayerWind; // 現在の親
}

/** AI性格パラメータ (1-5)。値が大きいほどその特性が強い */
export interface AiPersonality {
  /** 押しの積極性 */
  aggression: number;
  /** 危険牌許容度 */
  riskTolerance: number;
  /** 鳴き頻度 */
  meldFrequency: number;
  /** リーチ頻度 */
  riichiFrequency: number;
  /** 打点志向 (低い=スピード優先、高い=高打点優先) */
  handValueFocus: number;
}
