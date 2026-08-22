<script lang="ts">
  import { createLabelMeasurer } from "../lib/layout/measure-text";
  import {
    blockRectangle,
    labelPosition,
    rowHeight,
    type RowGeometry,
  } from "../lib/layout/row-geometry";
  import { OVERLAP_MODE, planTrackLayout, type EventPlacement } from "../lib/layout/track-layout";
  import {
    EVENT_KIND,
    resolveEventColor,
    type Track,
  } from "../lib/model/timeline-document";
  import { formatDaySpan } from "../lib/time/day-number";
  import { timeline } from "../lib/timeline-view-model.svelte";

  interface Props {
    track: Track;
  }
  const { track }: Props = $props();

  /* Той самий шрифт, що й у `.label` нижче: міряти треба тим, чим малюємо. */
  const measureLabel = createLabelMeasurer('600 12px -apple-system, "Segoe UI", Inter, system-ui, sans-serif');

  const layout = $derived(
    planTrackLayout(timeline.eventsOfTrack(track.id), {
      pixelsPerDay: timeline.viewport.pixelsPerDay,
      overlapMode: timeline.viewport.overlapMode,
      measureLabelWidth: measureLabel,
    }),
  );
  const height = $derived(rowHeight(timeline.viewport.overlapMode, layout.laneCount, track.height));
  const isStacked = $derived(timeline.viewport.overlapMode === OVERLAP_MODE.Stack);

  const geometry = $derived<RowGeometry>({
    mode: timeline.viewport.overlapMode,
    domain: timeline.domain,
    pixelsPerDay: timeline.viewport.pixelsPerDay,
    trackHeight: height,
  });

  const rectangleOf = (placement: EventPlacement) => blockRectangle(placement, geometry);
  const labelOf = (placement: EventPlacement) => labelPosition(placement, geometry);
  const colourOf = (placement: EventPlacement) => resolveEventColor(placement.event, track);

  /** Що саме тягнуть за шапку. Іменований союз, не два прапорці. */
  const HEAD_GESTURE = {
    /** Нижній край — висота доріжки. */
    Height: "height",
    /** Держак ліворуч — місце доріжки серед інших. */
    Reorder: "reorder",
  } as const;
  type HeadGestureKind = (typeof HEAD_GESTURE)[keyof typeof HEAD_GESTURE];

  interface HeadGesture {
    kind: HeadGestureKind;
    startClientY: number;
    startHeight: number;
  }
  let gesture: HeadGesture | null = null;

  function beginHeadGesture(kind: HeadGestureKind, nativeEvent: PointerEvent): void {
    nativeEvent.preventDefault();
    nativeEvent.stopPropagation();
    gesture = { kind, startClientY: nativeEvent.clientY, startHeight: track.height };
    (nativeEvent.currentTarget as Element).setPointerCapture(nativeEvent.pointerId);
  }

  function onHeadPointerMove(nativeEvent: PointerEvent): void {
    const active = gesture;
    if (active === null) return;

    if (active.kind === HEAD_GESTURE.Height) {
      timeline.setTrackHeight(track.id, active.startHeight + (nativeEvent.clientY - active.startClientY));
      return;
    }
    const overIndex = trackIndexAtClientY(nativeEvent.clientY);
    if (overIndex >= 0) timeline.moveTrack(track.id, overIndex);
  }

  function endHeadGesture(): void {
    gesture = null;
  }

  /**
   * Яка доріжка під курсором. Читаємо прямокутники самих рядків, а не рахуємо
   * висоти: вони тепер у кожної доріжки свої, і повторювати цю арифметику тут
   * означало б завести їй друге, розбіжне джерело.
   */
  function trackIndexAtClientY(clientY: number): number {
    const rows = document.querySelectorAll("[data-track-id]");
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (row === undefined) continue;
      const box = row.getBoundingClientRect();
      if (clientY >= box.top && clientY <= box.bottom) return index;
    }
    return -1;
  }

  /** Shift по шапці додає доріжку до виділення або прибирає з нього. */
  function onHeadPointerDown(nativeEvent: PointerEvent): void {
    if (!nativeEvent.shiftKey) return;
    /* Інакше натискання поставило б курсор у поле назви замість виділення. */
    nativeEvent.preventDefault();
    timeline.selection.selectTrack(track.id, { add: true });
  }
  function focusAndSelect(element: HTMLInputElement): void {
    element.focus();
    element.select();
  }

  function commitRename(eventId: string, title: string): void {
    if (timeline.selection.renamingEventId !== eventId) return;
    timeline.selection.stopRenaming();
    const trimmed = title.trim();
    const current = timeline.events.find((candidate) => candidate.id === eventId);
    if (!current || current.title === trimmed) return;
    timeline.beginChange();
    timeline.updateEvent(eventId, { title: trimmed });
  }

  function onRenameKeyDown(nativeEvent: KeyboardEvent & { currentTarget: HTMLInputElement }): void {
    /* Enter підтверджує, Escape відкидає — обидва через `blur`, щоб шлях
       завершення був один. */
    if (nativeEvent.code === "Enter" || nativeEvent.code === "NumpadEnter") {
      nativeEvent.currentTarget.blur();
    } else if (nativeEvent.code === "Escape") {
      timeline.selection.stopRenaming();
    }
  }

  const tooltipOf = (placement: EventPlacement) =>
    `${placement.event.title}\n${
      placement.event.kind === EVENT_KIND.Point
        ? "точкова подія"
        : formatDaySpan(placement.startDay, placement.endDay)
    }${placement.event.note ? `\n\n${placement.event.note}` : ""}`;
