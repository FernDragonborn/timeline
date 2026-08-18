import { describe, expect, it } from "vitest";
import { OVERLAP_MODE, planTrackLayout, POINT_MARKER_PIXELS } from "./track-layout";
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

function layoutOverlay(
  events: TimelineEvent[],
  pixelsPerDay: number,
  measure: (text: string) => number = measureNothing,
) {
  return planTrackLayout(events, {
    pixelsPerDay,
    overlapMode: OVERLAP_MODE.Overlay,
    measureLabelWidth: measure,
  });
}

function placementOf(layout: ReturnType<typeof planTrackLayout>, id: string) {
  return layout.placements.find((placement) => placement.event.id === id);
}

describe("розкладка по підрівнях", () => {
  it("кладе події, що не перетинаються, на один підрівень", () => {
    const layout = layoutOverlay(
      [
        makeEvent({ id: "a", start: "2026-01-01", end: "2026-01-10" }),
        makeEvent({ id: "b", start: "2026-02-01", end: "2026-02-10" }),
      ],
      10,
    );
    expect(layout.laneCount).toBe(1);
    expect(layout.placements.every((placement) => placement.lane === 0)).toBe(true);
  });

  it("лишає на одному підрівні події, що торкаються краями", () => {
    /* Перша по 10-те включно, друга з 11-го: спільного дня немає, тож і
       розводити їх нема за чим. */
    const layout = layoutOverlay(
      [
        makeEvent({ id: "a", start: "2026-01-01", end: "2026-01-10" }),
        makeEvent({ id: "b", start: "2026-01-11", end: "2026-01-20" }),
      ],
      10,
    );
    expect(layout.laneCount).toBe(1);
    expect(placementOf(layout, "b")?.lane).toBe(0);
  });

  it("розводить події, що перетинаються, по різних підрівнях", () => {
    const layout = layoutOverlay(
      [
        makeEvent({ id: "a", start: "2026-01-01", end: "2026-03-01" }),
        makeEvent({ id: "b", start: "2026-02-01", end: "2026-04-01" }),
        makeEvent({ id: "c", start: "2026-02-15", end: "2026-02-20" }),
      ],
      10,
    );
    expect(layout.laneCount).toBe(3);
  });

  it("повертає щонайменше один підрівень для порожньої доріжки", () => {
    expect(layoutOverlay([], 10).laneCount).toBe(1);
  });
});

describe("порядок малювання", () => {
  it("ставить довші події першими, щоб коротші лягли зверху", () => {
    const layout = layoutOverlay(
      [
        makeEvent({ id: "short", start: "2026-03-01", end: "2026-03-02" }),
        makeEvent({ id: "long", start: "2026-01-01", end: "2026-12-31" }),
      ],
      10,
    );
    expect(layout.placements.map((placement) => placement.event.id)).toEqual(["long", "short"]);
  });

  it("піднімає точкову подію над прямокутником такої ж тривалості", () => {
    const layout = layoutOverlay(
      [
        makeEvent({ id: "point", start: "2026-03-01", end: "2026-03-01", kind: EVENT_KIND.Point }),
        makeEvent({ id: "span", start: "2026-03-01", end: "2026-03-01" }),
      ],
      10,
    );
    expect(layout.placements.map((placement) => placement.event.id)).toEqual(["span", "point"]);
  });
});

