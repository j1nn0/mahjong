import { describe, it, expect } from "vitest";
import renderer from "react-test-renderer";
import { Text } from "ink";
import { KeyLegend } from "./KeyLegend.js";

/** Collect text content from a rendered tree recursively */
function collectText(
  node: renderer.ReactTestRendererNode | renderer.ReactTestRendererJSON,
): string {
  if (typeof node === "string") return node;
  const children = node.children || [];
  return children
    .map((c) => collectText(c as renderer.ReactTestRendererNode | renderer.ReactTestRendererJSON))
    .join("");
}

describe("KeyLegend", () => {
  it("renders playing phase with dimColor on outer Text", () => {
    const tree = renderer.create(<KeyLegend phase="playing" />);
    const textNodes = tree.root.findAllByType(Text);
    expect(textNodes.length).toBeGreaterThanOrEqual(1);
    expect(textNodes[0]!.props.dimColor).toBe(true);
  });

  it("renders playing phase key bindings", () => {
    const tree = renderer.create(<KeyLegend phase="playing" />);
    const text = collectText(tree.toJSON()! as renderer.ReactTestRendererJSON);
    expect(text).toContain("←→:選択");
    expect(text).toContain("Enter:打牌");
    expect(text).toContain("T:ツモ");
    expect(text).toContain("R:リーチ");
    expect(text).toContain("K:カン");
    expect(text).toContain("Y:九種");
    expect(text).toContain("Q:終了");
  });

  it("renders claiming phase with dimColor on outer Text", () => {
    const tree = renderer.create(<KeyLegend phase="claiming" />);
    const textNodes = tree.root.findAllByType(Text);
    expect(textNodes.length).toBeGreaterThanOrEqual(1);
    expect(textNodes[0]!.props.dimColor).toBe(true);
  });

  it("renders claiming phase key bindings", () => {
    const tree = renderer.create(<KeyLegend phase="claiming" />);
    const text = collectText(tree.toJSON()! as renderer.ReactTestRendererJSON);
    expect(text).toContain("L:ロン");
    expect(text).toContain("C:チー");
    expect(text).toContain("P:ポン");
    expect(text).toContain("K:カン");
    expect(text).toContain("Space/Esc:パス");
    expect(text).toContain("←→:選択");
  });
});
