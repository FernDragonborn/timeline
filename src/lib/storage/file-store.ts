import { documentDir, join } from "@tauri-apps/api/path";
import { open as openFileDialog, save as saveFileDialog } from "@tauri-apps/plugin-dialog";
import { exists, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import {
  parseDocument,
  serializeDocument,
  type TimelineDocument,
} from "../model/timeline-document";

/**
 * Робота з файлами документа. Разом із `platform/desktop-window` це єдині два
 * модулі, яким дозволено імпортувати `@tauri-apps/*`.
 *
 * Нащо: решта коду лишається звичайним браузерним — його можна запустити у
 * `vite dev` без десктопної оболонки і протестувати без мокання Tauri. Уся
 * прив'язка до платформи зібрана тут, тож вона видна цілком.
 */

const FILE_FILTERS = [{ name: "Timeline", extensions: ["json"] }];

export type FileResult<T> = { ok: true; value: T } | { ok: false; message: string };

/** Користувач закрив діалог — це не помилка, і повідомляти нема про що. */
export const CANCELLED = null;

export interface OpenedFile {
  path: string;
  document: TimelineDocument;
}

export async function pickFileToOpen(): Promise<string | typeof CANCELLED> {
  const selected = await openFileDialog({ multiple: false, filters: FILE_FILTERS });
  return typeof selected === "string" ? selected : CANCELLED;
}

export async function pickPathToSave(suggestedName: string): Promise<string | typeof CANCELLED> {
  const selected = await saveFileDialog({ defaultPath: suggestedName, filters: FILE_FILTERS });
  return typeof selected === "string" ? selected : CANCELLED;
}

export async function readDocument(path: string): Promise<FileResult<OpenedFile>> {
  let rawJson: string;
  try {
    rawJson = await readTextFile(path);
  } catch (cause) {
    return { ok: false, message: `Не вдалося прочитати файл: ${describe(cause)}` };
  }

  const parsed = parseDocument(rawJson);
  if (!parsed.ok) return { ok: false, message: parsed.message };
  return { ok: true, value: { path, document: parsed.document } };
}

export async function writeDocument(
  path: string,
  document: TimelineDocument,
): Promise<FileResult<void>> {
  try {
    await writeTextFile(path, serializeDocument(document));
    return { ok: true, value: undefined };
  } catch (cause) {
    return { ok: false, message: `Не вдалося зберегти файл: ${describe(cause)}` };
  }
}

function describe(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return String(cause);
}

/** Тихо: шлях може вести на від'єднаний диск, і це не помилка, а «немає». */
export async function fileExists(path: string): Promise<boolean> {
  try {
    return await exists(path);
  } catch {
    return false;
  }
}

/** Куди лягає файл, який застосунок заводить собі сам на першому запуску. */
export async function defaultDocumentPath(fileName: string): Promise<FileResult<string>> {
  try {
    return { ok: true, value: await join(await documentDir(), fileName) };
  } catch (cause) {
    return { ok: false, message: `Не вдалося визначити теку «Документи»: ${describe(cause)}` };
  }
}

/**
 * Шлях останнього файлу переживає перезапуск, щоб застосунок відкривався там,
 * де його закрили. Це налаштування середовища, а не дані документа, тож воно
 * навмисно НЕ лежить у файлі таймлайну.
 */
const LAST_PATH_KEY = "timeline.last-file-path";

export function rememberLastPath(path: string): void {
  try {
    localStorage.setItem(LAST_PATH_KEY, path);
  } catch {
    /* Приватний режим може забороняти запис. Втрата цієї підказки нічого не
       ламає — документ уже на диску, — тож мовчки живемо далі. */
  }
}

export function forgetLastPath(): void {
  try {
    localStorage.removeItem(LAST_PATH_KEY);
  } catch {
    /* Див. вище: підказка необов'язкова. */
  }
}

export function lastPath(): string | null {
  try {
    return localStorage.getItem(LAST_PATH_KEY);
  } catch {
    return null;
  }
}
