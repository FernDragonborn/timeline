<script lang="ts">
  import { periodsInRange, tierLayout, type Period } from "../lib/time/ruler";
  import { timeline } from "../lib/timeline-view-model.svelte";
  import { dayToPixel } from "../lib/view/timeline-viewport";

  /** Нижче цієї ширини підпис поділки не влізе і лише замусорить лінійку. */
  const MIN_MINOR_LABEL_PIXELS = 22;

  const layout = $derived(tierLayout(timeline.rulerTier));
  const range = $derived(timeline.visibleRange);

  const majorPeriods = $derived(
    periodsInRange(layout.major, range.fromDay, range.toDay, { major: true }),
  );
  const minorPeriods = $derived(periodsInRange(layout.minor, range.fromDay, range.toDay));

  const left = (period: Period): number =>
    dayToPixel(timeline.domain, timeline.pixelsPerDay, period.startDay);
  const width = (period: Period): number =>
    (period.endDay - period.startDay) * timeline.pixelsPerDay;
</script>

<div class="ruler" style:width="{timeline.canvasWidthPixels}px">
  {#each majorPeriods as period (period.startDay)}
    <div class="major" style:left="{left(period)}px" style:width="{width(period)}px">
      {period.label}
    </div>
  {/each}
  {#each minorPeriods as period (period.startDay)}
    {#if width(period) >= MIN_MINOR_LABEL_PIXELS}
      <div
        class="minor"
        class:weekend={period.isWeekend}
        style:left="{left(period)}px"
        style:width="{width(period)}px"
      >
        {period.label}
      </div>
    {/if}
  {/each}
</div>

<style>
  .ruler {
    position: relative;
    height: 100%;
    flex: 0 0 auto;
    /* Остання поділка починається в межах домену, але закінчується за ним.
       Без обрізання вона додає собі ширину до прокрутки, і смуга стає довшою
       за саму шкалу. */
    overflow: hidden;
  }

  .major,
  .minor {
    position: absolute;
    top: 0;
    height: 100%;
    white-space: nowrap;
    overflow: hidden;
  }

  .major {
    border-left: 1px solid var(--color-line);
    padding: 5px 0 0 7px;
    font-size: 11.5px;
    font-weight: 600;
  }

  .minor {
    border-left: 1px solid var(--color-line-soft);
    padding: 26px 0 0 5px;
    font-size: var(--font-size-label);
    color: var(--color-text-muted);
  }

  .minor.weekend {
    background: var(--color-weekend);
  }
</style>
