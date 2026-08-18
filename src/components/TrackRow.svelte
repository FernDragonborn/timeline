<script lang="ts">
  import { createLabelMeasurer } from "../lib/layout/measure-text";
  import { blockRectangle, labelPosition, rowHeight } from "../lib/layout/row-geometry";
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
      pixelsPerDay: timeline.pixelsPerDay,
      overlapMode: timeline.overlapMode,
      measureLabelWidth: measureLabel,
    }),
  );
  const height = $derived(rowHeight(timeline.overlapMode, layout.laneCount));
  const isStacked = $derived(timeline.overlapMode === OVERLAP_MODE.Stack);

  const rectangleOf = (placement: EventPlacement) =>
    blockRectangle(placement, timeline.overlapMode, timeline.domain, timeline.pixelsPerDay);
  const labelOf = (placement: EventPlacement) =>
    labelPosition(placement, timeline.overlapMode, timeline.domain, timeline.pixelsPerDay);
  const colourOf = (placement: EventPlacement) => resolveEventColor(placement.event, track);
  function focusAndSelect(element: HTMLInputElement): void {
    element.focus();
    element.select();
  }

  function commitRename(eventId: string, title: string): void {
    if (timeline.renamingEventId !== eventId) return;
    timeline.stopRenaming();
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
      timeline.stopRenaming();
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
    class:selected={timeline.selectedTrack?.id === track.id}
    title="Подвійний клік — властивості доріжки"
    ondblclick={() => timeline.selectTrack(track.id)}
  >
    <span class="stripe" style:--track-colour={track.color}></span>
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
  </div>

  <div class="body" style:width="{timeline.canvasWidthPixels}px" data-track-body={track.id}>
    {#each layout.placements as placement (placement.event.id)}
      {@const rectangle = rectangleOf(placement)}
      <div
        class="event"
        class:point={placement.event.kind === EVENT_KIND.Point}
        class:selected={timeline.selectedEvent?.id === placement.event.id}
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
      {@const renaming = timeline.renamingEventId === placement.event.id}
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

  .stripe {
    width: 4px;
    align-self: stretch;
    margin-right: 4px;
    background: var(--track-colour);
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
      0 4px 14px rgba(0, 0, 0, 0.35);
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
    font-size: 12px;
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
    font-size: 12px;
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