</script>

<div class="row" style:height="{height}px" data-track-id={track.id}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="head"
    class:selected={timeline.selection.isTrackSelected(track.id)}
    title="Подвійний клік — властивості доріжки, Shift+клік — виділити"
    onpointerdown={onHeadPointerDown}
    ondblclick={() => timeline.selection.selectTrack(track.id)}
  >
    <!-- Держак: смужка кольору доріжки й нею ж тягнемо порядок. Курсор і
         крапки кажуть, що це ручка, а не просто позначка. -->
    <span
      class="stripe"
      style:--track-colour={track.color}
      title="Тягнути — змінити місце доріжки"
      onpointerdown={(nativeEvent) => beginHeadGesture(HEAD_GESTURE.Reorder, nativeEvent)}
      onpointermove={onHeadPointerMove}
      onpointerup={endHeadGesture}
      onpointercancel={endHeadGesture}
      role="button"
      tabindex="-1"
      aria-label="Змінити місце доріжки"
    ></span>
    <input
      class="name"
      value={track.name}
      aria-label="Назва доріжки"
      onchange={(nativeEvent) => {
        timeline.beginChange();
        timeline.updateTrack(track.id, { name: nativeEvent.currentTarget.value.trim() || "Доріжка" });
      }}
    />
    <span class="count">{layout.placements.length}</span>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="height-grip"
      title="Тягнути — висота доріжки"
      onpointerdown={(nativeEvent) => beginHeadGesture(HEAD_GESTURE.Height, nativeEvent)}
      onpointermove={onHeadPointerMove}
      onpointerup={endHeadGesture}
      onpointercancel={endHeadGesture}
    ></div>
  </div>

  <div class="body" style:width="{timeline.canvasWidthPixels}px" data-track-body={track.id}>
    {#each layout.placements as placement (placement.event.id)}
      {@const rectangle = rectangleOf(placement)}
      <div
        class="event"
        class:point={placement.event.kind === EVENT_KIND.Point}
        class:selected={timeline.selection.isEventSelected(placement.event.id)}
        data-event-id={placement.event.id}
        title={tooltipOf(placement)}
        style:--event-colour={colourOf(placement)}
        style:left="{rectangle.left}px"
        style:top="{rectangle.top}px"
        style:width="{rectangle.width}px"
        style:height="{rectangle.height}px"
      >
        <div class="fill"></div>
        {#if placement.event.kind !== EVENT_KIND.Point}
          <div class="edge start" data-resize="start"></div>
          <div class="edge end" data-resize="end"></div>
        {/if}
      </div>
    {/each}

    <!-- Підписи окремим шаром: так назва ніколи не ховається під сусідньою
         заливкою і може виходити за правий край свого блока. -->
    {#each layout.placements as placement (placement.event.id)}
      {@const position = labelOf(placement)}
      {@const renaming = timeline.selection.renamingEventId === placement.event.id}
      {#if renaming}
        <!-- Поле перейменування показуємо завжди, навіть коли підпис не влазив:
             інакше найвужчі події неможливо було б перейменувати з полотна. -->
        <input
          class="rename"
          class:stacked={isStacked}
          style:left="{position.left}px"
          style:top="{position.top}px"
          value={placement.event.title}
          aria-label="Назва події"
          onblur={(nativeEvent) => commitRename(placement.event.id, nativeEvent.currentTarget.value)}
          onkeydown={onRenameKeyDown}
          {@attach focusAndSelect}
        />
      {:else if placement.showLabel}
        <div
          class="label"
          class:stacked={isStacked}
          style:left="{position.left}px"
          style:top="{position.top}px"
        >
          {placement.event.title}
        </div>
      {/if}
    {/each}
  </div>
</div>

<style>
  .row {
    display: flex;
    border-bottom: 1px solid var(--color-line-soft);
    position: relative;
  }

  .head {
    position: sticky;
    left: 0;
    z-index: 3;
    flex: 0 0 var(--track-head-width);
    width: var(--track-head-width);
    background: var(--color-panel);
    border-right: 1px solid var(--color-line);
    display: flex;
    align-items: center;
    gap: 6px;
    padding-right: 6px;
    cursor: default;
  }

  .head.selected {
    background: var(--color-panel-raised);
    box-shadow: inset 2px 0 0 var(--color-accent);
  }

  /* Смужка кольору — вона ж держак перестановки. Дві ролі на одному елементі
     навмисно: окрема ручка з'їла б ширину колонки, яку й так тягнуть вужче. */
  .stripe {
    position: relative;
    width: 8px;
    align-self: stretch;
    margin-right: 4px;
    background: var(--track-colour);
    cursor: grab;
    touch-action: none;
  }

  .stripe:active {
    cursor: grabbing;
  }

  /* Крапки проступають на наведенні: до того смужка читається як позначка
     кольору, і зайвий шум у спокої їй не потрібен. */
  .stripe::after {
    content: "";
    position: absolute;
    inset: 50% 2px auto;
    height: 14px;
    translate: 0 -50%;
    opacity: 0;
    background-image: radial-gradient(currentColor 1px, transparent 1.2px);
    background-size: 4px 4px;
    color: var(--color-panel);
  }

  .head:hover .stripe::after {
    opacity: 0.9;
  }

  /* Нижній край шапки тягне висоту. Зона влучання ширша за смугу, інакше в неї
     треба цілитись пікселем. */
  .height-grip {
    position: absolute;
    left: 0;
    right: 0;
    bottom: -3px;
    height: 7px;
    z-index: 4;
    cursor: ns-resize;
    touch-action: none;
  }

  .height-grip::after {
    content: "";
    position: absolute;
    inset: 3px 0 auto;
    height: 2px;
    background: var(--color-accent);
    opacity: 0;
  }

  .height-grip:hover::after {
    opacity: 0.7;
  }

  .name {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 3px;
    padding: 3px 5px;
    font-weight: 500;
  }
  .name:hover {
    background: var(--color-panel-raised);
  }
  .name:focus {
    background: var(--color-panel-raised);
    border-color: var(--color-accent);
    outline: none;
  }

  .count {
    color: var(--color-text-muted);
    font-size: var(--font-size-label);
  }


  .body {
    position: relative;
    flex: 0 0 auto;
    /* Тримає режим змішування всередині рядка: інакше заливки змішувалися б із
       сусідніми доріжками й тлом сторінки. */
    isolation: isolate;
    cursor: crosshair;
  }

  .event {
    position: absolute;
    border-radius: var(--radius);
    cursor: grab;
  }

  .fill {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: var(--event-colour);
    border: 1px solid var(--event-colour);
    opacity: var(--event-fill-opacity);
    mix-blend-mode: var(--event-blend-mode);
  }

  /* Точкова подія: шпилька — риска через увесь підрівень із кружечком угорі.
     Геометрія, а не гліф і не емодзі: так вона однакова на кожній машині й не
     розмивається на дрібних розмірах. Заливка тут непрозора й без змішування —
     мить не має «густішати» від накладання, вона або є, або ні. */
  .event.point .fill {
    left: 50%;
    right: auto;
    width: 2px;
    translate: -1px 0;
    border: 0;
    border-radius: 0;
    opacity: 0.95;
    mix-blend-mode: normal;
  }

  .event.point .fill::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 50%;
    translate: -50% 0;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--event-colour);
    box-shadow: 0 0 0 2px var(--color-panel);
  }

  .event.selected {
    box-shadow:
      0 0 0 1.5px var(--color-accent),
      var(--shadow-lifted);
    z-index: 4;
  }

  /* Обвідка виділення йде по самій шпильці, а не по її прямокутній обгортці —
     інакше навколо тонкої риски з'являється широка рамка. */
  .event.point.selected {
    box-shadow: none;
  }
  .event.point.selected .fill {
    box-shadow: 0 0 0 1.5px var(--color-accent);
  }
  .event.point.selected .fill::after {
    box-shadow:
      0 0 0 2px var(--color-panel),
      0 0 0 3.5px var(--color-accent);
  }

  /* Широка зона захоплення, щоб не доводилось цілитись. `min(…, 35%)` не дає
     двом краям з'їсти вузький блок цілком і забрати в нього перетягування. */
  .edge {
    position: absolute;
    top: 0;
    bottom: 0;
    width: min(16px, 35%);
    z-index: 2;
    cursor: ew-resize;
  }
  .edge.start {
    left: -5px;
  }
  .edge.end {
    right: -5px;
  }
  /* Вусик тримається ЗОВНІШНЬОГО боку своєї зони, а не її початку: зона широка
     заради влучання, і якби вусик рахувався від лівого краю зони, правий
     малювався б на всю її ширину всередині блока. */
  .event:hover .edge::before {
    content: "";
    position: absolute;
    top: 20%;
    bottom: 20%;
    width: 2px;
    border-radius: 2px;
    background: var(--event-colour);
  }
  .event:hover .edge.start::before {
    left: 3px;
  }
  .event:hover .edge.end::before {
    right: 3px;
  }

  .label {
    position: absolute;
    z-index: 5;
    pointer-events: none;
    white-space: nowrap;
    font-weight: 600;
    font-size: var(--font-size-medium);
    line-height: 15px;
    /* Тінь кольором тла: підпис лишається читабельним і над заливкою, і над сіткою. */
    text-shadow: 0 1px 2px var(--color-bg);
  }
  .label.stacked {
    line-height: 24px;
  }

  .rename {
    position: absolute;
    z-index: 7;
    width: 180px;
    padding: 1px 5px;
    font-weight: 600;
    font-size: var(--font-size-medium);
    line-height: 15px;
    background: var(--color-panel);
    border: 1px solid var(--color-accent);
    border-radius: 3px;
    outline: none;
  }
  .rename.stacked {
    line-height: 20px;
  }
</style>
