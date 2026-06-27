import React from 'react';
import type { Tile } from '../game/types.js';
import { Suit, Wind, Dragon } from '../game/types.js';

const CHINESE_NUMS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

const SUIT_KANJI: Record<string, string> = {
  [Suit.Man]: '萬',
  [Suit.Pin]: '筒',
  [Suit.Sou]: '索',
};

const WIND_KANJI: Record<number, string> = {
  [Wind.Ton]: '東',
  [Wind.Nan]: '南',
  [Wind.Sha]: '西',
  [Wind.Pei]: '北',
};

const DRAGON_KANJI: Record<number, string> = {
  [Dragon.Haku]: '白',
  [Dragon.Hatsu]: '發',
  [Dragon.Chun]: '中',
};

interface TileProps {
  tile: Tile;
  size?: number;
  selected?: boolean;
  isDrawn?: boolean;
  onClick?: () => void;
}

export const TileSVG: React.FC<TileProps> = ({ tile, size = 48, selected, isDrawn, onClick }) => {
  const w = size;
  const h = Math.round(size * 1.4);
  const isNumber = tile.suit === Suit.Man || tile.suit === Suit.Pin || tile.suit === Suit.Sou;

  // ── Tile face content ──

  let mainChar = '';
  let subChar = '';
  let mainColor = '#222';
  let subColor = '#222';
  let bgColor = '#f5efe6';

  if (tile.suit === Suit.Wind) {
    mainChar = WIND_KANJI[tile.value as number] ?? '?';
    mainColor = '#333';
  } else if (tile.suit === Suit.Dragon) {
    mainChar = DRAGON_KANJI[tile.value as number] ?? '?';
    if (tile.value === Dragon.Chun) { mainColor = '#cc2222'; bgColor = '#fdf0f0'; }
    else if (tile.value === Dragon.Hatsu) { mainColor = '#228833'; bgColor = '#f0fdf0'; }
    else { mainColor = '#333'; bgColor = '#f5f5f5'; }
  } else {
    const num = tile.value as number;
    mainChar = CHINESE_NUMS[num] ?? String(num);
    mainColor = tile.suit === Suit.Man ? '#cc2222'
      : tile.suit === Suit.Pin ? '#2266aa'
      : '#228833';
    subChar = SUIT_KANJI[tile.suit] ?? '';
    subColor = mainColor;
  }

  if (tile.red && isNumber) {
    mainColor = '#dd0000';
    subColor = '#dd0000';
    bgColor = '#fff5f0';
  }

  // ── Layout ──

  const margin = 2;
  const innerW = w - margin * 2;
  const innerH = h - margin * 2;

  const mainFontSize = isNumber ? Math.round(w * 0.45) : Math.round(w * 0.52);
  const subFontSize = Math.round(w * 0.2);

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        marginRight: isDrawn ? 4 : 1,
        opacity: 1,
      }}
      onClick={onClick}
    >
      {/* Shadow */}
      <rect x={margin + 1.5} y={margin + 1.5} width={innerW} height={innerH} rx={4} fill="#00000022" />
      {/* Tile body */}
      <rect
        x={margin}
        y={margin}
        width={innerW}
        height={innerH}
        rx={5}
        fill={bgColor}
        stroke={selected ? '#ff8800' : '#bbb'}
        strokeWidth={selected ? 2.5 : 1}
      />
      {/* Inner border */}
      <rect
        x={margin + 3}
        y={margin + 3}
        width={innerW - 6}
        height={innerH - 6}
        rx={3}
        fill="none"
        stroke={selected ? '#ff880055' : '#ddd'}
        strokeWidth={0.5}
      />
      {/* Red dora dot */}
      {tile.red && isNumber && (
        <circle cx={w - margin - 5} cy={margin + 5} r={3} fill="#dd0000" />
      )}
      {/* Main character */}
      <text
        x={w / 2}
        y={h / 2 - (subChar !== '' ? subFontSize * 0.3 : 0)}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={mainFontSize}
        fill={mainColor}
        fontWeight="bold"
        fontFamily="serif"
        style={{ userSelect: 'none' }}
      >
        {mainChar}
      </text>
      {/* Sub character (suit kanji) */}
      {subChar !== '' && (
        <text
          x={w / 2}
          y={h / 2 + mainFontSize * 0.55}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={subFontSize}
          fill={subColor}
          fontFamily="serif"
          style={{ userSelect: 'none' }}
        >
          {subChar}
        </text>
      )}
    </svg>
  );
};

/** Simplified tile back for opponents */
export const TileBack: React.FC<{ size?: number }> = ({ size = 48 }) => {
  const h = Math.round(size * 1.4);
  return (
    <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`} style={{ marginRight: 1 }}>
      <rect x={2} y={2} width={size - 4} height={h - 4} rx={5} fill="#4a7a4a" stroke="#3a6a3a" strokeWidth={1.2} />
      <rect x={5} y={5} width={size - 10} height={h - 10} rx={3} fill="none" stroke="#3a6a3a33" strokeWidth={0.5} />
      <text
        x={size / 2}
        y={h / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={Math.round(size * 0.35)}
        fill="#3a6a3a88"
        fontFamily="serif"
      >
        麻
      </text>
    </svg>
  );
};
