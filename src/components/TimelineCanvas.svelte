<script lang="ts">
  import { onMount, tick, untrack } from "svelte";
  import Ruler from "./Ruler.svelte";
  import TimeGrid from "./TimeGrid.svelte";
  import TrackRow from "./TrackRow.svelte";
  import { TRACK_HEAD_WIDTH_PIXELS } from "../lib/layout/row-geometry";
  import { EVENT_KIND } from "../lib/model/timeline-document";
  import { isoToDayNumber, type DayNumber } from "../lib/time/day-number";
  import { snapKindForTier, snapToPeriodEnd, snapToPeriodStart } from "../lib/time/ruler";
  import { DRAG_KIND, timeline } from "../lib/timeline-view-model.svelte";
  import { dayToPixel, pixelToDay, ZOOM_WHEEL_BASE } from "../lib/view/timeline-viewport";

  /** Ширина блока, який дає подвійний клік, — стала в пікселях, не в днях. */
  const QUICK_EVENT_PIXELS = 90;

  /**
   * Далі якого зсуву натискання вважається перетягуванням, а не кліком.
   * Кілька пікселів дрижання руки на подвійному кліку — це нормально.
   */
  const DRAG_THRESHOLD_PIXELS = 4;

  let scroller: HTMLDivElement;
  let pointerStartX = 0;
  let pointerMoved = false;
  /**
   * `dblclick` приходить ПІСЛЯ `pointerup`, тож «подвійний клік і потяг»
   * встигав створити дві події: одну від перетягування, другу — швидку, вже на
   * тому рядку, де рух закінчився. Прапорець гасить другу.
   */
  let suppressDoubleClick = false;
  let creation = $state<{ trackId: string; anchorDay: DayNumber; currentDay: DayNumber } | null>(null);

  function dayAtClientX(bodyElement: Element, clientX: number): DayNumber {
    const rectangle = bodyElement.getBoundingClientRect();
    const day = Math.round(
      pixelToDay(timeline.domain, timeline.pixelsPerDay, clientX - rectangle.left),
    );
    /* Полотно ширше за домен, коли вікно більше за шкалу; без обмеження клік по
       порожньому місцю праворуч створював би подію за межами документа. */
    return Math.min(timeline.domain.toDay, Math.max(timeline.domain.fromDay, day));
  }

  function bodyOfRow(row: Element): Element | null {
    return row.querySelector("[data-track-body]");
  }

  function rowAt(clientX: number, clientY: number): Element | null {
    return document.elementFromPoint(clientX, clientY)?.closest("[data-track-id]") ?? null;
  }

  function onPointerDown(nativeEvent: PointerEvent): void {
    /* Скидаємо ПЕРЕД будь-яким виходом: інакше натискання повз полотно лишало б
       прапорці від попереднього жесту, і наступний подвійний клік з'їдався б. */
    pointerStartX = nativeEvent.clientX;
    pointerMoved = false;
    suppressDoubleClick = false;

    const row = (nativeEvent.target as Element).closest("[data-track-id]");
    if (row === null) return;
    /* Клік по назві доріжки — не робота з полотном. */
    if ((nativeEvent.target as Element).closest("[data-track-body]") === null) return;

    const body = bodyOfRow(row);
    const trackId = row.getAttribute("data-track-id");
    if (body === null || trackId === null) return;

    const eventElement = (nativeEvent.target as Element).closest("[data-event-id]");

    if (eventElement !== null) {
      const eventId = eventElement.getAttribute("data-event-id");
      const model = timeline.events.find((candidate) => candidate.id === eventId);
      if (!model) return;
      timeline.selectEvent(model.id);

      const resizeSide = (nativeEvent.target as Element).closest("[data-resize]")?.getAttribute("data-resize");
      timeline.beginDrag({
        kind:
          resizeSide === "start"
            ? DRAG_KIND.ResizeStart
            : resizeSide === "end"
              ? DRAG_KIND.ResizeEnd
              : DRAG_KIND.Move,
        eventId: model.id,
        originalStartDay: isoToDayNumber(model.start),
        originalEndDay: isoToDayNumber(model.end),
      });
    } else {
      const anchorDay = dayAtClientX(body, nativeEvent.clientX);
      timeline.clearSelection();
      creation = { trackId, anchorDay, currentDay: anchorDay };
    }
    scroller.setPointerCapture(nativeEvent.pointerId);
  }

  function onPointerMove(nativeEvent: PointerEvent): void {
    /* Рух рахується лише всередині жесту: просте водіння мишею по полотну не
       має вважатися перетягуванням. */
    const gestureActive = creation !== null || timeline.drag !== null;
    if (gestureActive && Math.abs(nativeEvent.clientX - pointerStartX) > DRAG_THRESHOLD_PIXELS) {
      pointerMoved = true;
    }

    if (creation !== null) {
      const row = document.querySelector(`[data-track-id="${creation.trackId}"]`);
      const body = row === null ? null : bodyOfRow(row);
      if (body !== null) creation = { ...creation, currentDay: dayAtClientX(body, nativeEvent.clientX) };
      return;
    }
    if (timeline.drag === null) return;

    const dayOffset = Math.round((nativeEvent.clientX - pointerStartX) / timeline.pixelsPerDay);
    const overRow = rowAt(nativeEvent.clientX, nativeEvent.clientY);
    timeline.dragBy(dayOffset, overRow?.getAttribute("data-track-id") ?? null);
  }

  /**
   * Межі майбутньої події, притягнуті до поділок поточного масштабу. Малюючи по
   * місяцях, людина й хоче «весь березень», а не «з 3 по 29» — ловити піксель
   * заради рівної дати нікому не треба.
   */
  function snappedCreationRange(anchorDay: DayNumber, currentDay: DayNumber): {
    startDay: DayNumber;
    endDay: DayNumber;
  } {
    const kind = snapKindForTier(timeline.rulerTier);
    return {
      startDay: snapToPeriodStart(Math.min(anchorDay, currentDay), kind),
      endDay: snapToPeriodEnd(Math.max(anchorDay, currentDay), kind),
    };
  }

  function onPointerUp(): void {
    suppressDoubleClick = pointerMoved;

    if (creation !== null) {
      const { trackId, anchorDay, currentDay } = creation;
      creation = null;
      if (anchorDay !== currentDay) {
        const range = snappedCreationRange(anchorDay, currentDay);
        const created = timeline.addEvent(trackId, range.startDay, range.endDay, EVENT_KIND.Span);
        timeline.startRenaming(created.id);
      }
      return;
    }
    timeline.endDrag();
  }

  function onDoubleClick(nativeEvent: MouseEvent): void {
    /* Перетягування вже все зробило — швидке створення тут було б другою,
       непроханою подією. */
    if (suppressDoubleClick) {
      suppressDoubleClick = false;
      return;
    }

    /* Ціль беремо з координат, а не з `event.target`: захоплення вказівника на
       попередньому натисканні перенаправляє наступні події на елемент
       прокрутки, і подвійний клік переставав щось створювати. */
    const under = document.elementFromPoint(nativeEvent.clientX, nativeEvent.clientY);
    const row = under?.closest("[data-track-id]") ?? null;
    if (row === null) return;
    /* Ліва колонка з назвами — не полотно: там подвійний клік відкриває
       властивості доріжки, і створювати подію заразом не можна. */
    if (under?.closest("[data-track-body]") == null) return;

    /* По готовій події подвійний клік — це «перейменувати», а не «створити». */
    const existingId = under?.closest("[data-event-id]")?.getAttribute("data-event-id");
    if (existingId != null) {
      timeline.startRenaming(existingId);
      return;
    }

    const body = bodyOfRow(row);
    const trackId = row.getAttribute("data-track-id");
    if (body === null || trackId === null) return;

    /* Прилипання те саме, що й у перетягуванні: спосіб створення не має
       міняти те, на які дати подія сяде. */
    const kind = snapKindForTier(timeline.rulerTier);
    const day = snapToPeriodStart(dayAtClientX(body, nativeEvent.clientX), kind);

    /* Alt робить точкову подію: те саме місце, інший рід. */
    if (nativeEvent.altKey) {
      const created = timeline.addEvent(trackId, day, day, EVENT_KIND.Point);
      timeline.startRenaming(created.id);
      return;
    }
    const span = Math.max(1, Math.round(QUICK_EVENT_PIXELS / timeline.pixelsPerDay));
    const created = timeline.addEvent(
      trackId,
      day,
      snapToPeriodEnd(day + span - 1, kind),
      EVENT_KIND.Span,
    );
    timeline.startRenaming(created.id);
  }

  function onWheel(nativeEvent: WheelEvent): void {
    if (!nativeEvent.ctrlKey) return;
    nativeEvent.preventDefault();

    const viewportX = nativeEvent.clientX - scroller.getBoundingClientRect().left;
    const bodyPixel = scroller.scrollLeft + viewportX - TRACK_HEAD_WIDTH_PIXELS;
    const anchorDay = pixelToDay(timeline.domain, timeline.pixelsPerDay, bodyPixel);

    /* deltaMode 1 — «рядки» замість пікселів: без множника зум там ледь повзе. */
    const delta = nativeEvent.deltaY * (nativeEvent.deltaMode === 1 ? 33 : 1);
    timeline.setScale(timeline.pixelsPerDay * Math.pow(ZOOM_WHEEL_BASE, -delta), {
      day: anchorDay,
      viewportPixel: viewportX,
    });
  }

  function reportScroll(): void {
    timeline.reportScroll(scroller.scrollLeft - TRACK_HEAD_WIDTH_PIXELS, scroller.clientWidth);
  }

  let scrollScheduled = false;
  function onScroll(): void {
    if (scrollScheduled) return;
    scrollScheduled = true;
    requestAnimationFrame(() => {
      scrollScheduled = false;
      reportScroll();
    });
  }

  /* Прохання «показати цей день» приходить із моделі; виконує його той, хто
     володіє елементом прокрутки, тобто цей компонент. Єдина залежність —
     лічильник прохань; сам день читається без підписки. */
  $effect(() => {
    if (timeline.scrollRequestId === 0) return;
    const target = untrack(() => ({
      day: timeline.scrollTargetDay,
      viewportPixel: timeline.scrollTargetViewportPixel,
    }));
    void (async () => {
      await tick();
      scroller.scrollLeft =
        dayToPixel(timeline.domain, timeline.pixelsPerDay, target.day) +
        TRACK_HEAD_WIDTH_PIXELS -
        target.viewportPixel;
      reportScroll();
    })();
  });

  /* Перший вимір розмірів: далі їх оновлює обробник прокрутки. */
  onMount(() => {
    reportScroll();
  });

  /* Прев'ю показує вже притягнуті межі: рамка не має брехати про те, що вийде
     після відпускання кнопки. */
  const previewRange = $derived(
    creation === null ? null : snappedCreationRange(creation.anchorDay, creation.currentDay),
  );
  const previewLeft = $derived(
    previewRange === null
      ? 0
      : dayToPixel(timeline.domain, timeline.pixelsPerDay, previewRange.startDay),
  );
  const previewWidth = $derived(
    previewRange === null
      ? 0
      : Math.max(2, (previewRange.endDay - previewRange.startDay + 1) * timeline.pixelsPerDay),
  );
