import { describe, expect, it } from "vitest";
import { rowHeight } from "./row-geometry";
import { OVERLAP_MODE } from "./track-layout";

describe("висота рядка", () => {
  it("у накладанні дорівнює висоті доріжки", () => {
    expect(rowHeight(OVERLAP_MODE.Overlay, 1, 66)).toBe(66);
    expect(rowHeight(OVERLAP_MODE.Overlay, 5, 120)).toBe(120);
  });

  it("у стеку росте, коли підрівні не вміщаються", () => {
    const tall = rowHeight(OVERLAP_MODE.Stack, 6, 66);
    const short = rowHeight(OVERLAP_MODE.Stack, 1, 66);
    expect(tall).toBeGreaterThan(short);
  });

  it("у стеку не опускається нижче за висоту доріжки", () => {
    /* Висота доріжки тут — нижня межа, а не точне значення: підрівні мусять
       вміститись, але задану висоту рядок теж не має порушувати вниз. */
    expect(rowHeight(OVERLAP_MODE.Stack, 1, 200)).toBe(200);
  });
});
