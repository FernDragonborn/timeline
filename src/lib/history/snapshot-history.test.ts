import { describe, expect, it } from "vitest";
import { SnapshotHistory } from "./snapshot-history";

describe("історія знімків", () => {
  it("порожня історія нічого не повертає", () => {
    const history = new SnapshotHistory<string>();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(history.undo("зараз")).toBeNull();
    expect(history.redo("зараз")).toBeNull();
  });

  it("повертає попередній стан і дозволяє повторити", () => {
    const history = new SnapshotHistory<string>();
    history.record("a");
    history.record("b");

    expect(history.undo("c")).toBe("b");
    expect(history.undo("b")).toBe("a");
    expect(history.canUndo).toBe(false);

    expect(history.redo("a")).toBe("b");
    expect(history.redo("b")).toBe("c");
    expect(history.canRedo).toBe(false);
  });

  it("нова зміна після відкату відрізає гілку повтору", () => {
    const history = new SnapshotHistory<string>();
    history.record("a");
    history.undo("b");
    expect(history.canRedo).toBe(true);

    history.record("a");
    expect(history.canRedo).toBe(false);
  });

  it("не росте далі за обмеження, викидаючи найстаріше", () => {
    const history = new SnapshotHistory<number>({ capacity: 3 });
    for (const value of [1, 2, 3, 4, 5]) history.record(value);

    /* Лишились 3, 4, 5 — саме вони й мають вийти у зворотному порядку. */
    expect(history.undo(6)).toBe(5);
    expect(history.undo(5)).toBe(4);
    expect(history.undo(4)).toBe(3);
    expect(history.canUndo).toBe(false);
  });

  it("очищення прибирає обидва напрямки", () => {
    const history = new SnapshotHistory<string>();
    history.record("a");
    history.undo("b");
    history.clear();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });
});