</script>

<svelte:window onpointerup={onPointerUp} />

<div
  class="scroller"
  bind:this={scroller}
  onscroll={onScroll}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  ondblclick={onDoubleClick}
  onwheel={onWheel}
  role="application"
  aria-label="Часова шкала"
>
  <div class="canvas" style:width="{TRACK_HEAD_WIDTH_PIXELS + timeline.canvasWidthPixels}px">
    <div class="ruler-row">
      <div class="ruler-corner">Доріжки</div>
      <Ruler />
    </div>

    <div class="rows">
      <TimeGrid />
      {#each timeline.tracks as track (track.id)}
        <TrackRow {track} />
      {/each}
      {#if creation !== null}
        <div class="creation-preview" style:left="{previewLeft}px" style:width="{previewWidth}px"></div>
      {/if}
    </div>

    <div class="add-track">
      <button onclick={() => timeline.addTrack()}>+ доріжка</button>
    </div>
  </div>
</div>

<style>
  .scroller {
    overflow: auto;
    position: relative;
    min-width: 0;
    /* Подвійний клік тут створює подію, а не виділяє текст підпису. */
    user-select: none;
  }

  .canvas {
    position: relative;
    min-width: 100%;
  }

  .ruler-row {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    height: var(--ruler-height);
    background: var(--color-panel);
    border-bottom: 1px solid var(--color-line);
  }

  .ruler-corner {
    position: sticky;
    left: 0;
    z-index: 2;
    flex: 0 0 var(--track-head-width);
    width: var(--track-head-width);
    background: var(--color-panel);
    border-right: 1px solid var(--color-line);
    display: flex;
    align-items: flex-end;
    padding: 0 10px 5px;
    font-size: var(--font-size-label);
    text-transform: uppercase;
    letter-spacing: var(--tracking-label);
    color: var(--color-text-muted);
  }

  .rows {
    position: relative;
  }

  /* Не називати це `.ghost`: узагальнене ім'я рано чи пізно означатиме дві
     різні речі, і абсолютне позиціювання поїде на чужий елемент. */
  .creation-preview {
    position: absolute;
    top: 0;
    bottom: 0;
    margin-left: var(--track-head-width);
    border: 1px dashed var(--color-accent);
    background: color-mix(in srgb, var(--color-accent) 14%, transparent);
    pointer-events: none;
    z-index: 6;
  }

  .add-track {
    position: sticky;
    left: 0;
    width: var(--track-head-width);
    padding: 6px 0 6px 12px;
  }

  .add-track button {
    width: 100%;
    background: transparent;
    border: 1px dashed var(--color-line);
    border-radius: var(--radius);
    color: var(--color-text-muted);
    padding: 4px 10px;
  }
  .add-track button:hover {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }
</style>
