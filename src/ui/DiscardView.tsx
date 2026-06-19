import React from "react";
import { Text } from "ink";
import { formatTile } from "../game/tiles.js";
import { type Tile, type Discard, Suit } from "../game/types.js";

// ── Color helper ────────────────────────────────────────────────────

export function tileColor(tile: Tile): string {
  switch (tile.suit) {
    case Suit.Man:
      return "red";
    case Suit.Pin:
      return "blue";
    case Suit.Sou:
      return "green";
    case Suit.Wind:
      return "magenta";
    case Suit.Dragon:
      return "yellow";
  }
}

// ── Max display count computation ─────────────────────────────────

/**
 * 端末幅と compact モードから省略なしで表示できる最大捨て牌枚数を計算する。
 * compact 時は端末幅半分、非 compact 時はフル幅を基準に、
 * 1 枚あたり 3 表示幅（Unicode 牌 + 空白）、
 * 先頭に `...N ` のインジケータ 5 幅分を確保する。
 */
export function computeMaxDisplayCount(terminalWidth: number, compact?: boolean): number {
  const available = compact ? Math.floor(terminalWidth / 2) - 4 : terminalWidth - 4;
  const min = compact ? 6 : 12;
  return Math.max(min, Math.floor(available / 3));
}

// ── Discard river ──────────────────────────────────────────────────

export interface DiscardViewProps {
  discards: readonly Discard[];
  terminalWidth: number | undefined;
  compact: boolean | undefined;
}

export const DiscardView: React.FC<DiscardViewProps> = ({ discards, terminalWidth, compact }) => {
  if (discards.length === 0) return <Text dimColor>--</Text>;

  const maxDisplayCount =
    terminalWidth != null ? computeMaxDisplayCount(terminalWidth, compact) : 18;

  if (discards.length <= maxDisplayCount) {
    return (
      <Text>
        {discards.map((d, i) =>
          d.isRiichi ? (
            <Text key={i} color={tileColor(d.tile)} inverse>
              {formatTile(d.tile)}{" "}
            </Text>
          ) : (
            <Text key={i} color={tileColor(d.tile)}>
              {formatTile(d.tile)}{" "}
            </Text>
          ),
        )}
      </Text>
    );
  }

  const omitted = discards.length - maxDisplayCount;
  const visible = discards.slice(-maxDisplayCount);
  return (
    <Text>
      <Text dimColor>...{omitted} </Text>
      {visible.map((d, i) =>
        d.isRiichi ? (
          <Text key={i} color={tileColor(d.tile)} inverse>
            {formatTile(d.tile)}{" "}
          </Text>
        ) : (
          <Text key={i} color={tileColor(d.tile)}>
            {formatTile(d.tile)}{" "}
          </Text>
        ),
      )}
    </Text>
  );
};
