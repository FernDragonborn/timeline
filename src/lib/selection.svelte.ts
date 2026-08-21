/**
 * Що зараз обрано і що перейменовують. Окремо від документа: у файл це не лягає.
 */

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

export class SelectionStore {
  #selection = $state<Selection | null>(null);
  #renamingEventId = $state<string | null>(null);

  get current(): Selection | null {
    return this.#selection;
  }

  /** Порожньо, якщо обрано інший рід: набір однорідний, мішанини не буває. */
  idsOf(kind: SelectionKind): string[] {
    const selection = this.#selection;
    if (selection === null || selection.kind !== kind) return [];
    return selection.ids;
  }

  isEventSelected(eventId: string): boolean {
    return this.idsOf(SELECTION_KIND.Event).includes(eventId);
  }

  isTrackSelected(trackId: string): boolean {
    return this.idsOf(SELECTION_KIND.Track).includes(trackId);
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

  /** Після відкату частина обраного могла зникнути з документа. */
  keepOnlyAlive(aliveIds: ReadonlySet<string>): void {
    const selection = this.#selection;
    if (selection === null) return;
    const ids = selection.ids.filter((id) => aliveIds.has(id));
    if (ids.length === selection.ids.length) return;
    this.#selection = ids.length === 0 ? null : { kind: selection.kind, ids };
    if (ids.length === 0) this.#renamingEventId = null;
  }
}
