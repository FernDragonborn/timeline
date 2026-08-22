import { z } from "zod";
import { dayNumberOfParts } from "../time/day-number";

/**
 * Форма файлу на диску. Схема тут не для краси: файл редагується руками,
 * копіюється між машинами й переживає версії застосунку, тож єдиний спосіб не
 * розсипатися на битому вході — перевірити його на межі, один раз.
 */

/** Подія без власного кольору малюється кольором доріжки. */
export const COLOR_INHERIT = "inherit";
export type EventColor = typeof COLOR_INHERIT | string;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const colorSchema = z
  .string()
  .refine((value) => value === COLOR_INHERIT || HEX_COLOR.test(value), {
    message: 'Колір має бути "inherit" або #RRGGBB',
  });

const isoDateSchema = z
  .string()
  .regex(ISO_DATE, "Дата має бути у форматі YYYY-MM-DD")
  .refine(isRealIsoDate, "Неіснуюча дата");

/* `Date.parse` бере «2026-02-30» і тихо робить із неї 2 березня: рядок у файлі
   казав би одне, а намальована подія стояла б на іншому дні. */
function isRealIsoDate(value: string): boolean {
  const [year, month, dayOfMonth] = value.split("-").map(Number);
  if (year === undefined || month === undefined || dayOfMonth === undefined) return false;
  return dayNumberOfParts(year, month, dayOfMonth) !== null;
}

/** Висота доріжки за замовчуванням; вона ж нижня межа при перетягуванні. */
export const DEFAULT_TRACK_HEIGHT = 66;
export const MIN_TRACK_HEIGHT = 40;
export const MAX_TRACK_HEIGHT = 400;

export const trackSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  color: z.string().regex(HEX_COLOR, "Колір доріжки має бути #RRGGBB"),
  /* Висота живе у файлі, а не у вікні: «ця доріжка головна, хай буде вища» —
     твердження про дані, і воно має пережити перезапуск та поїхати разом із
     документом. Старіші файли її не мали, тож доповнюємо, а не відхиляємо. */
  height: z
    .number()
    .min(MIN_TRACK_HEIGHT)
    .max(MAX_TRACK_HEIGHT)
    .default(DEFAULT_TRACK_HEIGHT)
    .catch(DEFAULT_TRACK_HEIGHT),
});

/**
 * Рід події. Іменований союз, а не прапорець `isPoint`: щойно знадобиться
 * третій рід (скажімо, проміжок з нечіткими краями), він додається одним
 * членом, і компілятор сам покаже кожен `switch`, який його ще не розбирає.
 */
export const EVENT_KIND = {
  /** Триває від початку до кінця, малюється прямокутником. */
  Span: "span",
  /** Сталося одного дня, малюється позначкою сталого розміру. */
  Point: "point",
} as const;
export type EventKind = (typeof EVENT_KIND)[keyof typeof EVENT_KIND];

export const timelineEventSchema = z
  .object({
    id: z.string().min(1),
    trackId: z.string().min(1),
    start: isoDateSchema,
    end: isoDateSchema,
    /* Старіші файли писалися без роду й кольору — доповнюємо, а не відхиляємо. */
    kind: z.enum([EVENT_KIND.Span, EVENT_KIND.Point]).default(EVENT_KIND.Span),
    color: colorSchema.default(COLOR_INHERIT),
    title: z.string().default(""),
    note: z.string().default(""),
  })
  /* У точкової події кінець завжди дорівнює початку. Тримаємо це в даних, а не
     лише в UI, щоб файл лишався коректним і для читача, який про `kind` не знає:
     він побачить звичайну одноденну подію. */
  .transform((event) => (event.kind === EVENT_KIND.Point ? { ...event, end: event.start } : event))
  .refine((event) => event.start <= event.end, {
    message: "Кінець події раніший за початок",
    path: ["end"],
  });

/**
 * Необов'язкові межі шкали. `null` — «без меж», і це НАЗВАНИЙ стан, а не
 * відсутнє поле: інакше «межі не задано» і «межі загубилися при імпорті»
 * виглядають у файлі однаково.
 */
