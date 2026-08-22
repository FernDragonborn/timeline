import { describe, expect, it } from "vitest";
import { applyDragTo, createDragSession, grabbedOf, DRAG_KIND } from "./drag-session";
import { COLOR_INHERIT, EVENT_KIND, type TimelineEvent, type Track } from "./model/timeline-document";
import { isoToDayNumber } from "./time/day-number";

function track(id: string): Track {
  return { id, name: id, color: "#5B8DEF", height: 66 };
}

function event(id: string, trackId: string, start: string, end: string): TimelineEvent {
  return {
    id,
    trackId,
    kind: EVENT_KIND.Span,
    start,
    end,
    color: COLOR_INHERIT,
    title: id,
    note: "",
  };
}

const tracks = [track("t1"), track("t2"), track("t3")];

function scene() {
  const events = [
    event("e1", "t1", "2026-03-10", "2026-03-20"),
    event("e2", "t2", "2026-04-01", "2026-04-05"),
  ];
  const session = createDragSession({
    kind: DRAG_KIND.Move,
    grabbedId: "e1",
    moving: events,
    tracks,
  });
  return { events, session };
}

describe("початок перетягування", () => {
  it("запам'ятовує межі й доріжку на момент жесту", () => {
    const { session } = scene();
    const grabbed = grabbedOf(session);
    expect(grabbed?.originalStartDay).toBe(isoToDayNumber("2026-03-10"));
    expect(grabbed?.originalTrackIndex).toBe(0);
    expect(session.changed).toBe(false);
  });

  it("не бере подію з невідомою доріжкою", () => {
    const session = createDragSession({
      kind: DRAG_KIND.Move,
      grabbedId: "e1",
      moving: [event("e1", "нема", "2026-03-10", "2026-03-20")],
      tracks,
    });
    expect(session.events).toHaveLength(0);
    expect(grabbedOf(session)).toBeNull();
  });
});

describe("кадр перетягування", () => {
  it("рахує зсув від початкових меж, а не накопичує його", () => {
    const { events, session } = scene();
    applyDragTo({ session, events, tracks, dayOffset: 5, trackOffset: 0 });
    applyDragTo({ session, events, tracks, dayOffset: 5, trackOffset: 0 });
    expect(events[0]?.start).toBe("2026-03-15");
    expect(events[0]?.end).toBe("2026-03-25");
  });

  it("переїжджає гуртом на стільки ж рядків, скільки взята подія", () => {
    const { events, session } = scene();
    applyDragTo({ session, events, tracks, dayOffset: 0, trackOffset: 1 });
    expect(events[0]?.trackId).toBe("t2");
    expect(events[1]?.trackId).toBe("t3");
  });

  it("хто впирається в останню доріжку — там і лишається", () => {
    const { events, session } = scene();
    applyDragTo({ session, events, tracks, dayOffset: 0, trackOffset: 2 });
    expect(events[0]?.trackId).toBe("t3");
    expect(events[1]?.trackId).toBe("t3");
  });

  it("розтягуючи початок, не переходить за кінець", () => {
    const events = [event("e1", "t1", "2026-03-10", "2026-03-20")];
    const session = createDragSession({
      kind: DRAG_KIND.ResizeStart,
      grabbedId: "e1",
      moving: events,
      tracks,
    });
    applyDragTo({ session, events, tracks, dayOffset: 40, trackOffset: 0 });
    expect(events[0]?.start).toBe("2026-03-20");
    expect(events[0]?.end).toBe("2026-03-20");
  });

  it("розтягуючи кінець, не переходить за початок", () => {
    const events = [event("e1", "t1", "2026-03-10", "2026-03-20")];
    const session = createDragSession({
      kind: DRAG_KIND.ResizeEnd,
      grabbedId: "e1",
      moving: events,
      tracks,
    });
    applyDragTo({ session, events, tracks, dayOffset: -40, trackOffset: 0 });
    expect(events[0]?.start).toBe("2026-03-10");
    expect(events[0]?.end).toBe("2026-03-10");
  });

  it("не рушить доріжку при зміні розміру", () => {
    const events = [event("e1", "t1", "2026-03-10", "2026-03-20")];
    const session = createDragSession({
      kind: DRAG_KIND.ResizeEnd,
      grabbedId: "e1",
      moving: events,
      tracks,
    });
    applyDragTo({ session, events, tracks, dayOffset: 3, trackOffset: 2 });
    expect(events[0]?.trackId).toBe("t1");
  });

  it("повертає обхват усіх зрушених днів — щоб домен розсунувся один раз", () => {
    const { events, session } = scene();
    const touched = applyDragTo({ session, events, tracks, dayOffset: 10, trackOffset: 0 });
    expect(touched).toEqual({
      fromDay: isoToDayNumber("2026-03-20"),
      toDay: isoToDayNumber("2026-04-15"),
    });
  });

  it("нічого не рушить, коли рухати нема чого", () => {
    const session = createDragSession({
      kind: DRAG_KIND.Move,
      grabbedId: "e1",
      moving: [],
      tracks,
    });
    expect(applyDragTo({ session, events: [], tracks, dayOffset: 5, trackOffset: 1 })).toBeNull();
  });
});
