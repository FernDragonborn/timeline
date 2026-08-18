import { describe, expect, it } from "vitest";
import { formatDateText, parseDateText } from "./date-text";
import { isoToDayNumber } from "./day-number";

function parsedIsoDay(text: string): number | "хиба" {
  const parsed = parseDateText(text);
  return parsed.ok ? parsed.day : "хиба";
}

describe("текстова форма дати", () => {
  it("пише день, місяць і рік з нулями попереду", () => {
    expect(formatDateText(isoToDayNumber("2026-03-05"))).toBe("05.03.2026");
    expect(formatDateText(isoToDayNumber("2026-12-31"))).toBe("31.12.2026");
  });

  it("читає український запис", () => {
    expect(parsedIsoDay("20.03.2026")).toBe(isoToDayNumber("2026-03-20"));
  });

  it("читає ISO, бо саме він лежить у файлі", () => {
    expect(parsedIsoDay("2026-03-20")).toBe(isoToDayNumber("2026-03-20"));
  });

  it("не чіпляється до роздільника й до нулів попереду", () => {
    const expected = isoToDayNumber("2026-03-05");
    expect(parsedIsoDay("5.3.2026")).toBe(expected);
    expect(parsedIsoDay("05/03/2026")).toBe(expected);
    expect(parsedIsoDay("  5 3 2026 ")).toBe(expected);
  });

  it("відкидає неіснуючу дату замість тихо її зсунути", () => {
    /* Date.UTC мовчки зробив би з цього 3 березня. */
    expect(parsedIsoDay("31.02.2026")).toBe("хиба");
    expect(parsedIsoDay("32.01.2026")).toBe("хиба");
    expect(parsedIsoDay("20.13.2026")).toBe("хиба");
  });

  it("відкидає те, що датою не є", () => {
    expect(parsedIsoDay("")).toBe("хиба");
    expect(parsedIsoDay("завтра")).toBe("хиба");
    expect(parsedIsoDay("20.03")).toBe("хиба");
    expect(parsedIsoDay("20.03.26")).toBe("хиба");
  });

  it("повертає те саме, що прочитав", () => {
    for (const iso of ["1900-01-01", "2026-03-20", "1969-07-20", "2100-12-31"]) {
      const parsed = parseDateText(formatDateText(isoToDayNumber(iso)));
      expect(parsed.ok && parsed.day).toBe(isoToDayNumber(iso));
    }
  });
});
