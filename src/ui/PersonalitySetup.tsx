import React from 'react';
import { Text, Box } from 'ink';
import type { AiPersonality } from '../game/types.js';
import {
  PERSONALITY_TEMPLATES,
  BALANCER,
} from '../game/aiPersonality.js';

// ── Types ────────────────────────────────────────────────────────────

export const PARAM_KEYS: (keyof AiPersonality)[] = [
  'aggression',
  'riskTolerance',
  'meldFrequency',
  'riichiFrequency',
  'handValueFocus',
];

export const PARAM_NAMES: Record<keyof AiPersonality, string> = {
  aggression: '攻撃性',
  riskTolerance: 'リスク許容度',
  meldFrequency: '副露指向',
  riichiFrequency: 'リーチ指向',
  handValueFocus: '打点志向',
};

export const PARAM_DESCRIPTIONS: Record<keyof AiPersonality, string> = {
  aggression: '押しの積極性',
  riskTolerance: '危険牌許容度',
  meldFrequency: '鳴きの頻度',
  riichiFrequency: 'リーチの積極性',
  handValueFocus: '打点志向',
};

const TEMPLATE_NAMES: Record<string, string> = {};
for (const t of PERSONALITY_TEMPLATES) {
  TEMPLATE_NAMES[t.id] = t.name;
}

export interface SlotConfig {
  /** テンプレートID、または 'custom' */
  templateId: string;
  /** custom モード時のパラメータ */
  customParams: AiPersonality;
}

export function makeDefaultSlot(): SlotConfig {
  return { templateId: 'balancer', customParams: { ...BALANCER } };
}

export function resolveSlot(slot: SlotConfig): AiPersonality {
  if (slot.templateId === 'custom') return { ...slot.customParams };
  const t = PERSONALITY_TEMPLATES.find((p) => p.id === slot.templateId);
  return t ? { ...t.params } : { ...BALANCER };
}

export function templateLabel(id: string): string {
  return TEMPLATE_NAMES[id] ?? id;
}

// ── Component ────────────────────────────────────────────────────────

interface PersonalitySetupProps {
  slots: readonly [SlotConfig, SlotConfig, SlotConfig];
  selectedSlot: number;
  showCustom: boolean;
  selectedParam: number;
}

export const PersonalitySetup: React.FC<PersonalitySetupProps> = ({
  slots,
  selectedSlot,
  showCustom,
  selectedParam,
}) => {
  if (showCustom) {
    return (
      <Box padding={1} flexDirection="column">
        <Text bold>カスタム調整 — P{selectedSlot + 2}</Text>
        <Text dimColor>⬆⬇: パラメータ選択 / ⬅➡: 値変更 / Enter: 完了 / Q: 戻る</Text>
        <Box flexDirection="column" marginTop={1}>
          {PARAM_KEYS.map((key, i) => {
            const slot = slots[selectedSlot]!;
            const val = slot.templateId === 'custom'
              ? slot.customParams[key]
              : resolveSlot(slot)[key];
            const isSelected = i === selectedParam;
            const bar = '█'.repeat(val) + '░'.repeat(5 - val);
            const color = val >= 4 ? 'red' : val <= 2 ? 'green' : 'yellow';
            return (
              <Box key={key}>
                <Text inverse={isSelected}> </Text>
                <Box width={14}><Text bold={isSelected} inverse={isSelected}>{PARAM_NAMES[key]}</Text></Box>
                <Text color={color}>{bar}</Text>
                <Text dimColor>{` ${val}`}</Text>
                <Text dimColor>{`  (${PARAM_DESCRIPTIONS[key]})`}</Text>
              </Box>
            );
          })}
        </Box>
      </Box>
    );
  }

  return (
    <Box padding={1} flexDirection="column">
      <Text bold>AIプレイヤー設定 — 打ち方を選んでください</Text>
      <Text dimColor>⬆⬇: プレイヤー選択 / ⬅➡: テンプレート変更 / R: ランダム</Text>
      <Text dimColor>Enter: カスタム調整 / S: ゲーム開始 / Q: キャンセル</Text>

      <Box marginY={1} flexDirection="column">
        {slots.map((slot, i) => {
          const playerNum = i + 2;
          const isSelected = i === selectedSlot;
          const resolved = resolveSlot(slot);
          const label = slot.templateId === 'custom' ? 'カスタム' : templateLabel(slot.templateId);
          return (
            <Box key={i} flexDirection="column" marginBottom={1}>
              <Box>
                <Text inverse={isSelected}> </Text>
                <Text bold={isSelected} inverse={isSelected}>
                  {` P${playerNum}: `}
                </Text>
                <Text bold={isSelected} inverse={isSelected} color="cyan">
                  {`[${label}]`}
                </Text>
                {isSelected && <Text color="yellow"> ← 選択中</Text>}
              </Box>
              {isSelected && (
                <Box marginLeft={4} flexDirection="column">
                  {PARAM_KEYS.map((key) => {
                    const val = resolved[key];
                    const bar = '█'.repeat(val) + '░'.repeat(5 - val);
                    const color = val >= 4 ? 'red' : val <= 2 ? 'green' : 'yellow';
                    return (
                      <Box key={key}>
                        <Box width={14}><Text dimColor>{PARAM_NAMES[key]}</Text></Box>
                        <Text color={color}>{bar}</Text>
                        <Text dimColor>{` ${val}`}</Text>
                      </Box>
                    );
                  })}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>{'─'.repeat(40)}</Text>
      </Box>
      <Box>
        <Text color="green" bold>S</Text>
        <Text> ゲームを開始 / </Text>
        <Text color="yellow" bold>Q</Text>
        <Text> キャンセル</Text>
      </Box>
    </Box>
  );
};
