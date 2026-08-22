import { describe, expect, it } from "vitest";
import {
  COLOR_INHERIT,
  DEFAULT_TRACK_HEIGHT,
  EVENT_KIND,
  parseDocument,
  serializeDocument,
  createEmptyDocument,
} from "./timeline-document";

/** Найменший коректний файл; тести псують саме те поле, про яке говорять. */
function rawDocument(overrides: string = ""): string {
  return `{
    "version": 1,
    "tracks": [{ "id": "t1", "name": "Доріжка", "color": "#5B8DEF", "height": 66 }],
    "events": [{ "id": "e1", "trackId": "t1", "start": "2026-01-08", "end": "2026-03-20" }]
    ${overrides}
  }`;
}

function parsed(rawJson: string) {
  const result = parseDocument(rawJson);
  if (!result.ok) throw new Error(result.message);
  return result.document;
}

describe("брама файлу", () => {
  it("доповнює поля, яких старіші файли не мали", () => {
    const document = parsed(rawDocument());
    const event = document.events[0];
    expect(event?.kind).toBe(EVENT_KIND.Span);
    expect(event?.color).toBe(COLOR_INHERIT);
    expect(event?.title).toBe("");
    expect(event?.note).toBe("");
    expect(document.bounds).toBeNull();
  });

  it("підставляє типову висоту замість неможливої", () => {
    const document = parsed(
      rawDocument().replace('"height": 66', '"height": 5000'),
    );
    expect(document.tracks[0]?.height).toBe(DEFAULT_TRACK_HEIGHT);
  });

  it("зводить точкову подію до одного дня", () => {
    const document = parsed(rawDocument().replace('"end": "2026-03-20"', '"end": "2026-03-20", "kind": "point"'));
    const event = document.events[0];
    expect(event?.end).toBe("2026-01-08");
  });

  it("відхиляє битий JSON", () => {
    const result = parseDocument("{ це не json");
    expect(result.ok).toBe(false);
  });

  it("відхиляє подію, що посилається на неіснуючу доріжку", () => {
    const result = parseDocument(rawDocument().replace('"trackId": "t1"', '"trackId": "нема"'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("нема");
  });

  it("відхиляє перевернутий проміжок", () => {
    const result = parseDocument(rawDocument().replace('"start": "2026-01-08"', '"start": "2026-06-08"'));
    expect(result.ok).toBe(false);
  });

  it("відхиляє неіснуючу дату й чужий формат", () => {
    expect(parseDocument(rawDocument().replace("2026-03-20", "2026-02-30")).ok).toBe(false);
    expect(parseDocument(rawDocument().replace("2026-03-20", "20.03.2026")).ok).toBe(false);
  });

  it("відхиляє документ без жодної доріжки", () => {
    const result = parseDocument('{ "version": 1, "tracks": [], "events": [] }');
    expect(result.ok).toBe(false);
  });

  it("бере «inherit» і #RRGGBB, але не решту", () => {
    expect(parsed(rawDocument().replace('"end": "2026-03-20"', '"end": "2026-03-20", "color": "inherit"')).events[0]?.color).toBe(COLOR_INHERIT);
    expect(parsed(rawDocument().replace('"end": "2026-03-20"', '"end": "2026-03-20", "color": "#A1B2C3"')).events[0]?.color).toBe("#A1B2C3");
    expect(parseDocument(rawDocument().replace('"end": "2026-03-20"', '"end": "2026-03-20", "color": "red"')).ok).toBe(false);
  });

  it("робить обіг документ → текст → документ без втрат", () => {
    const document = createEmptyDocument();
    expect(parsed(serializeDocument(document))).toEqual(document);
  });
});
