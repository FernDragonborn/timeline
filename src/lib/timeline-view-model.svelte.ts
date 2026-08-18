import { SnapshotHistory } from "./history/snapshot-history";
import { OVERLAP_MODE, type OverlapMode } from "./layout/track-layout";
import {
  createEmptyDocument,
  createId,
  createTrack,
  COLOR_INHERIT,
  EVENT_KIND,
  type DocumentBounds,
  type EventKind,
  type TimelineDocument,
  type TimelineEvent,
  type Track,
} from "./model/timeline-document";
import {
  dayNumberToDate,
  dayNumberToIso,
  isoToDayNumber,
  today,
  type DayNumber,
} from "./time/day-number";
import { tierForScale, type RulerTier } from "./time/ruler";
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
} from "./view/timeline-viewport";

/**
 * Стан подання та всі дії над документом.
 *
 * Розділення, на якому все тримається: `document` — те, що лягає у файл;
 * масштаб, домен, виділення й режим накладання — НЕ лягають. Через це домен
 * може вільно рости під час прокрутки, не роблячи файл «зміненим».
 */

export const DRAG_KIND = {
  Create: "create",
  Move: "move",
  ResizeStart: "resize-start",
  ResizeEnd: "resize-end",
} as const;
export type DragKind = (typeof DRAG_KIND)[keyof typeof DRAG_KIND];

/**
 * Обрати можна подію АБО доріжку — інспектор показує властивості того, що
 * обрано. Іменований союз замість двох полів `selectedEventId`/`selectedTrackId`:
 * обрано завжди рівно одне, і тип має це стверджувати.
 */
export const SELECTION_KIND = {
  Event: "event",
  Track: "track",
} as const;
export type SelectionKind = (typeof SELECTION_KIND)[keyof typeof SELECTION_KIND];

export interface Selection {
  kind: SelectionKind;
  id: string;
}

/** Скільки триває «серія» правок, які лягають в один крок історії. */
const COALESCE_WINDOW_MS = 600;

/** Стан перетягування — один об'єкт, а не розсип полів. */
export interface DragSession {
  kind: DragKind;
  eventId: string;
  /** Дні на момент початку — усі зсуви рахуються від них, не накопичуючись. */
  originalStartDay: DayNumber;
  originalEndDay: DayNumber;
  /** Чи вже щось справді змінилось, тобто чи вже записано крок історії. */
  changed: boolean;
}

class TimelineViewModel {
  #document = $state<TimelineDocument>(createEmptyDocument());
  #history = new SnapshotHistory<TimelineDocument>();
  #historyRevision = $state(0);

  #pixelsPerDay = $state(1.4);
  #overlapMode = $state<OverlapMode>(OVERLAP_MODE.Overlay);
  #domain = $state<TimeDomain>(defaultDomain());
  #selection = $state<Selection | null>(null);
  #renamingEventId = $state<string | null>(null);
  #drag = $state<DragSession | null>(null);

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

  /* Для склеювання серії дрібних правок в один крок історії (див. beginChange). */
  #lastChangeKey: string | null = null;
  #lastChangeAt = 0;

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

  get selection(): Selection | null {
    return this.#selection;
  }

  get selectedEvent(): TimelineEvent | null {
    const selection = this.#selection;
    if (selection === null || selection.kind !== SELECTION_KIND.Event) return null;
    return this.#document.events.find((event) => event.id === selection.id) ?? null;
  }

  get selectedTrack(): Track | null {
    const selection = this.#selection;
    if (selection === null || selection.kind !== SELECTION_KIND.Track) return null;
    return this.trackById(selection.id);
  }

  selectEvent(eventId: string): void {
    this.#selection = { kind: SELECTION_KIND.Event, id: eventId };
  }

  selectTrack(trackId: string): void {
    this.#selection = { kind: SELECTION_KIND.Track, id: trackId };
    this.#renamingEventId = null;
  }

  clearSelection(): void {
    this.#selection = null;
    this.#renamingEventId = null;
  }

  // ── Швидке перейменування прямо на полотні ────────────────────────────────

  get renamingEventId(): string | null {
    return this.#renamingEventId;
  }

  /** Подвійний клік по події — одразу правити назву, не тягнучись до інспектора. */
  startRenaming(eventId: string): void {
    this.selectEvent(eventId);
    this.#renamingEventId = eventId;
  }

  stopRenaming(): void {
    this.#renamingEventId = null;
  }

