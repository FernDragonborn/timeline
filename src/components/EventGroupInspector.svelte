<script lang="ts">
  import {
    COLOR_INHERIT,
    EVENT_KIND,
    PALETTE,
    type TimelineEvent,
  } from "../lib/model/timeline-document";
  import { sharedValue } from "../lib/shared-value";
  import { dayNumberToIso, formatDaySpan, isoToDayNumber } from "../lib/time/day-number";
  import { timeline } from "../lib/timeline-view-model.svelte";
  import DateField from "./DateField.svelte";

  interface Props {
    events: TimelineEvent[];
  }
  const { events }: Props = $props();

  /* Гурт уміє те саме, що й окрема подія. Де значення різняться, поле каже
     «різні», а введене застосовується до всіх одразу. */
  const title = $derived(sharedValue(events.map((event) => event.title)));
  const trackId = $derived(sharedValue(events.map((event) => event.trackId)));
  const kind = $derived(sharedValue(events.map((event) => event.kind)));
  const colour = $derived(sharedValue(events.map((event) => event.color)));
  const note = $derived(sharedValue(events.map((event) => event.note)));

  const startDays = $derived(events.map((event) => isoToDayNumber(event.start)));
  const endDays = $derived(events.map((event) => isoToDayNumber(event.end)));
  const earliest = $derived(Math.min(...startDays));
  const latest = $derived(Math.max(...endDays));

  const MIXED = "різні";
  /* Ключ склеювання спільний на весь гурт: серія натискань — один крок історії. */
  const groupKey = $derived(events.map((event) => event.id).join(","));

  function edit(patch: Partial<Omit<TimelineEvent, "id">>, field?: string): void {
    timeline.updateSelectedEvents(patch, field === undefined ? undefined : `${field}:${groupKey}`);
  }

  function isColour(hex: string): boolean {
    return colour.shared && colour.value !== COLOR_INHERIT && colour.value.toLowerCase() === hex;
  }
</script>

<div class="insp-title">Виділено {events.length}</div>

<div class="insp-field">
  <span>Назва</span>
  <input
    value={title.shared ? title.value : ""}
    placeholder={title.shared ? "" : MIXED}
    oninput={(e) => edit({ title: e.currentTarget.value }, "title")}
  />
</div>

<div class="insp-field">
  <span>Доріжка</span>
  <select
    value={trackId.shared ? trackId.value : MIXED}
    onchange={(e) => edit({ trackId: e.currentTarget.value })}
  >
    {#if !trackId.shared}
      <option value={MIXED} disabled>{MIXED}</option>
    {/if}
    {#each timeline.tracks as candidate (candidate.id)}
      <option value={candidate.id}>{candidate.name}</option>
    {/each}
  </select>
</div>

<div class="insp-field">
  <span>Рід</span>
  <div class="insp-segmented">
    <button
      aria-pressed={kind.shared && kind.value === EVENT_KIND.Span}
      onclick={() => edit({ kind: EVENT_KIND.Span })}>Проміжок</button
    >
    <button
      aria-pressed={kind.shared && kind.value === EVENT_KIND.Point}
      onclick={() => edit({ kind: EVENT_KIND.Point })}>Точка</button
    >
  </div>
</div>

<!-- Дати показують ОХОПЛЕНИЙ діапазон, а не спільне значення: спільного в
     чотирьох подій зазвичай немає. Введена дата стає однаковою в усіх — це те
     саме, що зробила б правка кожної окремо. -->
<div class="insp-two">
  {#key groupKey}
    <div class="insp-field">
      <span>Початок</span>
      <DateField
        value={dayNumberToIso(earliest)}
        title="Задати однаковий початок усім обраним"
        onCommit={(iso) => edit({ start: iso })}
      />
    </div>
    <div class="insp-field">
      <span>Кінець</span>
      <DateField
        value={dayNumberToIso(latest)}
        title="Задати однаковий кінець усім обраним"
        onCommit={(iso) => edit({ end: iso })}
      />
    </div>
  {/key}
</div>

<p class="insp-meta">{formatDaySpan(earliest, latest)}</p>

<div class="insp-field">
  <span>Колір</span>
  <div class="insp-swatches">
    {#each PALETTE as entry (entry.hex)}
      <button
        class="insp-swatch"
        style:--swatch-colour={entry.hex}
        title={entry.name}
        aria-label="Колір: {entry.name}"
        aria-pressed={isColour(entry.hex.toLowerCase())}
        onclick={() => edit({ color: entry.hex })}
      ></button>
    {/each}
  </div>
  <div class="insp-colour-actions">
    <button
      class="insp-chip"
      aria-pressed={colour.shared && colour.value === COLOR_INHERIT}
      onclick={() => edit({ color: COLOR_INHERIT })}
    >
      як у доріжки
    </button>
  </div>
</div>

<div class="insp-field">
  <span>Примітка</span>
  <textarea
    value={note.shared ? note.value : ""}
    placeholder={note.shared ? "" : MIXED}
    oninput={(e) => edit({ note: e.currentTarget.value }, "note")}
  ></textarea>
</div>

<div class="insp-spacer"></div>
<button class="insp-danger" onclick={() => timeline.deleteSelection()}>
  Видалити всі ({events.length})
</button>
