import { describe, expect, it } from "vitest";
import { sharedValue } from "./shared-value";

describe("спільне значення", () => {
  it("знаходить його, коли всі однакові", () => {
    expect(sharedValue(["a", "a", "a"])).toEqual({ shared: true, value: "a" });
  });

  it("не знаходить, коли хоч один інший", () => {
    expect(sharedValue(["a", "a", "b"])).toEqual({ shared: false });
  });

  it("для одного значення воно ж і спільне", () => {
    expect(sharedValue([42])).toEqual({ shared: true, value: 42 });
  });

  it("для порожнього набору спільного немає", () => {
    expect(sharedValue([])).toEqual({ shared: false });
  });

  it("відрізняє «усі однакові» від «різні», коли значення хибне", () => {
    /* Через це повертається союз, а не `T | null`: нуль цілком може бути
       спільним значенням, і з `null` ці два випадки злилися б. */
    expect(sharedValue([0, 0])).toEqual({ shared: true, value: 0 });
    expect(sharedValue([0, 1])).toEqual({ shared: false });
  });
});
