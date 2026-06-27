import React, { useReducer, useEffect, useRef, useState } from 'react';
import { createInitialState, gameReducer, processAiTurn, turnTileCount } from '../state/GameState.js';
import { getHumanHand } from '../state/selectors.js';
import { formatTile, getDoraIndicators } from '../game/tiles.js';
import { calcShanten } from '../game/agari.js';
import type { GameState, ClaimOption } from '../state/GameState.js';
import type { Tile } from '../game/types.js';
import { TileSVG } from './Tile.js';
const AI_DELAY = 600;

const WIND_NAMES = ['東', '南', '西', '北'];

const roundName = (roundNumber: number, roundWind: number = 0) =>
  `${WIND_NAMES[roundWind] ?? '東'}${roundNumber}局`;

const claimLabel = (option: ClaimOption): string => {
  switch (option.type) {
    case 'ron': return 'ロン';
    case 'chi': return 'チー';
    case 'pon': return 'ポン';
    case 'daiminkan': return 'カン';
    default: return '';
  }
};

// ── Style constants ──

const styles = {
  container: {
    fontFamily: 'system-ui, sans-serif',
    maxWidth: 1000,
    margin: '0 auto',
    padding: 16,
    color: '#222',
    background: '#fafaf0',
    minHeight: '100vh',
  } as React.CSSProperties,
  header: {
    textAlign: 'center' as const,
    fontWeight: 'bold',
    fontSize: 18,
    marginBottom: 4,
  },
  doraRow: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  section: {
    border: '1px solid #ccc',
    borderRadius: 8,
    padding: '8px 12px',
    marginBottom: 8,
    background: '#fff',
  } as React.CSSProperties,
  opponentRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 8,
  } as React.CSSProperties,
  playerArea: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 4,
  },
  handRow: {
    display: 'flex',
    justifyContent: 'center',
    flexWrap: 'wrap' as const,
    gap: 1,
    marginTop: 4,
  },
  hand: {
    display: 'flex',
    gap: 1,
  },
  discardRiver: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 2,
    marginTop: 4,
    minHeight: 40,
  } as React.CSSProperties,
  infoText: {
    fontSize: 14,
    color: '#555',
  },
  shanten: {
    fontSize: 14,
    color: '#999',
  },
  message: {
    fontSize: 16,
    fontWeight: 'bold' as const,
    textAlign: 'center' as const,
    marginTop: 8,
  },
  claimButton: {
    padding: '6px 14px',
    borderRadius: 6,
    border: '1px solid #aaa',
    background: '#fff',
    cursor: 'pointer',
    fontSize: 14,
  } as React.CSSProperties,
  claimMenu: {
    display: 'flex',
    justifyContent: 'center',
    gap: 8,
    flexWrap: 'wrap' as const,
    marginTop: 8,
  } as React.CSSProperties,
  actionBar: {
    display: 'flex',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,
  actionButton: {
    padding: '4px 12px',
    borderRadius: 4,
    border: '1px solid #888',
    cursor: 'pointer',
    fontSize: 13,
  } as React.CSSProperties,
  divider: {
    border: 'none',
    borderTop: '1px dashed #ccc',
    margin: '8px 0',
  } as React.CSSProperties,
};

// ── Hand view ──

interface HandViewProps {
  tiles: readonly Tile[];
  selectedIndex: number;
  isHuman: boolean;
  tileSize: number;
}

const HandView: React.FC<HandViewProps> = ({ tiles, selectedIndex, isHuman, tileSize }) => {
  if (!isHuman) {
    return <div style={{ color: '#aaa' }}>{'🀫 '.repeat(tiles.length)}</div>;
  }
  return (
    <div style={{ display: 'flex', gap: 1 }}>
      {tiles.map((tile, i) => (
        <TileSVG
          key={`${tile.suit}:${tile.value}:${tile.red ?? false}:${i}`}
          tile={tile}
          size={tileSize}
          selected={i === selectedIndex}
        />
      ))}
    </div>
  );
};

// ── Opponent info ──

interface OpponentInfoProps {
  label: string;
  tileCount: number;
  points: number;
  riichi: boolean;
}

