import { isoToDayNumber, type DayNumber } from "../time/day-number";
import { EVENT_KIND, type TimelineEvent } from "../model/timeline-document";

/**
 * Розкладка однієї доріжки. Уся геометрія рахується тут, у чистих функціях без
 * DOM, — компоненти лише розставляють готові координати.
 */

export const OVERLAP_MODE = {
  /** Прямокутники один поверх одного, перетин видно як щільність. */
  Overlay: "overlay",
  /** Кожен підрівень окремо, рядок росте у висоту, перетинів не видно. */
  Stack: "stack",
} as const;
export type OverlapMode = (typeof OVERLAP_MODE)[keyof typeof OVERLAP_MODE];

export interface EventPlacement {
  event: TimelineEvent;
  startDay: DayNumber;
  /** Останній день події, включно. Для точкової дорівнює startDay. */
  endDay: DayNumber;
  /**
   * Скільки днів подія займає для розкладки. Для прямокутника це його
   * тривалість; для точки — стільки днів, скільки вкриває позначка сталого
   * розміру за поточного масштабу.
   */
  footprintDays: number;
  /** Підрівень: у режимі стеку — вертикальна позиція, у накладанні — зсув підпису. */
  lane: number;
  /** Чи є місце написати назву, не обрізаючи її. */
  showLabel: boolean;
}

/**
 * Ширина позначки точкової події, у пікселях. Стала за визначенням: подія без
 * тривалості не має ширини в часі, тож масштабувати нема чого — і саме тому
 * вона лишається видимою там, де одноденний прямокутник вироджується в
 * невидиму риску.
 */
export const POINT_MARKER_PIXELS = 13;

export interface TrackLayout {
  placements: EventPlacement[];
  laneCount: number;
}

/** Скільки пікселів лишити між кінцем підпису й початком сусіда. */
const LABEL_GAP_PIXELS = 10;

/**
 * Жадібна розкладка по підрівнях: подія лягає на перший підрівень, де вона ні
 * з ким не перетинається. У межах ОДНОГО підрівня події гарантовано не
 * накладаються — на цьому тримається і режим стеку, і розрахунок місця під
 * підписи нижче.
 */
function assignLanes(sortedByStart: EventPlacement[]): number {
  const lastOccupiedDayPerLane: number[] = [];
  for (const placement of sortedByStart) {
    let lane = 0;
    while (lane < lastOccupiedDayPerLane.length) {
      const lastDay = lastOccupiedDayPerLane[lane];
      if (lastDay === undefined || lastDay < placement.startDay) break;
      lane += 1;
    }
    lastOccupiedDayPerLane[lane] = placement.startDay + placement.footprintDays;
    placement.lane = lane;
  }
  return Math.max(1, lastOccupiedDayPerLane.length);
}

/**
 * Підпис або вміщується повністю, або його немає — «Відпус…» не каже нічого,
 * а місце займає.
 *
 * Ширини самого прямокутника для цього мало: назва може виходити ЗА його правий
 * край, поки там порожньо. Тому доступне місце — це відстань до наступної події
 * на тому ж підрівні, а не власна ширина блока. Через це на дрібному масштабі
 * довгі події лишаються підписаними, а короткі стають кольоровими рисками —
 * їхні назви повертаються самі, щойно наблизити.
 */
function planLabels(
  sortedByStart: EventPlacement[],
  pixelsPerDay: number,
  measureLabelWidth: (text: string) => number,
): void {
  const nextStartDayPerLane = new Map<number, DayNumber>();

  /* Ідемо назад: так на кожному кроці вже відомий найближчий сусід справа. */
  for (let index = sortedByStart.length - 1; index >= 0; index -= 1) {
    const placement = sortedByStart[index];
    if (!placement) continue;

    const nextStartDay = nextStartDayPerLane.get(placement.lane);
    const availablePixels =
      nextStartDay === undefined
        ? Number.POSITIVE_INFINITY
        : (nextStartDay - placement.startDay) * pixelsPerDay;

    /* Підпис точкової події починається ПІСЛЯ позначки, тож її ширина з'їдає
       частину доступного місця. */
    const labelOffsetPixels =
      placement.event.kind === EVENT_KIND.Point ? POINT_MARKER_PIXELS : 0;
    const title = placement.event.title.trim();
    placement.showLabel =
      title.length > 0 &&
      measureLabelWidth(title) + LABEL_GAP_PIXELS + labelOffsetPixels <= availablePixels;

    nextStartDayPerLane.set(placement.lane, placement.startDay);
  }
}

/**
 * Порядок малювання: довші події йдуть першими, тобто лягають ПІД коротшими.
 * Через напівпрозорість порядок майже не змінює колір — він вирішує, чий
 * підпис зверху і хто ловить клік. А потрібен майже завжди коротший: річна
 * «фонова» смуга не має ні накривати дводенну подію, ні перехоплювати курсор.
 */
function byDurationDescending(a: EventPlacement, b: EventPlacement): number {
  const durationA = a.endDay - a.startDay;
  const durationB = b.endDay - b.startDay;
  if (durationA !== durationB) return durationB - durationA;
  /* Точки — завжди поверх прямокутників тієї ж тривалості: позначка дрібна, і
     сховати її під смугою означає втратити її зовсім. */
  const pointRank = (placement: EventPlacement): number =>
    placement.event.kind === EVENT_KIND.Point ? 1 : 0;
  if (pointRank(a) !== pointRank(b)) return pointRank(a) - pointRank(b);
  return a.startDay - b.startDay;
}

export function planTrackLayout(
  events: readonly TimelineEvent[],
  pixelsPerDay: number,
  measureLabelWidth: (text: string) => number,
): TrackLayout {
  const pointFootprintDays = POINT_MARKER_PIXELS / pixelsPerDay;
  const placements: EventPlacement[] = events.map((event) => {
    const startDay = isoToDayNumber(event.start);
    const endDay = isoToDayNumber(event.end);
    return {
      event,
      startDay,
      endDay,
      footprintDays:
        event.kind === EVENT_KIND.Point
          ? pointFootprintDays
          : Math.max(endDay - startDay + 1, pointFootprintDays),
      lane: 0,
      showLabel: false,
    };
  });

  const sortedByStart = [...placements].sort((a, b) => a.startDay - b.startDay);
  const laneCount = assignLanes(sortedByStart);
  planLabels(sortedByStart, pixelsPerDay, measureLabelWidth);

  placements.sort(byDurationDescending);
  return { placements, laneCount };
}
