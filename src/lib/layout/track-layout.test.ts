import { describe, expect, it } from "vitest";
import { planTrackLayout, POINT_MARKER_PIXELS } from "./track-layout";
import { COLOR_INHERIT, EVENT_KIND, type TimelineEvent } from "../model/timeline-document";

function makeEvent(overrides: Partial<TimelineEvent> & Pick<TimelineEvent, "id" | "start" | "end">): TimelineEvent {
  return {
    trackId: "t1",
    kind: EVENT_KIND.Span,
    color: COLOR_INHERIT,
    title: "",
    note: "",
    ...overrides,
  };
}

/* Підписи міряємо як 10 px на символ — так очікування в тестах лишаються
   арифметикою, а не залежать від шрифта машини. */
const measureTenPxPerCharacter = (text: string): number => text.length * 10;
const measureNothing = (): number => 0;

describe("розкладка по підрівнях", () => {
  it("кладе події, що не перетинаються, на один підрівень", () => {
    const layout = planTrackLayout(
      [
        makeEvent({ id: "a", start: "2026-01-01", end: "2026-01-10" }),
        makeEvent({ id: "b", start: "2026-02-01", end: "2026-02-10" }),
      ],
      10,
      measureNothing,
    );
    expect(layout.laneCount).toBe(1);
    expect(layout.placements.every((placement) => placement.lane === 0)).toBe(true);
  });

  it("розводить події, що перетинаються, по різних підрівнях", () => {
    const layout = planTrackLayout(
      [
        makeEvent({ id: "a", start: "2026-01-01", end: "2026-03-01" }),
        makeEvent({ id: "b", start: "2026-02-01", end: "2026-04-01" }),
        makeEvent({ id: "c", start: "2026-02-15", end: "2026-02-20" }),
      ],
      10,
      measureNothing,
    );
    expect(layout.laneCount).toBe(3);
  });

  it("повертає щонайменше один підрівень для порожньої доріжки", () => {
    expect(planTrackLayout([], 10, measureNothing).laneCount).toBe(1);
  });
});

describe("порядок малювання", () => {
  it("ставить довші події першими, щоб коротші лягли зверху", () => {
    const layout = planTrackLayout(
      [
        makeEvent({ id: "short", start: "2026-03-01", end: "2026-03-02" }),
        makeEvent({ id: "long", start: "2026-01-01", end: "2026-12-31" }),
      ],
      10,
      measureNothing,
    );
    expect(layout.placements.map((placement) => placement.event.id)).toEqual(["long", "short"]);
  });

  it("піднімає точкову подію над прямокутником такої ж тривалості", () => {
    const layout = planTrackLayout(
      [
        makeEvent({ id: "point", start: "2026-03-01", end: "2026-03-01", kind: EVENT_KIND.Point }),
        makeEvent({ id: "span", start: "2026-03-01", end: "2026-03-01" }),
      ],
      10,
      measureNothing,
    );
    expect(layout.placements.map((placement) => placement.event.id)).toEqual(["span", "point"]);
  });
});

describe("видимість підписів", () => {
  it("показує підпис, коли до наступної події вистачає місця", () => {
    /* 30 днів × 10 px = 300 px до сусіда; «Назва» — 50 px. */
    const layout = planTrackLayout(
      [
        makeEvent({ id: "a", start: "2026-01-01", end: "2026-01-05", title: "Назва" }),
        makeEvent({ id: "b", start: "2026-01-31", end: "2026-02-05", title: "Друга" }),
      ],
      10,
      measureTenPxPerCharacter,
    );
    const first = layout.placements.find((placement) => placement.event.id === "a");
    expect(first?.showLabel).toBe(true);
  });

  it("ховає підпис цілком, замість обрізати його трьома крапками", () => {
    /* Сусід за 2 дні → 20 px, а «Довга назва» — 110 px. */
    const layout = planTrackLayout(
      [
        makeEvent({ id: "a", start: "2026-01-01", end: "2026-01-01", title: "Довга назва" }),
        makeEvent({ id: "b", start: "2026-01-03", end: "2026-01-04", title: "Друга" }),
      ],
      10,
      measureTenPxPerCharacter,
    );
    const first = layout.placements.find((placement) => placement.event.id === "a");
    expect(first?.showLabel).toBe(false);
  });

  it("дозволяє підпису виходити за правий край блока, поки поруч порожньо", () => {
    /* Блок один день (10 px), але далі нікого — назва на 90 px має вміститись. */
    const layout = planTrackLayout(
      [makeEvent({ id: "a", start: "2026-01-01", end: "2026-01-01", title: "Дев'ять!" })],
      10,
      measureTenPxPerCharacter,
    );
    expect(layout.placements[0]?.showLabel).toBe(true);
  });

  it("не показує підпис для події без назви", () => {
    const layout = planTrackLayout(
      [makeEvent({ id: "a", start: "2026-01-01", end: "2026-06-01", title: "   " })],
      10,
      measureTenPxPerCharacter,
    );
    expect(layout.placements[0]?.showLabel).toBe(false);
  });
});

describe("точкові події", () => {
  it("займають сталу ширину в пікселях незалежно від масштабу", () => {
    const point = makeEvent({ id: "p", start: "2026-01-01", end: "2026-01-01", kind: EVENT_KIND.Point });

    const zoomedIn = planTrackLayout([point], 20, measureNothing).placements[0];
    const zoomedOut = planTrackLayout([point], 0.5, measureNothing).placements[0];

    expect((zoomedIn?.footprintDays ?? 0) * 20).toBeCloseTo(POINT_MARKER_PIXELS);
    expect((zoomedOut?.footprintDays ?? 0) * 0.5).toBeCloseTo(POINT_MARKER_PIXELS);
  });

  it("не дає двом сусіднім точкам злитись на дрібному масштабі", () => {
    /* За 0.5 px/день два дні — це один піксель, тож позначки перекрились би. */
    const layout = planTrackLayout(
      [
        makeEvent({ id: "a", start: "2026-01-01", end: "2026-01-01", kind: EVENT_KIND.Point }),
        makeEvent({ id: "b", start: "2026-01-03", end: "2026-01-03", kind: EVENT_KIND.Point }),
      ],
      0.5,
      measureNothing,
    );
    expect(layout.laneCount).toBe(2);
  });
});
