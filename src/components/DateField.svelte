<script lang="ts">
  import { formatDateText, parseDateText } from "../lib/time/date-text";
  import { dayNumberToIso, isoToDayNumber } from "../lib/time/day-number";

  interface Props {
    /** Дата у формі файлу, `YYYY-MM-DD`. */
    value: string;
    /** Викликається лише тоді, коли дата справді змінилась. */
    onCommit: (iso: string) => void;
    title: string;
  }

  let { value, onCommit, title }: Props = $props();

  /**
   * `null` означає «показуємо збережену дату», рядок — «людина саме править».
   * Так поле не тримає копії того, що вже є в документі, і зовнішня зміна
   * (перетягування події на полотні) не переписує набраний текст.
   */
  let draft = $state<string | null>(null);
  let field = $state<HTMLInputElement | null>(null);
  let picker = $state<HTMLInputElement | null>(null);

  const text = $derived(draft ?? formatDateText(isoToDayNumber(value)));
  const invalid = $derived(draft !== null && !parseDateText(draft).ok);

  function revert(): void {
    draft = null;
  }

  /** Незрозумілий текст не стає датою й не лишається на екрані: поле повертає
      останнє справне значення, щоб неіснуючої дати не було видно. */
  function commit(): void {
    if (draft === null) return;
    const parsed = parseDateText(draft);
    draft = null;
    if (!parsed.ok) return;
    const iso = dayNumberToIso(parsed.day);
    if (iso !== value) onCommit(iso);
  }

  /**
   * Клік будь-де поза полем застосовує правку — і робить це ДО того, як цей
   * самий клік змінить виділення.
   *
   * Чекати на `blur` тут не можна. Клік по іншій події перемальовує панель, і
   * Svelte не створює поле заново, а перевикористовує те саме: текст лишається,
   * а `value` й `onCommit` уже вказують на іншу подію. `blur` тоді записував
   * набрану дату в ЧУЖУ подію, а та, яку правили, лишалась без змін.
   */
  $effect(() => {
    function onPointerDownAnywhere(nativeEvent: PointerEvent): void {
      if (draft === null) return;
      const target = nativeEvent.target;
      if (target instanceof Node && field !== null && field.contains(target)) return;
      commit();
    }
    window.addEventListener("pointerdown", onPointerDownAnywhere, true);
    return () => window.removeEventListener("pointerdown", onPointerDownAnywhere, true);
  });

  function onKeyDown(nativeEvent: KeyboardEvent): void {
    if (nativeEvent.code === "Enter" || nativeEvent.code === "NumpadEnter") {
      nativeEvent.preventDefault();
      commit();
      field?.blur();
      return;
    }
    if (nativeEvent.code === "Escape") {
      /* Зупиняємо тут: нагорі Escape знімає виділення, а в полі він означає
         «скасувати правку», і другий сенс не повинен спрацювати заразом. */
      nativeEvent.stopPropagation();
      revert();
      field?.blur();
    }
  }

  function openPicker(): void {
    picker?.showPicker();
  }
</script>

<div class="date-field" class:invalid>
  <input
    class="date-text"
    type="text"
    inputmode="numeric"
    autocomplete="off"
    spellcheck="false"
    {title}
    bind:this={field}
    value={text}
    oninput={(nativeEvent) => (draft = nativeEvent.currentTarget.value)}
    onblur={commit}
    onkeydown={onKeyDown}
  />

  <button type="button" class="calendar" onclick={openPicker} title="Обрати з календаря">
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <rect x="2" y="3.5" width="12" height="10.5" rx="1.5" />
      <path d="M2 7.5h12" />
      <path d="M5.5 2v3M10.5 2v3" />
    </svg>
    <span class="sr-only">Обрати з календаря</span>
  </button>

  <!-- Нативний календар лишається як спосіб ТИКНУТИ дату, але не як спосіб її
       читати й правити: вигляд і редагування дає текстове поле поруч. -->
  <input
    class="native-picker"
    type="date"
    tabindex="-1"
    bind:this={picker}
    {value}
    onchange={(nativeEvent) => {
      const picked = nativeEvent.currentTarget.value;
      if (picked && picked !== value) onCommit(picked);
    }}
  />
</div>

<style>
  .date-field {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    background: var(--color-bg);
    border: 1px solid var(--color-line);
    border-radius: var(--radius);
  }

  .date-field:focus-within {
    border-color: var(--color-accent);
  }

  .date-field.invalid {
    border-color: var(--color-danger);
  }

  /* Перебиває глобальне `.insp-field input`: рамку тут малює контейнер, щоб
     текст і кнопка календаря читались як одне поле. */
  .date-field input.date-text {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: 0;
    border-radius: 0;
    padding: 6px 8px;
    font: inherit;
    color: inherit;
  }

  .date-field input.date-text:focus {
    outline: none;
  }

  .calendar {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    align-self: stretch;
    background: transparent;
    border: 0;
    border-radius: 0 var(--radius) var(--radius) 0;
    padding: 0;
    color: var(--color-text-muted);
    cursor: pointer;
  }

  .calendar:hover {
    background: var(--color-panel-raised);
    color: var(--color-text);
  }

  .calendar:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: -2px;
  }

  .calendar svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.3;
    stroke-linecap: round;
  }

  /* Має лишатись відрендереним, інакше `showPicker()` кидає помилку. */
  .native-picker {
    position: absolute;
    right: 4px;
    bottom: 0;
    width: 1px;
    height: 1px;
    padding: 0;
    border: 0;
    opacity: 0;
    pointer-events: none;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
