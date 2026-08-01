import React, { useReducer, useEffect, useState, useRef } from "react";
import { Text, Box, useInput, useStdout, useApp } from "ink";
import {
  createInitialState,
  gameReducer,
  normalizeGameState,
  processAiTurn,
  turnTileCount,
} from "../state/GameState.js";
import {
  canHumanTsumo,
  canHumanRiichi,
  canHumanKakan,
  canHumanKan,
  canHumanKyuushu,
  computeHumanWaits,
  getHumanHand,
} from "../state/selectors.js";
import { saveGame, loadGame, clearSave } from "../state/persistence.js";
import type { ClaimOption, GameAction, GameState } from "../state/GameState.js";
import { formatTile, getDoraIndicators } from "../game/tiles.js";
import { isWinningHand, tilesToCounts, calcShanten } from "../game/agari.js";
import { type Meld, type Tile, type Discard, type AiPersonality } from "../game/types.js";
import { DiscardView, tileColor } from "./DiscardView.js";
import { KeyLegend } from "./KeyLegend.js";
import { PersonalitySetup, makeDefaultSlot, resolveSlot, PARAM_KEYS } from "./PersonalitySetup.js";
import type { SlotConfig } from "./PersonalitySetup.js";
import { randomPersonality } from "../game/aiPersonality.js";

const AI_DELAY = parseInt(process.env.MAHJONG_AI_DELAY ?? "600", 10);

// ── Display helpers ────────────────────────────────────────────────

