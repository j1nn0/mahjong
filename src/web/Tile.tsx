import React from 'react';
import type { Tile } from '../game/types.js';
import { Suit } from '../game/types.js';
import { tileToUnicode } from '../game/tiles.js';
interface TileProps {
  tile: Tile;
  size?: number;
  selected?: boolean;
  isDrawn?: boolean;
  onClick?: () => void;
}

const suitFill: Record<string, string> = {
  [Suit.Man]: '#fff0f0',
  [Suit.Pin]: '#f0f0ff',
  [Suit.Sou]: '#f0fff0',
  [Suit.Wind]: '#fff0ff',
  [Suit.Dragon]: '#fffff0',
};

const suitStroke: Record<string, string> = {
  [Suit.Man]: '#cc3333',
  [Suit.Pin]: '#3333cc',
  [Suit.Sou]: '#33aa33',
  [Suit.Wind]: '#cc33cc',
  [Suit.Dragon]: '#ccaa33',
};

const suitColor: Record<string, string> = {
  [Suit.Man]: '#cc0000',
  [Suit.Pin]: '#0000cc',
  [Suit.Sou]: '#008800',
  [Suit.Wind]: '#990099',
  [Suit.Dragon]: '#996600',
};

export const TileSVG: React.FC<TileProps> = ({ tile, size = 48, selected, isDrawn, onClick }) => {
  const w = size;
  const h = Math.round(size * 1.35);
  const pad = 2;
  const unicode = tileToUnicode(tile);
  const fill = tile.red ? '#ffe0e0' : (suitFill[tile.suit] ?? '#fff');
  const stroke = selected ? '#ff6600' : (suitStroke[tile.suit] ?? '#888');
  const strokeW = selected ? 3 : 1.5;
  const color = suitColor[tile.suit] ?? '#000';

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{ cursor: onClick ? 'pointer' : 'default', marginRight: 2, opacity: isDrawn ? 1 : 1 }}
      onClick={onClick}
    >
      {/* Shadow */}
      <rect x={pad + 1} y={pad + 1} width={w - pad * 2} height={h - pad * 2} rx={4} fill="#00000020" />
      {/* Tile body */}
      <rect x={pad} y={pad} width={w - pad * 2} height={h - pad * 2} rx={4} fill={fill} stroke={stroke} strokeWidth={strokeW} />
      {/* Red dora indicator */}
      {tile.red && (
        <circle cx={w - pad - 6} cy={pad + 6} r={3} fill="red" />
      )}
      {/* Unicode tile character */}
      <text
        x={w / 2}
        y={h / 2 + 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={Math.round(w * 0.55)}
        fill={color}
        style={{ userSelect: 'none' }}
      >
        {unicode}
      </text>
    </svg>
  );
};
