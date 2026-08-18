import { SnapshotHistory } from "./history/snapshot-history";
import {
  DEFAULT_TRACK_HEAD_WIDTH,
  MAX_TRACK_HEAD_WIDTH,
  MIN_TRACK_HEAD_WIDTH,
} from "./layout/row-geometry";
import { OVERLAP_MODE, type OverlapMode } from "./layout/track-layout";
import {
  createEmptyDocument,
  createId,
  createTrack,
  COLOR_INHERIT,
  EVENT_KIND,
  MAX_TRACK_HEIGHT,
  MIN_TRACK_HEIGHT,
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
 * Обрані можуть бути події АБО доріжки, але ніколи вперемішку: панель показує
 * спільні властивості обраного, а спільних властивостей у події й доріжки
 * немає. Іменований союз замість двох полів `selectedEventIds`/`selectedTrackIds`
 * саме тому — тип стверджує, що рід рівно один.
 */
export const SELECTION_KIND = {
  Event: "event",
  Track: "track",
} as const;
export type SelectionKind = (typeof SELECTION_KIND)[keyof typeof SELECTION_KIND];

export interface Selection {
  kind: SelectionKind;
  /** Порядок збережено: він вирішує, що вважати «першим» обраним. */
  ids: string[];
}

/** Додавати до вже обраного чи почати наново. Іменований прапорець, не позиційний. */
export interface SelectOptions {
  add: boolean;
}

/** Скільки триває «серія» правок, які лягають в один крок історії. */
const COALESCE_WINDOW_MS = 600;

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

class TimelineViewModel {
  #document = $state<TimelineDocument>(createEmptyDocument());
  #history = new SnapshotHistory<TimelineDocument>();
  #historyRevision = $state(0);

  #pixelsPerDay = $state(1.4);
  #overlapMode = $state<OverlapMode>(OVERLAP_MODE.Overlay);
  #domain = $state<TimeDomain>(defaultDomain());
  #trackHeadWidthPixels = $state(DEFAULT_TRACK_HEAD_WIDTH);
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

  #selectedIds(kind: SelectionKind): string[] {
    const selection = this.#selection;
    if (selection === null || selection.kind !== kind) return [];
    return selection.ids;
  }

  get selectedEvents(): TimelineEvent[] {
    const ids = new Set(this.#selectedIds(SELECTION_KIND.Event));
    if (ids.size === 0) return [];
    return this.#document.events.filter((event) => ids.has(event.id));
  }

  get selectedTracks(): Track[] {
    const ids = new Set(this.#selectedIds(SELECTION_KIND.Track));
    if (ids.size === 0) return [];
    return this.#document.tracks.filter((track) => ids.has(track.id));
  }

  /** Подія, коли обрана РІВНО одна: для дій, які на гурті не мають сенсу. */
  get selectedEvent(): TimelineEvent | null {
    const events = this.selectedEvents;
    return events.length === 1 ? (events[0] ?? null) : null;
  }

  get selectedTrack(): Track | null {
    const tracks = this.selectedTracks;
    return tracks.length === 1 ? (tracks[0] ?? null) : null;
  }

  isEventSelected(eventId: string): boolean {
    return this.#selectedIds(SELECTION_KIND.Event).includes(eventId);
  }

  isTrackSelected(trackId: string): boolean {
    return this.#selectedIds(SELECTION_KIND.Track).includes(trackId);
  }

  /**
   * Додавання перемикає: Shift по вже обраному прибирає його з набору. Це
   * очікувана поведінка скрізь, де є Shift-клік, і без неї зняти зайве можна
   * було б лише почавши виділення спочатку.
   */
  #select(kind: SelectionKind, id: string, options: SelectOptions): void {
    const current = this.#selection;
    const sameKind = current !== null && current.kind === kind;

    if (!options.add || !sameKind) {
      this.#selection = { kind, ids: [id] };
      return;
    }
    const ids = current.ids.includes(id)
      ? current.ids.filter((existing) => existing !== id)
      : [...current.ids, id];
    this.#selection = ids.length === 0 ? null : { kind, ids };
  }

  selectEvent(eventId: string, options: SelectOptions = { add: false }): void {
    this.#select(SELECTION_KIND.Event, eventId, options);
  }

  selectTrack(trackId: string, options: SelectOptions = { add: false }): void {
    this.#select(SELECTION_KIND.Track, trackId, options);
    this.#renamingEventId = null;
  }

  /** Рамкою виділення: замінює набір цілком або доливає до нього. */
  selectEvents(eventIds: readonly string[], options: SelectOptions): void {
    if (eventIds.length === 0) {
      if (!options.add) this.clearSelection();
      return;
    }
    const current = this.#selection;
    const existing =
      options.add && current !== null && current.kind === SELECTION_KIND.Event ? current.ids : [];
    this.#selection = {
      kind: SELECTION_KIND.Event,
      ids: [...new Set([...existing, ...eventIds])],
    };
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

  /** Після відкату частина обраного могла зникнути з документа. */
  #dropSelectionIfGone(): void {
    const selection = this.#selection;
    if (selection === null) return;
    const alive = new Set(
      selection.kind === SELECTION_KIND.Event
        ? this.#document.events.map((event) => event.id)
        : this.#document.tracks.map((track) => track.id),
    );
    const ids = selection.ids.filter((id) => alive.has(id));
    if (ids.length === selection.ids.length) return;
    this.#selection = ids.length === 0 ? null : { kind: selection.kind, ids };
    if (ids.length === 0) this.#renamingEventId = null;
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
    const selection = this.#selection;
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
    this.#document.tracks = this.#document.tracks.filter((track) => track.id !== trackId);
    this.#document.events = this.#document.events.filter((event) => event.trackId !== trackId);
    this.#dropSelectionIfGone();
  }

  /**
   * Висота під час перетягування шле подію на кожен піксель, тож ключ склеювання
   * тут обов'язковий — інакше один рух краю з'їдав би всю історію.
   */
  setTrackHeight(trackId: string, height: number): void {
    const clamped = Math.min(MAX_TRACK_HEIGHT, Math.max(MIN_TRACK_HEIGHT, Math.round(height)));
    const track = this.trackById(trackId);
    if (track === null || track.height === clamped) return;
    this.beginChange(`height:${trackId}`);
    track.height = clamped;
  }

  /** Переставляє доріжку на місце `toIndex`; порядок масиву і є порядком на екрані. */
  moveTrack(trackId: string, toIndex: number): void {
    const from = this.#trackIndex(trackId);
    const to = Math.min(this.#document.tracks.length - 1, Math.max(0, toIndex));
    if (from < 0 || from === to) return;
    this.beginChange();
    const tracks = [...this.#document.tracks];
    const [moved] = tracks.splice(from, 1);
    if (moved === undefined) return;
    tracks.splice(to, 0, moved);
    this.#document.tracks = tracks;
  }

  trackIndexOf(trackId: string): number {
    return this.#trackIndex(trackId);
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
    const moving = this.isEventSelected(options.grabbedId)
      ? this.selectedEvents
      : this.#document.events.filter((event) => event.id === options.grabbedId);

    const indexByTrackId = new Map(this.#document.tracks.map((track, index) => [track.id, index]));
    this.#drag = {
      kind: options.kind,
      grabbedId: options.grabbedId,
      events: moving.flatMap((event) => {
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

  /**
   * Гурт переїжджає на стільки ж рядків, на скільки поїхала взята подія, а не
   * на ту доріжку, під якою опинився курсор: інакше все обране злиплося б в
   * один рядок. Хто впирається в край — там і лишається.
   */
  dragBy(dayOffset: number, overTrackId: string | null): void {
    const session = this.#drag;
    if (session === null) return;
    const grabbed = session.events.find((candidate) => candidate.id === session.grabbedId);
    if (grabbed === undefined) return;

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

    const lastTrackIndex = this.#document.tracks.length - 1;
    for (const dragged of session.events) {
      const event = this.#document.events.find((candidate) => candidate.id === dragged.id);
      if (!event) continue;

      if (session.kind === DRAG_KIND.Move) {
        event.start = dayNumberToIso(dragged.originalStartDay + dayOffset);
        event.end = dayNumberToIso(dragged.originalEndDay + dayOffset);
        if (trackOffset !== 0) {
          const index = Math.min(
            lastTrackIndex,
            Math.max(0, dragged.originalTrackIndex + trackOffset),
          );
          const track = this.#document.tracks[index];
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
      this.ensureDomainCovers(isoToDayNumber(event.start), isoToDayNumber(event.end));
    }
  }

  #trackIndex(trackId: string): number {
    return this.#document.tracks.findIndex((track) => track.id === trackId);
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
