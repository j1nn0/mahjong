import React from "react";
import { Box, Text } from "ink";

interface KeyLegendProps {
  phase: "playing" | "claiming";
}

export const KeyLegend: React.FC<KeyLegendProps> = ({ phase }) => {
  if (phase === "claiming") {
    return (
      <Box marginTop={1}>
        <Text dimColor>
          <Text color="yellow">L</Text>:ロン <Text color="yellow">C</Text>:チー{" "}
          <Text color="yellow">P</Text>:ポン <Text color="yellow">K</Text>:カン Space/Esc:パス{" "}
          ←→:選択
        </Text>
      </Box>
    );
  }
  return (
    <Box marginTop={1}>
      <Text dimColor>
        ←→:選択 Enter:打牌 <Text color="green">T</Text>:ツモ <Text color="yellow">R</Text>:リーチ{" "}
        <Text color="cyan">K</Text>:カン <Text color="magenta">Y</Text>:九種{" "}
        <Text color="red">Q</Text>:終了
      </Text>
    </Box>
  );
};
