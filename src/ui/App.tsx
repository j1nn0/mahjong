import React, { useReducer, useEffect, useState } from 'react';
import { Text, Box, useInput } from 'ink';
import { createInitialState, gameReducer, processAiTurn } from '../state/GameState.js';
import type { ClaimOption } from '../state/GameState.js';
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

// ── Hand display ───────────────────────────────────────────────────

interface HandViewProps {
  tiles: readonly Tile[];
  selectedIndex: number;
  riichi: boolean;
  isHuman: boolean;
}

const HandView: React.FC<HandViewProps> = ({ tiles, selectedIndex, riichi, isHuman }) => {
  if (!isHuman) {
    return (
      <Text>
        {riichi ? 'リーチ! ' : ''}
        {'🀫'.repeat(tiles.length)}
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
            <Text color={tileColor(tile)} inverse={isSelected}>{char}</Text>
          </Box>
        );
      })}
    </Box>
  );
};

// ── Discard river ──────────────────────────────────────────────────

interface DiscardViewProps {
  discards: readonly Tile[];
  riichi: boolean;
}

const DiscardView: React.FC<DiscardViewProps> = ({ discards, riichi }) => {
  if (discards.length === 0) return <Text dimColor>--</Text>;
  return (
    <Text>
      {riichi ? '(リーチ) ' : ''}
      {discards.map((t, i) => <Text key={i} color={tileColor(t)}>{formatTile(t)} </Text>)}
    </Text>
  );
};

// ── Opponent info ──────────────────────────────────────────────────
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
      <Text bold>{wind} ({points}点) {riichi ? '(リーチ)' : ''} 手牌:{tileCount}</Text>
      <Box><DiscardView discards={discards} riichi={riichi} /></Box>
    </Box>
  );
};

// ── Claim menu ─────────────────────────────────────────────────────

interface ClaimMenuProps {
  options: readonly ClaimOption[];
  selectedIndex: number;
}

const ClaimMenu: React.FC<ClaimMenuProps> = ({ options, selectedIndex }) => {
  const grouped = new Map<string, ClaimOption[]>();
  for (const opt of options) {
    const key = opt.type === 'chi' ? 'チー' : opt.type === 'pon' ? 'ポン' : 'カン';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(opt);
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>鳴き:</Text>
      {options.map((opt, i) => (
        <Text key={i} inverse={i === selectedIndex} wrap="truncate">
          {opt.display}
        </Text>
      ))}
      <Text dimColor>C:チー P:ポン K:カン Space:パス ←→:選択</Text>
    </Box>
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
        {canTsumo && <Text color="green"> [T]ツモ </Text>}
        {canRiichi && <Text color="yellow"> [R]リーチ </Text>}
      </Box>
      <Box marginTop={1}><Text dimColor>{'← →: 選択  Enter: 打牌'}</Text></Box>
      <Box marginTop={1}><Text>{message}</Text></Box>
    </Box>
  );
};

// ── Main game component ───────────────────────────────────────────

const WIND_NAMES = ['東', '南', '西', '北'];

