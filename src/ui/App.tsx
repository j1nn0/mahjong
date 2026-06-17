import React, { useReducer, useEffect, useState } from 'react';
import { Text, Box, useInput } from 'ink';
import { createInitialState, gameReducer, processAiTurn } from '../state/GameState.js';
import { formatTile, tileToUnicode } from '../game/tiles.js';
import { type Tile, Suit } from '../game/types.js';

// ── Color helpers ──────────────────────────────────────────────────

function tileColor(tile: Tile): string {
  switch (tile.suit) {
    case Suit.Man: return 'red';
    case Suit.Pin: return 'blue';
    case Suit.Sou: return 'green';
    case Suit.Wind: return 'magenta';
    case Suit.Dragon: return 'yellow';
  }
}

// ── Hand display component ─────────────────────────────────────────

interface HandViewProps {
  tiles: readonly Tile[];
  selectedIndex: number;
  riichi: boolean;
  isHuman: boolean;
}

const HandView: React.FC<HandViewProps> = ({ tiles, selectedIndex, riichi, isHuman }) => {
  if (!isHuman) {
    const count = tiles.length;
    const hidden = '\u{1F02B}'; // 🀫
    return (
      <Text>
        {riichi ? 'リーチ! ' : ''}
        {hidden.repeat(count)}
      </Text>
    );
  }

  return (
    <Box>
      {tiles.map((tile, i) => {
        const char = tileToUnicode(tile);
        const isSelected = i === selectedIndex;
        return (
          <Box key={`${tile.suit}:${tile.value}:${tile.red ?? false}:${i}`} marginRight={0}>
            <Text color={tileColor(tile)} inverse={isSelected}>
              {char}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};

// ── Discard river component ───────────────────────────────────────

interface DiscardViewProps {
  discards: readonly Tile[];
  riichi: boolean;
}

const DiscardView: React.FC<DiscardViewProps> = ({ discards, riichi }) => {
  if (discards.length === 0) {
    return <Text dimColor>--</Text>;
  }
  return (
    <Text>
      {riichi ? '(リーチ) ' : ''}
      {discards.map((t, i) => (
        <Text key={i} color={tileColor(t)}>{formatTile(t)} </Text>
      ))}
    </Text>
  );
};

// ── Action bar ────────────────────────────────────────────────────

interface ActionBarProps {
  canTsumo: boolean;
  canRiichi: boolean;
  message: string;
}

const ActionBar: React.FC<ActionBarProps> = ({ canTsumo, canRiichi, message }) => {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        {canRiichi && <Text color="yellow"> [R]リーチ </Text>}
        {canTsumo && <Text color="green"> [T]ツモ </Text>}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{'← →: 選択  Enter: 打牌'}</Text>
      </Box>
      <Box marginTop={1}>
        <Text>{message}</Text>
      </Box>
    </Box>
  );
};

// ── Opponent info ─────────────────────────────────────────────────

interface OpponentInfoProps {
  wind: string;
  discards: readonly Tile[];
  riichi: boolean;
  points: number;
  tileCount: number;
}

const OpponentInfo: React.FC<OpponentInfoProps> = ({ wind, discards, riichi, points, tileCount }) => {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>
        {wind} ({points}点) {riichi ? '(リーチ)' : ''} 手牌:{tileCount}
      </Text>
      <Box>
        <DiscardView discards={discards} riichi={riichi} />
      </Box>
    </Box>
  );
};

// ── Main game component ───────────────────────────────────────────

const WIND_NAMES = ['東', '南', '西', '北'];

const App: React.FC = () => {
  const [state, dispatch] = useReducer(gameReducer, null, createInitialState);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [localProcessing, setLocalProcessing] = useState(false);

  // Start game on mount
  useEffect(() => {
    dispatch({ type: 'START_GAME' });
  }, []);

  // Auto-draw when it's human's turn and hand has 13 tiles
  useEffect(() => {
    if (state.phase !== 'playing') return;
    if (state.currentPlayer !== 0) return;
    if (state.players[0].hand.length === 13) {
      dispatch({ type: 'DRAW', player: 0 });
    }
  }, [state.currentPlayer, state.phase, state.players[0].hand.length]);

  // AI turn processing
  useEffect(() => {
    if (state.phase !== 'playing') return;
    if (state.currentPlayer === 0) return;
    if (localProcessing) return;

    setLocalProcessing(true);
    const timer = setTimeout(() => {
      const { state: _, action } = processAiTurn(state);
      if (action) {
        dispatch(action);
      }
      setLocalProcessing(false);
    }, 800);

    return () => clearTimeout(timer);
  }, [state, localProcessing]);

  // Helper: check if human can tsumo
  const humanCanTsumo = state.phase === 'playing' && state.currentPlayer === 0 &&
    state.players[0].hand.length === 14;

  // Helper: check if human can riichi
  const humanCanRiichi = (() => {
    if (state.phase !== 'playing') return false;
    if (state.currentPlayer !== 0) return false;
    const p = state.players[0];
    if (p.riichi) return false;
    if (p.points < 1000) return false;
    return true;
  })();

  // Keyboard input
  useInput((input, key) => {
    if (state.phase === 'ended') {
      if (input === 'q' || input === ' ') {
        dispatch({ type: 'START_GAME' });
        setSelectedIndex(0);
      }
      return;
    }

    if (state.currentPlayer !== 0) return;

    const hand = state.players[0].hand;

    if (key.leftArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
      return;
    }
    if (key.rightArrow) {
      setSelectedIndex(prev => Math.min(hand.length - 1, prev + 1));
      return;
    }

    // Number keys for direct tile selection
    const num = parseInt(input, 10);
    if (num >= 1 && num <= hand.length) {
      setSelectedIndex(num - 1);
      return;
    }

    if (key.return) {
      if (hand.length === 0) return;
      const tile = hand[selectedIndex];
      if (!tile) return;
      dispatch({ type: 'DISCARD', player: 0, tile });
      setSelectedIndex(prev => Math.min(prev, hand.length - 2));
      return;
    }

    if (input === 'r' && humanCanRiichi) {
      if (hand.length === 0) return;
      const tile = hand[selectedIndex];
      if (!tile) return;
      dispatch({ type: 'DECLARE_RIICHI', player: 0, discardTile: tile });
      return;
    }

    if (input === 't') {
      dispatch({ type: 'TSUMO', player: 0 });
      return;
    }
  });

  const selectedHand = state.players[0].hand;

  // Game ended screen
  if (state.phase === 'ended') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold>{state.message}</Text>
        <Text dimColor>スペースキーまたはQで新しいゲーム</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      {/* Opponents */}
      <Box flexDirection="column">
        <OpponentInfo
          wind={`${WIND_NAMES[(state.currentPlayer + 2) % 4]!}家`}
          discards={state.players[2].discards}
          riichi={state.players[2].riichi}
          points={state.players[2].points}
          tileCount={state.players[2].hand.length}
        />
        <OpponentInfo
          wind={`${WIND_NAMES[(state.currentPlayer + 1) % 4]!}家`}
          discards={state.players[1].discards}
          riichi={state.players[1].riichi}
          points={state.players[1].points}
          tileCount={state.players[1].hand.length}
        />
        <OpponentInfo
          wind={`${WIND_NAMES[(state.currentPlayer + 3) % 4]!}家`}
          discards={state.players[3].discards}
          riichi={state.players[3].riichi}
          points={state.players[3].points}
          tileCount={state.players[3].hand.length}
        />
      </Box>

      <Text dimColor>{'─'.repeat(40)}</Text>

      {/* Last discard */}
      <Box marginTop={1} marginBottom={1}>
        <Text bold>捨て牌: </Text>
        {state.lastDiscard ? (
          <Text color={tileColor(state.lastDiscard.tile)}>
            {formatTile(state.lastDiscard.tile)} ({['あなた','P2','P3','P4'][state.lastDiscard.player]})
          </Text>
        ) : (
          <Text dimColor>まだありません</Text>
        )}
      </Box>

      {/* Wall info */}
      <Box>
        <Text dimColor>山残り: {state.wall.length} / リーチ棒: {state.riichiSticks}</Text>
      </Box>

      <Text dimColor>{'─'.repeat(40)}</Text>

      {/* Human hand */}
      <Box marginTop={1} marginBottom={1}>
        <Text bold>東家 (あなた) </Text>
        <Text dimColor>({state.players[0].points}点) </Text>
        {state.players[0].riichi && <Text color="yellow">リーチ中 </Text>}
      </Box>
      <HandView
        tiles={selectedHand}
        selectedIndex={selectedIndex}
        riichi={state.players[0].riichi}
        isHuman={true}
      />

      {/* Action bar */}
      <ActionBar
        canTsumo={humanCanTsumo}
        canRiichi={humanCanRiichi}
        message={state.message}
      />
    </Box>
  );
};

export default App;
