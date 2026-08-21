import {
  dayNumberToDate,
  dayNumberToIso,
  isoToDayNumber,
  today,
  type DayNumber,
} from "../time/day-number";
import {
  COLOR_INHERIT,
  createId,
  type DocumentBounds,
  EVENT_KIND,
  MAX_TRACK_HEIGHT,
  MIN_TRACK_HEIGHT,
  type EventKind,
  type TimelineDocument,
  type TimelineEvent,
  type Track,
} from "./timeline-document";

/**
 * Правки документа окремо від подання: чисті функції над переданими даними.
 * Крок історії й виділення лишаються на викликачеві — тут лише те, що можна
 * перевірити тестом, не піднімаючи ні застосунку, ні DOM.
 */

export function createEvent(options: {
  trackId: string;
  startDay: DayNumber;
  endDay: DayNumber;
  kind: EventKind;
}): TimelineEvent {
  const firstDay = Math.min(options.startDay, options.endDay);
  const lastDay = options.kind === EVENT_KIND.Point ? firstDay : Math.max(options.startDay, options.endDay);
  return {
    id: createId(),
    trackId: options.trackId,
    kind: options.kind,
    start: dayNumberToIso(firstDay),
    end: dayNumberToIso(lastDay),
    color: COLOR_INHERIT,
    title: options.kind === EVENT_KIND.Point ? "Подія" : "Нова подія",
    note: "",
  };
}

/**
 * Точкова подія завжди має однакові межі, тож зміна початку тягне за собою
 * кінець. Правило живе тут, а не в кожному місці виклику.
 */
export function applyEventPatch(
  event: TimelineEvent,
  patch: Partial<Omit<TimelineEvent, "id">>,
): void {
  Object.assign(event, patch);
  if (event.kind === EVENT_KIND.Point) {
    event.end = event.start;
  } else if (event.end < event.start) {
    /* Правка дат руками може перевернути проміжок — стягуємо в нуль-день,
       а не лишаємо документ у стані, який схема відкине при збереженні. */
    if (patch.start !== undefined) event.end = event.start;
    else event.start = event.end;
  }
}

/** Доріжка йде разом зі своїми подіями: осиротілу подію схема не пропустить. */
export function removeTrackFrom(document: TimelineDocument, trackId: string): void {
  document.tracks = document.tracks.filter((track) => track.id !== trackId);
  document.events = document.events.filter((event) => event.trackId !== trackId);
}

/**
 * Порядок масиву доріжок і є порядком на екрані. Повертає новий порядок або
 * `null`, якщо рухати нема куди: тоді викликач не пише марного кроку історії.
 */
export function reorderTracks(
  tracks: readonly Track[],
  trackId: string,
  toIndex: number,
): Track[] | null {
  const from = tracks.findIndex((track) => track.id === trackId);
  const to = Math.min(tracks.length - 1, Math.max(0, toIndex));
  if (from < 0 || from === to) return null;

  const reordered = [...tracks];
  const [moved] = reordered.splice(from, 1);
  if (moved === undefined) return null;
  reordered.splice(to, 0, moved);
  return reordered;
}

export function clampTrackHeight(height: number): number {
  return Math.min(MAX_TRACK_HEIGHT, Math.max(MIN_TRACK_HEIGHT, Math.round(height)));
}

/** Кожен край кожної події — те, за чим рахують і обхват, і межі за умовчанням. */
export function allEventDays(document: TimelineDocument): DayNumber[] {
  const days: DayNumber[] = [];
  for (const event of document.events) {
    days.push(isoToDayNumber(event.start), isoToDayNumber(event.end));
  }
  return days;
}

/** Межі за замовчуванням — обхват даних, а без даних поточний рік. */
export function suggestedBoundsFor(days: readonly DayNumber[]): DocumentBounds {
  if (days.length === 0) {
    const now = dayNumberToDate(today());
    return {
      start: `${now.getUTCFullYear()}-01-01`,
      end: `${now.getUTCFullYear()}-12-31`,
    };
  }
  return { start: dayNumberToIso(Math.min(...days)), end: dayNumberToIso(Math.max(...days)) };
}
