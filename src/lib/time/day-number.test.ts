import { describe, expect, it } from "vitest";
import {
  dayNumberToIso,
  formatDayCount,
  formatDaySpan,
  inclusiveDayCount,
  isoToDayNumber,
  isWeekend,
} from "./day-number";

describe("перетворення дат", () => {
  it("робить обіг ISO → день → ISO без втрат", () => {
    for (const iso of ["1970-01-01", "1850-06-15", "2026-02-28", "2024-02-29", "2200-12-31"]) {
      expect(dayNumberToIso(isoToDayNumber(iso))).toBe(iso);
    }
  });

  it("дає від'ємні номери для дат до епохи", () => {
    expect(isoToDayNumber("1969-12-31")).toBe(-1);
  });

  it("не залежить від часового поясу машини", () => {
    /* Полудень і північ одного дня в UTC дають той самий номер. */
    expect(isoToDayNumber("2026-03-01")).toBe(
      Math.floor(Date.UTC(2026, 2, 1, 12, 0, 0) / 86_400_000),
    );
  });

  it("рахує високосний рік", () => {
    expect(isoToDayNumber("2024-03-01") - isoToDayNumber("2024-02-01")).toBe(29);
    expect(isoToDayNumber("2026-03-01") - isoToDayNumber("2026-02-01")).toBe(28);
  });
});

describe("тривалість", () => {
  it("рахує межі включно, тож однаковий день — це один день", () => {
    const day = isoToDayNumber("2026-05-05");
    expect(inclusiveDayCount(day, day)).toBe(1);
  });

  it("узгоджує число зі словом", () => {
    expect(formatDayCount(1)).toBe("1 день");
    expect(formatDayCount(3)).toBe("3 дні");
    expect(formatDayCount(5)).toBe("5 днів");
    expect(formatDayCount(11)).toBe("11 днів");
    expect(formatDayCount(21)).toBe("21 день");
    expect(formatDayCount(22)).toBe("22 дні");
    expect(formatDayCount(114)).toBe("114 днів");
  });

  it("складає читабельний проміжок", () => {
    expect(formatDaySpan(isoToDayNumber("2026-01-01"), isoToDayNumber("2026-01-03"))).toBe(
      "1 січня 2026 → 3 січня 2026 · 3 дні",
    );
  });
});

describe("вихідні", () => {
  it("впізнає суботу й неділю", () => {
    expect(isWeekend(isoToDayNumber("2026-01-03"))).toBe(true);
    expect(isWeekend(isoToDayNumber("2026-01-04"))).toBe(true);
    expect(isWeekend(isoToDayNumber("2026-01-05"))).toBe(false);
  });
});