function stringDisplayWidth(str: string): number {
  let width = 0;
  for (const char of str) {
    const code = char.codePointAt(0) ?? 0;
    if (
      (code >= 0x3000 && code <= 0x303f) || // CJK punctuation
      (code >= 0x3040 && code <= 0x309f) || // Hiragana
      (code >= 0x30a0 && code <= 0x30ff) || // Katakana
      (code >= 0x4e00 && code <= 0x9fff) || // CJK ideographs
      (code >= 0xff01 && code <= 0xff5e) || // Fullwidth ASCII
      (code >= 0xffe0 && code <= 0xffe6) // Fullwidth symbols
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

// ── Color helpers (re-exported from DiscardView) ────────────────────
// tileColor is imported from ./DiscardView.js

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
        {riichi ? "リーチ! " : ""}
        {"🀫 ".repeat(tiles.length)}
      </Text>
    );
  }

  return (
    <Box>
      {tiles.map((tile, i) => {
        const isSelected = i === selectedIndex;
        return (
          <Box key={`${tile.suit}:${tile.value}:${tile.red ?? false}:${i}`} width={3}>
            <Text color={tileColor(tile)} underline={isSelected} bold={isSelected}>
              {formatTile(tile)}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};

// ── Meld display ──────────────────────────────────────────────────

interface MeldViewProps {
  melds: readonly Meld[];
}

const MeldView: React.FC<MeldViewProps> = ({ melds }) => {
  if (melds.length === 0) return null;
  return (
    <Text>
      {melds.map((meld, i) => (
        <Text key={i}>
          [
          {meld.tiles.map((tile, j) => (
            <Text key={j} color={tileColor(tile)}>
              {formatTile(tile)}{" "}
            </Text>
          ))}
          ]{" "}
        </Text>
      ))}
    </Text>
  );
};

// ── Turn info ──────────────────────────────────────────────────────

interface TurnInfoProps {
  wallRemaining: number;
  deadWallRemaining: number;
  riichiSticks: number;
}

const TurnInfo: React.FC<TurnInfoProps> = ({ wallRemaining, deadWallRemaining, riichiSticks }) => {
  const turns = Math.floor(wallRemaining / 4);
  return (
    <Box marginTop={1}>
      <Text bold>
        残り{turns}巡 (山:{wallRemaining}枚 王牌:{deadWallRemaining}枚) | リーチ棒:{riichiSticks}
      </Text>
    </Box>
  );
};

// ── Turn log ───────────────────────────────────────────────────────

interface TurnLogViewProps {
  entries: readonly { player: number; tile: Tile }[];
}

const TurnLogView: React.FC<TurnLogViewProps> = ({ entries }) => {
  if (entries.length === 0) return null;
  return (
    <Box marginY={1}>
      <Text dimColor>直近: </Text>
      {entries.map((entry, i) => (
        <Text key={i} color={tileColor(entry.tile)}>
          P{entry.player + 1}
          {formatTile(entry.tile)}
          {"  "}
        </Text>
      ))}
    </Box>
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
          <Box key={`dora-${tile.suit}-${tile.value}-${i}`} width={3}>
            <Text bold color={tileColor(tile)}>
              {formatTile(tile)}
            </Text>
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
    case "ron":
      return "ロン";
    case "chi":
      return "チー";
    case "pon":
      return "ポン";
    case "daiminkan":
      return "カン";
  }
};

// ── Opponent info ──────────────────────────────────────────────────
interface OpponentInfoProps {
  wind: string;
  relativeLabel?: string;
  discards: readonly Discard[];
  melds: readonly Meld[];
  points: number;
  tileCount: number;
  centerIn?: number;
  terminalWidth: number | undefined;
  compact: boolean | undefined;
}

const OpponentInfo: React.FC<OpponentInfoProps> = ({
  wind,
  relativeLabel,
  discards,
  melds,
  points,
  tileCount,
  centerIn,
  terminalWidth,
  compact,
}) => {
  const riichi = discards.some((d) => d.isRiichi);
  const label = relativeLabel ? `${relativeLabel} ${wind}` : wind;
  const labelText = `${label} (${points}点) 手牌:${tileCount}`;
  const leftPadding =
    centerIn && centerIn > stringDisplayWidth(labelText)
      ? Math.floor((centerIn - stringDisplayWidth(labelText)) / 2)
      : 0;
  const pad = " ".repeat(leftPadding);
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>
        {pad}
        {labelText}{" "}
        {riichi && (
          <Text bold color="yellow">
            リーチ
          </Text>
        )}
      </Text>
      {melds.length > 0 && (
        <Box marginLeft={leftPadding}>
          <MeldView melds={melds} />
        </Box>
      )}
      <Box marginLeft={leftPadding}>
        <DiscardView discards={discards} terminalWidth={terminalWidth} compact={compact} />
      </Box>
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
    </Box>
  );
};

// ── Action bar ────────────────────────────────────────────────────

interface ActionBarProps {
  canTsumo: boolean;
  canRiichi: boolean;
  canKan: boolean;
  canKyuushu: boolean;
}

const ActionBar: React.FC<ActionBarProps> = ({ canTsumo, canRiichi, canKan, canKyuushu }) => {
  return (
    <Box marginTop={1}>
      {canTsumo && <Text color="green"> [T]ツモ </Text>}
      {canRiichi && <Text color="yellow"> [R]リーチ </Text>}
      {canKan && <Text color="cyan"> [K]カン </Text>}
      {canKyuushu && <Text color="magenta"> [Y]九種九牌 </Text>}
    </Box>
  );
};

// ── Main game component ───────────────────────────────────────────

const WIND_NAMES = ["東", "南", "西", "北"];
const roundName = (roundNumber: number, roundWind: number = 0) =>
  `${WIND_NAMES[roundWind] ?? "東"}${roundNumber}局`;

const App: React.FC = () => {
  const [state, dispatch] = useReducer(gameReducer, null, createInitialState);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [claimSelectedIndex, setClaimSelectedIndex] = useState(0);
  const processingRef = useRef(false);
  const turnLogRef = useRef<{ player: number; tile: Tile }[]>([]);
  const prevShowDrawnRef = useRef(false);
  const [startupMode, setStartupMode] = useState<"loading" | "choose" | "setup" | "ready">("loading");
  const [savedState, setSavedState] = useState<GameState | null>(null);
  // AI personality setup state
  const [slots, setSlots] = useState<[SlotConfig, SlotConfig, SlotConfig]>([
    makeDefaultSlot(),
    makeDefaultSlot(),
    makeDefaultSlot(),
  ]);
  const [setupSelectedSlot, setSetupSelectedSlot] = useState(0);
  const [setupShowCustom, setSetupShowCustom] = useState(false);
  const [setupSelectedParam, setSetupSelectedParam] = useState(0);
  const { stdout } = useStdout();
  const { exit } = useApp();
  const terminalWidth = stdout.columns || 80;

  useEffect(() => {
    const saved = loadGame<GameState>();
    if (saved && saved.phase !== "ended") {
      setSavedState(normalizeGameState(saved));
      setStartupMode("choose");
    } else {
      setStartupMode("setup");
    }
  }, []);

  // 状態が変わったら自動セーブ
  useEffect(() => {
    if (startupMode !== "ready") return;
    if (state.phase === "ended") {
      clearSave();
    } else if (
      state.phase === "playing" ||
      state.phase === "claiming" ||
      state.phase === "roundEnded"
    ) {
      saveGame(state);
    }
  }, [state, startupMode]);
  // Turn log tracking
  useEffect(() => {
    if (!state.lastDiscard) return;
    const entry = { player: state.lastDiscard.player, tile: state.lastDiscard.tile };
    turnLogRef.current = [...turnLogRef.current.slice(-4), entry];
  }, [state.lastDiscard]);
  // Auto-draw for human
  useEffect(() => {
    if (startupMode !== "ready") return;
    if (state.phase !== "playing") return;
    if (state.currentPlayer !== 0) return;
    if (turnTileCount(state.players[0]) === 13) {
      dispatch({ type: "DRAW", player: 0 });
    }
  }, [
    startupMode,
    state.currentPlayer,
    state.phase,
    state.players[0].hand.length,
    state.players[0].melds.length,
  ]);

  // Riichi auto-tsumogiri: リーチ中のツモ切り（強制）
  useEffect(() => {
    if (startupMode !== "ready") return;
    if (state.phase !== "playing") return;
    if (state.currentPlayer !== 0) return;
    if (!state.players[0].riichi) return;
    if (state.players[0].hand.length !== 14) return;
    if (!state.lastDrawnTile) return;

    // 自摸和ならTSUMO
    if (isWinningHand(tilesToCounts(state.players[0].hand))) {
      dispatch({ type: "TSUMO", player: 0 });
      return;
    }

    dispatch({ type: "DISCARD", player: 0, tile: state.lastDrawnTile });
  }, [
    startupMode,
    state.phase,
    state.currentPlayer,
    state.players[0].riichi,
    state.players[0].hand.length,
    state.lastDrawnTile,
  ]);

  // AI turn processing (ref でレンダリングをトリガしない)
  useEffect(() => {
    if (startupMode !== "ready") return;
    if (state.phase === "ended") return;
    if (state.phase === "roundEnded") return;
    if (processingRef.current) return;

    const isAiTurn = state.phase === "playing" && state.currentPlayer !== 0;
    const isAiClaim = state.phase === "claiming" && !state.claimOptions.some((c) => c.player === 0);

    if (isAiTurn || isAiClaim) {
      processingRef.current = true;
      const timer = setTimeout(() => {
        try {
          const { action } = processAiTurn(state);
          processingRef.current = false;
          if (action) dispatch(action);
        } catch (err) {
          processingRef.current = false;
          const message = err instanceof Error ? err.message : String(err);
          dispatch({ type: "SET_MESSAGE", message: `AIエラー: ${message}` });
        }
      }, AI_DELAY);
      return () => {
        clearTimeout(timer);
        processingRef.current = false;
      };
    }
  }, [state, startupMode]);

  const hand = getHumanHand(state);
  const drawnIndex = state.lastDrawnTile != null ? hand.indexOf(state.lastDrawnTile) : -1;
  const showDrawnSeparate = drawnIndex >= 0 && turnTileCount(state.players[0]) === 14;
  // Auto-select drawn tile when drawn-separate view newly activates
  useEffect(() => {
    if (showDrawnSeparate && !prevShowDrawnRef.current) {
      setSelectedIndex(drawnIndex);
    }
    prevShowDrawnRef.current = showDrawnSeparate;
  }, [showDrawnSeparate, drawnIndex]);
  const humanCanTsumo = canHumanTsumo(state);
  const humanCanRiichi = canHumanRiichi(state);
  const humanCanKakan = canHumanKakan(state, selectedIndex);
  const humanCanKan = canHumanKan(state, selectedIndex);
  const humanCanKyuushu = canHumanKyuushu(state);
  const humanWaits = computeHumanWaits(state, selectedIndex);
  const humanAllTiles = [
    ...state.players[0].hand,
    ...state.players[0].melds.flatMap((m) => m.tiles),
  ];
  const humanShanten =
    state.phase === "playing" && state.currentPlayer === 0 ? calcShanten(humanAllTiles) : -1;

  // Keyboard input
  useInput((input, key) => {
    if (startupMode === "choose") {
      if (input === "r" || key.return) {
        if (savedState) dispatch({ type: "RESTORE", state: savedState } as GameAction);
        setStartupMode("ready");
        return;
      }
      if (input === "n" || input === "q") {
        clearSave();
        setSlots([makeDefaultSlot(), makeDefaultSlot(), makeDefaultSlot()]);
        setSetupSelectedSlot(0);
        setSetupShowCustom(false);
        setSetupSelectedParam(0);
        setStartupMode("setup");
        return;
      }
      return;
    }

    if (startupMode === "setup") {
      if (input === "q") {
        setStartupMode("choose");
        return;
      }
      if (input === "s") {
        const personalities: (AiPersonality | null)[] = [null];
        for (const slot of slots) {
          const resolved = resolveSlot(slot);
          if (slot.templateId === 'random') {
            personalities.push(randomPersonality());
          } else {
            personalities.push(resolved);
          }
        }
        dispatch({ type: "START_GAME", personalities });
        setSelectedIndex(0);
        setStartupMode("ready");
        return;
      }
      if (input === "r") {
        setSlots([
          { templateId: 'custom', customParams: randomPersonality() },
          { templateId: 'custom', customParams: randomPersonality() },
          { templateId: 'custom', customParams: randomPersonality() },
        ]);
        return;
      }
      if (setupShowCustom) {
        if (key.return || input === "q") {
          setSetupShowCustom(false);
          return;
        }
        if (key.upArrow) {
          setSetupSelectedParam((p) => Math.max(0, p - 1));
          return;
        }
        if (key.downArrow) {
          setSetupSelectedParam((p) => Math.min(PARAM_KEYS.length - 1, p + 1));
          return;
        }
        if (key.leftArrow) {
          const key_ = PARAM_KEYS[setupSelectedParam]!;
          setSlots((prev) => {
            const next = [...prev] as [SlotConfig, SlotConfig, SlotConfig];
            const slot = next[setupSelectedSlot]!;
            if (slot.templateId !== 'custom') {
              next[setupSelectedSlot] = { templateId: 'custom', customParams: resolveSlot(slot) };
            }
            next[setupSelectedSlot] = {
              ...next[setupSelectedSlot]!,
              customParams: {
                ...next[setupSelectedSlot]!.customParams,
                [key_]: Math.max(1, (next[setupSelectedSlot]!.customParams[key_] ?? 3) - 1),
              },
            };
            return next;
          });
          return;
        }
        if (key.rightArrow) {
          const key_ = PARAM_KEYS[setupSelectedParam]!;
          setSlots((prev) => {
            const next = [...prev] as [SlotConfig, SlotConfig, SlotConfig];
            const slot = next[setupSelectedSlot]!;
            if (slot.templateId !== 'custom') {
              next[setupSelectedSlot] = { templateId: 'custom', customParams: resolveSlot(slot) };
            }
            next[setupSelectedSlot] = {
              ...next[setupSelectedSlot]!,
              customParams: {
                ...next[setupSelectedSlot]!.customParams,
                [key_]: Math.min(5, (next[setupSelectedSlot]!.customParams[key_] ?? 3) + 1),
              },
            };
            return next;
          });
          return;
        }
        return;
      }
      // Template selection mode
      if (key.upArrow) {
        setSetupSelectedSlot((s) => Math.max(0, s - 1));
        return;
      }
      if (key.downArrow) {
        setSetupSelectedSlot((s) => Math.min(2, s + 1));
        return;
      }
      if (key.leftArrow) {
        setSlots((prev) => {
          const next = [...prev] as [SlotConfig, SlotConfig, SlotConfig];
          const slot = next[setupSelectedSlot]!;
          const templates = [
            { templateId: 'balancer' },
            { templateId: 'defensive' },
            { templateId: 'aggressive' },
            { templateId: 'handValue' },
            { templateId: 'meldExpert' },
            { templateId: 'custom' },
          ];
          const currentIdx = templates.findIndex((t) => t.templateId === slot.templateId);
          const prevIdx = ((currentIdx - 1 + templates.length) % templates.length);
          const newId = templates[prevIdx]!.templateId;
          if (newId === 'custom') {
            next[setupSelectedSlot] = { templateId: 'custom', customParams: resolveSlot(slot) };
          } else {
            next[setupSelectedSlot] = { templateId: newId, customParams: slot.customParams };
          }
          return next;
        });
        return;
      }
      if (key.rightArrow) {
        setSlots((prev) => {
          const next = [...prev] as [SlotConfig, SlotConfig, SlotConfig];
          const slot = next[setupSelectedSlot]!;
          const templates = [
            { templateId: 'balancer' },
            { templateId: 'defensive' },
            { templateId: 'aggressive' },
            { templateId: 'handValue' },
            { templateId: 'meldExpert' },
            { templateId: 'custom' },
          ];
          const currentIdx = templates.findIndex((t) => t.templateId === slot.templateId);
          const nextIdx = (currentIdx + 1) % templates.length;
          const newId = templates[nextIdx]!.templateId;
          if (newId === 'custom') {
            next[setupSelectedSlot] = { templateId: 'custom', customParams: resolveSlot(slot) };
          } else {
            next[setupSelectedSlot] = { templateId: newId, customParams: slot.customParams };
          }
          return next;
        });
        return;
      }
      if (key.return) {
        const slot = slots[setupSelectedSlot]!;
        if (slot.templateId === 'custom') {
          setSetupShowCustom(true);
          setSetupSelectedParam(0);
        }
        return;
      }
      return;
    }


    if (startupMode !== "ready") return;

    if (state.phase === "roundEnded") {
      if (input === "n" || input === " " || key.return) {
        dispatch({ type: "NEXT_ROUND" });
        setSelectedIndex(0);
      }
      return;
    }

    // Game over screen
    if (state.phase === "ended") {
      if (input === " ") {
        dispatch({ type: "START_GAME" });
        setSelectedIndex(0);
      } else if (input === "q") {
        exit();
      }
      return;
    }

    // Claiming phase
    if (state.phase === "claiming") {
      const humanOptions = state.claimOptions.filter((c) => c.player === 0);
      if (humanOptions.length === 0) return; // AI handles itself

      if (key.leftArrow) {
        setClaimSelectedIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.rightArrow) {
        setClaimSelectedIndex((prev) => Math.min(humanOptions.length - 1, prev + 1));
        return;
      }

      if (input === "l") {
        if (humanOptions.some((o) => o.type === "ron")) {
          dispatch({ type: "RON", winner: 0 });
          return;
        }
      }
      if (input === "c") {
        const chiOpts = humanOptions.filter((o) => o.type === "chi");
        if (chiOpts.length > 0) {
          const selectedOpt = humanOptions[claimSelectedIndex];
          const chosenChi = selectedOpt && selectedOpt.type === "chi" ? selectedOpt : chiOpts[0]!;
          dispatch({
            type: "CHI",
            player: 0,
            optionIndex: state.claimOptions.indexOf(chosenChi),
          });
          return;
        }
      }
      if (input === "p") {
        if (humanOptions.some((o) => o.type === "pon")) {
          dispatch({ type: "PON", player: 0 });
          return;
        }
      }
      if (input === "k") {
        if (humanOptions.some((o) => o.type === "daiminkan")) {
          dispatch({ type: "DAIMINKAN", player: 0 });
          return;
        }
      }
      if (key.return) {
        const opt = humanOptions[claimSelectedIndex];
        if (!opt) return;
        switch (opt.type) {
          case "ron":
            dispatch({ type: "RON", winner: 0 });
            break;
          case "chi":
            dispatch({ type: "CHI", player: 0, optionIndex: state.claimOptions.indexOf(opt) });
            break;
          case "pon":
            dispatch({ type: "PON", player: 0 });
            break;
          case "daiminkan":
            dispatch({ type: "DAIMINKAN", player: 0 });
            break;
        }
        return;
      }
      if (input === " " || key.escape || input === "q") {
        dispatch({ type: "PASS_CLAIM" });
        return;
      }
      return;
    }

    // Playing phase: only human's turn
    if (input === "q") {
      exit();
      return;
    }
    if (state.currentPlayer !== 0) return;

    // リーチ中は強制ツモ切り: 自摸和(T)以外は受け付けない
    if (state.players[0].riichi) {
      if (input === "t") {
        dispatch({ type: "TSUMO", player: 0 });
      }
      return;
    }

    if (key.leftArrow) {
      setSelectedIndex((prev) => {
        if (hand.length === 0) return 0;
        if (!showDrawnSeparate) return (prev - 1 + hand.length) % hand.length;
        // Visual order: non-drawn tiles left-to-right, drawn tile at end
        const visual = prev === drawnIndex ? hand.length - 1 : prev > drawnIndex ? prev - 1 : prev;
        const newVisual = (visual - 1 + hand.length) % hand.length;
        return newVisual === hand.length - 1 ? drawnIndex : newVisual >= drawnIndex ? newVisual + 1 : newVisual;
      });
      return;
    }
    if (key.rightArrow) {
      setSelectedIndex((prev) => {
        if (hand.length === 0) return 0;
        if (!showDrawnSeparate) return (prev + 1) % hand.length;
        // Visual order: non-drawn tiles left-to-right, drawn tile at end
        const visual = prev === drawnIndex ? hand.length - 1 : prev > drawnIndex ? prev - 1 : prev;
        const newVisual = (visual + 1) % hand.length;
        return newVisual === hand.length - 1 ? drawnIndex : newVisual >= drawnIndex ? newVisual + 1 : newVisual;
      });
      return;
    }

    const num = parseInt(input, 10);
    if (num >= 1 && num <= hand.length) {
      if (!showDrawnSeparate) {
        setSelectedIndex(num - 1);
      } else {
        const visual = num - 1;
        setSelectedIndex(visual === hand.length - 1 ? drawnIndex : visual >= drawnIndex ? visual + 1 : visual);
      }
      return;
    }

    if (key.return) {
      if (hand.length === 0) return;
      dispatch({ type: "DISCARD", player: 0, tile: hand[selectedIndex]! });
      setSelectedIndex(0);
      return;
    }

    if (input === "r" && humanCanRiichi) {
      dispatch({ type: "DECLARE_RIICHI", player: 0, discardTile: hand[selectedIndex]! });
      return;
    }

    if (input === "k" && humanCanKan) {
      dispatch({ type: humanCanKakan ? "KAKAN" : "ANKAN", player: 0, tile: hand[selectedIndex]! });
      return;
    }

    if (input === "t" && humanCanTsumo) {
      dispatch({ type: "TSUMO", player: 0 });
      return;
    }

    if (input === "y" && humanCanKyuushu) {
      dispatch({ type: "DECLARE_KYUUSHU_KYUUHAI", player: 0 });
      return;
    }
  });

  if (startupMode === "loading") {
    return (
      <Box padding={1}>
        <Text>読み込み中...</Text>
      </Box>
    );
  }

  if (startupMode === "choose") {
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


  if (startupMode === "setup") {
    return (
      <PersonalitySetup
        slots={slots}
        selectedSlot={setupSelectedSlot}
        showCustom={setupShowCustom}
        selectedParam={setupSelectedParam}
      />
    );
  }

  if (state.phase === "ended" || state.phase === "roundEnded") {
    const sr = state.lastScoreResult;
    const sortedPlayers =
      state.phase === "ended" && state.finalRanking ? state.finalRanking : [0, 1, 2, 3];
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold>{state.message}</Text>
        <Text dimColor>
          {state.phase === "roundEnded"
            ? `次局: ${roundName(state.roundNumber, state.roundWind)} / 親: P${state.dealer + 1} / 本場: ${state.honba} / 供託: ${state.riichiSticks}`
            : "対戦終了"}
        </Text>
        <DoraView state={state} />
        {sr && (
          <>
            <Text dimColor>{"─".repeat(40)}</Text>
            <Box flexDirection="column">
              <Text bold>-- スコア --</Text>
              <Text>役: {sr.yaku.map((y) => y.name).join("・")}</Text>
              {sr.yakuman > 0 ? (
                <Text color="red" bold>
                  {sr.yakuman === 1
                    ? "役満"
                    : sr.yakuman === 2
                      ? "ダブル役満"
                      : `役満 ×${sr.yakuman}`}
                </Text>
              ) : (
                <>
                  <Text>
                    飜: {sr.han - sr.doraHan} (役) + {sr.doraHan} (ドラ) = {sr.han}
                  </Text>
                  <Text>符: {sr.fu}</Text>
                  {sr.limit !== "none" && sr.limit !== "yakuman" && (
                    <Text>満貫区分: {sr.limit}</Text>
                  )}
                </>
              )}
              <Text>
                支払い: {sr.payment.from.map((f) => `P${f.player + 1}: ${f.amount}点`).join(", ")}
              </Text>
              <Text bold color="yellow">
                獲得: {sr.score}点
              </Text>
            </Box>
          </>
        )}
        <Box marginTop={1}>
          {sortedPlayers.map((i, index) => (
            <Box key={i} marginRight={2}>
              <Text>
                {state.phase === "ended" ? `${index + 1}位: ` : ""}
                {i === 0 ? "あなた" : `P${i + 1}`}({WIND_NAMES[state.players[i].wind]}家):{" "}
              </Text>
              <Text bold={true} color={i === state.winner ? "yellow" : "white"}>
                {state.players[i].points}点
              </Text>
            </Box>
          ))}
        </Box>
        {state.phase === "ended" && state.roundHistory && state.roundHistory.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>-- 局履歴 --</Text>
            {state.roundHistory.map((history, idx) => (
              <Box key={idx} flexDirection="column" marginBottom={1}>
                <Text bold>{history.roundName}</Text>
                <Text>{history.resultText}</Text>
                <Text dimColor>
                  {history.pointChanges
                    .map((pt, pIdx) => {
                      const name = pIdx === 0 ? "あなた" : `P${pIdx + 1}`;
                      const sign = pt > 0 ? "+" : "";
                      return `${name}: ${sign}${pt}`;
                    })
                    .join(" / ")}
                </Text>
              </Box>
            ))}
          </Box>
        )}
        <Box marginTop={1}>
          <Text dimColor>
            {state.phase === "roundEnded"
              ? "N / Enter / Space: 次局へ"
              : "[Space] もう一度遊ぶ / [Q] 終了する"}
          </Text>
        </Box>
      </Box>
    );
  }

  const dividerWidth = Math.max(20, Math.min((terminalWidth ?? 80) - 4, 80));

  // Claiming screen
  if (state.phase === "claiming") {
    const humanOptions = state.claimOptions.filter((c) => c.player === 0);
    return (
      <Box width={terminalWidth}>
        <Box flexDirection="column" padding={1} width="100%">
          <Box alignItems="center" flexDirection="column" width="100%">
            <Text bold>
              {roundName(state.roundNumber, state.roundWind)} / 親: P{state.dealer + 1} / 本場: {state.honba}
            </Text>
          </Box>
          <Text dimColor>{"─".repeat(dividerWidth)}</Text>
          {/* 対面 (across) - top center */}
          <Box width="100%">
            <OpponentInfo
              wind={`${WIND_NAMES[state.players[2].wind]}家`}
              relativeLabel="対面"
              discards={state.players[2].discards}
              melds={state.players[2].melds}
              points={state.players[2].points}
              tileCount={state.players[2].hand.length}
              centerIn={terminalWidth - 2}
              terminalWidth={terminalWidth}
              compact={false}
            />
          </Box>
          {/* Side players: 上家 (left) and 下家 (right) */}
          <Box flexDirection="row" justifyContent="space-between" width="100%">
            <Box flexDirection="column">
              <OpponentInfo
                wind={`${WIND_NAMES[state.players[3].wind]}家`}
                relativeLabel="上家"
                discards={state.players[3].discards}
                melds={state.players[3].melds}
                points={state.players[3].points}
                tileCount={state.players[3].hand.length}
                terminalWidth={terminalWidth}
                compact={true}
              />
            </Box>
            <Box flexDirection="column">
              <OpponentInfo
                wind={`${WIND_NAMES[state.players[1].wind]}家`}
                relativeLabel="下家"
                discards={state.players[1].discards}
                melds={state.players[1].melds}
                points={state.players[1].points}
                tileCount={state.players[1].hand.length}
                terminalWidth={terminalWidth}
                compact={true}
              />
            </Box>
          </Box>
          <Box alignItems="center" flexDirection="column" width="100%">
            <Text dimColor>{"─".repeat(dividerWidth)}</Text>
            <DoraView state={state} />
            <Box marginTop={1} marginBottom={1}>
              <Text bold>捨て牌: </Text>
              {state.lastDiscard ? (
                <Text color={tileColor(state.lastDiscard.tile)}>
                  {formatTile(state.lastDiscard.tile)}
                </Text>
              ) : (
                <Text dimColor>まだありません</Text>
              )}
            </Box>
            <TurnLogView entries={turnLogRef.current} />
            <Text dimColor>{"─".repeat(dividerWidth)}</Text>
            <Box marginTop={1} marginBottom={1}>
              <Text bold>{WIND_NAMES[state.players[0].wind]}家 (あなた) </Text>
              <Text dimColor>({state.players[0].points}点) </Text>
              {state.players[0].riichi && <Text color="yellow">リーチ中 </Text>}
            </Box>
            <Box marginBottom={1}>
              <Text bold>あなたの捨て牌: </Text>
              <DiscardView
                discards={state.players[0].discards}
                terminalWidth={terminalWidth}
                compact={false}
              />
            </Box>
            {state.players[0].melds.length > 0 && (
              <Box marginBottom={1}>
                <Text bold>あなたの副露: </Text>
                <MeldView melds={state.players[0].melds} />
              </Box>
            )}
            {showDrawnSeparate ? (
              <Box>
                <HandView
                  tiles={hand.filter((_, i) => i !== drawnIndex)}
                  selectedIndex={selectedIndex === drawnIndex ? -1 : selectedIndex > drawnIndex ? selectedIndex - 1 : selectedIndex}
                  riichi={state.players[0].riichi}
                  isHuman={true}
                />
                <Box width={3}>
                  <Text> <Text color={tileColor(state.lastDrawnTile!)} bold underline={selectedIndex === drawnIndex}>{formatTile(state.lastDrawnTile!)}</Text></Text>
                </Box>
              </Box>
            ) : (
              <HandView
                tiles={hand}
                selectedIndex={selectedIndex}
                riichi={state.players[0].riichi}
                isHuman={true}
              />
            )}
            <TurnInfo wallRemaining={state.wall.length} deadWallRemaining={state.deadWall.tiles.length} riichiSticks={state.riichiSticks} />
            {state.currentPlayer === 0 && state.phase === "claiming" && (
              <Box>
                {humanShanten >= 0 && <Text>シャンテン数:{humanShanten} </Text>}
                {humanWaits.length > 0 && (
                  <Text color="blue">
                    待ち:{humanWaits.length}種 [{humanWaits.map(formatTile).join(" ")}]
                  </Text>
                )}
              </Box>
            )}
            {humanOptions.length > 0 && (
              <ClaimMenu options={humanOptions} selectedIndex={claimSelectedIndex} />
            )}
          </Box>
          <Box alignItems="center" flexDirection="column" width="100%">
            <Box marginTop={1}>
              <Text bold>{state.message}</Text>
            </Box>
            <KeyLegend phase="claiming" />
          </Box>
        </Box>
      </Box>
    );
  }
  // Normal play screen
  return (
    <Box width={terminalWidth}>
      <Box flexDirection="column" padding={1} width="100%">
        <Box alignItems="center" flexDirection="column" width="100%">
          <Text bold>
            {roundName(state.roundNumber, state.roundWind)} / 親: P{state.dealer + 1} / 本場: {state.honba}
          </Text>
        </Box>
        <Text dimColor>{"─".repeat(dividerWidth)}</Text>
        <Box flexDirection="column" width="100%">
          {/* 対面 (across) - top center */}
          <Box width="100%">
            <OpponentInfo
              wind={`${WIND_NAMES[state.players[2].wind]}家`}
              relativeLabel="対面"
              discards={state.players[2].discards}
              melds={state.players[2].melds}
              points={state.players[2].points}
              tileCount={state.players[2].hand.length}
              centerIn={terminalWidth - 2}
              terminalWidth={terminalWidth}
              compact={false}
            />
          </Box>
          {/* Side players: 上家 (left) and 下家 (right) */}
          <Box flexDirection="row" justifyContent="space-between" width="100%">
            <Box flexDirection="column">
              <OpponentInfo
                wind={`${WIND_NAMES[state.players[3].wind]}家`}
                relativeLabel="上家"
                discards={state.players[3].discards}
                melds={state.players[3].melds}
                points={state.players[3].points}
                tileCount={state.players[3].hand.length}
                terminalWidth={terminalWidth}
                compact={true}
              />
            </Box>
            <Box flexDirection="column">
              <OpponentInfo
                wind={`${WIND_NAMES[state.players[1].wind]}家`}
                relativeLabel="下家"
                discards={state.players[1].discards}
                melds={state.players[1].melds}
                points={state.players[1].points}
                tileCount={state.players[1].hand.length}
                terminalWidth={terminalWidth}
                compact={true}
              />
            </Box>
          </Box>
        </Box>
        <Box alignItems="center" flexDirection="column" width="100%">
          <Text dimColor>{"─".repeat(dividerWidth)}</Text>
          <DoraView state={state} />
          <Box marginTop={1} marginBottom={1}>
            <Text bold>捨て牌: </Text>
            {state.lastDiscard ? (
              <Text color={tileColor(state.lastDiscard.tile)}>
                {formatTile(state.lastDiscard.tile)} (
                {["あなた", "下家", "対面", "上家"][state.lastDiscard.player]})
              </Text>
            ) : (
              <Text dimColor>まだありません</Text>
            )}
          </Box>
          <TurnLogView entries={turnLogRef.current} />
          <Text dimColor>{"─".repeat(dividerWidth)}</Text>
          <Box marginTop={1} marginBottom={1}>
            <Text bold>{WIND_NAMES[state.players[0].wind]}家 (あなた) </Text>
            <Text dimColor>({state.players[0].points}点) </Text>
            {state.players[0].riichi && <Text color="yellow">リーチ中 </Text>}
          </Box>
          <Box marginBottom={1}>
            <Text bold>あなたの捨て牌: </Text>
            <DiscardView
              discards={state.players[0].discards}
              terminalWidth={terminalWidth}
              compact={false}
            />
          </Box>
          {state.players[0].melds.length > 0 && (
            <Box marginBottom={1}>
              <Text bold>あなたの副露: </Text>
              <MeldView melds={state.players[0].melds} />
            </Box>
          )}
          {showDrawnSeparate ? (
            <Box>
              <HandView
                tiles={hand.filter((_, i) => i !== drawnIndex)}
                selectedIndex={selectedIndex === drawnIndex ? -1 : selectedIndex > drawnIndex ? selectedIndex - 1 : selectedIndex}
                riichi={state.players[0].riichi}
                isHuman={true}
              />
              <Box width={3}>
                <Text> <Text color={tileColor(state.lastDrawnTile!)} bold underline={selectedIndex === drawnIndex}>{formatTile(state.lastDrawnTile!)}</Text></Text>
              </Box>
            </Box>
          ) : (
            <HandView
              tiles={hand}
              selectedIndex={selectedIndex}
              riichi={state.players[0].riichi}
              isHuman={true}
            />
          )}
          <TurnInfo wallRemaining={state.wall.length} deadWallRemaining={state.deadWall.tiles.length} riichiSticks={state.riichiSticks} />
          <ActionBar
            canTsumo={humanCanTsumo}
            canRiichi={humanCanRiichi}
            canKan={humanCanKan}
            canKyuushu={humanCanKyuushu}
          />
          {state.currentPlayer === 0 && state.phase === "playing" && (
            <Box>
              {humanShanten >= 0 && <Text>シャンテン数:{humanShanten} </Text>}
              {humanWaits.length > 0 && (
                <Text color="blue">
                  待ち:{humanWaits.length}種 [{humanWaits.map(formatTile).join(" ")}]
                </Text>
              )}
            </Box>
          )}
        </Box>
        <Box alignItems="center" flexDirection="column" width="100%">
          <Box marginTop={1}>
            <Text bold>{state.message}</Text>
          </Box>
          <KeyLegend phase="playing" />
        </Box>
      </Box>
    </Box>
  );
};

export default App;
