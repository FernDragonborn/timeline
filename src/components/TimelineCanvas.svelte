<script lang="ts">
  import { onMount, tick, untrack } from "svelte";
  import Ruler from "./Ruler.svelte";
  import TimeGrid from "./TimeGrid.svelte";
  import TrackRow from "./TrackRow.svelte";
  import { EVENT_KIND } from "../lib/model/timeline-document";
  import { type DayNumber } from "../lib/time/day-number";
  import { snapKindForTier, snapToPeriodEnd, snapToPeriodStart } from "../lib/time/ruler";
  import { DRAG_KIND } from "../lib/drag-session";
  import { timeline } from "../lib/timeline-view-model.svelte";
  import { dayToPixel, pixelToDay, ZOOM_WHEEL_BASE } from "../lib/view/timeline-viewport";

  /** Ширина блока, який дає подвійний клік, — стала в пікселях, не в днях. */
  const QUICK_EVENT_PIXELS = 90;

  /**
   * Далі якого зсуву натискання вважається перетягуванням, а не кліком.
   * Кілька пікселів дрижання руки на подвійному кліку — це нормально.
   */
  const DRAG_THRESHOLD_PIXELS = 4;

  /** `WheelEvent.deltaMode`, коли крок міряється рядками, а не пікселями. */
  const WHEEL_DELTA_LINE = 1;
  /** У скільки пікселів рахувати такий рядок. */
  const WHEEL_LINE_PIXELS = 33;

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

  /** Рамка виділення, у координатах вікна — саме в них лежать прямокутники подій. */
  interface MarqueeBox {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
  }
  let marquee = $state<MarqueeBox | null>(null);

  function dayAtClientX(bodyElement: Element, clientX: number): DayNumber {
    const rectangle = bodyElement.getBoundingClientRect();
    const day = Math.round(
      pixelToDay(timeline.domain, timeline.viewport.pixelsPerDay, clientX - rectangle.left),
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

      /* Натискання на вже обране НЕ перебирає виділення: інакше взятись за
         гурт було б неможливо — перший же дотик лишав би в ньому одну подію. */
      if (nativeEvent.shiftKey || !timeline.selection.isEventSelected(model.id)) {
        timeline.selection.selectEvent(model.id, { add: nativeEvent.shiftKey });
      }

      const resizeSide = (nativeEvent.target as Element).closest("[data-resize]")?.getAttribute("data-resize");
      timeline.beginDrag({
        kind:
          resizeSide === "start"
            ? DRAG_KIND.ResizeStart
            : resizeSide === "end"
              ? DRAG_KIND.ResizeEnd
              : DRAG_KIND.Move,
        grabbedId: model.id,
      });
    } else if (nativeEvent.shiftKey) {
      /* Shift по порожньому — рамка виділення. Проста протяжка тут створює
         подію, тож гілка вільна й жести не сперечаються.

         `preventDefault` тут обов'язковий: Shift+натискання для браузера — це
         «розтягнути виділення тексту від каретки», і без цього рамка тягнеться
         разом із синьою смугою через півзастосунку. */
      nativeEvent.preventDefault();
      marquee = {
        fromX: nativeEvent.clientX,
        fromY: nativeEvent.clientY,
        toX: nativeEvent.clientX,
        toY: nativeEvent.clientY,
      };
    } else {
      const anchorDay = dayAtClientX(body, nativeEvent.clientX);
      timeline.selection.clearSelection();
      creation = { trackId, anchorDay, currentDay: anchorDay };
    }
    scroller.setPointerCapture(nativeEvent.pointerId);
  }

  /**
   * Події під рамкою. Влучання рахуємо по прямокутниках самих елементів, а не
   * перераховуємо розкладку: доріжки тепер різної висоти, і друга копія цієї
   * арифметики розійшлася б із першою на першій же правці.
   */
  function eventsWithin(box: MarqueeBox): string[] {
    const left = Math.min(box.fromX, box.toX);
    const right = Math.max(box.fromX, box.toX);
    const top = Math.min(box.fromY, box.toY);
    const bottom = Math.max(box.fromY, box.toY);

    const caught: string[] = [];
    for (const element of document.querySelectorAll("[data-event-id]")) {
      const id = element.getAttribute("data-event-id");
      if (id === null) continue;
      const rectangle = element.getBoundingClientRect();
      const overlaps =
        rectangle.right >= left &&
        rectangle.left <= right &&
        rectangle.bottom >= top &&
        rectangle.top <= bottom;
      if (overlaps) caught.push(id);
    }
    return caught;
  }

  /* Ширина колонки: тягнеться від того місця, де взялись, а не «куди вказує
     курсор» — інакше роздільник стрибав би до вказівника на першому ж пікселі. */
  let widthDrag: { startClientX: number; startWidth: number } | null = null;

  function beginWidthDrag(nativeEvent: PointerEvent): void {
    nativeEvent.preventDefault();
    widthDrag = {
      startClientX: nativeEvent.clientX,
      startWidth: timeline.viewport.trackHeadWidthPixels,
    };
    (nativeEvent.currentTarget as Element).setPointerCapture(nativeEvent.pointerId);
  }

  function onWidthDrag(nativeEvent: PointerEvent): void {
    const active = widthDrag;
    if (active === null) return;
    timeline.viewport.setTrackHeadWidth(active.startWidth + (nativeEvent.clientX - active.startClientX));
  }

  function endWidthDrag(): void {
    widthDrag = null;
  }

  function onPointerMove(nativeEvent: PointerEvent): void {
    /* Рух рахується лише всередині жесту: просте водіння мишею по полотну не
       має вважатися перетягуванням. */
    const gestureActive = creation !== null || marquee !== null || timeline.drag !== null;
    if (gestureActive && Math.abs(nativeEvent.clientX - pointerStartX) > DRAG_THRESHOLD_PIXELS) {
      pointerMoved = true;
    }

    if (marquee !== null) {
      marquee = { ...marquee, toX: nativeEvent.clientX, toY: nativeEvent.clientY };
      return;
    }

    if (creation !== null) {
      const row = document.querySelector(`[data-track-id="${creation.trackId}"]`);
      const body = row === null ? null : bodyOfRow(row);
      if (body !== null) creation = { ...creation, currentDay: dayAtClientX(body, nativeEvent.clientX) };
      return;
    }
    if (timeline.drag === null) return;

    const dayOffset = Math.round((nativeEvent.clientX - pointerStartX) / timeline.viewport.pixelsPerDay);
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
    const kind = snapKindForTier(timeline.viewport.rulerTier);
    return {
      startDay: snapToPeriodStart(Math.min(anchorDay, currentDay), kind),
      endDay: snapToPeriodEnd(Math.max(anchorDay, currentDay), kind),
    };
  }

  function onPointerUp(): void {
    suppressDoubleClick = pointerMoved;

    if (marquee !== null) {
      const box = marquee;
      marquee = null;
      /* Рамка ЗАВЖДИ доливає до набору: її кличуть Shift-ом, а Shift скрізь у
         застосунку означає «додати до вже обраного». */
      timeline.selection.selectEvents(eventsWithin(box), { add: true });
      return;
    }

    if (creation !== null) {
      const { trackId, anchorDay, currentDay } = creation;
      creation = null;
      if (anchorDay !== currentDay) {
        const range = snappedCreationRange(anchorDay, currentDay);
        const created = timeline.addEvent(trackId, range.startDay, range.endDay, EVENT_KIND.Span);
        timeline.selection.startRenaming(created.id);
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
      timeline.selection.startRenaming(existingId);
      return;
    }

    const body = bodyOfRow(row);
    const trackId = row.getAttribute("data-track-id");
    if (body === null || trackId === null) return;

    /* Прилипання те саме, що й у перетягуванні: спосіб створення не має
       міняти те, на які дати подія сяде. */
    const kind = snapKindForTier(timeline.viewport.rulerTier);
    const day = snapToPeriodStart(dayAtClientX(body, nativeEvent.clientX), kind);

    /* Alt робить точкову подію: те саме місце, інший рід. */
    if (nativeEvent.altKey) {
      const created = timeline.addEvent(trackId, day, day, EVENT_KIND.Point);
      timeline.selection.startRenaming(created.id);
      return;
    }
    const span = Math.max(1, Math.round(QUICK_EVENT_PIXELS / timeline.viewport.pixelsPerDay));
    const created = timeline.addEvent(
      trackId,
      day,
      snapToPeriodEnd(day + span - 1, kind),
      EVENT_KIND.Span,
    );
    timeline.selection.startRenaming(created.id);
  }

  /**
   * Крок колеса в пікселях, незалежно від того, на яку вісь браузер його поклав.
   *
   * Осі тут не фіксовані: із затиснутим Shift Chromium сам переносить крок з
   * `deltaY` у `deltaX`, тож читати лише одну вісь — значить не побачити
   * половини випадків. `deltaMode` «рядки» без множника дає крок у кілька
   * пікселів, тобто рух ледь помітний.
   */
  function wheelStepPixels(nativeEvent: WheelEvent): number {
    const scale = nativeEvent.deltaMode === WHEEL_DELTA_LINE ? WHEEL_LINE_PIXELS : 1;
    const dominant =
      Math.abs(nativeEvent.deltaY) >= Math.abs(nativeEvent.deltaX)
        ? nativeEvent.deltaY
        : nativeEvent.deltaX;
    return dominant * scale;
  }

  /**
   * Колесо возить шкалу ВЗДОВЖ ЧАСУ, з Shift — впоперек. Це навпаки до типової
   * поведінки браузера, і навмисно: на часовій шкалі рух горизонталлю —
   * основний, а доріжок зазвичай кілька і вертикаль потрібна значно рідше.
   */
  function onWheel(nativeEvent: WheelEvent): void {
    const step = wheelStepPixels(nativeEvent);

    if (nativeEvent.ctrlKey) {
      nativeEvent.preventDefault();
      const viewportX = nativeEvent.clientX - scroller.getBoundingClientRect().left;
      const bodyPixel = scroller.scrollLeft + viewportX - timeline.viewport.trackHeadWidthPixels;
      const anchorDay = pixelToDay(timeline.domain, timeline.viewport.pixelsPerDay, bodyPixel);

      timeline.setScale(timeline.viewport.pixelsPerDay * Math.pow(ZOOM_WHEEL_BASE, -step), {
        day: anchorDay,
        viewportPixel: viewportX,
      });
      return;
    }

    nativeEvent.preventDefault();
    if (nativeEvent.shiftKey) scroller.scrollTop += step;
    else scroller.scrollLeft += step;
  }

  function reportScroll(): void {
    timeline.viewport.reportScroll(scroller.scrollLeft - timeline.viewport.trackHeadWidthPixels, scroller.clientWidth);
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
    if (timeline.viewport.scrollRequestId === 0) return;
    const target = untrack(() => ({
      day: timeline.viewport.scrollTargetDay,
      viewportPixel: timeline.viewport.scrollTargetViewportPixel,
    }));
    void (async () => {
      await tick();
      scroller.scrollLeft =
        dayToPixel(timeline.domain, timeline.viewport.pixelsPerDay, target.day) +
        timeline.viewport.trackHeadWidthPixels -
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
      : dayToPixel(timeline.domain, timeline.viewport.pixelsPerDay, previewRange.startDay),
  );
  const previewWidth = $derived(
    previewRange === null
      ? 0
      : Math.max(2, (previewRange.endDay - previewRange.startDay + 1) * timeline.viewport.pixelsPerDay),
  );
</script>

<svelte:window onpointerup={onPointerUp} />

<div class="canvas-area">
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
  <div class="canvas" style:width="{timeline.viewport.trackHeadWidthPixels + timeline.canvasWidthPixels}px">
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

<!-- Роздільник липне до правого краю колонки з назвами. Поза прокруткою, бо
     сама колонка теж не їде: вона sticky. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="head-divider"
  style:left="{timeline.viewport.trackHeadWidthPixels}px"
  title="Тягнути — ширина колонки з назвами"
  onpointerdown={beginWidthDrag}
  onpointermove={onWidthDrag}
  onpointerup={endWidthDrag}
  onpointercancel={endWidthDrag}
></div>
</div>

{#if marquee !== null}
  <div
    class="marquee"
    style:left="{Math.min(marquee.fromX, marquee.toX)}px"
    style:top="{Math.min(marquee.fromY, marquee.toY)}px"
    style:width="{Math.abs(marquee.toX - marquee.fromX)}px"
    style:height="{Math.abs(marquee.toY - marquee.fromY)}px"
  ></div>
{/if}

<style>
  /* Рамка виділення й роздільник живуть у координатах вікна: перша — бо в них
     лежать прямокутники подій, другий — бо колонка з назвами sticky й з
     прокруткою не їде. */
  .marquee {
    position: fixed;
    z-index: 20;
    pointer-events: none;
    border: 1px solid var(--color-accent);
    background: color-mix(in srgb, var(--color-accent) 14%, transparent);
    border-radius: 2px;
  }

  /* Контейнер для роздільника: без нього `absolute` рахувався б від сторінки,
     і смуга простяглася б через шапку та підвал. */
  .canvas-area {
    position: relative;
    display: grid;
    min-width: 0;
    min-height: 0;
  }

  .head-divider {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 7px;
    translate: -3px 0;
    z-index: 6;
    cursor: ew-resize;
  }

  .head-divider::after {
    content: "";
    position: absolute;
    inset: 0 3px;
    background: var(--color-accent);
    opacity: 0;
  }

  .head-divider:hover::after {
    opacity: 0.55;
  }

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
