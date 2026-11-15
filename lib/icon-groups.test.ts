import { describe, expect, it } from "vitest";
import { ICON_GROUPS, ungroupedIcons } from "./icon-groups";
import { ICON_NAMES } from "./icon-names";

describe("grupos semânticos de ícones", () => {
  it("cobre todos os ícones exatamente uma vez", () => {
    const grouped = ICON_GROUPS.flatMap((group) => group.icons);
    expect(ungroupedIcons(ICON_NAMES)).toEqual([]);
    expect(new Set(grouped).size).toBe(grouped.length);
    expect(new Set(grouped)).toEqual(new Set(ICON_NAMES));
  });

  it("mantém grupos não vazios e com rótulos únicos", () => {
    const labels = ICON_GROUPS.map((group) => group.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const group of ICON_GROUPS) {
      expect(group.icons.length).toBeGreaterThan(0);
      expect(group.label.trim().length).toBeGreaterThan(0);
    }
  });
});
