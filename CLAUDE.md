# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A standalone desktop app: a **multi-event timeline**. Not a Gantt chart — the defining difference is
that **one track holds any number of events, and they may overlap in time**. Gantt gives one bar per
row; this gives N bars per row, drawn semi-transparent so overlaps read as density.

That single capability is the whole product. Everything else (tracks, dates, notes, storage) exists
to serve it.

**Scope discipline.** The tool must stay **as simple as possible** — but simple is not sloppy. Simple
means few concepts and no speculative features; it does not mean cut corners on typing, naming,
error handling, or visual polish. When in doubt, ship less surface, not lower quality.

## Commands

**The package manager is `pnpm`** — `pnpm-lock.yaml` is the lockfile and `tauri.conf.json`'s
`beforeDevCommand` / `beforeBuildCommand` invoke `pnpm`. Running `npm install` here creates a second
lockfile and a different tree; don't.

```
pnpm install
pnpm tauri dev        # the real app (Rust + webview); first build takes minutes
pnpm dev              # frontend only, at localhost:1420 — no file access, see below
pnpm test             # vitest, pure logic
pnpm test -- <name>   # a single test file or -t "<test name>"
pnpm check            # svelte-check, the type gate
pnpm build            # vite → dist/, what Tauri bundles
pnpm tauri build      # installer
pnpm build:portable   # standalone binary, no installer
```

Before committing, run `pnpm test && pnpm check && pnpm build`. A green subset is a false green.

`pnpm dev` in a plain browser is the fast loop for layout and interaction work, and screenshots of
it are how visual changes get verified. File access is the one thing it can't do: every
`@tauri-apps/*` call rejects, so the app reports "не збережено" and works from an in-memory
document. That is the designed fallback, not a broken state.

Vite must not watch `src-tauri/` — cargo is writing `timeline_lib.dll` there while the dev server
runs, and chokidar dies on the locked file with `EBUSY`, taking the whole dev server with it. The
tell is `pnpm dev` working while `pnpm tauri dev` fails at "beforeDevCommand terminated with a
non-zero status code". Leave `server.watch.ignored` in place, and leave `server.host` unset — the
default matches `devUrl`, and pinning one without the other is how they drift apart.

**`build:portable` means something different on each OS**, because the webview is always the
system's, never bundled. Windows gets a genuinely portable `timeline.exe` — ~10 MB, no side DLLs,
importing only OS libraries and the UCRT (so no VC++ redistributable); its one requirement is the
WebView2 runtime, which ships with Win11 and reaches Win10 through Windows Update. macOS wants the
`.app` from `tauri build` instead, since a bare Mach-O has no bundle id or icon; WKWebView is part
of the OS, so nothing extra ships. Linux is the one that breaks the pattern: the binary still needs
`libwebkit2gtk-4.1-0` present, so the self-contained Linux artifact is the AppImage (~10× the size)
rather than the bare binary.

None of the three cross-compile. Each artifact is built on its own OS.

## Status

Built and running: **Svelte 5 (runes) + TypeScript + Vite + Tauri v2**, plain Vite (no SvelteKit —
one window, no routing, so the framework would only add failure surface).

- `mockup/index.html` — the original self-contained prototype (vanilla JS, no build). Superseded by
  the app, kept as the record of the agreed interaction design.

This file is the only ruleset. It began as a distillation of the maintainer's house rules from
another project (Charnik), which lived here as `AI-CONVENTIONS.md`; everything that applies to a
one-window timeline app has since been folded in and that file removed. Don't reintroduce a second
rules document — two of them drift, and then neither is trusted.

Point events draw as a **pin** — a hairline down the whole lane with a dot at the top — chosen by the
maintainer from five rendered variants (diamond, hollow diamond, pin, flag, dot).

## Agreed design decisions

Settled with the maintainer; changing any of these is a decision, not an implementation detail.

- **Zoom is continuous and adaptive** — one `pxPerDay` value drives everything; the ruler's tier
  (days → weeks → months → quarters → years) is *derived* from it, never a separate mode the user
  picks. It is deliberately **coarse per step** (~1.5× per wheel notch): the full range is a few
  gestures, not a slow crawl.
- **The wheel moves along time; Shift moves across tracks; Ctrl zooms.** This inverts the browser
  default deliberately — on a timeline the horizontal axis is the one you travel, while tracks are
  few and rarely need scrolling. Read the dominant of `deltaY`/`deltaX` rather than one axis:
  holding Shift makes Chromium move the step onto the other axis by itself, so a handler that reads
  only `deltaY` sees nothing.
