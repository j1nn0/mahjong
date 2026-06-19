import React from "react";
import { Box, Text } from "ink";

interface KeyLegendProps {
  phase: "playing" | "claiming";
}

export const KeyLegend: React.FC<KeyLegendProps> = ({ phase }) => {
  const legend =
    phase === "claiming"
      ? "L:ロン C:チー P:ポン K:カン Space/Esc:パス ←→:選択"
      : "←→:選択 Enter:打牌 T:ツモ R:リーチ K:カン Y:九種 Q:終了";
  return (
    <Box marginTop={1}>
      <Text dimColor>{legend}</Text>
    </Box>
  );
};