export const documentBoundsSchema = z
  .object({ start: isoDateSchema, end: isoDateSchema })
  .refine((bounds) => bounds.start <= bounds.end, {
    message: "Кінець шкали раніший за початок",
    path: ["end"],
  });

export type DocumentBounds = z.infer<typeof documentBoundsSchema>;

export const timelineDocumentSchema = z
  .object({
    version: z.literal(1),
    /* Старіші файли меж не мали — доповнюємо, а не відхиляємо. */
    bounds: documentBoundsSchema.nullable().default(null),
    tracks: z.array(trackSchema).min(1, "Потрібна щонайменше одна доріжка"),
    events: z.array(timelineEventSchema),
  })
  .superRefine((document, context) => {
    const trackIds = new Set(document.tracks.map((track) => track.id));
    document.events.forEach((event, index) => {
      if (!trackIds.has(event.trackId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["events", index, "trackId"],
          message: `Подія посилається на неіснуючу доріжку «${event.trackId}»`,
        });
      }
    });
  });

export type Track = z.infer<typeof trackSchema>;
export type TimelineEvent = z.infer<typeof timelineEventSchema>;
export type TimelineDocument = z.infer<typeof timelineDocumentSchema>;

export const DOCUMENT_VERSION = 1;

/**
 * Заготовлені кольори. Однакові світлота й насиченість у всіх — щоб жоден не
 * важив візуально більше за сусідів і щоб напівпрозора заливка читалася в
 * обох темах.
 */
export const PALETTE = [
  { hex: "#5B8DEF", name: "синій" },
  { hex: "#4EA8DE", name: "блакитний" },
  { hex: "#43BFA3", name: "бірюзовий" },
  { hex: "#62B96A", name: "зелений" },
  { hex: "#9DC65A", name: "лаймовий" },
  { hex: "#E0A458", name: "бурштиновий" },
  { hex: "#E08A4F", name: "помаранчевий" },
  { hex: "#E0687A", name: "кораловий" },
  { hex: "#D45D9E", name: "мажента" },
  { hex: "#A78BFA", name: "фіолетовий" },
  { hex: "#7C86C4", name: "лавандовий" },
  { hex: "#98A2B3", name: "сірий" },
] as const;

const DEFAULT_TRACK_COLOR_INDEXES = [0, 2, 5, 7, 9];

export function paletteColorAt(index: number): string {
  const entry = PALETTE[index % PALETTE.length];
  return entry ? entry.hex : "#98A2B3";
}

/** Ідентифікатори — GUID, бо файли копіюють і зливають між машинами. */
export function createId(): string {
  return crypto.randomUUID();
}

export function createTrack(name: string, colorIndex: number): Track {
  return { id: createId(), name, color: paletteColorAt(colorIndex), height: DEFAULT_TRACK_HEIGHT };
}

export function createEmptyDocument(): TimelineDocument {
  return {
    version: DOCUMENT_VERSION,
    bounds: null,
    tracks: DEFAULT_TRACK_COLOR_INDEXES.map((colorIndex, position) =>
      createTrack(`Доріжка ${position + 1}`, colorIndex),
    ),
    events: [],
  };
}

export function resolveEventColor(event: TimelineEvent, track: Track): string {
  return event.color === COLOR_INHERIT ? track.color : event.color;
}

export type ParseResult =
  | { ok: true; document: TimelineDocument }
  | { ok: false; message: string };

/**
 * Єдина брама для чужого JSON. Усе, що пройшло сюди, далі вважається повним:
 * ніяких `?? default` по місцях читання.
 */
export function parseDocument(rawJson: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { ok: false, message: "Файл не є коректним JSON." };
  }

  const result = timelineDocumentSchema.safeParse(parsed);
  if (result.success) return { ok: true, document: result.data };

  const firstIssues = result.error.issues.slice(0, 4).map((issue) => {
    const where = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
    return `• ${where}${issue.message}`;
  });
  const more = result.error.issues.length > 4 ? `\n…і ще ${result.error.issues.length - 4}` : "";
  return { ok: false, message: `Файл не відповідає формату:\n${firstIssues.join("\n")}${more}` };
}

export function serializeDocument(document: TimelineDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