const App: React.FC = () => {
  const [state, dispatch] = useReducer(gameReducer, null, createInitialState);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [claimSelectedIndex, setClaimSelectedIndex] = useState(0);
  const [localProcessing, setLocalProcessing] = useState(false);

  useEffect(() => { dispatch({ type: 'START_GAME' }); }, []);

  // Auto-draw for human
  useEffect(() => {
    if (state.phase !== 'playing') return;
    if (state.currentPlayer !== 0) return;
    if (state.players[0].hand.length === 13) {
      dispatch({ type: 'DRAW', player: 0 });
    }
  }, [state.currentPlayer, state.phase, state.players[0].hand.length]);

  // AI turn processing
  useEffect(() => {
    if (state.phase === 'ended') return;
    if (localProcessing) return;

    // Process AI claims or AI turns
    const isAiTurn = state.currentPlayer !== 0;
    const isAiClaim = state.phase === 'claiming' && !state.claimOptions.some(c => c.player === 0);

    if (isAiTurn || isAiClaim) {
      setLocalProcessing(true);
      const timer = setTimeout(() => {
        const { action } = processAiTurn(state);
        if (action) dispatch(action);
        setLocalProcessing(false);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [state, localProcessing]);

  const hand = state.players[0].hand;
  const humanCanTsumo = state.phase === 'playing' && state.currentPlayer === 0 && hand.length === 14;
  const humanCanRiichi = (() => {
    if (state.phase !== 'playing' || state.currentPlayer !== 0) return false;
    const p = state.players[0];
    return !p.riichi && p.points >= 1000;
  })();

  // Keyboard input
  useInput((input, key) => {
    // Game over screen
    if (state.phase === 'ended') {
      if (input === 'q' || input === ' ') {
        dispatch({ type: 'START_GAME' });
        setSelectedIndex(0);
      }
      return;
    }

    // Claiming phase
    if (state.phase === 'claiming') {
      const humanOptions = state.claimOptions.filter(c => c.player === 0);
      if (humanOptions.length === 0) return; // AI handles itself

      if (key.leftArrow) {
        setClaimSelectedIndex(prev => Math.max(0, prev - 1));
        return;
      }
      if (key.rightArrow) {
        setClaimSelectedIndex(prev => Math.min(humanOptions.length - 1, prev + 1));
        return;
      }

      if (input === 'c') {
        const chiOpts = humanOptions.filter(o => o.type === 'chi');
        if (chiOpts.length > 0) {
          dispatch({ type: 'CHI', player: 0, optionIndex: state.claimOptions.indexOf(chiOpts[0]!) });
          return;
        }
      }
      if (input === 'p') {
        if (humanOptions.some(o => o.type === 'pon')) {
          dispatch({ type: 'PON', player: 0 });
          return;
        }
      }
      if (input === 'k') {
        if (humanOptions.some(o => o.type === 'daiminkan')) {
          dispatch({ type: 'DAIMINKAN', player: 0 });
          return;
        }
      }
      if (input === ' ' || input === 'q') {
        dispatch({ type: 'PASS_CLAIM' });
        return;
      }
      return;
    }

    // Playing phase: only human's turn
    if (state.currentPlayer !== 0) return;

    if (key.leftArrow) { setSelectedIndex(prev => Math.max(0, prev - 1)); return; }
    if (key.rightArrow) { setSelectedIndex(prev => Math.min(hand.length - 1, prev + 1)); return; }

    const num = parseInt(input, 10);
    if (num >= 1 && num <= hand.length) { setSelectedIndex(num - 1); return; }

    if (key.return) {
      if (hand.length === 0) return;
      dispatch({ type: 'DISCARD', player: 0, tile: hand[selectedIndex]! });
      setSelectedIndex(0);
      return;
    }

    if (input === 'r' && humanCanRiichi) {
      dispatch({ type: 'DECLARE_RIICHI', player: 0, discardTile: hand[selectedIndex]! });
      return;
    }

    if (input === 't') {
      dispatch({ type: 'TSUMO', player: 0 });
      return;
    }
  });

  if (state.phase === 'ended') {
    const sr = state.lastScoreResult;
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold>{state.message}</Text>
        {sr && (
          <>
            <Text dimColor>{'─'.repeat(40)}</Text>
            <Box flexDirection="column">
              <Text bold>-- スコア --</Text>
              <Text>役: {sr.yaku.filter(y => !y.yakuman).map(y => y.name).join('・')}</Text>
              {sr.yakuman > 0 && <Text color="red" bold>役満 ×{sr.yakuman}</Text>}
              <Text>飜: {sr.han - sr.doraHan} (役) + {sr.doraHan} (ドラ) = {sr.han}</Text>
              <Text>符: {sr.fu}</Text>
              {sr.limit !== 'none' && sr.limit !== 'yakuman' && <Text>満貫区分: {sr.limit}</Text>}
              <Text>支払い: {sr.payment.from.map(f => `P${f.player + 1}: ${f.amount}点`).join(', ')}</Text>
              <Text bold color="yellow">獲得: {sr.score}点</Text>
            </Box>
          </>
        )}
        <Box marginTop={1}>
          {[0, 1, 2, 3].map(i => (
            <Box key={i} marginRight={2}>
              <Text>{['東家(あなた)', '南家', '西家', '北家'][i]}: </Text>
              <Text bold={true} color={i === state.winner ? 'yellow' : 'white'}>{state.players[i].points}点</Text>
            </Box>
          ))}
        </Box>
        <Text dimColor>スペースキーまたはQで新しいゲーム</Text>
      </Box>
    );
  }

  // Claiming screen
  if (state.phase === 'claiming') {
    const humanOptions = state.claimOptions.filter(c => c.player === 0);
    return (
      <Box flexDirection="column" padding={1}>
        <OpponentInfo
          wind={`${WIND_NAMES[(state.currentPlayer + 2) % 4]!}家`}
          discards={state.players[2].discards} riichi={state.players[2].riichi}
          points={state.players[2].points} tileCount={state.players[2].hand.length}
        />
        <OpponentInfo
          wind={`${WIND_NAMES[(state.currentPlayer + 1) % 4]!}家`}
          discards={state.players[1].discards} riichi={state.players[1].riichi}
          points={state.players[1].points} tileCount={state.players[1].hand.length}
        />
        <OpponentInfo
          wind={`${WIND_NAMES[(state.currentPlayer + 3) % 4]!}家`}
          discards={state.players[3].discards} riichi={state.players[3].riichi}
          points={state.players[3].points} tileCount={state.players[3].hand.length}
        />
        <Text dimColor>{'─'.repeat(40)}</Text>
        <Box marginTop={1} marginBottom={1}>
          <Text>捨て牌: </Text>
          {state.lastDiscard ? <Text color={tileColor(state.lastDiscard.tile)}>{formatTile(state.lastDiscard.tile)}</Text> : null}
        </Box>
        <Text dimColor>{'─'.repeat(40)}</Text>
        <Text bold>東家 (あなた) ({state.players[0].points}点)</Text>
        <HandView tiles={hand} selectedIndex={selectedIndex} riichi={state.players[0].riichi} isHuman={true} />
        {humanOptions.length > 0 && (
          <ClaimMenu options={humanOptions} selectedIndex={claimSelectedIndex} />
        )}
        <Box marginTop={1}><Text>{state.message}</Text></Box>
      </Box>
    );
  }

  // Normal play screen
  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="column">
        <OpponentInfo
          wind={`${WIND_NAMES[(state.currentPlayer + 2) % 4]!}家`}
          discards={state.players[2].discards} riichi={state.players[2].riichi}
          points={state.players[2].points} tileCount={state.players[2].hand.length}
        />
        <OpponentInfo
          wind={`${WIND_NAMES[(state.currentPlayer + 1) % 4]!}家`}
          discards={state.players[1].discards} riichi={state.players[1].riichi}
          points={state.players[1].points} tileCount={state.players[1].hand.length}
        />
        <OpponentInfo
          wind={`${WIND_NAMES[(state.currentPlayer + 3) % 4]!}家`}
          discards={state.players[3].discards} riichi={state.players[3].riichi}
          points={state.players[3].points} tileCount={state.players[3].hand.length}
        />
      </Box>
      <Text dimColor>{'─'.repeat(40)}</Text>
      <Box>
        <Text dimColor>ドラ表示: </Text>
        {Array.from({ length: state.deadWall.doraCount }, (_, i) => (
          <Text key={i} color="cyan">{formatTile(state.deadWall.tiles[i]!)} </Text>
        ))}
      </Box>
      <Box marginTop={1} marginBottom={1}>
        <Text bold>捨て牌: </Text>
        {state.lastDiscard ? (
          <Text color={tileColor(state.lastDiscard.tile)}>
            {formatTile(state.lastDiscard.tile)} ({['あなた','P2','P3','P4'][state.lastDiscard.player]})
          </Text>
        ) : <Text dimColor>まだありません</Text>}
      </Box>
      <Box><Text dimColor>山残り: {state.wall.length} / リーチ棒: {state.riichiSticks}</Text></Box>
      <Text dimColor>{'─'.repeat(40)}</Text>
      <Box marginTop={1} marginBottom={1}>
        <Text bold>東家 (あなた) </Text>
        <Text dimColor>({state.players[0].points}点) </Text>
        {state.players[0].riichi && <Text color="yellow">リーチ中 </Text>}
      </Box>
      <HandView tiles={hand} selectedIndex={selectedIndex} riichi={state.players[0].riichi} isHuman={true} />
      <ActionBar canTsumo={humanCanTsumo} canRiichi={humanCanRiichi} message={state.message} />
    </Box>
  );
};

export default App;