- **The scrollable domain is a century either side of today**, fixed, and it does **not** grow from
  scrolling. Dates beyond it are reached with the "go to date" field, which widens the domain once.
  An earlier version extended the domain when you hit the edge and compensated `scrollLeft` to keep
  the view steady — that is self-defeating: the compensation puts you back exactly where you were
  scrolling away from, so scrolling left threw you forward. Don't reintroduce edge-extension.
- **Ruler ticks and grid lines are generated for the visible window only**, never for the whole
  domain — two centuries at day zoom is tens of thousands of nodes, and computing them all is
  exactly why tools like this end up silently pinned to the current year. Both layers also need
  `overflow: hidden`: the last tick starts inside the domain and ends past it, and an unclipped
  overhang inflates `scrollWidth` past the actual timeline.
- **Two kinds of event**, an open union (`kind: "span" | "point"`), never a boolean. A point happened
  on one day and draws as a **fixed-size marker** — fixed size is the whole point: a one-day span
  degenerates into an invisible sliver when zoomed out, a marker does not. A point's `end` always
  equals its `start` in the file, so a reader that ignores `kind` still sees a valid one-day event.
- **A label is drawn in full or not at all — never truncated with an ellipsis.** "Відпус…" costs
  space and says nothing. A name may overflow past its block's right edge while there is nothing
  there, so the block's own width is not the limit. Text is measured with canvas `measureText`
  before layout, never by reading `offsetWidth` off the DOM.
- **What crowds a label is another label, not another block.** Two events may touch at the edges or
  share days while their short names sit side by side with room to spare — and a one-day event with
  a long name takes far more width than its rectangle. So labels are packed by their own pixel
  extents into label lanes (`labelLane`), kept deliberately separate from the block lane (`lane`,
  which stack mode uses for vertical position). When two names would collide the later one drops a
  step; only when no step is free does it disappear. Blocks are still packed by day overlap, and
  there the comparison is non-strict — an event starting the day after another ends does not
  overlap it, and a strict `<` put every pair of touching events on two rows.
- **Draw order is by duration, longest first** — so the shorter event lands on top. With
  semi-transparent fills this barely affects colour; what it decides is whose label is legible and
  who catches the click, and the answer wanted is almost always the shorter one. Points sort above
  spans of equal length. No manual z-order field until a real case needs one.
- **Colour is per event**, chosen from a 12-swatch preset palette or a free picker. The default is
  the **named** `"inherit"` sentinel meaning "use the track's colour" — not a missing field, so an
  import can't make "inherits" and "the field got lost" look identical. Tracks carry their own
  colour too, which is what `inherit` resolves to.
- **Overlap rendering is a user toggle**, both modes required:
  - `overlay` — fixed row height, blocks drawn on top of each other with `mix-blend-mode`
    (`screen` on dark, `multiply` on light), so overlaps darken/brighten visibly;
  - `stack` — greedy sub-lane assignment, row grows in height, no visual overlap.
- **Editing is direct-manipulation first**: drag on empty track = create; double-click = create a
  block sized to the current zoom; drag body = move (including onto another track); drag edge =
  resize. Double-click on an existing event renames it in place, and every creation opens that
  rename box immediately — naming is part of creating, not a separate trip to the inspector.
- **New events snap to the current ruler tier** — drawing over months yields whole months, over
  weeks whole Monday-to-Sunday weeks, over days exact days. Every creation path snaps identically
  (drag, double-click, Alt double-click): how you made the event must not change what dates it gets.
  The drag preview shows the snapped range, not the raw pointer range. Move and resize are
  deliberately *not* snapped — adjusting an existing event is where you want exact control.
- **`dblclick` arrives after `pointerup`**, so a double-click-then-drag gesture used to create two
  events. Any pointer movement past a few pixels between down and up suppresses the following
  double-click. Don't remove that guard.
- **A history step is recorded only when something actually changes.** Pressing on an event is
  mostly just selecting it, so `beginDrag` records nothing; the first frame that moves anything
  records once, and the rest of the drag are frames, not steps. Likewise `beginChange(key)` coalesces
  a burst of edits under the same key into one step — typing a title emits an event per keystroke,
  and without this Ctrl+Z would walk back letter by letter while flushing the real history out of a
  100-step buffer.
- **The inspector shows whatever is selected** — an event, a track, or (when nothing is) the
  document. Selection is a named union of event-or-track, not two parallel id fields. Track
  properties, including colour, are reached by double-clicking the track's name.
