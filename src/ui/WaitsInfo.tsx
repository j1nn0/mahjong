import React from "react";
import { Text } from "ink";
import { formatTile } from "../game/tiles.js";
import type { Tile } from "../game/types.js";

interface WaitsInfoProps {
  waits: readonly Tile[];
  showNames: boolean;
}

export const WaitsInfo: React.FC<WaitsInfoProps> = ({ waits, showNames }) => {
  if (waits.length === 0) return null;
  return (
    <>
      <Text color="blue"> 待ち: {waits.length}種 </Text>
      {showNames && <Text> 待ち牌: {waits.map(formatTile).join(" ")}</Text>}
    </>
  );
};
