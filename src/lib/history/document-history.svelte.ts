import { SnapshotHistory } from "./snapshot-history";
import type { TimelineDocument } from "../model/timeline-document";

/**
 * Історія документа: знімки, склеювання серій та лічильник для реактивності.
 * Знімає стан на вимогу викликача — сам документ їй не належить.
 */

/** Скільки триває «серія» правок, які лягають в один крок історії. */
const COALESCE_WINDOW_MS = 600;

export class DocumentHistory {
  #history = new SnapshotHistory<TimelineDocument>();
  /* `SnapshotHistory` — звичайний клас без рун, тож про його зміни ніхто б не
     дізнався; лічильник і є тим сигналом, який читають кнопки. */
  #revision = $state(0);

  /* Для склеювання серії дрібних правок в один крок історії (див. beginChange). */
  #lastChangeKey: string | null = null;
  #lastChangeAt = 0;

  get canUndo(): boolean {
    void this.#revision;
    return this.#history.canUndo;
  }

  get canRedo(): boolean {
    void this.#revision;
    return this.#history.canRedo;
  }

  clear(): void {
    this.#history.clear();
    this.#revision += 1;
  }

  /**
   * Позначає межу кроку історії. Викликати ПЕРЕД зміною.
   *
   * `coalesceKey` склеює серію дрібних правок в один крок: набір назви шле
   * подію на кожну літеру, і без цього Ctrl+Z стирав би по символу, а сотня
   * натискань витісняла б з історії все справді важливе. Ключ має бути
   * унікальним для поля («title:<id>»), інакше склеїлись би правки різних полів.
   */
  beginChange(document: TimelineDocument, coalesceKey?: string): void {
    const now = Date.now();
    const sameBurst =
      coalesceKey !== undefined &&
      coalesceKey === this.#lastChangeKey &&
      now - this.#lastChangeAt < COALESCE_WINDOW_MS;

    this.#lastChangeAt = now;
    if (sameBurst) return;

    this.#lastChangeKey = coalesceKey ?? null;
    this.#history.record(snapshot(document));
    this.#revision += 1;
  }

  undo(document: TimelineDocument): TimelineDocument | null {
    const previous = this.#history.undo(snapshot(document));
    if (previous === null) return null;
    this.#revision += 1;
    return previous;
  }

  redo(document: TimelineDocument): TimelineDocument | null {
    const next = this.#history.redo(snapshot(document));
    if (next === null) return null;
    this.#revision += 1;
    return next;
  }
}

/** Знімок для історії. `$state.snapshot` знімає реактивні проксі. */
function snapshot(document: TimelineDocument): TimelineDocument {
  return structuredClone($state.snapshot(document)) as TimelineDocument;
}
