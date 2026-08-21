import { applyDragTo, createDragSession, grabbedOf, DRAG_KIND } from "./drag-session";
import type { DragKind, DragSession } from "./drag-session";
import { DocumentHistory } from "./history/document-history.svelte";
import {
  allEventDays,
  applyEventPatch,
  clampTrackHeight,
  createEvent,
  removeTrackFrom,
  reorderTracks,
  suggestedBoundsFor,
} from "./model/document-edits";
import {
  createEmptyDocument,
  createTrack,
  type DocumentBounds,
  type EventKind,
  type TimelineDocument,
  type TimelineEvent,
  type Track,
} from "./model/timeline-document";
import { SELECTION_KIND, SelectionStore } from "./selection.svelte";
import { isoToDayNumber, today, type DayNumber } from "./time/day-number";
import { ViewportState } from "./view/viewport-state.svelte";
import type { TimeDomain, VisibleRange } from "./view/timeline-viewport";

/**
 * Стан подання та всі дії над документом.
 *
 * Розділення, на якому все тримається: `document` — те, що лягає у файл;
 * масштаб, домен, виділення й режим накладання — НЕ лягають. Через це домен
 * може вільно рости під час прокрутки, не роблячи файл «зміненим».
 */

class TimelineViewModel {
  #document = $state<TimelineDocument>(createEmptyDocument());
  #history = new DocumentHistory();

  /* Подання й виділення — власні об'єкти, а не десяток полів навпіл із
     документом: у файл не лягає ні те, ні те, і читач бачить межу одразу. */
  readonly selection = new SelectionStore();
  readonly viewport = new ViewportState();
  #drag = $state<DragSession | null>(null);

  // ── Документ ──────────────────────────────────────────────────────────────

  get document(): TimelineDocument {
    return this.#document;
  }

  get tracks(): Track[] {
    return this.#document.tracks;
  }

  get events(): TimelineEvent[] {
    return this.#document.events;
  }

  eventsOfTrack(trackId: string): TimelineEvent[] {
    return this.#document.events.filter((event) => event.trackId === trackId);
  }

  trackById(trackId: string): Track | null {
    return this.#document.tracks.find((track) => track.id === trackId) ?? null;
  }

  get selectedEvents(): TimelineEvent[] {
    const ids = new Set(this.selection.idsOf(SELECTION_KIND.Event));
    if (ids.size === 0) return [];
    return this.#document.events.filter((event) => ids.has(event.id));
  }

  get selectedTracks(): Track[] {
    const ids = new Set(this.selection.idsOf(SELECTION_KIND.Track));
    if (ids.size === 0) return [];
    return this.#document.tracks.filter((track) => ids.has(track.id));
  }

  /**
   * Замінює документ цілком — після «Новий» чи «Відкрити». Історія й виділення
   * скидаються: відкат у документ, якого вже немає на екрані, безглуздий.
   */
  replaceDocument(next: TimelineDocument): void {
    this.#document = next;
    this.#history.clear();
    this.selection.clearSelection();

    const eventDays = allEventDays(next);
    this.viewport.resetDomainAround(eventDays);
    /* Домен охоплює сторіччя, тож без цього новий документ відкривався б десь
       у 1920-х. Показуємо початок даних, а для порожнього — сьогодні. */
    this.requestScrollTo(eventDays.length > 0 ? Math.min(...eventDays) : today());
  }

  // ── Історія ───────────────────────────────────────────────────────────────

  get canUndo(): boolean {
    return this.#history.canUndo;
  }

  get canRedo(): boolean {
    return this.#history.canRedo;
  }

  beginChange(coalesceKey?: string): void {
    this.#history.beginChange(this.#document, coalesceKey);
  }

  undo(): void {
    const previous = this.#history.undo(this.#document);
    if (previous === null) return;
    this.#document = previous;
    this.#dropSelectionIfGone();
  }

  redo(): void {
    const next = this.#history.redo(this.#document);
    if (next === null) return;
    this.#document = next;
    this.#dropSelectionIfGone();
  }

