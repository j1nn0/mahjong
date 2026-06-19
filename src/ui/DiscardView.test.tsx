import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "ink-testing-library";
import { Text } from "ink";
import renderer from "react-test-renderer";
import { Suit, type Tile, type Discard, PlayerWind } from "../game/types.js";
import { formatTile } from "../game/tiles.js";
import { DiscardView, computeMaxDisplayCount } from "./DiscardView.js";

// ── Tile factories ─────────────────────────────────────────────────

function m(v: number, red = false): Tile {
  return { suit: Suit.Man, value: v as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, red };
}
function p(v: number): Tile {
  return { suit: Suit.Pin, value: v as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 };
}
function s(v: number): Tile {
  return { suit: Suit.Sou, value: v as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 };
}

function discard(tile: Tile, isRiichi: boolean, player: PlayerWind = PlayerWind.Ton): Discard {
  return { tile, isRiichi, player };
}

// ── computeMaxDisplayCount ──────────────────────────────────────────

describe("computeMaxDisplayCount", () => {
  it("returns 18 when terminalWidth is undefined (fallback)", () => {
    // この関数は terminalWidth が必ず渡される前提。 fallback は DiscardView 側。
    expect(computeMaxDisplayCount(80)).toBeGreaterThan(12);
  });

  it("returns at least 12 for normal (non-compact) mode", () => {
    // 最小幅 (40) でも最低 12
    expect(computeMaxDisplayCount(40)).toBe(12);
    // 狭くても落ちない
    expect(computeMaxDisplayCount(30)).toBe(12);
    expect(computeMaxDisplayCount(20)).toBe(12);
  });

  it("returns at least 6 for compact mode", () => {
    expect(computeMaxDisplayCount(40, true)).toBeGreaterThanOrEqual(6);
    expect(computeMaxDisplayCount(20, true)).toBe(6);
    expect(computeMaxDisplayCount(10, true)).toBe(6);
  });

  it("increases count as terminalWidth grows (non-compact)", () => {
    expect(computeMaxDisplayCount(80)).toBeGreaterThan(computeMaxDisplayCount(60));
    expect(computeMaxDisplayCount(100)).toBeGreaterThan(computeMaxDisplayCount(80));
  });

  it("increases count as terminalWidth grows (compact)", () => {
    expect(computeMaxDisplayCount(80, true)).toBeGreaterThan(computeMaxDisplayCount(60, true));
  });

  it("compact mode returns fewer items than non-compact at same width", () => {
    expect(computeMaxDisplayCount(80, true)).toBeLessThan(computeMaxDisplayCount(80));
    expect(computeMaxDisplayCount(120, true)).toBeLessThan(computeMaxDisplayCount(120));
  });

  it("calculates correct values at key widths (non-compact)", () => {
    // available = width - 4, max = max(12, floor(available / 3))
    // width=80: available=76, floor(76/3)=25 → 25
    expect(computeMaxDisplayCount(80)).toBe(25);
    // width=60: available=56, floor(56/3)=18 → 18
    expect(computeMaxDisplayCount(60)).toBe(18);
    // width=50: available=46, floor(46/3)=15 → 15
    expect(computeMaxDisplayCount(50)).toBe(15);
  });

  it("calculates correct values at key widths (compact)", () => {
    // available = floor(width/2) - 4, max = max(6, floor(available/3))
    // width=80: available=40-4=36, floor(36/3)=12 → 12
    expect(computeMaxDisplayCount(80, true)).toBe(12);
    // width=60: available=30-4=26, floor(26/3)=8 → 8
    expect(computeMaxDisplayCount(60, true)).toBe(8);
    // width=50: available=25-4=21, floor(21/3)=7 → 7
    expect(computeMaxDisplayCount(50, true)).toBe(7);
  });
});

// ── Visual output tests (ink-testing-library) ──────────────────────

