import { createEmptyDocument, type TimelineDocument } from "../model/timeline-document";
import {
  destroyWindow,
  isDesktopRuntime,
  onWindowCloseRequested,
} from "../platform/desktop-window";
import { timeline } from "../timeline-view-model.svelte";
import {
  CANCELLED,
  defaultDocumentPath,
  fileExists,
  forgetLastPath,
  lastPath,
  pickFileToOpen,
  pickPathToSave,
  readDocument,
  rememberLastPath,
  writeDocument,
} from "./file-store";

/**
 * Файл документа: відкриття, збереження, автозбереження.
 *
 * Ключове рішення — застосунок ЗАВЖДИ має файл. Немає стану «десь є незбережені
 * зміни»: на першому запуску створюється файл у теці «Документи», «Новий»
 * питає, куди покласти наступний. Через це автозбереженню завжди є куди
 * писати, а закриття вікна ніколи не ставить питань.
 */

export const SAVE_STATUS = {
  Saved: "saved",
  Pending: "pending",
  Saving: "saving",
  Failed: "failed",
} as const;
export type SaveStatus = (typeof SAVE_STATUS)[keyof typeof SAVE_STATUS];

const AUTOSAVE_DELAY_MS = 700;
const DEFAULT_FILE_NAME = "timeline.json";

class DocumentFileController {
  #path = $state<string | null>(null);
  #status = $state<SaveStatus>(SAVE_STATUS.Saved);
  #message = $state<string | null>(null);
  #timer: ReturnType<typeof setTimeout> | null = null;
  /* Поки true, зміни документа не вважаються редагуванням користувача — інакше
     саме завантаження файлу відразу запускало б запис назад у нього. */
  #loading = true;

  get path(): string | null {
    return this.#path;
  }

  get fileName(): string {
    if (this.#path === null) return DEFAULT_FILE_NAME;
    return this.#path.split(/[\\/]/).pop() ?? DEFAULT_FILE_NAME;
  }

  get status(): SaveStatus {
    return this.#status;
  }

  get message(): string | null {
    return this.#message;
  }

  clearMessage(): void {
    this.#message = null;
  }

  // ── Запуск ────────────────────────────────────────────────────────────────

  /** Відкриває файл минулого сеансу, а якщо його немає — заводить новий. */
  async restoreSession(): Promise<void> {
    this.#loading = true;

    if (!isDesktopRuntime()) {
      /* Режим `pnpm dev` у браузері: працюємо з документа в пам'яті. Це
         передбачений запасний шлях для роботи над версткою, а не поламаний стан. */
      timeline.replaceDocument(createEmptyDocument());
      this.#message =
        "Запущено в браузері, без десктопної оболонки — файли недоступні.\n" +
        "Зміни живуть лише до перезавантаження сторінки. Для роботи з файлами: pnpm tauri dev";
      this.#path = null;
      this.#settle(SAVE_STATUS.Failed);
      return;
    }

    const remembered = lastPath();

    if (remembered !== null && (await fileExists(remembered))) {
      const result = await readDocument(remembered);
      if (result.ok) {
        timeline.replaceDocument(result.value.document);
        this.#path = result.value.path;
        this.#settle(SAVE_STATUS.Saved);
        return;
      }
      /* Файл на місці, але зіпсований. Не мовчимо і не затираємо його: далі
         працюємо з порожнім документом, поки користувач не вирішить сам. */
      this.#message = `${result.message}\n\nВідкрито порожній документ; попередній файл не змінено.`;
      forgetLastPath();
    }

    await this.#startFreshInDocumentsFolder();
  }

  async #startFreshInDocumentsFolder(): Promise<void> {
    const document = createEmptyDocument();
    timeline.replaceDocument(document);

    const path = await defaultDocumentPath(DEFAULT_FILE_NAME);
    if (path.ok) {
      const written = await writeDocument(path.value, document);
      if (written.ok) {
        this.#path = path.value;
        rememberLastPath(path.value);
        this.#settle(SAVE_STATUS.Saved);
        return;
      }
      this.#message = written.message;
    } else {
      this.#message = path.message;
    }
    this.#path = null;
    this.#settle(SAVE_STATUS.Failed);
  }

