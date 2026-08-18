<script lang="ts">
  import DocumentInspector from "./DocumentInspector.svelte";
  import EventGroupInspector from "./EventGroupInspector.svelte";
  import EventInspector from "./EventInspector.svelte";
  import TrackGroupInspector from "./TrackGroupInspector.svelte";
  import TrackInspector from "./TrackInspector.svelte";
  import { timeline } from "../lib/timeline-view-model.svelte";

  /* Панель показує властивості обраного. Нічого не обрано — властивості
     документа: інакше межі шкали не мали б де жити. */
  const events = $derived(timeline.selectedEvents);
  const tracks = $derived(timeline.selectedTracks);
</script>

<aside class="inspector">
  {#if events.length === 1 && events[0] !== undefined}
    <EventInspector event={events[0]} />
  {:else if events.length > 1}
    <EventGroupInspector {events} />
  {:else if tracks.length === 1 && tracks[0] !== undefined}
    <TrackInspector track={tracks[0]} />
  {:else if tracks.length > 1}
    <TrackGroupInspector {tracks} />
  {:else}
    <DocumentInspector />
  {/if}
</aside>

<style>
  .inspector {
    background: var(--color-panel);
    border-left: 1px solid var(--color-line);
    padding: 14px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
</style>