  /** Після відкату частина обраного могла зникнути з документа. */
  #dropSelectionIfGone(): void {
    const selection = this.selection.current;
    if (selection === null) return;
    const alive = new Set(
      selection.kind === SELECTION_KIND.Event
        ? this.#document.events.map((event) => event.id)
        : this.#document.tracks.map((track) => track.id),
    );
    this.selection.keepOnlyAlive(alive);
  }

  // ── Події ─────────────────────────────────────────────────────────────────

  addEvent(trackId: string, startDay: DayNumber, endDay: DayNumber, kind: EventKind): TimelineEvent {
    this.beginChange();
    const event = createEvent({ trackId, startDay, endDay, kind });
    this.#document.events.push(event);
    this.selection.selectEvent(event.id);
    this.ensureDomainCovers(isoToDayNumber(event.start), isoToDayNumber(event.end));
    return event;
  }

  updateEvent(eventId: string, patch: Partial<Omit<TimelineEvent, "id">>): void {
    const event = this.#document.events.find((candidate) => candidate.id === eventId);
    if (!event) return;
    applyEventPatch(event, patch);
    this.ensureDomainCovers(isoToDayNumber(event.start), isoToDayNumber(event.end));
  }

  deleteEvent(eventId: string): void {
    this.deleteEvents([eventId]);
  }

  deleteEvents(eventIds: readonly string[]): void {
    if (eventIds.length === 0) return;
    this.beginChange();
    const doomed = new Set(eventIds);
    this.#document.events = this.#document.events.filter((event) => !doomed.has(event.id));
    this.#dropSelectionIfGone();
  }

  /** Правка гуртом: те саме поле в кожній обраній події, одним кроком історії. */
  updateSelectedEvents(patch: Partial<Omit<TimelineEvent, "id">>, coalesceKey?: string): void {
    const events = this.selectedEvents;
    if (events.length === 0) return;
    this.beginChange(coalesceKey);
    for (const event of events) this.updateEvent(event.id, patch);
  }

  /** Видаляє обране, чим би воно не було. Одна дія для Del і для кнопки. */
  deleteSelection(): void {
    const selection = this.selection.current;
    if (selection === null) return;
    if (selection.kind === SELECTION_KIND.Event) {
      this.deleteEvents(selection.ids);
      return;
    }
    for (const id of selection.ids) this.removeTrack(id);
  }

  // ── Доріжки ───────────────────────────────────────────────────────────────

  addTrack(): void {
    this.beginChange();
    const position = this.#document.tracks.length;
    this.#document.tracks.push(createTrack(`Доріжка ${position + 1}`, position * 2));
  }

  updateTrack(trackId: string, patch: Partial<Omit<Track, "id">>): void {
    const track = this.#document.tracks.find((candidate) => candidate.id === trackId);
    if (track) Object.assign(track, patch);
  }

  removeTrack(trackId: string): void {
    if (this.#document.tracks.length <= 1) return;
    this.beginChange();
    removeTrackFrom(this.#document, trackId);
    this.#dropSelectionIfGone();
  }

  /**
   * Висота під час перетягування шле подію на кожен піксель, тож ключ склеювання
   * тут обов'язковий — інакше один рух краю з'їдав би всю історію.
   */
  setTrackHeight(trackId: string, height: number): void {
    const clamped = clampTrackHeight(height);
    const track = this.trackById(trackId);
    if (track === null || track.height === clamped) return;
    this.beginChange(`height:${trackId}`);
    track.height = clamped;
  }

  moveTrack(trackId: string, toIndex: number): void {
    const reordered = reorderTracks(this.#document.tracks, trackId, toIndex);
    if (reordered === null) return;
    this.beginChange();
    this.#document.tracks = reordered;
  }

  // ── Перетягування ─────────────────────────────────────────────────────────

  get drag(): DragSession | null {
    return this.#drag;
  }

  /**
   * Початок перетягування САМ ПО СОБІ нічого не змінює: натискання на подію —
   * це передусім вибір, і більшість натискань так вибором і лишаються. Тому
   * крок історії тут не записується, інакше кожен клік по події клав у неї
   * порожній запис, і Ctrl+Z починав «нічого не робити» по десять разів.
   */
  /**
   * Рухається весь обраний гурт, якщо взялись за одну з обраних подій. Взялись
   * за сторонню — рухається лише вона, а виділення до цього діла не має.
   */
  beginDrag(options: { kind: DragKind; grabbedId: string }): void {
    const moving = this.selection.isEventSelected(options.grabbedId)
      ? this.selectedEvents
      : this.#document.events.filter((event) => event.id === options.grabbedId);

    this.#drag = createDragSession({ ...options, moving, tracks: this.#document.tracks });
  }

  dragBy(dayOffset: number, overTrackId: string | null): void {
    const session = this.#drag;
    if (session === null) return;
    const grabbed = grabbedOf(session);
    if (grabbed === null) return;

    const overIndex = overTrackId === null ? -1 : this.#trackIndex(overTrackId);
    const trackOffset =
      session.kind === DRAG_KIND.Move && overIndex >= 0 ? overIndex - grabbed.originalTrackIndex : 0;

    /* Поки нічого не зрушило — не чіпаємо ні документ, ні історію. */
    if (!session.changed && dayOffset === 0 && trackOffset === 0) return;
    if (!session.changed) {
      /* Один крок на все перетягування: далі йдуть кадри, а не окремі дії. */
      this.beginChange();
      session.changed = true;
    }

    const touched = applyDragTo({
      session,
      events: this.#document.events,
      tracks: this.#document.tracks,
      dayOffset,
      trackOffset,
    });
    if (touched !== null) this.ensureDomainCovers(touched.fromDay, touched.toDay);
  }

  #trackIndex(trackId: string): number {
    return this.#document.tracks.findIndex((track) => track.id === trackId);
  }

  endDrag(): void {
    this.#drag = null;
  }

  // ── Подання: масштаб, домен, прокрутка ────────────────────────────────────

  setScale(pixelsPerDay: number, anchor?: { day: DayNumber; viewportPixel: number }): void {
    this.viewport.setScale(pixelsPerDay, this.domain, anchor);
  }

  /**
   * Задані в документі межі перекривають вільний домен: якщо автор сказав, що
   * шкала триває з такого по таке, прокручувати за них нема куди.
   */
  get domain(): TimeDomain {
    const bounds = this.#document.bounds;
    if (bounds === null) return this.viewport.freeDomain;
    return { fromDay: isoToDayNumber(bounds.start), toDay: isoToDayNumber(bounds.end) };
  }

  get isBounded(): boolean {
    return this.#document.bounds !== null;
  }

  setBounds(bounds: DocumentBounds | null): void {
    this.beginChange();
    this.#document.bounds = bounds;
  }

  suggestedBounds(): DocumentBounds {
    return suggestedBoundsFor(allEventDays(this.#document));
  }

  get canvasWidthPixels(): number {
    return this.viewport.canvasWidthPixels(this.domain);
  }

  get visibleRange(): VisibleRange {
    return this.viewport.visibleRange(this.domain);
  }

  /**
   * Розсовує домен так, щоб діапазон був досяжним, і повідомляє, на скільки
   * днів поїхав лівий край: викликач компенсує це прокруткою, інакше картинка
   * стрибне під курсором.
   */
  ensureDomainCovers(fromDay: DayNumber, toDay: DayNumber): number {
    /* Задані межі — рішення автора документа, і розсовувати їх мовчки, бо
       подія виїхала за край, не можна. */
    if (this.isBounded) return 0;
    return this.viewport.widenDomainTo(fromDay, toDay);
  }

  /** Прохання показати день у центрі; виконує його власник елемента прокрутки. */
  requestScrollTo(day: DayNumber): void {
    const viewportWidthPixels = this.viewport.viewportWidthPixels;
    const halfScreenDays = viewportWidthPixels / this.viewport.pixelsPerDay / 2 + 30;
    this.ensureDomainCovers(day - halfScreenDays, day + halfScreenDays);
    this.viewport.requestScroll(day, viewportWidthPixels / 2);
  }

  goToToday(): void {
    this.requestScrollTo(today());
  }
}

export const timeline = new TimelineViewModel();