  #settle(status: SaveStatus): void {
    this.#status = status;
    this.#loading = false;
  }

  // ── Дії користувача ───────────────────────────────────────────────────────

  async newDocument(): Promise<void> {
    const chosen = await pickPathToSave(DEFAULT_FILE_NAME);
    if (chosen === CANCELLED) return;

    await this.#flushPendingSave();
    this.#loading = true;
    const document = createEmptyDocument();
    timeline.replaceDocument(document);
    await this.#writeTo(chosen, document);
    this.#loading = false;
  }

  async openDocument(): Promise<void> {
    const chosen = await pickFileToOpen();
    if (chosen === CANCELLED) return;

    await this.#flushPendingSave();
    const result = await readDocument(chosen);
    if (!result.ok) {
      this.#message = result.message;
      return;
    }
    this.#loading = true;
    /* Куди дивитись після відкриття, вирішує `replaceDocument` — він веде до
       початку даних. Стрибок на «сьогодні» тут показував би порожнє місце у
       файлі про 1850-й. */
    timeline.replaceDocument(result.value.document);
    this.#path = result.value.path;
    rememberLastPath(result.value.path);
    this.#settle(SAVE_STATUS.Saved);
  }

  async saveAs(): Promise<void> {
    const chosen = await pickPathToSave(this.fileName);
    if (chosen === CANCELLED) return;
    await this.#writeTo(chosen, this.#snapshot());
  }

  /** Записати негайно, не чекаючи автозбереження. Для Ctrl+S і закриття вікна. */
  async saveNow(): Promise<void> {
    if (this.#path === null) {
      await this.saveAs();
      return;
    }
    await this.#flushPendingSave();
  }

  async #writeTo(path: string, document: TimelineDocument): Promise<void> {
    this.#status = SAVE_STATUS.Saving;
    const written = await writeDocument(path, document);
    if (!written.ok) {
      this.#status = SAVE_STATUS.Failed;
      this.#message = written.message;
      return;
    }
    this.#path = path;
    rememberLastPath(path);
    this.#status = SAVE_STATUS.Saved;
  }

  #snapshot(): TimelineDocument {
    return $state.snapshot(timeline.document) as TimelineDocument;
  }

  // ── Автозбереження ────────────────────────────────────────────────────────

  /**
   * Викликається з `$effect`, який читає документ цілком: серіалізація і є тим
   * читанням, що робить ефект залежним від кожного поля. Тобто рядок, який ми
   * збираємось писати, — водночас і сигнал про те, що писати треба.
   */
  onDocumentChanged(): void {
    if (this.#loading || this.#path === null) return;
    this.#status = SAVE_STATUS.Pending;
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.#autosave();
    }, AUTOSAVE_DELAY_MS);
  }

  async #autosave(): Promise<void> {
    const path = this.#path;
    if (path === null) return;
    await this.#writeTo(path, this.#snapshot());
  }

  /** Дописує те, що чекало в черзі, перш ніж документ підмінять. */
  async #flushPendingSave(): Promise<void> {
    if (this.#timer === null) return;
    clearTimeout(this.#timer);
    this.#timer = null;
    await this.#autosave();
  }

  /**
   * Чи лишилось щось незаписане. Потрібне при закритті вікна: автозбереження
   * чекає 700 мс, і без цієї перевірки правка, зроблена останньою, зникала б
   * разом із застосунком.
   */
  get hasPendingWrite(): boolean {
    return this.#timer !== null;
  }
}

export const documentFile = new DocumentFileController();

/**
 * Перехоплює закриття вікна, щоб дописати відкладене. Tauri дає скасувати
 * закриття, дочекатися запису й закрити самому — це єдиний надійний момент;
 * `beforeunload` у вебв'ю асинхронну роботу не дочекається.
 */
export function saveBeforeWindowCloses(): Promise<() => void> {
  return onWindowCloseRequested(async (cancel) => {
    if (!documentFile.hasPendingWrite) return;
    cancel();
    await documentFile.saveNow();
    await destroyWindow();
  });
}
