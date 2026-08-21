<script lang="ts">
  import { onMount, untrack } from "svelte";
  import Inspector from "./components/Inspector.svelte";
  import TimelineCanvas from "./components/TimelineCanvas.svelte";
  import Toolbar from "./components/Toolbar.svelte";
  import { closeWindow } from "./lib/platform/desktop-window";
  import { serializeDocument } from "./lib/model/timeline-document";
  import {
    documentFile,
    saveBeforeWindowCloses,
  } from "./lib/storage/document-file-controller.svelte";
  import { timeline } from "./lib/timeline-view-model.svelte";
  import { ZOOM_KEY_STEP } from "./lib/view/timeline-viewport";

  const THEME_KEY = "timeline.theme";
  /* Ширина колонки описує вікно, а не дані, тож живе поруч із темою, а не в
     документі. Той самий шлях: прочитати на старті, писати на зміну. */
  const HEAD_WIDTH_KEY = "timeline.track-head-width";
  type Theme = "dark" | "light";

  function initialTheme(): Theme {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "dark" || stored === "light") return stored;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }

  let theme = $state<Theme>(initialTheme());

  $effect(() => {
    document.documentElement.dataset["theme"] = theme;
    localStorage.setItem(THEME_KEY, theme);
  });

  /* Відновлення сеансу — разова дія на старті, а не реакція на зміну стану,
     тож їй місце в onMount. У $effect вона перезапускалася б щоразу, коли
     зачепить будь-який стан, який сама ж і міняє. */
  onMount(() => {
    const storedWidth = Number(localStorage.getItem(HEAD_WIDTH_KEY));
    if (Number.isFinite(storedWidth) && storedWidth > 0) timeline.viewport.setTrackHeadWidth(storedWidth);

    void documentFile.restoreSession();

    let unlisten: (() => void) | null = null;
    void saveBeforeWindowCloses().then((stop) => (unlisten = stop));
    return () => unlisten?.();
  });

  /**
   * Автозбереження. Серіалізація читає документ наскрізь — саме це читання й
   * робить ефект залежним від кожного поля. Тобто рядок, який ми збираємось
   * записати, є водночас і сигналом про те, що записувати треба.
   *
   * Сама дія йде в `untrack`: вона змінює стан збереження, і без цього ефект
   * підписався б на те, що сам же й пише.
   */
  $effect(() => {
    void serializeDocument(timeline.document);
    untrack(() => documentFile.onDocumentChanged());
  });

  $effect(() => {
    localStorage.setItem(HEAD_WIDTH_KEY, String(timeline.viewport.trackHeadWidthPixels));
  });

  function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return (
      target.isContentEditable ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    );
  }

  /* Порівнюємо `code`, а не `key`: на кириличній розкладці `key` для клавіші Z
     дорівнює «я», і будь-яка перевірка по літері мовчки перестає працювати. */
  function onKeyDown(nativeEvent: KeyboardEvent): void {
    const typing = isTypingTarget(nativeEvent.target);

    if (nativeEvent.ctrlKey || nativeEvent.metaKey) {
      if (nativeEvent.code === "KeyZ" && !nativeEvent.shiftKey) {
        nativeEvent.preventDefault();
        timeline.undo();
        return;
      }
      if ((nativeEvent.code === "KeyZ" && nativeEvent.shiftKey) || nativeEvent.code === "KeyY") {
        nativeEvent.preventDefault();
        timeline.redo();
        return;
      }
      if (nativeEvent.code === "KeyS") {
        nativeEvent.preventDefault();
        /* Ctrl+S — «запиши зараз», а не «спитай, куди». Файл уже є, і рефлекс
           зберегтися не повинен щоразу відкривати діалог вибору шляху. */
        if (nativeEvent.shiftKey) void documentFile.saveAs();
        else void documentFile.saveNow();
        return;
      }
      if (nativeEvent.code === "KeyO") {
        nativeEvent.preventDefault();
        void documentFile.openDocument();
        return;
      }
      if (nativeEvent.code === "KeyW") {
        nativeEvent.preventDefault();
        /* `close`, а не `destroy`: закриття проходить через onCloseRequested,
           тобто через дозапис незбереженого. */
        void closeWindow();
        return;
      }
      return;
    }

    if (nativeEvent.code === "Escape") {
      /* У полі Escape означає «покинути поле», а не «зняти виділення»: інакше
         вихід з поля назви заразом закривав би панель, яку ти правиш. */
      if (typing) (nativeEvent.target as HTMLElement).blur();
      else timeline.selection.clearSelection();
      return;
    }
    if (typing) return;

    if (nativeEvent.code === "Equal" || nativeEvent.code === "NumpadAdd") {
      timeline.setScale(timeline.viewport.pixelsPerDay * ZOOM_KEY_STEP);
      return;
    }
    if (nativeEvent.code === "Minus" || nativeEvent.code === "NumpadSubtract") {
      timeline.setScale(timeline.viewport.pixelsPerDay / ZOOM_KEY_STEP);
      return;
    }
    if (nativeEvent.code === "Delete" || nativeEvent.code === "Backspace") {
      timeline.deleteSelection();
    }
  }
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="app" style:--track-head-width="{timeline.viewport.trackHeadWidthPixels}px">
  <Toolbar {theme} onToggleTheme={() => (theme = theme === "dark" ? "light" : "dark")} />

  <main>
    <TimelineCanvas />
    <Inspector />
  </main>

  {#if documentFile.message !== null}
    <div class="notice" role="alert">
      <pre>{documentFile.message}</pre>
      <button onclick={() => documentFile.clearMessage()}>Зрозуміло</button>
    </div>
  {/if}

  <footer>
    <span>{timeline.tracks.length} доріжок · {timeline.events.length} подій</span>
    <span class="spacer"></span>
    <span>масштаб {timeline.viewport.pixelsPerDay.toFixed(2)} px/день</span>
  </footer>
</div>

<style>
  /*
   * `min-width: 0` тут не косметика. Елемент сітки за замовчуванням не може
   * стиснутися вужче за свій вміст, а вміст тут — полотно завширшки в сотні
   * тисяч пікселів і шапка з нестисними кнопками. Без цього обидва рівні
   * розпирали макет, і бічна панель разом зі смугами прокрутки виїжджала за
   * межі вікна.
   */
  .app {
    height: 100%;
    width: 100%;
    min-width: 0;
    display: grid;
    grid-template-rows: auto 1fr auto auto;
    overflow: hidden;
  }

  main {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    min-width: 0;
    min-height: 0;
  }

  .notice {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 10px 12px;
    background: var(--color-panel);
    border-top: 1px solid var(--color-danger);
  }
  .notice pre {
    margin: 0;
    flex: 1;
    white-space: pre-wrap;
    font: inherit;
    color: var(--color-text);
  }
  .notice button {
    background: var(--color-panel-raised);
    border: 1px solid var(--color-line);
    border-radius: var(--radius);
    padding: 5px 10px;
  }

  footer {
    display: flex;
    align-items: center;
    gap: 16px;
    height: 26px;
    padding: 0 12px;
    background: var(--color-panel);
    border-top: 1px solid var(--color-line);
    font-size: var(--font-size-small);
    color: var(--color-text-muted);
  }
  .spacer {
    flex: 1;
  }
</style>
