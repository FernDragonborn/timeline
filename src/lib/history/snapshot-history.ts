/**
 * Історія змін як стек знімків.
 *
 * Знімки, а не пари do/undo: документ тут — кілька десятків подій, тобто
 * одиниці кілобайт, і зробити копію дешевше, ніж описати кожну дію двома
 * дзеркальними операціями і потім усе життя стежити, щоб вони не розійшлися.
 *
 * Історія навмисно НЕ зберігає теперішній стан — ним володіє модель подання.
 * Інакше було б два джерела правди про те, який документ зараз на екрані.
 */
export class SnapshotHistory<T> {
  #past: T[] = [];
  #future: T[] = [];
  readonly #capacity: number;

  constructor(options: { capacity?: number } = {}) {
    this.#capacity = options.capacity ?? 100;
  }

  get canUndo(): boolean {
    return this.#past.length > 0;
  }

  get canRedo(): boolean {
    return this.#future.length > 0;
  }

  /**
   * Запам'ятовує стан ПЕРЕД зміною. Викликається один раз на дію користувача —
   * зокрема один раз на все перетягування, а не на кожен його кадр: інакше один
   * рух мишею з'їдав би всю глибину відкату, і Ctrl+Z повертав би подію на
   * піксель назад.
   */
  record(current: T): void {
    this.#past.push(current);
    if (this.#past.length > this.#capacity) this.#past.shift();
    this.#future.length = 0;
  }

  /** Повертає стан, на який треба замінити теперішній, або null. */
  undo(current: T): T | null {
    const previous = this.#past.pop();
    if (previous === undefined) return null;
    this.#future.push(current);
    return previous;
  }

  redo(current: T): T | null {
    const next = this.#future.pop();
    if (next === undefined) return null;
    this.#past.push(current);
    return next;
  }

  clear(): void {
    this.#past.length = 0;
    this.#future.length = 0;
  }
}