- **A field with an uncommitted edit commits on `pointerdown` anywhere outside it, not on `blur`.**
  Leaving a field applies the edit and Escape cancels it — but `blur` is the wrong moment to detect
  leaving. Clicking another event re-renders the inspector, and Svelte *reuses* the same field
  instance rather than building a new one, so the typed text survives while `value` and the commit
  callback already point at the next event: the edit landed on the event the user did not touch,
  and the one they did edit kept its old date. Capture-phase `pointerdown` fires before the
  selection changes, so the commit still goes where it was meant to. The inspector also keys its
  date fields on the event id, so a different event can never inherit a dirty one.
- **Tracks carry arbitrary user-editable names**, a colour and a height; five by default,
  add/remove allowed. Height and order live **in the file** — "this track is the important one, make
  it taller" and "these two belong next to each other" are statements about the data, and they must
  survive a restart and travel with the document. Order simply *is* the order of the `tracks` array.
  The width of the name column is the opposite case: it describes the window, not the data, so it is
  view state kept in `localStorage` beside the theme.
- **Selection is a set, and it is homogeneous** — either events or tracks, never mixed, because the
  inspector shows the *shared* properties of what is selected and an event and a track share none.
  Shift+click toggles (removing from a set otherwise needs starting over), Shift+drag on empty track
  space draws a marquee. The group can do everything a single object can: name, track, kind, dates,
  colour, note, delete, all applied to every member. A field whose values differ reads "різні".
  Shift+pointerdown **must** `preventDefault` — to the browser it means "extend the text selection
  from the caret", and without it the marquee drags a blue smear across half the app.
- **A group moves by the same number of rows the grabbed event moved**, not onto the track under the
  cursor — otherwise everything selected collapses into one row. Whoever hits the end stays there.
- **The document may declare its own start and end** (`bounds`, `null` when unbounded). When set,
  they replace the free domain outright: scrolling stops there and clicks outside cannot create
  events. They live in the file, because "this timeline covers 1914–1918" is a property of the
  data, not of the window it is being viewed in.
- **Dates are whole days, end-inclusive.** No times, no timezones. Internally a date is an integer
  day-number from the Unix epoch (UTC); ISO `YYYY-MM-DD` is the storage and UI form. Keep the
  conversion in one module — this is the single place where date bugs can live.

## Data model

The file on disk is the model. Both formats round-trip the same data; JSON is authoritative
(CSV loses track colours and the track/event distinction).

```jsonc
{
  "version": 1,
  "tracks": [{ "id": "t1", "name": "Дослідження", "color": "#5B8DEF", "height": 66 }],
  "events": [{
    "id": "e1", "trackId": "t1",
    "start": "2026-01-08", "end": "2026-03-20",   // inclusive
    "color": "inherit",                            // "inherit" | "#RRGGBB"
    "title": "…", "note": "…"
  }]
}
```

Rules that govern it:

- **Ids are GUIDs** (`crypto.randomUUID()`), never counters — files get copied and merged between
  machines, and two files' "event 3" are different events.
- **No manifest, no index file.** A dataset is one self-describing file. Never add a sidecar that
  lists or versions other files.
- **A column that expresses a policy or kind is an open enum** (`as const` union), never a boolean.
  Booleans bake in "there are exactly two cases", and there is always a third. Extend by adding a
  member; the TS union then makes every `switch` re-check exhaustiveness.
- **Normalise on the way in, once.** An imported or older file may lack a field; fill it at the load
  boundary so no other code ever meets a half-filled event. Don't scatter `?? default` at read sites.
- **Autosave debounces by 700 ms, so closing the window can outrun it.** Tauri's `onCloseRequested`
  cancels the close, flushes, then destroys the window — the only reliable moment, since a webview
  will not wait for async work in `beforeunload`. `Ctrl+S` flushes the same way rather than opening a
  dialog; `Ctrl+Shift+S` is Save As.
- Platform access lives in exactly **two** modules — `storage/file-store.ts` (dialogs, files, paths)
  and `platform/desktop-window.ts` (the window). Nothing else may import `@tauri-apps/*`; that is
  what keeps every other module runnable in a plain browser and testable without mocking Tauri.

## Architecture

- **Components are a thin shell.** No timeline math inside a `.svelte` file. Layout maths (day ↔
  pixel, ruler tick generation, sub-lane assignment, hit-testing) are **pure functions in plain
  `.ts`**, unit-testable without a DOM. Components render their output and dispatch intents.
- **One typed view-model per view**, a class named after itself (`TimelineViewModel` →
  `timeline-view-model.svelte.ts`), exported as a singleton. Components read via
  `const x = $derived(vm.x)` and write through `vm.*`.
