import { describe, it, expect } from "vitest";
import renderer from "react-test-renderer";
import { Text } from "ink";
import { KeyLegend } from "./KeyLegend.js";

describe("KeyLegend", () => {
  it("renders playing phase legend with dimColor", () => {
    const tree = renderer.create(<KeyLegend phase="playing" />);
    const textNodes = tree.root.findAllByType(Text);
    expect(textNodes).toHaveLength(1);
    expect(textNodes[0]!.props.dimColor).toBe(true);
    expect(textNodes[0]!.props.children).toContain(
      "←→:選択 Enter:打牌 T:ツモ R:リーチ K:カン Y:九種 Q:終了",
    );
  });

  it("renders claiming phase legend with dimColor", () => {
    const tree = renderer.create(<KeyLegend phase="claiming" />);
    const textNodes = tree.root.findAllByType(Text);
    expect(textNodes).toHaveLength(1);
    expect(textNodes[0]!.props.dimColor).toBe(true);
    expect(textNodes[0]!.props.children).toContain(
      "L:ロン C:チー P:ポン K:カン Space/Esc:パス ←→:選択",
    );
  });
});
