/**
 * Стан подання: масштаб, вільний домен, геометрія прокрутки, режим накладання
 * і ширина колонки з назвами. Нічого з цього у файл документа не лягає.
 *
 * Методи, яким потрібен ДІЙСНИЙ домен (він може бути перекритий межами
 * документа), беруть його аргументом: інакше цей стан мусив би тримати копію
 * меж і стежити за її свіжістю.
 */

import {
  DEFAULT_TRACK_HEAD_WIDTH,
  MAX_TRACK_HEAD_WIDTH,
  MIN_TRACK_HEAD_WIDTH,
} from "../layout/row-geometry";
import { OVERLAP_MODE, type OverlapMode } from "../layout/track-layout";
import type { DayNumber } from "../time/day-number";
import { tierForScale, type RulerTier } from "../time/ruler";
import {
  clampScale,
  defaultDomain,
  domainAroundDays,
  domainCovering,
  domainWidthPixels,
  pixelToDay,
  visibleRange,
  type TimeDomain,
  type VisibleRange,
} from "./timeline-viewport";

export class ViewportState {
  #pixelsPerDay = $state(1.4);
  #overlapMode = $state<OverlapMode>(OVERLAP_MODE.Overlay);
  #domain = $state<TimeDomain>(defaultDomain());
  #trackHeadWidthPixels = $state(DEFAULT_TRACK_HEAD_WIDTH);

  /* Геометрія прокрутки живе тут, бо від неї залежить, які поділки будувати. */
  #scrollLeftPixels = $state(0);
  #viewportWidthPixels = $state(1200);

  /**
   * Прохання «покажи цей день» — лічильник плюс звичайне поле, а не одне
   * реактивне значення, яке читач мусив би обнулити. Ефект, що читає й пише той
   * самий стан, зациклюється; тут ефект лише читає лічильник, а день бере зі
   * звичайного поля, запис у яке нічого не перезапускає.
   */
  #scrollRequestId = $state(0);
  #scrollTargetDay: DayNumber = 0;
  #scrollTargetViewportPixel = 0;

  get pixelsPerDay(): number {
    return this.#pixelsPerDay;
  }

  /**
   * Зміна масштабу ЗАВЖДИ утримує якийсь день на місці. Без цього прокрутка
   * лишається тією ж у пікселях, а от що це за пікселі — змінюється разом із
   * масштабом: на домені в два століття слайдер відкидав у 1930-ті.
   *
   * За замовчуванням тримається середина екрана; колесо передає день під
   * курсором, бо там людина дивиться саме туди.
   */
  setScale(
    pixelsPerDay: number,
    domain: TimeDomain,
    anchor?: { day: DayNumber; viewportPixel: number },
  ): void {
    const held = anchor ?? {
      day: pixelToDay(
        domain,
        this.#pixelsPerDay,
        this.#scrollLeftPixels + this.#viewportWidthPixels / 2,
      ),
      viewportPixel: this.#viewportWidthPixels / 2,
    };
    this.#pixelsPerDay = clampScale(pixelsPerDay);
    this.requestScroll(held.day, held.viewportPixel);
  }

  get rulerTier(): RulerTier {
    return tierForScale(this.#pixelsPerDay);
  }

  get overlapMode(): OverlapMode {
    return this.#overlapMode;
  }

  setOverlapMode(mode: OverlapMode): void {
    this.#overlapMode = mode;
  }

  /**
   * Ширина колонки з назвами — стан ВІКНА, а не документа: вона описує, як
   * зручно дивитись, і в файл не потрапляє.
   */
  get trackHeadWidthPixels(): number {
    return this.#trackHeadWidthPixels;
  }

  setTrackHeadWidth(pixels: number): void {
    this.#trackHeadWidthPixels = Math.min(
      MAX_TRACK_HEAD_WIDTH,
      Math.max(MIN_TRACK_HEAD_WIDTH, Math.round(pixels)),
    );
  }

  canvasWidthPixels(domain: TimeDomain): number {
    return domainWidthPixels(domain, this.#pixelsPerDay);
  }

  visibleRange(domain: TimeDomain): VisibleRange {
    return visibleRange(
      domain,
      this.#pixelsPerDay,
      this.#scrollLeftPixels,
      this.#viewportWidthPixels,
    );
  }

  get viewportWidthPixels(): number {
    return this.#viewportWidthPixels;
  }

  /** Вільний домен — той, що діє, поки документ не задав власних меж. */
  get freeDomain(): TimeDomain {
    return this.#domain;
  }

  /** Новий документ — новий домен: попередній обхват до цих даних не має діла. */
  resetDomainAround(days: readonly DayNumber[]): void {
    this.#domain = domainAroundDays(days);
  }

  reportScroll(scrollLeftPixels: number, viewportWidthPixels: number): void {
    this.#scrollLeftPixels = scrollLeftPixels;
    this.#viewportWidthPixels = viewportWidthPixels;
  }

  /**
   * Розсовує домен так, щоб діапазон був досяжним, і повідомляє, на скільки
   * днів поїхав лівий край: викликач компенсує це прокруткою, інакше картинка
   * стрибне під курсором.
   */
  widenDomainTo(fromDay: DayNumber, toDay: DayNumber): number {
    const before = this.#domain.fromDay;
    this.#domain = domainCovering(this.#domain, fromDay, toDay);
    return before - this.#domain.fromDay;
  }

  /** Прохання показати день; виконує його власник елемента прокрутки. */
  requestScroll(day: DayNumber, viewportPixel: number): void {
    this.#scrollTargetDay = day;
    this.#scrollTargetViewportPixel = viewportPixel;
    this.#scrollRequestId += 1;
  }

  /** Росте на кожне прохання; нуль означає, що просити ще не встигли. */
  get scrollRequestId(): number {
    return this.#scrollRequestId;
  }

  get scrollTargetDay(): DayNumber {
    return this.#scrollTargetDay;
  }

  /** Куди по горизонталі екрана має потрапити цільовий день. */
  get scrollTargetViewportPixel(): number {
    return this.#scrollTargetViewportPixel;
  }
}
