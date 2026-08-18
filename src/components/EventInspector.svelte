<script lang="ts">
  import {
    COLOR_INHERIT,
    EVENT_KIND,
    PALETTE,
    resolveEventColor,
    type TimelineEvent,
  } from "../lib/model/timeline-document";
  import { formatDaySpan, isoToDayNumber } from "../lib/time/day-number";
  import { timeline } from "../lib/timeline-view-model.svelte";

  interface Props {
    event: TimelineEvent;
  }
  const { event }: Props = $props();

  const track = $derived(timeline.trackById(event.trackId));
  const shownColour = $derived(track === null ? null : resolveEventColor(event, track));
  const usesOwnColour = $derived(event.color !== COLOR_INHERIT);
  const usesCustomColour = $derived(
    usesOwnColour && !PALETTE.some((entry) => entry.hex.toLowerCase() === event.color.toLowerCase()),
  );

  /* Ключ склеювання — поле плюс подія: серія натискань у назві стає одним
     кроком історії, але правка назви й правка примітки лишаються різними. */
  function edit(patch: Parameters<typeof timeline.updateEvent>[1], coalesceKey?: string): void {
    timeline.beginChange(coalesceKey);
    timeline.updateEvent(event.id, patch);
  }

  /* Піпетка шле подію на кожен рух повзунка: крок історії має бути один, тож
     записуємо його лише коли діалог закрився. */
  function previewColour(colour: string): void {
    timeline.updateEvent(event.id, { color: colour });
  }
</script>

<div class="insp-title" style:--dot-colour={shownColour}>
  <span class="insp-dot"></span>
  {event.kind === EVENT_KIND.Point ? "Точкова подія" : "Подія"}
</div>

<label class="insp-field">
  <span>Назва</span>
  <input value={event.title} oninput={(e) => edit({ title: e.currentTarget.value }, `title:${event.id}`)} />
</label>

<label class="insp-field">
  <span>Доріжка</span>
  <select value={event.trackId} onchange={(e) => edit({ trackId: e.currentTarget.value })}>
    {#each timeline.tracks as candidate (candidate.id)}
      <option value={candidate.id}>{candidate.name}</option>
    {/each}
  </select>
</label>

<div class="insp-field">
  <span>Рід</span>
  <div class="insp-segmented">
    <button
      aria-pressed={event.kind === EVENT_KIND.Span}
      onclick={() => edit({ kind: EVENT_KIND.Span })}>Проміжок</button
    >
    <button
      aria-pressed={event.kind === EVENT_KIND.Point}
      onclick={() => edit({ kind: EVENT_KIND.Point })}>Точка</button
    >
  </div>
</div>

<div class="insp-two">
  <label class="insp-field">
    <span>{event.kind === EVENT_KIND.Point ? "Дата" : "Початок"}</span>
    <input
      type="date"
      value={event.start}
      onchange={(e) => e.currentTarget.value && edit({ start: e.currentTarget.value })}
    />
  </label>
  {#if event.kind !== EVENT_KIND.Point}
    <label class="insp-field">
      <span>Кінець</span>
      <input
        type="date"
        value={event.end}
        onchange={(e) => e.currentTarget.value && edit({ end: e.currentTarget.value })}
      />
    </label>
  {/if}
</div>

{#if event.kind !== EVENT_KIND.Point}
  <p class="insp-meta">{formatDaySpan(isoToDayNumber(event.start), isoToDayNumber(event.end))}</p>
{/if}

<div class="insp-field">
  <span>Колір</span>
  <div class="insp-swatches">
    {#each PALETTE as entry (entry.hex)}
      <button
        class="insp-swatch"
        style:--swatch-colour={entry.hex}
        title={entry.name}
        aria-label="Колір: {entry.name}"
        aria-pressed={usesOwnColour && event.color.toLowerCase() === entry.hex.toLowerCase()}
        onclick={() => edit({ color: entry.hex })}
      ></button>
    {/each}
  </div>
  <div class="insp-colour-actions">
    <button
      class="insp-chip"
      aria-pressed={!usesOwnColour}
      onclick={() => edit({ color: COLOR_INHERIT })}
    >
      <span class="insp-dot" style:--dot-colour={track?.color}></span>як у доріжки
    </button>
    <label class="insp-chip" aria-pressed={usesCustomColour}>
      <span class="insp-dot" style:--dot-colour={shownColour}></span>свій…
      <input
        type="color"
        value={shownColour}
        oninput={(e) => previewColour(e.currentTarget.value)}
        onchange={(e) => edit({ color: e.currentTarget.value })}
      />
    </label>
  </div>
</div>

<label class="insp-field">
  <span>Примітка</span>
  <textarea value={event.note} oninput={(e) => edit({ note: e.currentTarget.value }, `note:${event.id}`)}></textarea>
</label>

<div class="insp-spacer"></div>
<button class="insp-danger" onclick={() => timeline.deleteEvent(event.id)}>Видалити подію</button>
