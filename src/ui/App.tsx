import React, { useReducer, useEffect, useState, useRef } from 'react';
import { Text, Box, useInput } from 'ink';
import { createInitialState, gameReducer, normalizeGameState, processAiTurn } from '../state/GameState.js';
import { saveGame, loadGame, clearSave } from '../state/persistence.js';
import type { ClaimOption, GameAction, GameState } from '../state/GameState.js';
import { formatTile, getDoraIndicators, tileToUnicode } from '../game/tiles.js';
import { isWinningHand, tilesToCounts } from '../game/agari.js';
import { type Meld, MeldType, type Tile, Suit } from '../game/types.js';

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
        {'🀫 '.repeat(tiles.length)}
      </Text>
    );
  }

  return (
    <Box>
      {tiles.map((tile, i) => {
        const char = tileToUnicode(tile);
        const isSelected = i === selectedIndex;
        return (
          <Box key={`${tile.suit}:${tile.value}:${tile.red ?? false}:${i}`} width={3}>
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

// ── Meld display ──────────────────────────────────────────────────

interface MeldViewProps {
  melds: readonly Meld[];
}

const MeldView: React.FC<MeldViewProps> = ({ melds }) => {
  if (melds.length === 0) return <Text dimColor>--</Text>;
  return (
    <Text>
      {melds.map((meld, i) => (
        <Text key={i}>
          [
          {meld.tiles.map((tile, j) => (
            <Text key={j} color={tileColor(tile)}>{formatTile(tile)} </Text>
          ))}
          ] {' '}
        </Text>
      ))}
    </Text>
  );
};

// ── Dora display ─────────────────────────────────────────────────

interface DoraViewProps {
  state: GameState;
}

const DoraView: React.FC<DoraViewProps> = ({ state }) => {
  const indicators = getDoraIndicators(state.deadWall.tiles, state.deadWall.doraCount);

  return (
    <Box>
      <Text bold>ドラ表示: </Text>
      {indicators.length > 0 ? (
        indicators.map((tile, i) => (
          <Box key={`${tile.suit}:${tile.value}:${tile.red ?? false}:${i}`} width={3}>
            <Text color={tileColor(tile)}>{formatTile(tile)}</Text>
          </Box>
        ))
      ) : (
        <Text dimColor>--</Text>
      )}
    </Box>
  );
};

const claimLabel = (option: ClaimOption): string => {
  switch (option.type) {
    case 'ron': return 'ロン';
    case 'chi': return 'チー';
    case 'pon': return 'ポン';
    case 'daiminkan': return 'カン';
  }
};

// ── Opponent info ──────────────────────────────────────────────────
interface OpponentInfoProps {
  wind: string;
  discards: readonly Tile[];
  melds: readonly Meld[];
  riichi: boolean;
  points: number;
  tileCount: number;
}

const OpponentInfo: React.FC<OpponentInfoProps> = ({ wind, discards, melds, riichi, points, tileCount }) => {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>{wind} ({points}点) {riichi ? '(リーチ)' : ''} 手牌:{tileCount}</Text>
      <Box><Text>副露: </Text><MeldView melds={melds} /></Box>
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
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>鳴き:</Text>
      {options.map((opt, i) => {
        const selected = i === selectedIndex;
        return (
          <Box key={i}>
            <Box width={5}>
              <Text inverse={selected}>{claimLabel(opt)}</Text>
            </Box>
            {opt.tiles.map((tile, j) => (
              <Box key={`${tile.suit}:${tile.value}:${tile.red ?? false}:${j}`} width={3}>
                <Text color={tileColor(tile)}>{formatTile(tile)}</Text>
              </Box>
            ))}
          </Box>
        );
      })}
      <Text dimColor>L:ロン C:チー P:ポン K:カン Space:パス ←→:選択</Text>
    </Box>
  );
};

// ── Action bar ────────────────────────────────────────────────────

interface ActionBarProps {
  canTsumo: boolean;
  canRiichi: boolean;
  canKan: boolean;
  message: string;
}

const ActionBar: React.FC<ActionBarProps> = ({ canTsumo, canRiichi, canKan, message }) => {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        {canTsumo && <Text color="green"> [T]ツモ </Text>}
        {canRiichi && <Text color="yellow"> [R]リーチ </Text>}
        {canKan && <Text color="cyan"> [K]カン </Text>}
      </Box>
      <Box marginTop={1}><Text dimColor>{'← →: 選択  Enter: 打牌'}</Text></Box>
      <Box marginTop={1}><Text>{message}</Text></Box>
    </Box>
  );
};

// ── Main game component ───────────────────────────────────────────

const WIND_NAMES = ['東', '南', '西', '北'];
const roundName = (roundNumber: number) => `東${roundNumber}局`;
const turnTileCount = (player: GameState['players'][number]) =>
  player.hand.length + player.melds.reduce((sum, meld) => sum + meld.tiles.length, 0);
const tileKindKey = (tile: Tile) => `${tile.suit}:${tile.value}`;

const App: React.FC = () => {
  const [state, dispatch] = useReducer(gameReducer, null, createInitialState);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [claimSelectedIndex, setClaimSelectedIndex] = useState(0);
  const processingRef = useRef(false);
  const [startupMode, setStartupMode] = useState<'loading' | 'choose' | 'ready'>('loading');
  const [savedState, setSavedState] = useState<GameState | null>(null);

  useEffect(() => {
    const saved = loadGame<GameState>();
    if (saved && saved.phase !== 'ended') {
      setSavedState(normalizeGameState(saved));
      setStartupMode('choose');
    } else {
      dispatch({ type: 'START_GAME' });
      setStartupMode('ready');
    }
  }, []);

  // 状態が変わったら自動セーブ
  useEffect(() => {
    if (startupMode !== 'ready') return;
    if (state.phase === 'ended') {
      clearSave();
    } else if (state.phase === 'playing' || state.phase === 'claiming' || state.phase === 'roundEnded') {
      saveGame(state);
    }
  }, [state, startupMode]);
  // Auto-draw for human
  useEffect(() => {
    if (startupMode !== 'ready') return;
    if (state.phase !== 'playing') return;
    if (state.currentPlayer !== 0) return;
    if (turnTileCount(state.players[0]) === 13) {
      dispatch({ type: 'DRAW', player: 0 });
    }
  }, [startupMode, state.currentPlayer, state.phase, state.players[0].hand.length, state.players[0].melds.length]);

  // Riichi auto-tsumogiri: リーチ中のツモ切り（強制）
  useEffect(() => {
    if (startupMode !== 'ready') return;
    if (state.phase !== 'playing') return;
    if (state.currentPlayer !== 0) return;
    if (!state.players[0].riichi) return;
    if (state.players[0].hand.length !== 14) return;
    if (!state.lastDrawnTile) return;

    // 自摸和ならTSUMO
    if (isWinningHand(tilesToCounts(state.players[0].hand))) {
      dispatch({ type: 'TSUMO', player: 0 });
      return;
    }

    dispatch({ type: 'DISCARD', player: 0, tile: state.lastDrawnTile });
  }, [startupMode, state.phase, state.currentPlayer, state.players[0].riichi, state.players[0].hand.length, state.lastDrawnTile]);

  // AI turn processing (ref でレンダリングをトリガしない)
  useEffect(() => {
    if (startupMode !== 'ready') return;
    if (state.phase === 'ended') return;
    if (state.phase === 'roundEnded') return;
    if (processingRef.current) return;

    const isAiTurn = state.phase === 'playing' && state.currentPlayer !== 0;
    const isAiClaim = state.phase === 'claiming' && !state.claimOptions.some(c => c.player === 0);

    if (isAiTurn || isAiClaim) {
      processingRef.current = true;
      const timer = setTimeout(() => {
        const { action } = processAiTurn(state);
        processingRef.current = false;
        if (action) dispatch(action);
      }, 600);
      return () => {
        clearTimeout(timer);
        processingRef.current = false;
      };
    }
  }, [state, startupMode]);

  const hand = state.players[0].hand;
  const humanCanTsumo = state.phase === 'playing' && state.currentPlayer === 0 && turnTileCount(state.players[0]) === 14;
  const humanCanRiichi = (() => {
    if (state.phase !== 'playing' || state.currentPlayer !== 0) return false;
    const p = state.players[0];
    return !p.riichi && p.points >= 1000;
  })();
  const humanCanAnkan = (() => {
    if (state.phase !== 'playing' || state.currentPlayer !== 0 || state.players[0].riichi) return false;
    const tile = hand[selectedIndex];
    if (!tile) return false;
    return hand.filter(t => tileKindKey(t) === tileKindKey(tile)).length >= 4;
  })();
  const humanCanKakan = (() => {
    if (state.phase !== 'playing' || state.currentPlayer !== 0 || state.players[0].riichi) return false;
    const tile = hand[selectedIndex];
    if (!tile) return false;
    return state.players[0].melds.some(meld => (
      meld.type === MeldType.Poon &&
      meld.tiles.some(meldTile => tileKindKey(meldTile) === tileKindKey(tile))
    ));
  })();
  const humanCanKan = humanCanAnkan || humanCanKakan;

  // Keyboard input
  useInput((input, key) => {
    if (startupMode === 'choose') {
      if (input === 'r' || key.return) {
        if (savedState) dispatch({ type: 'RESTORE', state: savedState } as GameAction);
        setStartupMode('ready');
        return;
      }
      if (input === 'n' || input === 'q') {
        clearSave();
        dispatch({ type: 'START_GAME' });
        setSelectedIndex(0);
        setStartupMode('ready');
        return;
      }
      return;
    }

    if (startupMode !== 'ready') return;

    if (state.phase === 'roundEnded') {
      if (input === 'n' || input === ' ' || key.return) {
        dispatch({ type: 'NEXT_ROUND' });
        setSelectedIndex(0);
      }
      return;
    }

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

      if (input === 'l') {
        if (humanOptions.some(o => o.type === 'ron')) {
          dispatch({ type: 'RON', winner: 0 });
          return;
        }
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

    // リーチ中は強制ツモ切り: 自摸和(T)以外は受け付けない
    if (state.players[0].riichi) {
      if (input === 't') {
        dispatch({ type: 'TSUMO', player: 0 });
      }
      return;
    }

    if (key.leftArrow) {
      setSelectedIndex(prev => hand.length > 0 ? (prev - 1 + hand.length) % hand.length : 0);
      return;
    }
    if (key.rightArrow) {
      setSelectedIndex(prev => hand.length > 0 ? (prev + 1) % hand.length : 0);
      return;
    }

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

    if (input === 'k') {
      if (hand.length === 0) return;
      dispatch({ type: humanCanKakan ? 'KAKAN' : 'ANKAN', player: 0, tile: hand[selectedIndex]! });
      return;
    }

    if (input === 't') {
      dispatch({ type: 'TSUMO', player: 0 });
      return;
    }
  });

  if (startupMode === 'loading') {
    return (
      <Box padding={1}>
        <Text>読み込み中...</Text>
      </Box>
    );
  }

  if (startupMode === 'choose') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold>保存された対戦があります</Text>
        <Text>前回の続きから再開するか、新しい東風戦を始めるか選んでください。</Text>
        <Box marginTop={1} flexDirection="column">
          <Text color="green">R / Enter: 復元</Text>
          <Text color="yellow">N / Q: 新規開始して保存を破棄</Text>
        </Box>
      </Box>
    );
  }

  if (state.phase === 'ended' || state.phase === 'roundEnded') {
    const sr = state.lastScoreResult;
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold>{state.message}</Text>
        <Text dimColor>
          {state.phase === 'roundEnded'
            ? `次局: ${roundName(state.roundNumber)} / 親: P${state.dealer + 1} / 本場: ${state.honba} / 供託: ${state.riichiSticks}`
            : '対戦終了'}
        </Text>
        <DoraView state={state} />
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
              <Text>{i === 0 ? 'あなた' : `P${i + 1}`}({WIND_NAMES[state.players[i].wind]}家): </Text>
              <Text bold={true} color={i === state.winner ? 'yellow' : 'white'}>{state.players[i].points}点</Text>
            </Box>
          ))}
        </Box>
        {state.finalRanking && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>最終順位</Text>
            {state.finalRanking.map((player, index) => (
              <Text key={player}>
                {index + 1}位: {player === 0 ? 'あなた' : `P${player + 1}`} {state.players[player].points}点
              </Text>
            ))}
          </Box>
        )}
        <Text dimColor>
          {state.phase === 'roundEnded' ? 'N / Enter / Space: 次局へ' : 'SpaceまたはQで新しいゲーム'}
        </Text>
      </Box>
    );
  }

  // Claiming screen
  if (state.phase === 'claiming') {
    const humanOptions = state.claimOptions.filter(c => c.player === 0);
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold>{roundName(state.roundNumber)} / 親: P{state.dealer + 1} / 本場: {state.honba}</Text>
        <DoraView state={state} />
        <Text dimColor>{'─'.repeat(40)}</Text>
        <OpponentInfo
          wind={`${WIND_NAMES[state.players[2].wind]}家`}
          discards={state.players[2].discards} riichi={state.players[2].riichi}
          melds={state.players[2].melds}
          points={state.players[2].points} tileCount={state.players[2].hand.length}
        />
        <OpponentInfo
          wind={`${WIND_NAMES[state.players[1].wind]}家`}
          discards={state.players[1].discards} riichi={state.players[1].riichi}
          melds={state.players[1].melds}
          points={state.players[1].points} tileCount={state.players[1].hand.length}
        />
        <OpponentInfo
          wind={`${WIND_NAMES[state.players[3].wind]}家`}
          discards={state.players[3].discards} riichi={state.players[3].riichi}
          melds={state.players[3].melds}
          points={state.players[3].points} tileCount={state.players[3].hand.length}
        />
        <Text dimColor>{'─'.repeat(40)}</Text>
        <Box marginTop={1} marginBottom={1}>
          <Text>捨て牌: </Text>
          {state.lastDiscard ? <Text color={tileColor(state.lastDiscard.tile)}>{formatTile(state.lastDiscard.tile)}</Text> : null}
        </Box>
        <Text dimColor>{'─'.repeat(40)}</Text>
        <Text bold>{WIND_NAMES[state.players[0].wind]}家 (あなた) ({state.players[0].points}点)</Text>
        <Box>
          <Text bold>あなたの捨て牌: </Text>
          <DiscardView discards={state.players[0].discards} riichi={state.players[0].riichi} />
        </Box>
        <Box>
          <Text bold>あなたの副露: </Text>
          <MeldView melds={state.players[0].melds} />
        </Box>
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
      <Text bold>{roundName(state.roundNumber)} / 親: P{state.dealer + 1} / 本場: {state.honba}</Text>
      <DoraView state={state} />
      <Box flexDirection="column">
        <OpponentInfo
          wind={`${WIND_NAMES[state.players[2].wind]}家`}
          discards={state.players[2].discards} riichi={state.players[2].riichi}
          melds={state.players[2].melds}
          points={state.players[2].points} tileCount={state.players[2].hand.length}
        />
        <OpponentInfo
          wind={`${WIND_NAMES[state.players[1].wind]}家`}
          discards={state.players[1].discards} riichi={state.players[1].riichi}
          melds={state.players[1].melds}
          points={state.players[1].points} tileCount={state.players[1].hand.length}
        />
        <OpponentInfo
          wind={`${WIND_NAMES[state.players[3].wind]}家`}
          discards={state.players[3].discards} riichi={state.players[3].riichi}
          melds={state.players[3].melds}
          points={state.players[3].points} tileCount={state.players[3].hand.length}
        />
      </Box>
      <Text dimColor>{'─'.repeat(40)}</Text>
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
        <Text bold>{WIND_NAMES[state.players[0].wind]}家 (あなた) </Text>
        <Text dimColor>({state.players[0].points}点) </Text>
        {state.players[0].riichi && <Text color="yellow">リーチ中 </Text>}
      </Box>
      <Box marginBottom={1}>
        <Text bold>あなたの捨て牌: </Text>
        <DiscardView discards={state.players[0].discards} riichi={state.players[0].riichi} />
      </Box>
      <Box marginBottom={1}>
        <Text bold>あなたの副露: </Text>
        <MeldView melds={state.players[0].melds} />
      </Box>
      <HandView tiles={hand} selectedIndex={selectedIndex} riichi={state.players[0].riichi} isHuman={true} />
      <ActionBar canTsumo={humanCanTsumo} canRiichi={humanCanRiichi} canKan={humanCanKan} message={state.message} />
    </Box>
  );
};

export default App;
