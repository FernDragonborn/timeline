<script lang="ts">
  import { OVERLAP_MODE } from "../lib/layout/track-layout";
  import { isoToDayNumber } from "../lib/time/day-number";
  import { RULER_TIER_LABEL } from "../lib/time/ruler";
  import { documentFile, SAVE_STATUS } from "../lib/storage/document-file-controller.svelte";
  import { timeline } from "../lib/timeline-view-model.svelte";
  import { scaleToSlider, SLIDER_MAX, sliderToScale } from "../lib/view/timeline-viewport";

  interface Props {
    theme: "dark" | "light";
    onToggleTheme: () => void;
  }
  const { theme, onToggleTheme }: Props = $props();

  const SAVE_LABEL: Record<string, string> = {
    [SAVE_STATUS.Saved]: "збережено",
    [SAVE_STATUS.Pending]: "зміни…",
    [SAVE_STATUS.Saving]: "запис…",
    [SAVE_STATUS.Failed]: "не збережено",
  };
</script>

<header class="toolbar">
  <div class="brand">
    <b>Timeline</b>
    <span class="file" title={documentFile.path ?? ""}>{documentFile.fileName}</span>
    <span class="status" class:failed={documentFile.status === SAVE_STATUS.Failed}>
      {SAVE_LABEL[documentFile.status]}
    </span>
  </div>

  <div class="divider"></div>

  <div class="group">
    <button onclick={() => void documentFile.newDocument()}>Новий</button>
    <button onclick={() => void documentFile.openDocument()}>Відкрити…</button>
    <button onclick={() => void documentFile.saveAs()}>Зберегти як…</button>
  </div>

  <div class="divider"></div>

  <div class="group">
    <button disabled={!timeline.canUndo} title="Ctrl+Z" onclick={() => timeline.undo()}>Відкат</button>
    <button disabled={!timeline.canRedo} title="Ctrl+Y" onclick={() => timeline.redo()}>Повтор</button>
  </div>

  <div class="divider"></div>

  <label class="zoom">
    <span>Масштаб</span>
    <input
      type="range"
      min="0"
      max={SLIDER_MAX}
      value={scaleToSlider(timeline.pixelsPerDay)}
      oninput={(nativeEvent) => timeline.setScale(sliderToScale(Number(nativeEvent.currentTarget.value)))}
    />
    <span class="tier">{RULER_TIER_LABEL[timeline.rulerTier]}</span>
  </label>

  <div class="segmented">
    <button
      aria-pressed={timeline.overlapMode === OVERLAP_MODE.Overlay}
      onclick={() => timeline.setOverlapMode(OVERLAP_MODE.Overlay)}>Прозоро</button
    >
    <button
      aria-pressed={timeline.overlapMode === OVERLAP_MODE.Stack}
      onclick={() => timeline.setOverlapMode(OVERLAP_MODE.Stack)}>Стек</button
    >
  </div>

  <div class="spacer"></div>

  <label class="goto">
    <span>Перейти до</span>
    <input
      type="date"
      title="Будь-яка дата — шкала розсунеться до неї"
      onchange={(nativeEvent) => {
        const value = nativeEvent.currentTarget.value;
        if (value) timeline.requestScrollTo(isoToDayNumber(value));
      }}
    />
  </label>
  <button onclick={() => timeline.goToToday()}>Сьогодні</button>
  <button onclick={onToggleTheme}>{theme === "dark" ? "Світла" : "Темна"}</button>
</header>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 46px;
    padding: 0 12px;
    background: var(--color-panel);
    border-bottom: 1px solid var(--color-line);
    /* Кнопки не стискаються (див. нижче), тож у вузькому вікні шапка має
       прокручуватись, а не розсовувати весь застосунок. */
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
  }

  /* Ніщо в шапці не стискається: інакше у вузькому вікні кнопки схлопуються
     в нуль і наїжджають одна на одну. Ужимається лише розпірка. */
  .toolbar > * {
    flex: none;
  }

  .spacer {
    flex: 1 1 auto;
    min-width: 8px;
  }

  .brand {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .brand b {
    font-weight: 600;
  }
  .file {
    font-size: var(--font-size-small);
    color: var(--color-text-muted);
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .status {
    font-size: var(--font-size-label);
    text-transform: uppercase;
    letter-spacing: var(--tracking-label);
    color: var(--color-text-muted);
  }
  .status.failed {
    color: var(--color-danger);
  }

  .divider {
    width: 1px;
    height: 20px;
    background: var(--color-line);
  }

  .group {
    display: flex;
    gap: 6px;
  }

  button {
    background: var(--color-panel-raised);
    border: 1px solid var(--color-line);
    border-radius: var(--radius);
    padding: 5px 10px;
    white-space: nowrap;
  }
  button:hover:not(:disabled) {
    border-color: var(--color-text-muted);
  }
  button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .zoom,
  .goto {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .zoom > span:first-child,
  .goto > span {
    font-size: var(--font-size-small);
    text-transform: uppercase;
    letter-spacing: var(--tracking-label);
    color: var(--color-text-muted);
  }
  .zoom input {
    width: 130px;
    accent-color: var(--color-accent);
  }
  .tier {
    min-width: 56px;
    font-size: var(--font-size-small);
    color: var(--color-text-muted);
  }

  .goto input {
    background: var(--color-panel-raised);
    border: 1px solid var(--color-line);
    border-radius: var(--radius);
    padding: 4px 7px;
    cursor: pointer;
  }

  .segmented {
    display: inline-flex;
    padding: 2px;
    background: var(--color-panel-raised);
    border: 1px solid var(--color-line);
    border-radius: var(--radius);
  }
  .segmented button {
    background: transparent;
    border: 0;
    border-radius: 3px;
    padding: 3px 10px;
    color: var(--color-text-muted);
  }
  .segmented button[aria-pressed="true"] {
    background: var(--color-accent);
    color: var(--color-accent-contrast);
    font-weight: 500;
  }
</style>
