import { EVENT_KIND } from "../model/timeline-document";
import { dayToPixel, type TimeDomain } from "../view/timeline-viewport";
import {
  OVERLAP_MODE,
  POINT_MARKER_PIXELS,
  type EventPlacement,
  type OverlapMode,
} from "./track-layout";

/**
 * Переведення розкладки в пікселі. Окремо від `track-layout`, бо там — хто з ким
 * перетинається (чиста логіка часу), а тут — де саме це намалювати.
 */

const OVERLAY_ROW_HEIGHT = 66;
const OVERLAY_BLOCK_INSET = 8;
/** На скільки опустити підпис кожного наступного підрівня в режимі накладання. */
const OVERLAY_LABEL_STEP = 16;
/** Висота рядка тексту підпису — потрібна, щоб він не звисав за межі рядка. */
const LABEL_LINE_HEIGHT_PIXELS = 15;

const STACK_LANE_HEIGHT = 24;
const STACK_LANE_GAP = 3;
const STACK_PADDING = 7;
const STACK_MIN_ROW_HEIGHT = 52;

/** Прямокутник вужчий за це неможливо ні побачити, ні влучити мишею. */
const MIN_BLOCK_WIDTH_PIXELS = 3;

/**
 * Ширина лівої колонки з назвами доріжок. Живе в коді, а не лише в CSS, бо
 * входить у перерахунок прокрутки в дні — а два незалежні числа для однієї
 * ширини розійшлися б на першій же правці стилів.
 */
export const TRACK_HEAD_WIDTH_PIXELS = 172;

export interface Rectangle {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function rowHeight(mode: OverlapMode, laneCount: number): number {
  if (mode === OVERLAP_MODE.Overlay) return OVERLAY_ROW_HEIGHT;
  const content = STACK_PADDING * 2 + laneCount * STACK_LANE_HEIGHT + (laneCount - 1) * STACK_LANE_GAP;
  return Math.max(STACK_MIN_ROW_HEIGHT, content);
}

/**
 * У режимі накладання всі блоки заввишки на весь рядок — саме через це перетин
 * і видно як щільність. У стеку кожен сидить на своєму підрівні.
 */
function verticalExtent(placement: EventPlacement, mode: OverlapMode): { top: number; height: number } {
  if (mode === OVERLAP_MODE.Stack) {
    return {
      top: STACK_PADDING + placement.lane * (STACK_LANE_HEIGHT + STACK_LANE_GAP),
      height: STACK_LANE_HEIGHT,
    };
  }
  return {
    top: OVERLAY_BLOCK_INSET,
    height: OVERLAY_ROW_HEIGHT - OVERLAY_BLOCK_INSET * 2,
  };
}

export function blockRectangle(
  placement: EventPlacement,
  mode: OverlapMode,
  domain: TimeDomain,
  pixelsPerDay: number,
): Rectangle {
  const vertical = verticalExtent(placement, mode);
  const startPixel = dayToPixel(domain, pixelsPerDay, placement.startDay);

  if (placement.event.kind === EVENT_KIND.Point) {
    /* Шпилька стоїть на середині доби, тому й половина ширини доби у зсуві.
       Заввишки — на весь підрівень: так її і видно краще, і легше влучити. */
    const centre = startPixel + pixelsPerDay / 2;
    return {
      left: centre - POINT_MARKER_PIXELS / 2,
      top: vertical.top,
      width: POINT_MARKER_PIXELS,
      height: vertical.height,
    };
  }

  /* Межі включні, тож останній день теж має бути видно — звідси «+ 1». */
  const width = (placement.endDay - placement.startDay + 1) * pixelsPerDay;
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
  mode: OverlapMode,
  domain: TimeDomain,
  pixelsPerDay: number,
): { left: number; top: number } {
  const rectangle = blockRectangle(placement, mode, domain, pixelsPerDay);
  const isPoint = placement.event.kind === EVENT_KIND.Point;

  if (mode === OVERLAP_MODE.Stack) {
    return {
      left: isPoint ? rectangle.left + rectangle.width + 5 : rectangle.left + 7,
      top: rectangle.top,
    };
  }

  /* Сходинка не має винести підпис у сусідню доріжку: при глибокому перетині
     нижні підрівні впираються в останній рядок, де ще видно текст цілком. */
  const lowestLabelTop = OVERLAY_ROW_HEIGHT - OVERLAY_BLOCK_INSET - LABEL_LINE_HEIGHT_PIXELS;
  return {
    left: isPoint ? rectangle.left + rectangle.width + 5 : rectangle.left + 8,
    top: Math.min(
      OVERLAY_BLOCK_INSET + 4 + placement.lane * OVERLAY_LABEL_STEP,
      lowestLabelTop,
    ),
  };
}

