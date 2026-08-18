<script lang="ts">
  import { today } from "../lib/time/day-number";
  import { periodsInRange, tierLayout } from "../lib/time/ruler";
  import { timeline } from "../lib/timeline-view-model.svelte";
  import { dayToPixel } from "../lib/view/timeline-viewport";

  /** Лінії частіші за це зливаються в суцільну заливку — сенсу малювати немає. */
  const MIN_LINE_SPACING_PIXELS = 14;

  const layout = $derived(tierLayout(timeline.rulerTier));
  const range = $derived(timeline.visibleRange);
  const majorPeriods = $derived(periodsInRange(layout.major, range.fromDay, range.toDay));
  const minorPeriods = $derived(
    periodsInRange(layout.minor, range.fromDay, range.toDay).filter(
      (period) =>
        (period.endDay - period.startDay) * timeline.pixelsPerDay >= MIN_LINE_SPACING_PIXELS,
    ),
  );

  const x = (day: number): number => dayToPixel(timeline.domain, timeline.pixelsPerDay, day);
  const todayPixel = $derived(x(today()));
</script>

<div class="grid" style:width="{timeline.canvasWidthPixels}px">
  {#each minorPeriods as period (period.startDay)}
    {#if period.isWeekend}
      <div
        class="weekend"
        style:left="{x(period.startDay)}px"
        style:width="{(period.endDay - period.startDay) * timeline.pixelsPerDay}px"
      ></div>
    {/if}
    <div class="line" style:left="{x(period.startDay)}px"></div>
  {/each}
  {#each majorPeriods as period (period.startDay)}
    <div class="line major" style:left="{x(period.startDay)}px"></div>
  {/each}
  <div class="today" style:left="{todayPixel}px"><span>сьогодні</span></div>
</div>

<style>
  .grid {
    position: absolute;
    top: 0;
    bottom: 0;
    left: var(--track-head-width);
    pointer-events: none;
    z-index: 0;
    /* Див. Ruler: остання смуга вихідних вилазить за домен і роздуває прокрутку. */
    overflow: hidden;
  }

  .line {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--color-line-soft);
  }

  .line.major {
    background: var(--color-line);
  }

  .weekend {
    position: absolute;
    top: 0;
    bottom: 0;
    background: var(--color-weekend);
  }

  .today {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--color-danger);
    opacity: 0.8;
  }

  .today span {
    position: absolute;
    top: 2px;
    left: 4px;
    font-size: 9.5px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--color-danger);
  }
</style>
