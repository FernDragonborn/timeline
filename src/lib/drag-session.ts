import { dayNumberToIso, isoToDayNumber, type DayNumber } from "./time/day-number";
import type { TimelineEvent, Track } from "./model/timeline-document";

/**
 * Перетягування подій: із чого воно починається і що робить кожен кадр.
 * Чиста арифметика над переданими масивами — щоб її можна було перевірити
 * тестом, не зводячи ні подання, ні DOM.
 */

export const DRAG_KIND = {
  Create: "create",
  Move: "move",
  ResizeStart: "resize-start",
  ResizeEnd: "resize-end",
} as const;
export type DragKind = (typeof DRAG_KIND)[keyof typeof DRAG_KIND];

/** Одна подія в перетягуванні: її межі на момент початку жесту. */
export interface DraggedEvent {
  id: string;
  /** Дні на момент початку — усі зсуви рахуються від них, не накопичуючись. */
  originalStartDay: DayNumber;
  originalEndDay: DayNumber;
  /** Місце доріжки на момент початку: гурт переїжджає на стільки ж рядків. */
  originalTrackIndex: number;
}

/** Стан перетягування — один об'єкт, а не розсип полів. */
export interface DragSession {
  kind: DragKind;
  /** Подія, за яку взялись: саме її позиція вирішує, куди їде решта. */
  grabbedId: string;
  /** Усе, що рухається: взята подія та решта обраних разом із нею. */
  events: DraggedEvent[];
  /** Чи вже щось справді змінилось, тобто чи вже записано крок історії. */
  changed: boolean;
}

/** Проміжок днів, якого торкнувся кадр: викликач розсовує домен один раз. */
export interface TouchedSpan {
  fromDay: DayNumber;
  toDay: DayNumber;
}

/**
 * Рухається весь обраний гурт, якщо взялись за одну з обраних подій. Взялись
 * за сторонню — рухається лише вона, а виділення до цього діла не має.
 */
export function createDragSession(options: {
  kind: DragKind;
  grabbedId: string;
  /** Події, які поїдуть: взята сама або весь обраний гурт разом із нею. */
  moving: readonly TimelineEvent[];
  tracks: readonly Track[];
}): DragSession {
  const indexByTrackId = new Map(options.tracks.map((track, index) => [track.id, index]));
  return {
    kind: options.kind,
    grabbedId: options.grabbedId,
    events: options.moving.flatMap((event) => {
      const originalTrackIndex = indexByTrackId.get(event.trackId);
      if (originalTrackIndex === undefined) return [];
      return [
        {
          id: event.id,
          originalStartDay: isoToDayNumber(event.start),
          originalEndDay: isoToDayNumber(event.end),
          originalTrackIndex,
        },
      ];
    }),
    changed: false,
  };
}

export function grabbedOf(session: DragSession): DraggedEvent | null {
  return session.events.find((candidate) => candidate.id === session.grabbedId) ?? null;
}

/**
 * Гурт переїжджає на стільки ж рядків, на скільки поїхала взята подія, а не
 * на ту доріжку, під якою опинився курсор: інакше все обране злиплося б в
 * один рядок. Хто впирається в край — там і лишається.
 */
export function trackOffsetFor(session: DragSession, overTrackIndex: number): number {
  const grabbed = grabbedOf(session);
  if (grabbed === null || session.kind !== DRAG_KIND.Move || overTrackIndex < 0) return 0;
  return overTrackIndex - grabbed.originalTrackIndex;
}

/** Один кадр перетягування: посуває події на місці, у переданому масиві. */
export function applyDragTo(options: {
  session: DragSession;
  events: TimelineEvent[];
  tracks: readonly Track[];
  dayOffset: number;
  trackOffset: number;
}): TouchedSpan | null {
  const { session, events, tracks, dayOffset, trackOffset } = options;
  const lastTrackIndex = tracks.length - 1;
  let touched: TouchedSpan | null = null;

  for (const dragged of session.events) {
    const event = events.find((candidate) => candidate.id === dragged.id);
    if (!event) continue;

    if (session.kind === DRAG_KIND.Move) {
      event.start = dayNumberToIso(dragged.originalStartDay + dayOffset);
      event.end = dayNumberToIso(dragged.originalEndDay + dayOffset);
      if (trackOffset !== 0) {
        const index = Math.min(lastTrackIndex, Math.max(0, dragged.originalTrackIndex + trackOffset));
        const track = tracks[index];
        if (track) event.trackId = track.id;
      }
    } else if (session.kind === DRAG_KIND.ResizeStart) {
      event.start = dayNumberToIso(
        Math.min(dragged.originalStartDay + dayOffset, dragged.originalEndDay),
      );
    } else if (session.kind === DRAG_KIND.ResizeEnd) {
      event.end = dayNumberToIso(
        Math.max(dragged.originalEndDay + dayOffset, dragged.originalStartDay),
      );
    }

    const fromDay = isoToDayNumber(event.start);
    const toDay = isoToDayNumber(event.end);
    touched =
      touched === null
        ? { fromDay, toDay }
        : { fromDay: Math.min(touched.fromDay, fromDay), toDay: Math.max(touched.toDay, toDay) };
  }
  return touched;
}