- **`$derived` is pure** — it computes and returns. Anything that *acts* on a change (persisting,
  scrolling, toasting) belongs in `$effect`. Svelte re-runs deriveds unpredictably; a side effect in
  one produces reactive loops that are miserable to trace.
- **An `$effect` must never read and write the same state** — that is an infinite loop, and in dev it
  freezes the tab so hard the page shows nothing but a spinner (`effect_update_depth_exceeded` in the
  console is the tell). Two rules that prevent it: one-time startup work goes in `onMount`, not
  `$effect`; and a "pending request" is a `$state` counter plus a **plain** field, so the consumer
  reads the counter and the payload without writing back what it just read. Wrap an effect's
  imperative tail in `untrack` when it touches state it doesn't want to depend on.
- **Separate view state from document state.** `pxPerDay`, overlap mode, selection, scroll position
  are view state and never reach the saved file.

## Code rules

- **Strict typing is a gate.** No `any`, no non-null `!`, no `@ts-ignore`, no unsafe `as`. **Avoid
  bare `T | undefined`** — model absence deliberately (explicit union, default, discriminated
  state). If `undefined` looks genuinely necessary, ask first.
- **Related state is ONE typed object**, not a spray of fields. If several variables move together
  and mean one thing, give them an `interface` and a single `field: T | null`. 5+ positional params
  means group them.
- **Compare against named constants, not bare string literals.** `mode === OverlapMode.Stack`, not
  `mode === 'stack'`. A typo in a bare literal compiles and fails silently. Fix these on sight rather
  than deferring.
- **Options object over positional booleans.** `render(row, { stacked: true })`, never
  `render(row, true, false)`.
- **Verbose, self-evident names** — a reader should know what a function does from its name plus its
  arguments, without opening the body. `dayToPixel`, not `d2p`. Same for files: **a module that
  exports one class is named after that class**. Same for CSS: kebab-case, full words.
- **One name per fact.** If a concept is `trackId` somewhere, it is `trackId` everywhere; only the
  case convention may shift between a snake_case file format and camelCase code.
- **Comments carry WHY**, not a play-by-play of what the code does, and **never a changelog** — git
  already holds that. Past tense is allowed only when it names a failure that returns if the code is
  undone. An example of a *value* (`e.g. "2026-03-20"`) earns its place; an example from the
  project's history does not.
- **Size.** Logic files: ~200 lines is the target, 300 the ceiling, 400 means it should have been
  split already. Functions: much shorter than 80. `.svelte` files have no line rule — judge them by
  single responsibility, and measure only the lines inside `<script>`.
- **Errors surface or are handled, never swallowed.** No empty `catch {}`. A deliberate best-effort
  swallow needs a comment saying why it is safe to ignore.
