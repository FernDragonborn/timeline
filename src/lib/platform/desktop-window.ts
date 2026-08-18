/**
 * Доступ до вікна десктопної оболонки.
 *
 * Разом із `storage/file-store` це єдині два місця, яким дозволено імпортувати
 * `@tauri-apps/*`. Решта коду лишається звичайним браузерним і запускається у
 * `vite dev` без оболонки — а ці модулі чесно повідомляють, що її немає.
 */

/**
 * У звичайному браузері (`pnpm dev` без Tauri) ні файлів, ні вікна немає.
 * Перевіряємо явно, щоб показати зрозуміле пояснення замість витоку
 * внутрішньої помилки на кшталт «Cannot read properties of undefined».
 */
export function isDesktopRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Просить оболонку закрити вікно. Саме `close`, а не `destroy`: закриття має
 * пройти через `onCloseRequested`, інакше воно обійде дозапис незбереженого.
 */
export async function closeWindow(): Promise<void> {
  if (!isDesktopRuntime()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().close();
}

/** Знищує вікно без питань — викликається вже після дозапису. */
export async function destroyWindow(): Promise<void> {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().destroy();
}

/**
 * Перехоплює закриття. Повертає функцію відписки; порожню, якщо оболонки
 * немає, щоб викликач не мусив розрізняти ці випадки.
 */
export async function onWindowCloseRequested(
  handle: (cancel: () => void) => Promise<void> | void,
): Promise<() => void> {
  if (!isDesktopRuntime()) return () => {};
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow().onCloseRequested(async (closeEvent) => {
    await handle(() => closeEvent.preventDefault());
  });
}
