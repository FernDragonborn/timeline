<script lang="ts">
  import { PALETTE, type Track } from "../lib/model/timeline-document";
  import { timeline } from "../lib/timeline-view-model.svelte";

  interface Props {
    track: Track;
  }
  const { track }: Props = $props();

  const eventCount = $derived(timeline.eventsOfTrack(track.id).length);

  function edit(patch: Partial<Omit<Track, "id">>, coalesceKey?: string): void {
    timeline.beginChange(coalesceKey);
    timeline.updateTrack(track.id, patch);
  }

  /* Піпетка шле подію на кожен рух повзунка: крок історії має бути один, тож
     записуємо його лише коли діалог закрився. */
  function previewColour(colour: string): void {
    timeline.updateTrack(track.id, { color: colour });
  }

  function remove(): void {
    const confirmed = confirm(
      `Видалити доріжку «${track.name}» разом із ${eventCount} подіями?\nЦе можна відкотити через Ctrl+Z.`,
    );
    if (confirmed) timeline.removeTrack(track.id);
  }
</script>

<div class="insp-title" style:--dot-colour={track.color}>
  <span class="insp-dot"></span>Доріжка
</div>

<label class="insp-field">
  <span>Назва</span>
  <input value={track.name} oninput={(e) => edit({ name: e.currentTarget.value }, `track-name:${track.id}`)} />
</label>

<div class="insp-field">
  <span>Колір</span>
  <div class="insp-swatches">
    {#each PALETTE as entry (entry.hex)}
      <button
        class="insp-swatch"
        style:--swatch-colour={entry.hex}
        title={entry.name}
        aria-label="Колір: {entry.name}"
        aria-pressed={track.color.toLowerCase() === entry.hex.toLowerCase()}
        onclick={() => edit({ color: entry.hex })}
      ></button>
    {/each}
  </div>
  <div class="insp-colour-actions">
    <label class="insp-chip">
      <span class="insp-dot" style:--dot-colour={track.color}></span>свій колір…
      <input
        type="color"
        value={track.color}
        oninput={(e) => previewColour(e.currentTarget.value)}
        onchange={(e) => edit({ color: e.currentTarget.value })}
      />
    </label>
  </div>
</div>

<p class="insp-meta">
  {eventCount} подій на доріжці. Кожна бере цей колір, поки їй не задано власний.
</p>

<div class="insp-spacer"></div>
<button class="insp-danger" disabled={timeline.tracks.length <= 1} onclick={remove}>
  Видалити доріжку
</button>
