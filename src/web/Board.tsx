import React, { useReducer, useEffect, useRef, useState } from 'react';
import { createInitialState, gameReducer, processAiTurn, turnTileCount } from '../state/GameState.js';
import { getHumanHand } from '../state/selectors.js';
import { formatTile, getDoraIndicators } from '../game/tiles.js';
import { calcShanten } from '../game/agari.js';
import type { ClaimOption } from '../state/GameState.js';
import type { Tile } from '../game/types.js';
import { TileSVG, TileBack } from './Tile.js';

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

// ── Helpers ──

const greenGrad = 'linear-gradient(180deg, #2d6a2d 0%, #1f5a1f 100%)';

// ── Sub-components ──

interface HandViewProps {
  tiles: readonly Tile[];
  selectedIndex: number;
  tileSize: number;
}

const HandView: React.FC<HandViewProps> = ({ tiles, selectedIndex, tileSize }) => (
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



interface DiscardRiverProps {
  discards: readonly { tile: Tile; isRiichi: boolean }[];
  tileSize: number;
}


const DiscardRiver: React.FC<DiscardRiverProps> = ({ discards, tileSize }) => (
  <div style={{
    display: 'flex',
    flexWrap: 'wrap',
    gap: 1,
    padding: 4,
    background: '#3a7a3a',
    borderRadius: 4,
    minHeight: tileSize * 1.4,
    minWidth: 60,
  }}>
    {discards.length === 0 ? (
      <span style={{ color: '#5a9a5a', fontSize: 11, padding: 2 }}>--</span>
    ) : (
      discards.map((d, i) => (
        <TileSVG
          key={i}
          tile={d.tile}
          size={tileSize}
          selected={d.isRiichi}
        />
      ))
    )}
  </div>
);
// ── Main Board ──

export const Board: React.FC = () => {
  const [state, dispatch] = useReducer(gameReducer, null, createInitialState);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [claimSelectedIndex, setClaimSelectedIndex] = useState(0);
  const [tileSize, setTileSize] = useState(46);
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

      // Suppress arrow/page scroll
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) {
        e.preventDefault();
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
      if (state.players[0].riichi) return;

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
  }, [state, selectedIndex, claimSelectedIndex, hand]);

  // ── Render helpers ──

  const s = tileSize;

  const renderOpponentRiver = (discards: readonly { tile: Tile; isRiichi: boolean }[]) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 1, padding: 3 }}>
      {discards.length === 0 ? (
        <span style={{ color: '#5a9a5a', fontSize: 10 }}>--</span>
      ) : (
        discards.slice(-12).map((d, i) => (
          <TileSVG key={i} tile={d.tile} size={Math.round(s * 0.55)} selected={d.isRiichi} />
        ))
      )}
    </div>
  );

  const renderMeldSet = (melds: readonly { tiles: readonly Tile[] }[], sz: number) => (
    <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
      {melds.map((meld, i) => (
        <div key={i} style={{ display: 'flex', gap: 0.5 }}>
          {meld.tiles.map((tile, j) => (
            <TileSVG key={j} tile={tile} size={sz} />
          ))}
        </div>
      ))}
    </div>
  );

  // ── Screen state ──

  if (state.phase === 'ended' || state.phase === 'roundEnded') {
    const sr = state.lastScoreResult;
    return (
      <div style={{
        background: greenGrad,
        minHeight: '100vh',
        color: '#fff',
        fontFamily: 'serif',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}>
        <div style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 8 }}>{state.message}</div>
        <div style={{ fontSize: 14, color: '#ccc', marginBottom: 16 }}>
          {state.phase === 'roundEnded'
            ? `次局: ${roundName(state.roundNumber, state.roundWind)} / 親: P${state.dealer + 1} / 本場: ${state.honba}`
            : '対戦終了'}
        </div>
        {sr && (
          <div style={{
            background: 'rgba(0,0,0,0.3)',
            borderRadius: 8,
            padding: '12px 24px',
            marginBottom: 16,
          }}>
            <div style={{ fontWeight: 'bold' }}>スコア</div>
            <div>役: {sr.yaku.map(y => y.name).join('・')}</div>
            <div>飜: {sr.han} / 符: {sr.fu}</div>
            <div>獲得: {sr.score}点</div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 16 }}>
          {([0, 1, 2, 3] as const).map(i => (
            <div key={i} style={{
              background: 'rgba(0,0,0,0.3)',
              borderRadius: 6,
              padding: '6px 14px',
            }}>
              <strong>{i === 0 ? 'あなた' : `P${i + 1}`}</strong>
              <span style={{ marginLeft: 8 }}>{state.players[i].points}点</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 24, fontSize: 14, color: '#aaa' }}>
          {state.phase === 'roundEnded' ? 'Enter / Space: 次局へ' : 'Space: もう一度遊ぶ'}
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
  const doraIndicators = getDoraIndicators(state.deadWall.tiles, state.deadWall.doraCount);

  return (
    <div style={{
      background: greenGrad,
      minHeight: '100vh',
      fontFamily: 'serif',
      display: 'flex',
      flexDirection: 'column',
      padding: '6px 8px',
      color: '#fff',
      userSelect: 'none',
    }}>
      {/* Tile size slider */}
      <div style={{ position: 'fixed', top: 4, right: 8, zIndex: 10 }}>
        <label style={{ fontSize: 11, color: '#8aba8a' }}>
          牌:
          <input
            type="range"
            min={32}
            max={72}
            value={tileSize}
            onChange={e => setTileSize(Number(e.target.value))}
            style={{ verticalAlign: 'middle', margin: '0 4px' }}
          />
        </label>
      </div>

      {/* ═══ OPPONENT ROW ═══ */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'flex-start',
        gap: 4,
        marginBottom: 6,
      }}>
        {([3, 2, 1] as const).map((idx) => {
          const p = state.players[idx];
          const labels = ['あなた', '下家', '対面', '上家'];
          return (
            <div key={idx} style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              background: 'rgba(0,0,0,0.18)',
              borderRadius: 6,
              padding: '4px 8px',
              flex: 1,
              maxWidth: 240,
            }}>
              {/* Name + Points */}
              <div style={{ fontSize: 13, fontWeight: 'bold', color: '#ffd700' }}>
                {WIND_NAMES[p.wind]}家
                <span style={{ color: '#ccc', fontWeight: 'normal', marginLeft: 6 }}>
                  {labels[idx]} {p.riichi && '⚡'}
                </span>
              </div>
              <div style={{ fontSize: 15, color: '#fff', fontWeight: 'bold' }}>{p.points}点</div>
              {/* Tile backs */}
              <div style={{ display: 'flex', gap: 0.5 }}>
                {Array.from({ length: Math.min(p.hand.length, 13) }).map((_, i) => (
                  <TileBack key={i} size={Math.round(s * 0.45)} />
                ))}
              </div>
              {/* Melds */}
              {p.melds.length > 0 && (
                <div style={{ marginTop: 2 }}>
                  {renderMeldSet(p.melds, Math.round(s * 0.35))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ═══ CENTER: Log / Dora / Last discard ═══ */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
        padding: '3px 0',
        marginBottom: 4,
      }}>
        {/* Dora indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 12, color: '#8aba8a', fontWeight: 'bold' }}>ドラ:</span>
          {doraIndicators.length > 0 ? (
            doraIndicators.map((tile, i) => (
              <TileSVG key={`dora-${i}`} tile={tile} size={Math.round(s * 0.55)} />
            ))
          ) : (
            <span style={{ color: '#5a9a5a', fontSize: 11 }}>--</span>
          )}
        </div>

        {/* Last discard */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 12, color: '#8aba8a', fontWeight: 'bold' }}>最後の捨て牌:</span>
          {state.lastDiscard ? (
            <TileSVG tile={state.lastDiscard.tile} size={Math.round(s * 0.65)} selected />
          ) : (
            <span style={{ color: '#5a9a5a', fontSize: 11 }}>--</span>
          )}
        </div>
      </div>

      {/* ═══ OPPONENT DISCARD RIVERS ═══ */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-around',
        gap: 8,
        marginBottom: 6,
      }}>
        <div style={{
          background: 'rgba(0,0,0,0.1)',
          borderRadius: 4,
          padding: 3,
          flex: 1,
          maxWidth: 240,
        }}>
          <div style={{ fontSize: 9, color: '#8aba8a', marginBottom: 2 }}>上家の河</div>
          {renderOpponentRiver(state.players[3].discards)}
        </div>
        <div style={{
          background: 'rgba(0,0,0,0.1)',
          borderRadius: 4,
          padding: 3,
          flex: 1,
          maxWidth: 240,
        }}>
          <div style={{ fontSize: 9, color: '#8aba8a', marginBottom: 2 }}>対面の河</div>
          {renderOpponentRiver(state.players[2].discards)}
        </div>
        <div style={{
          background: 'rgba(0,0,0,0.1)',
          borderRadius: 4,
          padding: 3,
          flex: 1,
          maxWidth: 240,
        }}>
          <div style={{ fontSize: 9, color: '#8aba8a', marginBottom: 2 }}>下家の河</div>
          {renderOpponentRiver(state.players[1].discards)}
        </div>
      </div>

      {/* ═══ PLAYER SECTION ═══ */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        marginTop: 'auto',
        background: 'rgba(0,0,0,0.15)',
        borderRadius: 8,
        padding: '6px 8px',
      }}>
        {/* Wind, points, riichi, shanten */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14 }}>
          <span style={{ fontWeight: 'bold', color: '#ffd700' }}>
            {WIND_NAMES[state.players[0].wind]}家 (あなた)
          </span>
          <span style={{ color: '#fff', fontWeight: 'bold' }}>{state.players[0].points}点</span>
          {state.players[0].riichi && <span style={{ color: '#ff4444', fontWeight: 'bold' }}>リーチ中</span>}
          {humanShanten >= 0 && (
            <span style={{ color: '#8aba8a', fontSize: 12 }}>
              シャンテン: {humanShanten}
            </span>
          )}
        </div>

        {/* Melds */}
        {state.players[0].melds.length > 0 && (
          <div style={{ marginTop: 2 }}>
            {renderMeldSet(state.players[0].melds, Math.round(s * 0.55))}
          </div>
        )}

        {/* Player discards */}
        <div style={{ width: '100%', maxWidth: 700 }}>
          <div style={{ fontSize: 11, color: '#8aba8a', marginBottom: 2 }}>あなたの河</div>
          <DiscardRiver discards={state.players[0].discards} tileSize={Math.round(s * 0.55)} />
        </div>

        {/* Hand */}
        <div style={{ display: 'flex', gap: 0, marginTop: 4 }}>
          {showDrawnSeparate ? (
            <>
              <HandView
                tiles={hand.filter((_, i) => i !== drawnIndex)}
                selectedIndex={selectedIndex === drawnIndex ? -1 : selectedIndex > drawnIndex ? selectedIndex - 1 : selectedIndex}
                tileSize={s}
              />
              <TileSVG
                tile={state.lastDrawnTile!}
                size={s}
                selected={selectedIndex === drawnIndex}
                isDrawn
              />
            </>
          ) : (
            <HandView
              tiles={hand}
              selectedIndex={selectedIndex}
              tileSize={s}
            />
          )}
        </div>

        {/* Turn info */}
        <div style={{ fontSize: 11, color: '#8aba8a' }}>
          残り牌: {state.wall.length} / 王牌: {state.deadWall.tiles.length}枚 / リーチ棒: {state.riichiSticks}
        </div>

        {/* Claim menu */}
        {isClaiming && humanOptions.length > 0 && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 6,
            marginTop: 6,
          }}>
            {humanOptions.map((opt, i) => (
              <button
                key={i}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: i === claimSelectedIndex ? '2px solid #ff8800' : '1px solid #888',
                  background: i === claimSelectedIndex ? 'rgba(255,136,0,0.2)' : 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontSize: 14,
                  cursor: 'pointer',
                  fontFamily: 'serif',
                }}
                onClick={() => {
                  setClaimSelectedIndex(i);
                  switch (opt.type) {
                    case 'ron': dispatch({ type: 'RON', winner: 0 }); break;
                    case 'chi': dispatch({ type: 'CHI', player: 0, optionIndex: state.claimOptions.indexOf(opt) }); break;
                    case 'pon': dispatch({ type: 'PON', player: 0 }); break;
                    case 'daiminkan': dispatch({ type: 'DAIMINKAN', player: 0 }); break;
                  }
                }}
              >
                {claimLabel(opt)} {opt.tiles.map(t => formatTile(t)).join('')}
              </button>
            ))}
          </div>
        )}

        {/* Action buttons */}
        {state.phase === 'playing' && state.currentPlayer === 0 && !state.players[0].riichi && (
          <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
            {(turnTileCount(state.players[0]) === 14) && (
              <button style={{
                padding: '4px 14px',
                borderRadius: 4,
                border: '1px solid #228833',
                background: 'rgba(34,136,51,0.2)',
                color: '#88dd88',
                cursor: 'pointer',
                fontSize: 13,
                fontFamily: 'serif',
              }} onClick={() => dispatch({ type: 'TSUMO', player: 0 })}>
                T: ツモ
              </button>
            )}
            {(!state.players[0].riichi && state.players[0].points >= 1000 &&
              state.players[0].melds.every(m => m.type === 'closedKan')) && (
              <button style={{
                padding: '4px 14px',
                borderRadius: 4,
                border: '1px solid #886622',
                background: 'rgba(136,102,34,0.2)',
                color: '#ddbb66',
                cursor: 'pointer',
                fontSize: 13,
                fontFamily: 'serif',
              }}
                onClick={() => dispatch({ type: 'DECLARE_RIICHI', player: 0, discardTile: hand[selectedIndex]! })}
              >
                R: リーチ
              </button>
            )}
          </div>
        )}

        {/* Message */}
        {state.message && (
          <div style={{
            fontSize: 16,
            fontWeight: 'bold',
            color: '#ffdd88',
            textAlign: 'center',
            marginTop: 4,
          }}>
            {state.message}
          </div>
        )}

        {/* Key legend */}
        <div style={{ fontSize: 11, color: '#6a9a6a', textAlign: 'center', marginTop: 4 }}>
          ←→: 選択 &nbsp; Enter: 打牌 &nbsp; T: ツモ &nbsp; R: リーチ &nbsp; 1-9: 直接選択
          {isClaiming && ' | L:ロン C:チー P:ポン K:カン Space:パス'}
        </div>
      </div>
    </div>
  );
};
