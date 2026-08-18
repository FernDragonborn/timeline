<script lang="ts">
  import { formatDaySpan, isoToDayNumber } from "../lib/time/day-number";
  import { timeline } from "../lib/timeline-view-model.svelte";
  import DateField from "./DateField.svelte";

  const bounds = $derived(timeline.document.bounds);

  function setStart(start: string): void {
    if (bounds === null || !start) return;
    timeline.setBounds({ start, end: start > bounds.end ? start : bounds.end });
  }

  function setEnd(end: string): void {
    if (bounds === null || !end) return;
    timeline.setBounds({ start: end < bounds.start ? end : bounds.start, end });
  }
</script>

<div class="insp-title">Документ</div>

<div class="insp-field">
  <span>Тривалість шкали</span>
  <div class="insp-segmented">
    <button
      aria-pressed={bounds === null}
      onclick={() => timeline.setBounds(null)}>Без меж</button
    >
    <button
      aria-pressed={bounds !== null}
      onclick={() => timeline.setBounds(timeline.suggestedBounds())}>Задати</button
    >
  </div>
</div>

{#if bounds === null}
  <p class="insp-meta">
    Шкала охоплює сто років у кожен бік від сьогодні. Дати поза цим досяжні полем
    <b>Перейти до</b> у шапці.
  </p>
{:else}
  <div class="insp-two">
    <div class="insp-field">
      <span>Початок</span>
      <DateField
        value={bounds.start}
        title="День, місяць, рік. Приймає і 20.03.2026, і 2026-03-20"
        onCommit={setStart}
      />
    </div>
    <div class="insp-field">
      <span>Кінець</span>
      <DateField
        value={bounds.end}
        title="День, місяць, рік. Приймає і 20.03.2026, і 2026-03-20"
        onCommit={setEnd}
      />
    </div>
  </div>
  <p class="insp-meta">
    {formatDaySpan(isoToDayNumber(bounds.start), isoToDayNumber(bounds.end))}<br />
    Прокрутка не виходить за ці межі, і вони зберігаються у файлі разом з подіями.
  </p>
{/if}

<div class="hint">
  <p>
    На кожній доріжці — скільки завгодно подій, і вони <b>можуть перетинатися в часі</b>. Саме цього
    немає в діаграмі Ганта.
  </p>
  <p>
    <kbd>протягнути</kbd> по доріжці — нова подія, межі прилипають до поділок<br />
    <kbd>2× клік</kbd> — подія і одразу її назва<br />
    <kbd>Alt</kbd> + <kbd>2× клік</kbd> — точкова подія<br />
    <kbd>2× клік</kbd> по події — перейменувати<br />
    <kbd>2× клік</kbd> по назві доріжки — її властивості<br />
    <kbd>тягнути край</kbd> — змінити дати<br />
    <kbd>тягнути тіло</kbd> — зсунути, зокрема на іншу доріжку<br />
    <kbd>колесо</kbd> — вздовж часу, з <kbd>Shift</kbd> — впоперек<br />
    <kbd>Ctrl</kbd> + колесо або <kbd>+</kbd>/<kbd>−</kbd> — масштаб<br />
    <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd> — відкат і повтор<br />
    <kbd>Ctrl</kbd>+<kbd>S</kbd> — записати одразу, <kbd>Ctrl</kbd>+<kbd>W</kbd> — закрити вікно<br />
    <kbd>Del</kbd> — видалити
  </p>
</div>

<style>
  .hint {
    font-size: 12px;
    line-height: 1.7;
    color: var(--color-text-muted);
  }

  .hint kbd {
    background: var(--color-panel-raised);
    border: 1px solid var(--color-line);
    border-bottom-width: 2px;
    border-radius: 4px;
    padding: 0 5px;
    font: inherit;
    font-size: var(--font-size-small);
    color: var(--color-text);
  }
</style>
