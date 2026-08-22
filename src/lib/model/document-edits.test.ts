import { describe, expect, it } from "vitest";
import {
  allEventDays,
  applyEventPatch,
  clampTrackHeight,
  createEvent,
  removeTrackFrom,
  reorderTracks,
  suggestedBoundsFor,
} from "./document-edits";
import {
  COLOR_INHERIT,
  DEFAULT_TRACK_HEIGHT,
  EVENT_KIND,
  MAX_TRACK_HEIGHT,
  MIN_TRACK_HEIGHT,
  type TimelineDocument,
  type TimelineEvent,
  type Track,
} from "./timeline-document";
import { isoToDayNumber } from "../time/day-number";

function track(id: string): Track {
  return { id, name: id, color: "#5B8DEF", height: DEFAULT_TRACK_HEIGHT };
}

function span(id: string, trackId: string, start: string, end: string): TimelineEvent {
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

function document(): TimelineDocument {
  return {
    version: 1,
    bounds: null,
    tracks: [track("t1"), track("t2")],
    events: [span("e1", "t1", "2026-03-10", "2026-03-20"), span("e2", "t2", "2026-04-01", "2026-04-05")],
  };
}

describe("створення події", () => {
  it("не залежить від того, в який бік тягнули", () => {
    const forward = createEvent({
      trackId: "t1",
      startDay: isoToDayNumber("2026-03-10"),
      endDay: isoToDayNumber("2026-03-20"),
      kind: EVENT_KIND.Span,
    });
    const backward = createEvent({
      trackId: "t1",
      startDay: isoToDayNumber("2026-03-20"),
      endDay: isoToDayNumber("2026-03-10"),
      kind: EVENT_KIND.Span,
    });
    expect(backward.start).toBe(forward.start);
    expect(backward.end).toBe(forward.end);
  });

  it("зводить точкову подію до одного дня", () => {
    const point = createEvent({
      trackId: "t1",
      startDay: isoToDayNumber("2026-03-10"),
      endDay: isoToDayNumber("2026-03-20"),
      kind: EVENT_KIND.Point,
    });
    expect(point.start).toBe("2026-03-10");
    expect(point.end).toBe("2026-03-10");
  });

  it("дає новий колір «як у доріжки» та свій ідентифікатор", () => {
    const options = {
      trackId: "t1",
      startDay: 0,
      endDay: 1,
      kind: EVENT_KIND.Span,
    } as const;
    expect(createEvent(options).color).toBe(COLOR_INHERIT);
    expect(createEvent(options).id).not.toBe(createEvent(options).id);
  });
});

describe("правка події", () => {
  it("тягне кінець точкової події за початком", () => {
    const point = { ...span("e1", "t1", "2026-03-10", "2026-03-10"), kind: EVENT_KIND.Point };
    applyEventPatch(point, { start: "2026-05-01" });
    expect(point.end).toBe("2026-05-01");
  });

  it("стягує перевернутий проміжок у той край, який не правили", () => {
    const movedStart = span("e1", "t1", "2026-03-10", "2026-03-20");
    applyEventPatch(movedStart, { start: "2026-06-01" });
    expect(movedStart.end).toBe("2026-06-01");

    const movedEnd = span("e2", "t1", "2026-03-10", "2026-03-20");
    applyEventPatch(movedEnd, { end: "2026-01-01" });
    expect(movedEnd.start).toBe("2026-01-01");
  });

  it("лишає коректний проміжок як є", () => {
    const event = span("e1", "t1", "2026-03-10", "2026-03-20");
    applyEventPatch(event, { title: "Назва" });
    expect(event.start).toBe("2026-03-10");
    expect(event.end).toBe("2026-03-20");
  });
});

describe("доріжки", () => {
  it("видаляє доріжку разом із її подіями", () => {
    const doc = document();
    removeTrackFrom(doc, "t1");
    expect(doc.tracks.map((t) => t.id)).toEqual(["t2"]);
    expect(doc.events.map((e) => e.id)).toEqual(["e2"]);
  });

  it("переставляє доріжку на вказане місце", () => {
    const tracks = [track("a"), track("b"), track("c")];
    expect(reorderTracks(tracks, "c", 0)?.map((t) => t.id)).toEqual(["c", "a", "b"]);
    expect(reorderTracks(tracks, "a", 99)?.map((t) => t.id)).toEqual(["b", "c", "a"]);
  });

  it("каже «нема куди», щоб не писався марний крок історії", () => {
    const tracks = [track("a"), track("b")];
    expect(reorderTracks(tracks, "a", 0)).toBeNull();
    expect(reorderTracks(tracks, "нема", 1)).toBeNull();
  });

  it("тримає висоту в межах і цілими пікселями", () => {
    expect(clampTrackHeight(10)).toBe(MIN_TRACK_HEIGHT);
    expect(clampTrackHeight(10_000)).toBe(MAX_TRACK_HEIGHT);
    expect(clampTrackHeight(80.6)).toBe(81);
  });
});

describe("межі документа", () => {
  it("бере обхват усіх днів даних", () => {
    expect(suggestedBoundsFor(allEventDays(document()))).toEqual({
      start: "2026-03-10",
      end: "2026-04-05",
    });
  });

  it("без даних дає поточний рік", () => {
    const bounds = suggestedBoundsFor([]);
    const year = new Date().getUTCFullYear();
    expect(bounds).toEqual({ start: `${year}-01-01`, end: `${year}-12-31` });
  });
});