const OpponentInfo: React.FC<OpponentInfoProps> = ({ label, tileCount, points, riichi }) => (
  <div style={{ textAlign: 'center', fontSize: 13, color: '#555' }}>
    <div><strong>{label}</strong> {riichi && '🔥'}</div>
    <div>{points}点</div>
    <div style={{ color: '#aaa' }}>{'🀫'.repeat(Math.min(tileCount, 8))}</div>
  </div>
);

// ── Dora view ──

interface DoraViewProps {
  state: GameState;
  tileSize: number;
}

const DoraView: React.FC<DoraViewProps> = ({ state, tileSize }) => {
  const indicators = getDoraIndicators(state.deadWall.tiles, state.deadWall.doraCount);
  if (indicators.length === 0) return null;
  return (
    <div style={styles.doraRow}>
      <span style={{ fontWeight: 'bold', fontSize: 13 }}>ドラ表示: </span>
      {indicators.map((tile, i) => (
        <TileSVG key={`dora-${tile.suit}-${tile.value}-${i}`} tile={tile} size={tileSize * 0.7} />
      ))}
    </div>
  );
};

// ── Claim menu ──

interface ClaimMenuProps {
  options: readonly ClaimOption[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onConfirm: (option: ClaimOption) => void;
}

const ClaimMenu: React.FC<ClaimMenuProps> = ({ options, selectedIndex, onSelect, onConfirm }) => (
  <div style={styles.claimMenu}>
    {options.map((opt, i) => (
      <button
        key={i}
        style={{
          ...styles.claimButton,
          background: i === selectedIndex ? '#ddf' : '#fff',
          borderColor: i === selectedIndex ? '#66f' : '#aaa',
        }}
        onClick={() => { onSelect(i); onConfirm(opt); }}
        onMouseEnter={() => onSelect(i)}
      >
        {claimLabel(opt)} {opt.tiles.map(t => formatTile(t)).join('')}
      </button>
    ))}
  </div>
);

// ── Discard river ──

interface DiscardRiverProps {
  discards: readonly { tile: Tile; isRiichi: boolean }[];
  tileSize: number;
}

const DiscardRiver: React.FC<DiscardRiverProps> = ({ discards, tileSize }) => {
  if (discards.length === 0) return <span style={{ color: '#bbb' }}>--</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      {discards.map((d, i) => (
        <span key={i} style={{ opacity: d.isRiichi ? 0.6 : 1 }}>
          <TileSVG tile={d.tile} size={tileSize * 0.7} />
        </span>
      ))}
    </div>
  );
};

// ── Main App ──

