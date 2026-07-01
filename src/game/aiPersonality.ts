import { type AiPersonality } from './types.js';

// ── Template presets ──────────────────────────────────────────────────

/** バランサー — 標準的な打ち方。現行AI相当 */
export const BALANCER: AiPersonality = {
  aggression: 2,
  riskTolerance: 2,
  meldFrequency: 2,
  riichiFrequency: 2,
  handValueFocus: 3,
} as const;

/** 守りの名人 — 安全第一、放銃を極力避ける */
export const DEFENSIVE: AiPersonality = {
  aggression: 1,
  riskTolerance: 1,
  meldFrequency: 2,
  riichiFrequency: 1,
  handValueFocus: 3,
} as const;

/** 攻めの一点張り — リーチ連打、危険牌でも押す */
export const AGGRESSIVE: AiPersonality = {
  aggression: 5,
  riskTolerance: 4,
  meldFrequency: 4,
  riichiFrequency: 5,
  handValueFocus: 2,
} as const;

/** 手役派 — 門前思考、高打点を狙う */
export const HAND_VALUE: AiPersonality = {
  aggression: 3,
  riskTolerance: 3,
  meldFrequency: 1,
  riichiFrequency: 3,
  handValueFocus: 5,
} as const;

/** 鳴きの達人 — 副露を多用してスピード勝負 */
export const MELD_EXPERT: AiPersonality = {
  aggression: 4,
  riskTolerance: 4,
  meldFrequency: 5,
  riichiFrequency: 2,
  handValueFocus: 2,
} as const;

// ── Personality definitions for UI ────────────────────────────────────

export interface PersonalityTemplate {
  id: string;
  name: string;
  description: string;
  params: AiPersonality;
}

export const PERSONALITY_TEMPLATES: readonly PersonalityTemplate[] = [
  { id: 'random', name: 'ランダム', description: '各プレイヤーにランダムな性格を割り当てる', params: null as unknown as AiPersonality },
  { id: 'balancer', name: 'バランサー', description: '標準的な打ち方', params: BALANCER },
  { id: 'defensive', name: '守りの名人', description: '安全第一、放銃を極力避ける', params: DEFENSIVE },
  { id: 'aggressive', name: '攻めの一点張り', description: 'リーチ連打、危険牌でも押す', params: AGGRESSIVE },
  { id: 'handValue', name: '手役派', description: '門前思考、高打点を狙う', params: HAND_VALUE },
  { id: 'meldExpert', name: '鳴きの達人', description: '副露を多用してスピード勝負', params: MELD_EXPERT },
] as const;

// ── Helpers ──────────────────────────────────────────────────────────

/** 指定された範囲 (1-5) のランダムな値を生成 */
function randomParam(rng: () => number): number {
  return Math.floor(rng() * 5) + 1;
}

/** 完全にランダムなAI性格を生成する */
export function randomPersonality(rng: () => number = Math.random): AiPersonality {
  return {
    aggression: randomParam(rng),
    riskTolerance: randomParam(rng),
    meldFrequency: randomParam(rng),
    riichiFrequency: randomParam(rng),
    handValueFocus: randomParam(rng),
  };
}

/** テンプレートIDから性格パラメータを取得。ランダムの場合は randomPersonality を返す */
export function resolvePersonality(templateId: string, rng?: () => number): AiPersonality {
  if (templateId === 'random') return randomPersonality(rng);
  const found = PERSONALITY_TEMPLATES.find((t) => t.id === templateId);
  return found ? { ...found.params } : { ...BALANCER };
}
