import { EVENT_KIND } from "../model/timeline-document";
import { dayToPixel, type TimeDomain } from "../view/timeline-viewport";
import {
  LABEL_AFTER_MARKER_GAP_PIXELS,
  LABEL_LEFT_INSET_PIXELS,
  OVERLAP_MODE,
  POINT_MARKER_PIXELS,
  type EventPlacement,
  type OverlapMode,
} from "./track-layout";

/**
 * Переведення розкладки в пікселі. Окремо від `track-layout`, бо там — хто з ким
 * перетинається (чиста логіка часу), а тут — де саме це намалювати.
 */

const OVERLAY_BLOCK_INSET = 8;
/** На скільки опустити підпис кожного наступного підрівня в режимі накладання. */
const OVERLAY_LABEL_STEP = 16;
/** Висота рядка тексту підпису — потрібна, щоб він не звисав за межі рядка. */
const LABEL_LINE_HEIGHT_PIXELS = 15;

const STACK_LANE_HEIGHT = 24;
const STACK_LANE_GAP = 3;
const STACK_PADDING = 7;

/** Прямокутник вужчий за це неможливо ні побачити, ні влучити мишею. */
const MIN_BLOCK_WIDTH_PIXELS = 3;

/**
 * Ширина лівої колонки з назвами доріжок. Живе в коді, а не лише в CSS, бо
 * входить у перерахунок прокрутки в дні — а два незалежні числа для однієї
 * ширини розійшлися б на першій же правці стилів. Її можна тягнути, тож
 * розрахунки беруть поточне значення з моделі подання, а це — типове.
 */
export const DEFAULT_TRACK_HEAD_WIDTH = 172;
export const MIN_TRACK_HEAD_WIDTH = 96;
export const MAX_TRACK_HEAD_WIDTH = 420;

export interface Rectangle {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Усе, що потрібно, аби перевести розкладку в пікселі. Один об'єкт, а не п'ять
 * позиційних аргументів: висота доріжки й ширина колонки стали змінними, і
 * список аргументів інакше довелося б правити в кожному місці виклику.
 */
export interface RowGeometry {
  mode: OverlapMode;
  domain: TimeDomain;
  pixelsPerDay: number;
  /** Висота саме цієї доріжки; у накладанні вона ж і висота блоків. */
  trackHeight: number;
}

/**
 * У стеку рядок мусить умістити всі підрівні, тож власна висота доріжки тут —
 * нижня межа, а не точне значення: інакше підрівні вилазили б за край.
 */
export function rowHeight(mode: OverlapMode, laneCount: number, trackHeight: number): number {
  if (mode === OVERLAP_MODE.Overlay) return trackHeight;
  const content =
    STACK_PADDING * 2 + laneCount * STACK_LANE_HEIGHT + (laneCount - 1) * STACK_LANE_GAP;
  return Math.max(trackHeight, content);
}

/**
 * У режимі накладання всі блоки заввишки на весь рядок — саме через це перетин
 * і видно як щільність. У стеку кожен сидить на своєму підрівні.
 */
function verticalExtent(
  placement: EventPlacement,
  geometry: RowGeometry,
): { top: number; height: number } {
  if (geometry.mode === OVERLAP_MODE.Stack) {
    return {
      top: STACK_PADDING + placement.lane * (STACK_LANE_HEIGHT + STACK_LANE_GAP),
      height: STACK_LANE_HEIGHT,
    };
  }
  return {
    top: OVERLAY_BLOCK_INSET,
    height: geometry.trackHeight - OVERLAY_BLOCK_INSET * 2,
  };
}

export function blockRectangle(placement: EventPlacement, geometry: RowGeometry): Rectangle {
  const vertical = verticalExtent(placement, geometry);
  const startPixel = dayToPixel(geometry.domain, geometry.pixelsPerDay, placement.startDay);

  if (placement.event.kind === EVENT_KIND.Point) {
    /* Шпилька стоїть на середині доби, тому й половина ширини доби у зсуві.
       Заввишки — на весь підрівень: так її і видно краще, і легше влучити. */
    const centre = startPixel + geometry.pixelsPerDay / 2;
    return {
      left: centre - POINT_MARKER_PIXELS / 2,
      top: vertical.top,
      width: POINT_MARKER_PIXELS,
      height: vertical.height,
    };
  }

  /* Межі включні, тож останній день теж має бути видно — звідси «+ 1». */
  const width = (placement.endDay - placement.startDay + 1) * geometry.pixelsPerDay;
  return {
    left: startPixel,
    top: vertical.top,
    width: Math.max(MIN_BLOCK_WIDTH_PIXELS, width),
    height: vertical.height,
  };
}

/**
 * Підпис живе окремо від прямокутника і не обрізається ним: якщо праворуч
 * порожньо, назва спокійно виходить за край блока. Саме тому вузька подія на
 * дрібному масштабі лишається підписаною, а не перетворюється на «Відпус…».
 */
export function labelPosition(
  placement: EventPlacement,
  geometry: RowGeometry,
): { left: number; top: number } {
  const rectangle = blockRectangle(placement, geometry);
  const isPoint = placement.event.kind === EVENT_KIND.Point;

  const left = isPoint
    ? rectangle.left + rectangle.width + LABEL_AFTER_MARKER_GAP_PIXELS
    : rectangle.left + LABEL_LEFT_INSET_PIXELS;

  if (geometry.mode === OVERLAP_MODE.Stack) return { left, top: rectangle.top };

  /* Скільки сходинок узагалі буде, вирішує `OVERLAY_LABEL_LANE_LIMIT` у
     track-layout; тут — гарантія, що жодна з них не вилізе за межі рядка й не
     напливе на сусідню доріжку. Дві різні задачі, тому й два місця. */
  const lowestLabelTop = geometry.trackHeight - OVERLAY_BLOCK_INSET - LABEL_LINE_HEIGHT_PIXELS;
  return {
    left,
    top: Math.min(
      OVERLAY_BLOCK_INSET + 4 + placement.labelLane * OVERLAY_LABEL_STEP,
      lowestLabelTop,
    ),
  };
}
