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
  /** Підрівень блока. У стеку це вертикальна позиція; у накладанні — лише лічильник перетинів. */
  lane: number;
  /**
   * Сходинка підпису в режимі накладання. Рахується окремо від `lane`, бо
   * перетин блоків і перетин назв — різні події: смуги можуть налазити одна на
   * одну, поки їхні короткі назви стоять поруч вільно.
   */
  labelLane: number;
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

/** Скільки пікселів лишити між кінцем одного підпису й початком наступного. */
const LABEL_GAP_PIXELS = 10;

/** Відступ підпису від лівого краю прямокутника. */
export const LABEL_LEFT_INSET_PIXELS = 8;

/** Проміжок між позначкою точкової події та її назвою. */
export const LABEL_AFTER_MARKER_GAP_PIXELS = 5;

/**
 * Скільки сходинок підписів вміщує рядок у режимі накладання. Понад це назву
 * вже нема куди опустити — там і починає діяти «цілком або ніяк».
 */
export const OVERLAY_LABEL_LANE_LIMIT = 3;

/**
 * Жадібна розкладка по підрівнях: подія лягає на перший підрівень, де вона ні
 * з ким не перетинається. У межах ОДНОГО підрівня події гарантовано не
 * накладаються — на цьому тримається режим стеку.
 *
 * Зайнятість зберігається як день ПІСЛЯ останнього (`endDay + 1`), тож
 * порівняння нестрогe: подія, що починається рівно там, де попередня
 * скінчилась, з нею не перетинається і має право на той самий підрівень.
 * Зі строгим `<` дві дотичні події займали два рядки замість одного.
 */
function assignLanes(sortedByStart: EventPlacement[]): number {
  const nextFreeDayPerLane: number[] = [];
  for (const placement of sortedByStart) {
    let lane = 0;
    while (lane < nextFreeDayPerLane.length) {
      const nextFreeDay = nextFreeDayPerLane[lane];
      if (nextFreeDay === undefined || nextFreeDay <= placement.startDay) break;
      lane += 1;
    }
    nextFreeDayPerLane[lane] = placement.startDay + placement.footprintDays;
    placement.lane = lane;
  }
  return Math.max(1, nextFreeDayPerLane.length);
}

/**
 * Ліва межа підпису в пікселях, рахуючи від початку епохи. Домен тут не
 * потрібен: сходинку вирішують ВІДСТАНІ між підписами, а спільний зсув їх не
 * змінює.
 */
function labelLeftPixel(placement: EventPlacement, pixelsPerDay: number): number {
  const startPixel = placement.startDay * pixelsPerDay;
  if (placement.event.kind !== EVENT_KIND.Point) return startPixel + LABEL_LEFT_INSET_PIXELS;
  /* Шпилька стоїть на середині доби, а назва — одразу за нею. */
  return (
    startPixel + pixelsPerDay / 2 + POINT_MARKER_PIXELS / 2 + LABEL_AFTER_MARKER_GAP_PIXELS
  );
}

interface LabelExtent {
  placement: EventPlacement;
  left: number;
  right: number;
}

/**
 * Куди сяде кожен підпис. Міряємо САМІ підписи, а не блоки під ними — це різні
 * речі: дві події можуть торкатися краями чи ділити кілька днів, поки їхні
 * короткі назви стоять поруч вільно, і навпаки — одноденна подія з довгою
 * назвою займає набагато більше місця, ніж її прямокутник.
 *
 * Коли назви таки налазять, друга опускається на сходинку нижче, а не зникає.
 * Зникає вона лише тоді, коли вільних сходинок не лишилось — тоді діє «цілком
 * або ніяк», бо «Відпус…» місце займає, а не каже нічого.
 */
function planLabels(
  placements: EventPlacement[],
  pixelsPerDay: number,
  measureLabelWidth: (text: string) => number,
  mode: OverlapMode,
): void {
  /* У стеку підписи не зсуваються: блоки вже стоять на різній висоті, тож
     кожен підрівень має рівно одну сходинку — свою. */
  const laneLimit = mode === OVERLAP_MODE.Stack ? 1 : OVERLAY_LABEL_LANE_LIMIT;

  const extents: LabelExtent[] = [];
  for (const placement of placements) {
    placement.labelLane = 0;
    placement.showLabel = false;
    const title = placement.event.title.trim();
    if (title.length === 0) continue;
    const left = labelLeftPixel(placement, pixelsPerDay);
    extents.push({ placement, left, right: left + measureLabelWidth(title) });
  }
  /* Замітаємо зліва направо саме по підписах: у точкової події назва починається
     праворуч від позначки, тож порядок за днем початку тут був би не той. */
  extents.sort((a, b) => a.left - b.left);

  const occupiedUntilByRow = new Map<number, number[]>();
  for (const extent of extents) {
    const row = mode === OVERLAP_MODE.Stack ? extent.placement.lane : 0;
    let occupiedUntil = occupiedUntilByRow.get(row);
    if (occupiedUntil === undefined) {
      occupiedUntil = [];
      occupiedUntilByRow.set(row, occupiedUntil);
    }

    let lane = 0;
    while (lane < occupiedUntil.length) {
      const until = occupiedUntil[lane];
      if (until === undefined || until <= extent.left) break;
      lane += 1;
    }
    if (lane >= laneLimit) continue;

    occupiedUntil[lane] = extent.right + LABEL_GAP_PIXELS;
    extent.placement.labelLane = lane;
    extent.placement.showLabel = true;
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

export interface TrackLayoutOptions {
  pixelsPerDay: number;
  /** Потрібен уже на етапі розкладки: від режиму залежить, як лягають підписи. */
  overlapMode: OverlapMode;
  measureLabelWidth: (text: string) => number;
}

export function planTrackLayout(
  events: readonly TimelineEvent[],
  { pixelsPerDay, overlapMode, measureLabelWidth }: TrackLayoutOptions,
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
      labelLane: 0,
      showLabel: false,
    };
  });

  const sortedByStart = [...placements].sort((a, b) => a.startDay - b.startDay);
  const laneCount = assignLanes(sortedByStart);
  planLabels(placements, pixelsPerDay, measureLabelWidth, overlapMode);

  placements.sort(byDurationDescending);
  return { placements, laneCount };
}