- **Don't wave off small duplicates.** A repeated predicate or construction goes to one seam even if
  it is a one-liner; they compound. (A repeated cheap `Map` lookup across decoupled stages is *not*
  a duplicate — deduping there just couples modules. Say which one it is, don't hand-wave.)
- **Fix the root cause.** Read the code path end to end before writing a bugfix. Do not ship a
  plausible patch and hope — guessed fixes waste round-trips and mask the real cause. State the
  identified cause, then fix that.

## UI rules

- **Theme-able by construction.** Style only through design tokens (`var(--color-*)` etc.). Never
  hardcode a hex, rgb, or px font-size in a component — a hardcoded value doesn't respond to
  `[data-theme]` and silently breaks the other theme. Alpha tints via
  `color-mix(in srgb, var(--token) N%, transparent)`. Both light and dark ship.
- **Every clickable element signals it.** `cursor: pointer`, a hover state, a visible
  `:focus-visible` ring. Enlarge tiny hit areas (drag handles!) with a transparent `::before` inset.
- **Icons are drawn, never typed.** Inline SVG or plain CSS geometry — no emoji-as-icon, no icon
  font. A glyph doing an icon's job blurs at small sizes, falls back to a different font on another
  machine, and renders as colour emoji on one OS and monochrome on another. Text characters used as
  *text* (`−`, `→` inside a sentence) stay text.
- **A control used in more than one place is ONE component**, not re-inlined per site.
- **Grep a class name before making it global.** A generic name means two different things sooner
  than you expect — in the mockup `.ghost` was both a button modifier and the drag preview, and the
  preview's `position: absolute` silently threw three toolbar buttons into the corner. Prefer scoped
  styles; when a name must be global, make it specific (`.drag-preview`, not `.ghost`).
- **Keyboard shortcuts match the physical key** — compare `event.code` (`"KeyZ"`, `"KeyS"`), never
  `event.key`. On a Cyrillic layout `key` for the Z key is `"я"`, so every letter-based check
  silently stops working for exactly the person this app is written for.
- **A native control's date format follows the browser's UI language and nothing else.** Not
  `<html lang>`, not `navigator.language`, not the OS regional format — all three were measured and
  none of them moves it. That is why the app looked American on a machine whose regional format is
  Ukrainian: WebView2 takes its language from the Windows *display* language. The lever is the
  `--lang` browser argument, passed through `additionalBrowserArgs` in `tauri.conf.json` (Windows
  only, and it replaces wry's default `--disable-features=…`, which must be repeated by hand).
- **Ukrainian UI copy uses formal "ви"** — «використовуйте», not «використовуй». Prefer impersonal
  phrasing where it reads naturally. This governs product copy only, not chat.

## Tests

- **Assert behaviour, not the shape of the code.** A test that knows which private helpers exist
  breaks on a refactor that changed nothing observable — which destroys the one job it had, proving
  the refactor was safe. Test at a stable boundary: feed a pure function its inputs and check its
  outputs.
- **During active development the bug nets are strict typing and walking the UI**, and tests cover
  the pure maths (day↔pixel, tick generation, lane packing, history) where a wrong number is silent.
  Don't propose coverage gates while the shape is still moving.

## Refactoring mechanics

- **Split a file with a script, not by retyping it through the model.** Read the original, write
  line ranges into the new files, then make small targeted edits for imports. Passing a large file
  through the model to "retype it into two" drifts — reworded comments, dropped lines, a subtly
  changed condition — and the diff is too big for anyone to catch it.
- **A file that belongs elsewhere MOVES, and `git mv` is how**, so blame survives; a
  delete-and-recreate restarts the record of why each line exists. The loudest signal that something
  is in the wrong place is an import cycle: it usually means one module doing two jobs, so move the
  leaf out rather than shuffling imports.
- **Revising a file's comments is its own commit**, made after the move or split is green. A
  reworded comment inside a byte-preserving move hides whether the code changed too.

## Dependencies

Judge on solution quality, never on dep-count symbolism. For anything complex and error-prone —
drag-and-drop, virtualization, parsing — a mature library beats hand-rolled code, and it keeps
getting security fixes when this app is untouched for a year. Use vanilla library APIs only (no
forks or monkey-patching) so version bumps stay one-liners.

Balanced against "keep it simple": this app's own maths (day↔pixel, tick generation, lane packing)
is a few dozen lines of pure arithmetic and does **not** warrant a date or charting library. Adding
one would be more concept surface, not less. Flag a project-reshaping dependency (Tailwind-scale)
before adding it; add anything ordinary without asking.

## Working with the maintainer

- **Answer "should I…?" questions before acting.** When asked a diagnostic or confirmation question
  («чи треба X?»), explain and give the exact change, then stop. They often want to make it
  themselves after understanding it; a preemptive edit takes that away.
- **The maintainer is design-detail-driven** and iterates hard on alignment, spacing, colour, and
  wording. "Looks roughly right" is not accepted.
- **Verify visual work by rendering a screenshot and looking at it** — never describe instead of
  checking, and never punt a visual task as "I can't verify this visually". Drive the UI to the state
  with a throwaway Playwright script placed *inside* the repo (so `node_modules` resolves), screenshot
  it, open the PNG, then delete the script.
- **Offer 2–3 rendered variants** when a design choice is genuinely open. They pick from seeing them,
  not from names or ASCII sketches.
- **Interaction-heavy changes (drag, hover, zoom) are confirmed in the running app** by the
  maintainer before being considered done.
- **Git:** solo project, commit straight to `main`, no feature branches. Commit at your own
  discretion at a verified checkpoint. **Never `git push` unless asked in that same turn** — one
  "push" authorises that turn only.
- **A status checkbox flips to done only when the change is in code and verified**, not when it is
  designed or written up.
- **This file tracks the code, in the same commit.** Renaming, finishing or deleting something is
  not done until the lines describing it are updated — grep `CLAUDE.md` for every identifier the
  change touched, and each hit is either still true or it is the drift. The two that rot quietest
  are a requirement in the present tense that is already built ("still open", "not yet") and a name
  that no longer exists. A file that lies is worse than no file, because the next session believes
  it.
- **Don't blind-delete "dead" code during active development** — judge whether it is scaffolding for
  a planned feature; if so keep it and note that it needs wiring.