export const Board: React.FC = () => {
  const [state, dispatch] = useReducer(gameReducer, null, createInitialState);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [claimSelectedIndex, setClaimSelectedIndex] = useState(0);
  const [tileSize, setTileSize] = useState(52);
  const processingRef = useRef(false);

  // AI turn processing
  useEffect(() => {
    if (state.phase === 'ended') return;
    if (state.phase === 'roundEnded') return;
    if (processingRef.current) return;

    const isAiTurn = state.phase === 'playing' && state.currentPlayer !== 0;
    const isAiClaim = state.phase === 'claiming' && !state.claimOptions.some(c => c.player === 0);

    if (isAiTurn || isAiClaim) {
      processingRef.current = true;
      const timer = setTimeout(() => {
        try {
          const { action } = processAiTurn(state);
          processingRef.current = false;
          if (action) dispatch(action);
        } catch (err) {
          processingRef.current = false;
          const msg = err instanceof Error ? err.message : String(err);
          dispatch({ type: 'SET_MESSAGE', message: `AIエラー: ${msg}` });
        }
      }, AI_DELAY);
      return () => {
        clearTimeout(timer);
        processingRef.current = false;
      };
    }
  }, [state]);

  // Auto-draw for human
  useEffect(() => {
    if (state.phase !== 'playing') return;
    if (state.currentPlayer !== 0) return;
    if (turnTileCount(state.players[0]) === 13) {
      dispatch({ type: 'DRAW', player: 0 });
    }
  }, [state.phase, state.currentPlayer, state.players]);

  const hand = getHumanHand(state);
  const drawnIndex = state.lastDrawnTile != null ? hand.indexOf(state.lastDrawnTile) : -1;
  const showDrawnSeparate = drawnIndex >= 0 && turnTileCount(state.players[0]) === 14;

  // Keyboard handler
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (state.phase === 'roundEnded') {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'n') {
          dispatch({ type: 'NEXT_ROUND' });
          setSelectedIndex(0);
        }
        return;
      }
      if (state.phase === 'ended') {
        if (e.key === ' ') {
          dispatch({ type: 'START_GAME' });
          setSelectedIndex(0);
        }
        return;
      }

      if (state.phase === 'claiming') {
        const humanOptions = state.claimOptions.filter(c => c.player === 0);
        if (humanOptions.length === 0) return;

        if (e.key === 'ArrowLeft') {
          setClaimSelectedIndex(prev => Math.max(0, prev - 1));
          return;
        }
        if (e.key === 'ArrowRight') {
          setClaimSelectedIndex(prev => Math.min(humanOptions.length - 1, prev + 1));
          return;
        }
        if (e.key === 'l') {
          if (humanOptions.some(o => o.type === 'ron')) {
            dispatch({ type: 'RON', winner: 0 });
            return;
          }
        }
        if (e.key === 'c') {
          const chiOpts = humanOptions.filter(o => o.type === 'chi');
          if (chiOpts.length > 0) {
            const selectedOpt = humanOptions[claimSelectedIndex];
            const chosenChi = selectedOpt && selectedOpt.type === 'chi' ? selectedOpt : chiOpts[0]!;
            dispatch({ type: 'CHI', player: 0, optionIndex: state.claimOptions.indexOf(chosenChi) });
            return;
          }
        }
        if (e.key === 'p') {
          if (humanOptions.some(o => o.type === 'pon')) {
            dispatch({ type: 'PON', player: 0 });
            return;
          }
        }
        if (e.key === 'k') {
          if (humanOptions.some(o => o.type === 'daiminkan')) {
            dispatch({ type: 'DAIMINKAN', player: 0 });
            return;
          }
        }
        if (e.key === ' ' || e.key === 'Escape' || e.key === 'q') {
          dispatch({ type: 'PASS_CLAIM' });
          return;
        }
        if (e.key === 'Enter') {
          const opt = humanOptions[claimSelectedIndex];
          if (!opt) return;
          switch (opt.type) {
            case 'ron': dispatch({ type: 'RON', winner: 0 }); break;
            case 'chi': dispatch({ type: 'CHI', player: 0, optionIndex: state.claimOptions.indexOf(opt) }); break;
            case 'pon': dispatch({ type: 'PON', player: 0 }); break;
            case 'daiminkan': dispatch({ type: 'DAIMINKAN', player: 0 }); break;
          }
          return;
        }
        return;
      }

      // Playing phase
      if (state.currentPlayer !== 0) return;
      if (state.players[0].riichi) {
        // Riichi forced discard handled by selector
        return;
      }

      if (e.key === 'ArrowLeft') {
        setSelectedIndex(prev => hand.length > 0 ? (prev - 1 + hand.length) % hand.length : 0);
        return;
      }
      if (e.key === 'ArrowRight') {
        setSelectedIndex(prev => hand.length > 0 ? (prev + 1) % hand.length : 0);
        return;
      }
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= hand.length) {
        setSelectedIndex(num - 1);
        return;
      }
      if (e.key === 'Enter') {
        if (hand.length === 0) return;
        dispatch({ type: 'DISCARD', player: 0, tile: hand[selectedIndex]! });
        setSelectedIndex(0);
        return;
      }
      if (e.key === 't') {
        const canTsumo = state.phase === 'playing' && state.currentPlayer === 0 &&
          turnTileCount(state.players[0]) === 14;
        if (canTsumo) {
          dispatch({ type: 'TSUMO', player: 0 });
          return;
        }
      }
      if (e.key === 'r') {
        const canRiichi = !state.players[0].riichi && state.players[0].points >= 1000 &&
          state.players[0].melds.every(m => m.type === 'closedKan');
        if (canRiichi) {
          dispatch({ type: 'DECLARE_RIICHI', player: 0, discardTile: hand[selectedIndex]! });
          return;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, selectedIndex, claimSelectedIndex, hand, drawnIndex, showDrawnSeparate]);

  // ── Render ──

  if (state.phase === 'ended' || state.phase === 'roundEnded') {
    const sr = state.lastScoreResult;
    return (
      <div style={styles.container}>
        <div style={styles.header}>{state.message}</div>
        <div style={{ textAlign: 'center', fontSize: 14, color: '#555' }}>
          {state.phase === 'roundEnded'
            ? `次局: ${roundName(state.roundNumber, state.roundWind)} / 親: P${state.dealer + 1} / 本場: ${state.honba}`
            : '対戦終了'}
        </div>
        <DoraView state={state} tileSize={tileSize} />
        {sr && (
          <div style={styles.section}>
            <div><strong>スコア</strong></div>
            <div style={styles.infoText}>役: {sr.yaku.map(y => y.name).join('・')}</div>
            <div style={styles.infoText}>飜: {sr.han} / 符: {sr.fu}</div>
            <div style={styles.infoText}>
              支払い: {sr.payment.from.map(f => `P${f.player + 1}: ${f.amount}点`).join(', ')}
            </div>
            <div style={{ fontWeight: 'bold', color: '#cc0', fontSize: 16 }}>
              獲得: {sr.score}点
            </div>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
          {([0, 1, 2, 3] as const).map(i => (
            <div key={i} style={styles.section}>
              <strong>{i === 0 ? 'あなた' : `P${i + 1}`}</strong>
              <span style={styles.infoText}> ({state.players[i].points}点)</span>
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 14, color: '#888' }}>
          {state.phase === 'roundEnded' ? 'Enter / Space / N: 次局へ' : 'Space: もう一度遊ぶ'}
        </div>
      </div>
    );
  }

  const isClaiming = state.phase === 'claiming';
  const humanOptions = isClaiming ? state.claimOptions.filter(c => c.player === 0) : [];
  const humanAllTiles = [...state.players[0].hand, ...state.players[0].melds.flatMap(m => m.tiles)];
  const humanShanten = state.phase === 'playing' && state.currentPlayer === 0
    ? calcShanten(humanAllTiles)
    : -1;

  return (
    <div style={styles.container}>
      {/* Tile size slider */}
      <div style={{ textAlign: 'right', marginBottom: 4 }}>
        <label style={{ fontSize: 12, color: '#888' }}>
          牌サイズ:
          <input
            type="range"
            min={32}
            max={80}
            value={tileSize}
            onChange={e => setTileSize(Number(e.target.value))}
            style={{ verticalAlign: 'middle', marginLeft: 4 }}
          />
          <span style={{ marginLeft: 4 }}>{tileSize}</span>
        </label>
      </div>

      {/* Header */}
      <div style={styles.header}>
        {roundName(state.roundNumber, state.roundWind)} / 親: P{state.dealer + 1} / 本場: {state.honba} / 供託: {state.riichiSticks}
      </div>

      <hr style={styles.divider} />

      {/* Dora */}
      <DoraView state={state} tileSize={tileSize} />

      {/* Opponents */}
      <div style={styles.opponentRow}>
        <OpponentInfo
          label={`上家 (${WIND_NAMES[state.players[3].wind]}家)`}
          tileCount={state.players[3].hand.length}
          points={state.players[3].points}
          riichi={state.players[3].riichi}
        />
        <OpponentInfo
          label={`対面 (${WIND_NAMES[state.players[2].wind]}家)`}
          tileCount={state.players[2].hand.length}
          points={state.players[2].points}
          riichi={state.players[2].riichi}
        />
        <OpponentInfo
          label={`下家 (${WIND_NAMES[state.players[1].wind]}家)`}
          tileCount={state.players[1].hand.length}
          points={state.players[1].points}
          riichi={state.players[1].riichi}
        />
      </div>

      {/* Last discard */}
      <div style={{ textAlign: 'center', marginBottom: 4 }}>
        <span style={{ fontWeight: 'bold', fontSize: 13 }}>捨て牌: </span>
        {state.lastDiscard ? (
          <TileSVG tile={state.lastDiscard.tile} size={tileSize * 0.8} />
        ) : (
          <span style={{ color: '#bbb', fontSize: 13 }}>--</span>
        )}
      </div>

      <hr style={styles.divider} />

      {/* Player area */}
      <div style={styles.playerArea}>
        <div style={{ fontWeight: 'bold', fontSize: 14 }}>
          {WIND_NAMES[state.players[0].wind]}家 (あなた) ({state.players[0].points}点)
          {state.players[0].riichi && <span style={{ color: '#cc0', marginLeft: 8 }}>リーチ中</span>}
        </div>

        {/* Discards */}
        <div style={styles.section}>
          <div style={{ fontWeight: 'bold', fontSize: 12 }}>あなたの捨て牌:</div>
          <DiscardRiver discards={state.players[0].discards} tileSize={tileSize} />
        </div>

        {/* Melds */}
        {state.players[0].melds.length > 0 && (
          <div style={styles.section}>
            <div style={{ fontWeight: 'bold', fontSize: 12 }}>副露:</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {state.players[0].melds.map((meld, i) => (
                <div key={i} style={{ display: 'flex', gap: 1, border: '1px solid #aaa', borderRadius: 4, padding: '2px 4px' }}>
                  {meld.tiles.map((tile, j) => (
                    <TileSVG key={j} tile={tile} size={tileSize * 0.6} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hand */}
        <div style={styles.handRow}>
          {showDrawnSeparate ? (
            <>
              <HandView
                tiles={hand.filter((_, i) => i !== drawnIndex)}
                selectedIndex={selectedIndex === drawnIndex ? -1 : selectedIndex > drawnIndex ? selectedIndex - 1 : selectedIndex}
                isHuman={true}
                tileSize={tileSize}
              />
              <TileSVG
                tile={state.lastDrawnTile!}
                size={tileSize}
                selected={selectedIndex === drawnIndex}
                isDrawn
              />
            </>
          ) : (
            <HandView
              tiles={hand}
              selectedIndex={selectedIndex}
              isHuman={true}
              tileSize={tileSize}
            />
          )}
        </div>

        {/* Shanten */}
        {humanShanten >= 0 && (
          <div style={styles.shanten}>シャンテン数: {humanShanten}</div>
        )}

        {/* Turn info */}
        <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
          残り牌: {state.wall.length} / 王牌: {state.deadWall.tiles.length}枚 / リーチ棒: {state.riichiSticks}
        </div>

        {/* Claim menu */}
        {isClaiming && humanOptions.length > 0 && (
          <ClaimMenu
            options={humanOptions}
            selectedIndex={claimSelectedIndex}
            onSelect={setClaimSelectedIndex}
            onConfirm={(opt) => {
              switch (opt.type) {
                case 'ron': dispatch({ type: 'RON', winner: 0 }); break;
                case 'chi': dispatch({ type: 'CHI', player: 0, optionIndex: state.claimOptions.indexOf(opt) }); break;
                case 'pon': dispatch({ type: 'PON', player: 0 }); break;
                case 'daiminkan': dispatch({ type: 'DAIMINKAN', player: 0 }); break;
              }
            }}
          />
        )}

        {/* Action bar */}
        {state.phase === 'playing' && state.currentPlayer === 0 && !state.players[0].riichi && (
          <div style={styles.actionBar}>
            {(turnTileCount(state.players[0]) === 14) && (
              <button style={styles.actionButton} onClick={() => dispatch({ type: 'TSUMO', player: 0 })}>
                ツモ (T)
              </button>
            )}
            {(!state.players[0].riichi && state.players[0].points >= 1000 &&
              state.players[0].melds.every(m => m.type === 'closedKan')) && (
              <button style={styles.actionButton}
                onClick={() => dispatch({ type: 'DECLARE_RIICHI', player: 0, discardTile: hand[selectedIndex]! })}
              >
                リーチ (R)
              </button>
            )}
          </div>
        )}

        {/* Message */}
        {state.message && (
          <div style={styles.message}>{state.message}</div>
        )}

        {/* Key legend */}
        <div style={{ textAlign: 'center', fontSize: 12, color: '#aaa', marginTop: 8 }}>
          ←→:選択 Enter:打牌 T:ツモ R:リーチ 数字キー:直接選択
        </div>
      </div>
    </div>
  );
};
