<script lang="ts">
  import {
    MAX_TRACK_HEIGHT,
    MIN_TRACK_HEIGHT,
    PALETTE,
    type Track,
  } from "../lib/model/timeline-document";
  import { sharedValue } from "../lib/shared-value";
  import { timeline } from "../lib/timeline-view-model.svelte";

  interface Props {
    tracks: Track[];
  }
  const { tracks }: Props = $props();

  const colour = $derived(sharedValue(tracks.map((track) => track.color)));
  const height = $derived(sharedValue(tracks.map((track) => track.height)));
  const eventCount = $derived(
    tracks.reduce((total, track) => total + timeline.eventsOfTrack(track.id).length, 0),
  );

  const MIXED = "різні";
  const groupKey = $derived(tracks.map((track) => track.id).join(","));

  function edit(patch: Partial<Omit<Track, "id">>, field?: string): void {
    timeline.beginChange(field === undefined ? undefined : `${field}:${groupKey}`);
    for (const track of tracks) timeline.updateTrack(track.id, patch);
  }

  function remove(): void {
    const confirmed = confirm(
      `Видалити ${tracks.length} доріжок разом із ${eventCount} подіями?\nЦе можна відкотити через Ctrl+Z.`,
    );
    if (confirmed) timeline.deleteSelection();
  }
</script>

<div class="insp-title">Виділено доріжок: {tracks.length}</div>

<div class="insp-field">
  <span>Колір</span>
  <div class="insp-swatches">
    {#each PALETTE as entry (entry.hex)}
      <button
        class="insp-swatch"
        style:--swatch-colour={entry.hex}
        title={entry.name}
        aria-label="Колір: {entry.name}"
        aria-pressed={colour.shared && colour.value.toLowerCase() === entry.hex.toLowerCase()}
        onclick={() => edit({ color: entry.hex })}
      ></button>
    {/each}
  </div>
</div>

<div class="insp-field">
  <span>Висота, px</span>
  <input
    type="number"
    min={MIN_TRACK_HEIGHT}
    max={MAX_TRACK_HEIGHT}
    value={height.shared ? height.value : ""}
    placeholder={height.shared ? "" : MIXED}
    onchange={(e) => {
      const wanted = Number(e.currentTarget.value);
      if (!Number.isFinite(wanted) || wanted <= 0) return;
      for (const track of tracks) timeline.setTrackHeight(track.id, wanted);
    }}
  />
</div>

<p class="insp-meta">Разом {eventCount} подій на цих доріжках.</p>

<div class="insp-spacer"></div>
<button class="insp-danger" disabled={timeline.tracks.length <= tracks.length} onclick={remove}>
  Видалити доріжки ({tracks.length})
</button>
