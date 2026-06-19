import { describe, it, expect } from "vitest";
import renderer from "react-test-renderer";
import { Text } from "ink";
import { WaitsInfo } from "./WaitsInfo.js";
import { Suit, type Tile } from "../game/types.js";
import { formatTile } from "../game/tiles.js";

// ── Tile factory ────────────────────────────────────────────────────

function m(v: number, red = false): Tile {
  return { suit: Suit.Man, value: v as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, red };
}
function p(v: number): Tile {
  return { suit: Suit.Pin, value: v as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 };
}

// ── Tests ──────────────────────────────────────────────────────────

describe("WaitsInfo", () => {
  it("shows only count when showNames is false", () => {
    const tree = renderer.create(<WaitsInfo waits={[m(1), p(2)]} showNames={false} />);
    const textNodes = tree.root.findAllByType(Text);
    expect(textNodes).toHaveLength(1);
    expect(textNodes[0]!.props.color).toBe("blue");
    const countChildren = textNodes[0]!.props.children;
    expect(Array.isArray(countChildren) ? countChildren.join("") : String(countChildren)).toContain(
      "待ち",
    );
    expect(Array.isArray(countChildren) ? countChildren.join("") : String(countChildren)).toContain(
      "2種",
    );
  });

  it("shows names list when showNames is true", () => {
    const waits = [m(1), p(2), m(3)];
    const tree = renderer.create(<WaitsInfo waits={waits} showNames={true} />);
    const textNodes = tree.root.findAllByType(Text);
    expect(textNodes).toHaveLength(2);

    // First text: count
    expect(textNodes[0]!.props.color).toBe("blue");
    const countChildren = textNodes[0]!.props.children;
    expect(Array.isArray(countChildren) ? countChildren.join("") : String(countChildren)).toContain(
      "待ち",
    );
    expect(Array.isArray(countChildren) ? countChildren.join("") : String(countChildren)).toContain(
      "3種",
    );

    // Second text: names
    const namesChildren = textNodes[1]!.props.children;
    const namesText = Array.isArray(namesChildren) ? namesChildren.join("") : String(namesChildren);
    expect(namesText).toContain("待ち牌");
    expect(namesText).toContain(formatTile(m(1)));
    expect(namesText).toContain(formatTile(p(2)));
    expect(namesText).toContain(formatTile(m(3)));
  });

  it("shows nothing when waits is empty even if showNames is true", () => {
    const tree = renderer.create(<WaitsInfo waits={[]} showNames={true} />);
    const textNodes = tree.root.findAllByType(Text);
    expect(textNodes).toHaveLength(0);
  });
});
