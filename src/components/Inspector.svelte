<script lang="ts">
  import DocumentInspector from "./DocumentInspector.svelte";
  import EventInspector from "./EventInspector.svelte";
  import TrackInspector from "./TrackInspector.svelte";
  import { timeline } from "../lib/timeline-view-model.svelte";

  /* Панель показує властивості обраного. Нічого не обрано — властивості
     документа: інакше межі шкали не мали б де жити. */
  const event = $derived(timeline.selectedEvent);
  const track = $derived(timeline.selectedTrack);
</script>

<aside class="inspector">
  {#if event !== null}
    <EventInspector {event} />
  {:else if track !== null}
    <TrackInspector {track} />
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