  /**
   * Замінює документ цілком — після «Новий» чи «Відкрити». Історія й виділення
   * скидаються: відкат у документ, якого вже немає на екрані, безглуздий.
   */
  replaceDocument(next: TimelineDocument): void {
    this.#document = next;
    this.#history.clear();
    this.#historyRevision += 1;
    this.#selection = null;
    this.#renamingEventId = null;

    const eventDays = this.#allEventDays(next);
    this.#domain = domainAroundDays(eventDays);
    /* Домен охоплює сторіччя, тож без цього новий документ відкривався б десь
       у 1920-х. Показуємо початок даних, а для порожнього — сьогодні. */
    this.requestScrollTo(eventDays.length > 0 ? Math.min(...eventDays) : today());
  }

  #allEventDays(document: TimelineDocument): DayNumber[] {
    const days: DayNumber[] = [];
    for (const event of document.events) {
      days.push(isoToDayNumber(event.start), isoToDayNumber(event.end));
    }
    return days;
  }

  // ── Історія ───────────────────────────────────────────────────────────────

  get canUndo(): boolean {
    void this.#historyRevision;
    return this.#history.canUndo;
  }

  get canRedo(): boolean {
    void this.#historyRevision;
    return this.#history.canRedo;
  }

  /** Знімок для історії. `$state.snapshot` знімає реактивні проксі. */
  #snapshot(): TimelineDocument {
    return structuredClone($state.snapshot(this.#document)) as TimelineDocument;
  }

  /**
   * Позначає межу кроку історії. Викликати ПЕРЕД зміною.
   *
   * `coalesceKey` склеює серію дрібних правок в один крок: набір назви шле
   * подію на кожну літеру, і без цього Ctrl+Z стирав би по символу, а сотня
   * натискань витісняла б з історії все справді важливе. Ключ має бути
   * унікальним для поля («title:<id>»), інакше склеїлись би правки різних полів.
   */
  beginChange(coalesceKey?: string): void {
    const now = Date.now();
    const sameBurst =
      coalesceKey !== undefined &&
      coalesceKey === this.#lastChangeKey &&
      now - this.#lastChangeAt < COALESCE_WINDOW_MS;

    this.#lastChangeAt = now;
    if (sameBurst) return;

    this.#lastChangeKey = coalesceKey ?? null;
    this.#history.record(this.#snapshot());
    this.#historyRevision += 1;
  }

  undo(): void {
    const previous = this.#history.undo(this.#snapshot());
    if (previous === null) return;
    this.#document = previous;
    this.#historyRevision += 1;
    this.#dropSelectionIfGone();
  }

  redo(): void {
    const next = this.#history.redo(this.#snapshot());
    if (next === null) return;
    this.#document = next;
    this.#historyRevision += 1;
    this.#dropSelectionIfGone();
  }

  /** Після відкату обране могло зникнути з документа. */
  #dropSelectionIfGone(): void {
    const selection = this.#selection;
    if (selection === null) return;
    const stillThere =
      selection.kind === SELECTION_KIND.Event
        ? this.selectedEvent !== null
        : this.selectedTrack !== null;
    if (!stillThere) this.clearSelection();
  }

  // ── Події ─────────────────────────────────────────────────────────────────

  addEvent(trackId: string, startDay: DayNumber, endDay: DayNumber, kind: EventKind): TimelineEvent {
    this.beginChange();
    const event: TimelineEvent = {
      id: createId(),
      trackId,
      kind,
      start: dayNumberToIso(Math.min(startDay, endDay)),
      end: dayNumberToIso(kind === EVENT_KIND.Point ? Math.min(startDay, endDay) : Math.max(startDay, endDay)),
      color: COLOR_INHERIT,
      title: kind === EVENT_KIND.Point ? "Подія" : "Нова подія",
      note: "",
    };
    this.#document.events.push(event);
    this.selectEvent(event.id);
    this.ensureDomainCovers(isoToDayNumber(event.start), isoToDayNumber(event.end));
    return event;
  }

  /**
   * Точкова подія завжди має однакові межі, тож зміна початку тягне за собою
   * кінець. Правило живе тут, а не в кожному місці виклику.
   */
  updateEvent(eventId: string, patch: Partial<Omit<TimelineEvent, "id">>): void {
    const event = this.#document.events.find((candidate) => candidate.id === eventId);
    if (!event) return;
    Object.assign(event, patch);
    if (event.kind === EVENT_KIND.Point) {
      event.end = event.start;
    } else if (event.end < event.start) {
      /* Правка дат руками може перевернути проміжок — стягуємо в нуль-день,
         а не лишаємо документ у стані, який схема відкине при збереженні. */
      if (patch.start !== undefined) event.end = event.start;
      else event.start = event.end;
    }
    this.ensureDomainCovers(isoToDayNumber(event.start), isoToDayNumber(event.end));
  }

  deleteEvent(eventId: string): void {
    this.beginChange();
    this.#document.events = this.#document.events.filter((event) => event.id !== eventId);
    if (this.#selection?.id === eventId) this.clearSelection();
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
    this.#document.tracks = this.#document.tracks.filter((track) => track.id !== trackId);
    this.#document.events = this.#document.events.filter((event) => event.trackId !== trackId);
    this.#dropSelectionIfGone();
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
  beginDrag(session: Omit<DragSession, "changed">): void {
    this.#drag = { ...session, changed: false };
  }

  dragBy(dayOffset: number, overTrackId: string | null): void {
    const session = this.#drag;
    if (session === null) return;
    const event = this.#document.events.find((candidate) => candidate.id === session.eventId);
    if (!event) return;

    const changesTrack =
      session.kind === DRAG_KIND.Move && overTrackId !== null && overTrackId !== event.trackId;
    /* Поки нічого не зрушило — не чіпаємо ні документ, ні історію. */
    if (!session.changed && dayOffset === 0 && !changesTrack) return;
    if (!session.changed) {
      /* Один крок на все перетягування: далі йдуть кадри, а не окремі дії. */
      this.beginChange();
      session.changed = true;
    }

    if (session.kind === DRAG_KIND.Move) {
      event.start = dayNumberToIso(session.originalStartDay + dayOffset);
      event.end = dayNumberToIso(session.originalEndDay + dayOffset);
      if (overTrackId !== null) event.trackId = overTrackId;
    } else if (session.kind === DRAG_KIND.ResizeStart) {
      event.start = dayNumberToIso(Math.min(session.originalStartDay + dayOffset, session.originalEndDay));
    } else if (session.kind === DRAG_KIND.ResizeEnd) {
      event.end = dayNumberToIso(Math.max(session.originalEndDay + dayOffset, session.originalStartDay));
    }
    this.ensureDomainCovers(isoToDayNumber(event.start), isoToDayNumber(event.end));
  }

  endDrag(): void {
    this.#drag = null;
  }

  // ── Масштаб і домен ───────────────────────────────────────────────────────

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
  setScale(pixelsPerDay: number, anchor?: { day: DayNumber; viewportPixel: number }): void {
    const held = anchor ?? {
      day: pixelToDay(
        this.domain,
        this.#pixelsPerDay,
        this.#scrollLeftPixels + this.#viewportWidthPixels / 2,
      ),
      viewportPixel: this.#viewportWidthPixels / 2,
    };
    this.#pixelsPerDay = clampScale(pixelsPerDay);
    this.#requestScroll(held.day, held.viewportPixel);
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
   * Задані в документі межі перекривають вільний домен: якщо автор сказав, що
   * шкала триває з такого по таке, прокручувати за них нема куди.
   */
  get domain(): TimeDomain {
    const bounds = this.#document.bounds;
    if (bounds === null) return this.#domain;
    return { fromDay: isoToDayNumber(bounds.start), toDay: isoToDayNumber(bounds.end) };
  }

  get isBounded(): boolean {
    return this.#document.bounds !== null;
  }

  setBounds(bounds: DocumentBounds | null): void {
    this.beginChange();
    this.#document.bounds = bounds;
  }

  /** Межі за замовчуванням — обхват даних, а без даних поточний рік. */
  suggestedBounds(): DocumentBounds {
    const days = this.#allEventDays(this.#document);
    if (days.length === 0) {
      const now = dayNumberToDate(today());
      return {
        start: `${now.getUTCFullYear()}-01-01`,
        end: `${now.getUTCFullYear()}-12-31`,
      };
    }
    return { start: dayNumberToIso(Math.min(...days)), end: dayNumberToIso(Math.max(...days)) };
  }

  get canvasWidthPixels(): number {
    return domainWidthPixels(this.domain, this.#pixelsPerDay);
  }

  get visibleRange(): VisibleRange {
    return visibleRange(
      this.domain,
      this.#pixelsPerDay,
      this.#scrollLeftPixels,
      this.#viewportWidthPixels,
    );
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
  ensureDomainCovers(fromDay: DayNumber, toDay: DayNumber): number {
    /* Задані межі — рішення автора документа, і розсовувати їх мовчки, бо
       подія виїхала за край, не можна. */
    if (this.isBounded) return 0;
    const before = this.#domain.fromDay;
    this.#domain = domainCovering(this.#domain, fromDay, toDay);
    return before - this.#domain.fromDay;
  }

  /** Прохання показати день у центрі; виконує його власник елемента прокрутки. */
  requestScrollTo(day: DayNumber): void {
    const halfScreenDays = this.#viewportWidthPixels / this.#pixelsPerDay / 2 + 30;
    this.ensureDomainCovers(day - halfScreenDays, day + halfScreenDays);
    this.#requestScroll(day, this.#viewportWidthPixels / 2);
  }

  #requestScroll(day: DayNumber, viewportPixel: number): void {
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

  goToToday(): void {
    this.requestScrollTo(today());
  }
}

export const timeline = new TimelineViewModel();