describe("DiscardView visual output", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders an empty river as --", () => {
    const { lastFrame } = render(
      <DiscardView discards={[]} terminalWidth={undefined} compact={undefined} />,
    );
    expect(lastFrame()).toBe("--");
  });

  it("renders non-riichi discards with tile text", () => {
    const discards = [discard(m(1), false), discard(p(3), false), discard(s(7), false)];
    const { lastFrame } = render(
      <DiscardView discards={discards} terminalWidth={undefined} compact={undefined} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain(formatTile(m(1)));
    expect(frame).toContain(formatTile(p(3)));
    expect(frame).toContain(formatTile(s(7)));
  });

  it("renders a riichi discard with tile text visible", () => {
    const discards = [
      discard(m(1), false),
      discard(p(5), true, PlayerWind.Nan),
      discard(s(9), false),
    ];
    const { lastFrame } = render(
      <DiscardView discards={discards} terminalWidth={undefined} compact={undefined} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain(formatTile(m(1)));
    expect(frame).toContain(formatTile(p(5)));
    expect(frame).toContain(formatTile(s(9)));
  });

  it("renders multiple riichi discards with tile text visible", () => {
    const discards = [discard(m(1), true, PlayerWind.Ton), discard(p(2), true, PlayerWind.Nan)];
    const { lastFrame } = render(
      <DiscardView discards={discards} terminalWidth={undefined} compact={undefined} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain(formatTile(m(1)));
    expect(frame).toContain(formatTile(p(2)));
  });

  it("shows no ellipsis when count is within maxDisplayCount", () => {
    // 18 枚までなら省略なし (undefined → fallback 18)
    const discards = Array.from({ length: 17 }, (_, i) => discard(m((i % 9) + 1), false));
    const { lastFrame } = render(
      <DiscardView discards={discards} terminalWidth={undefined} compact={undefined} />,
    );
    const frame = lastFrame()!;
    expect(frame).not.toMatch(/\.\.\./);
  });

  it("shows ellipsis with omitted count when exceeding maxDisplayCount", () => {
    // 18 枚超えで省略 (undefined → fallback 18)
    const discards = Array.from({ length: 20 }, (_, i) => discard(m((i % 9) + 1), false));
    const { lastFrame } = render(
      <DiscardView discards={discards} terminalWidth={undefined} compact={undefined} />,
    );
    const frame = lastFrame()!;
    // ...2 → 2 omitted (20 - 18 = 2)
    expect(frame).toContain("...2 ");
  });
});

// ── Structural tests (react-test-renderer) ─────────────────────────
// These verify that the `inverse` prop is passed to <Text> for riichi
// discards, which ink-testing-library cannot detect since it strips ANSI.

describe("DiscardView structure", () => {
  it("renders non-riichi discards without inverse prop", () => {
    const discards = [discard(m(1), false), discard(p(3), false)];
    const tree = renderer.create(
      <DiscardView discards={discards} terminalWidth={undefined} compact={undefined} />,
    );
    const textNodes = tree.root.findAllByType(Text);
    // No <Text> should have inverse={true} for non-riichi discards
    const inverseNodes = textNodes.filter(
      (n: renderer.ReactTestInstance) => n.props.inverse === true,
    );
    expect(inverseNodes).toHaveLength(0);
  });

  it("renders a riichi discard with inverse prop on the correct <Text>", () => {
    const discards = [
      discard(m(1), false),
      discard(p(5), true, PlayerWind.Nan), // riichi tile
      discard(s(9), false),
    ];
    const tree = renderer.create(
      <DiscardView discards={discards} terminalWidth={undefined} compact={undefined} />,
    );
    const textNodes = tree.root.findAllByType(Text);
    // Exactly one <Text> should have inverse={true}
    const inverseNodes = textNodes.filter(
      (n: renderer.ReactTestInstance) => n.props.inverse === true,
    );
    expect(inverseNodes).toHaveLength(1);
    // The inverse <Text> should contain the riichi tile's display text
    const inverseNode = inverseNodes[0]!;
    const children = inverseNode.props.children;
    // Children is the formatted tile text plus trailing space
    expect(children).toContain(formatTile(p(5)));
  });

  it("renders multiple riichi discards each with inverse prop", () => {
    const discards = [discard(m(1), true, PlayerWind.Ton), discard(p(2), true, PlayerWind.Nan)];
    const tree = renderer.create(
      <DiscardView discards={discards} terminalWidth={undefined} compact={undefined} />,
    );
    const textNodes = tree.root.findAllByType(Text);
    const inverseNodes = textNodes.filter(
      (n: renderer.ReactTestInstance) => n.props.inverse === true,
    );
    expect(inverseNodes).toHaveLength(2);
  });

  it("renders non-riichi <Text> nodes with color but not inverse", () => {
    const discards = [discard(m(1), false), discard(p(3), true, PlayerWind.Nan)];
    const tree = renderer.create(
      <DiscardView discards={discards} terminalWidth={undefined} compact={undefined} />,
    );
    const textNodes = tree.root.findAllByType(Text);
    // Find the non-riichi Text node (m(1))
    const nonInverseColored = textNodes.filter(
      (n: renderer.ReactTestInstance) => n.props.inverse !== true && n.props.color != null,
    );
    expect(nonInverseColored.length).toBeGreaterThanOrEqual(1);
    // The non-riichi tile should have color but no inverse
    const m1Node = nonInverseColored.find((n: renderer.ReactTestInstance) =>
      String(n.props.children).includes(formatTile(m(1))),
    );
    expect(m1Node).toBeDefined();
    expect(m1Node!.props.inverse).toBeFalsy();
  });
});

// ── Truncation structural tests ─────────────────────────────────────

describe("DiscardView truncation structure", () => {
  it("renders no dimColor <Text> for omitted count when within limit", () => {
    const discards = Array.from({ length: 10 }, (_, i) => discard(m((i % 9) + 1), false));
    const tree = renderer.create(
      <DiscardView discards={discards} terminalWidth={80} compact={false} />,
    );
    // With terminalWidth=80, maxDisplayCount=25 so no truncation
    const textNodes = tree.root.findAllByType(Text);
    const dimNodes = textNodes.filter((n: renderer.ReactTestInstance) => n.props.dimColor === true);
    // The no-dim node is the "--" for empty, not rendered here
    // dim nodes should only appear if there's truncation
    expect(dimNodes.length).toBe(0);
  });

  it("renders dimColor <Text> with omitted count at start when truncated", () => {
    // Force truncation with a small terminalWidth and many discards
    const discards = Array.from({ length: 15 }, (_, i) => discard(m((i % 9) + 1), false));
    const tree = renderer.create(
      <DiscardView discards={discards} terminalWidth={40} compact={false} />,
    );
    // maxDisplayCount at width=40 = 12. omitted = 15-12 = 3
    const textNodes = tree.root.findAllByType(Text);
    const dimNodes = textNodes.filter((n: renderer.ReactTestInstance) => n.props.dimColor === true);
    expect(dimNodes.length).toBeGreaterThanOrEqual(1);
    const dimText = dimNodes.map((n) => n.props.children).join("");
    expect(dimText).toContain("...");
    expect(dimText).toContain("3");
  });

  it("shows only latest N discards when truncated", () => {
    const discards = Array.from({ length: 20 }, (_, i) => discard(m((i % 9) + 1), false));
    // terminalWidth=40 → maxDisplayCount=12 → show latest 12
    const { lastFrame } = render(
      <DiscardView discards={discards} terminalWidth={40} compact={false} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("...8");
  });

  it("truncates earlier with compact mode at same width", () => {
    // terminalWidth=50, non-compact → max=15
    const discards20 = Array.from({ length: 17 }, (_, i) => discard(m((i % 9) + 1), false));
    const { lastFrame: nonCompact } = render(
      <DiscardView discards={discards20} terminalWidth={50} compact={false} />,
    );
    const { lastFrame: compact } = render(
      <DiscardView discards={discards20} terminalWidth={50} compact={true} />,
    );
    // compact at width=50: max=7, omitted=10
    expect(compact()!).toContain("...10");
    // non-compact at width=50: max=15, omitted=2
    expect(nonCompact()!).toContain("...2");
  });
});