describe("сходинка підпису", () => {
  it("не зсуває підписи, поки самі назви не перетинаються", () => {
    /* Блоки торкаються краями, але «А» і «Б» — по 10 px, між ними 100 px. */
    const layout = layoutOverlay(
      [
        makeEvent({ id: "a", start: "2026-01-01", end: "2026-01-10", title: "А" }),
        makeEvent({ id: "b", start: "2026-01-11", end: "2026-01-20", title: "Б" }),
      ],
      10,
      measureTenPxPerCharacter,
    );
    expect(placementOf(layout, "a")?.labelLane).toBe(0);
    expect(placementOf(layout, "b")?.labelLane).toBe(0);
  });

  it("опускає підпис на сходинку нижче, коли назви таки налазять", () => {
    /* «Дуже довга назва» — 160 px, а сусід починається за 20 px. */
    const layout = layoutOverlay(
      [
        makeEvent({ id: "a", start: "2026-01-01", end: "2026-01-02", title: "Дуже довга назва" }),
        makeEvent({ id: "b", start: "2026-01-03", end: "2026-01-04", title: "Друга" }),
      ],
      10,
      measureTenPxPerCharacter,
    );
    expect(placementOf(layout, "a")?.labelLane).toBe(0);
    expect(placementOf(layout, "b")?.labelLane).toBe(1);
    expect(placementOf(layout, "b")?.showLabel).toBe(true);
  });

  it("лишає підпис шпильці, коли одразу за нею починається подія", () => {
    /* Саме цей випадок раніше з'їдав назву шпильки: сусід близько, і підпис
       просто зникав замість опуститись. */
    const layout = layoutOverlay(
      [
        makeEvent({
          id: "pin",
          start: "2026-01-01",
          end: "2026-01-01",
          kind: EVENT_KIND.Point,
          title: "Шпилька",
        }),
        makeEvent({ id: "next", start: "2026-01-02", end: "2026-01-09", title: "Подія" }),
      ],
      10,
      measureTenPxPerCharacter,
    );
    expect(placementOf(layout, "pin")?.showLabel).toBe(true);
    expect(placementOf(layout, "pin")?.labelLane).toBe(0);
    expect(placementOf(layout, "next")?.labelLane).toBe(1);
  });

  it("ховає підпис цілком, коли вільних сходинок не лишилось", () => {
    /* Чотири назви по 200 px, що починаються з кроком 10 px: перші три займуть
       усі сходинки, четвертій опуститись нема куди. */
    const layout = layoutOverlay(
      [
        makeEvent({ id: "a", start: "2026-01-01", end: "2026-01-01", title: "Двадцять символів!!" }),
        makeEvent({ id: "b", start: "2026-01-02", end: "2026-01-02", title: "Двадцять символів!!" }),
        makeEvent({ id: "c", start: "2026-01-03", end: "2026-01-03", title: "Двадцять символів!!" }),
        makeEvent({ id: "d", start: "2026-01-04", end: "2026-01-04", title: "Двадцять символів!!" }),
      ],
      10,
      measureTenPxPerCharacter,
    );
    expect(placementOf(layout, "c")?.showLabel).toBe(true);
    expect(placementOf(layout, "d")?.showLabel).toBe(false);
  });

  it("у стеку не зсуває підписи, а ховає — блоки там уже на різній висоті", () => {
    const layout = planTrackLayout(
      [
        makeEvent({ id: "a", start: "2026-01-01", end: "2026-01-02", title: "Дуже довга назва" }),
        makeEvent({ id: "b", start: "2026-01-03", end: "2026-01-04", title: "Друга" }),
      ],
      {
        pixelsPerDay: 10,
        overlapMode: OVERLAP_MODE.Stack,
        measureLabelWidth: measureTenPxPerCharacter,
      },
    );
    expect(placementOf(layout, "a")?.lane).toBe(0);
    expect(placementOf(layout, "b")?.lane).toBe(0);
    expect(placementOf(layout, "b")?.showLabel).toBe(false);
  });
});

describe("видимість підписів", () => {
  it("показує підпис, коли до наступної події вистачає місця", () => {
    /* 30 днів × 10 px = 300 px до сусіда; «Назва» — 50 px. */
    const layout = layoutOverlay(
      [
        makeEvent({ id: "a", start: "2026-01-01", end: "2026-01-05", title: "Назва" }),
        makeEvent({ id: "b", start: "2026-01-31", end: "2026-02-05", title: "Друга" }),
      ],
      10,
      measureTenPxPerCharacter,
    );
    expect(placementOf(layout, "a")?.showLabel).toBe(true);
  });

  it("дозволяє підпису виходити за правий край блока, поки поруч порожньо", () => {
    /* Блок один день (10 px), але далі нікого — назва на 90 px має вміститись. */
    const layout = layoutOverlay(
      [makeEvent({ id: "a", start: "2026-01-01", end: "2026-01-01", title: "Дев'ять!" })],
      10,
      measureTenPxPerCharacter,
    );
    expect(layout.placements[0]?.showLabel).toBe(true);
  });

  it("не показує підпис для події без назви", () => {
    const layout = layoutOverlay(
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

    const zoomedIn = layoutOverlay([point], 20).placements[0];
    const zoomedOut = layoutOverlay([point], 0.5).placements[0];

    expect((zoomedIn?.footprintDays ?? 0) * 20).toBeCloseTo(POINT_MARKER_PIXELS);
    expect((zoomedOut?.footprintDays ?? 0) * 0.5).toBeCloseTo(POINT_MARKER_PIXELS);
  });

  it("не дає двом сусіднім точкам злитись на дрібному масштабі", () => {
    /* За 0.5 px/день два дні — це один піксель, тож позначки перекрились би. */
    const layout = layoutOverlay(
      [
        makeEvent({ id: "a", start: "2026-01-01", end: "2026-01-01", kind: EVENT_KIND.Point }),
        makeEvent({ id: "b", start: "2026-01-03", end: "2026-01-03", kind: EVENT_KIND.Point }),
      ],
      0.5,
    );
    expect(layout.laneCount).toBe(2);
  });
});
