# PIETER_STACK.md
> Personal development standards and AI collaboration framework.  
> Upload this at the start of every session across all projects.  
> Last updated: 2026-07-12

---

## 1. WHO I AM

I am Pieter — a personal trainer and solo developer based in Weimar, Germany. I maintain several active projects across web and Android. I am the product owner; the AI acts as primary technical implementer.

**Active projects:**
- **Falkenburg PWA** — Single-file vanilla JS fitness coaching app (`pieter800320.github.io/train`)
- **Forex1212 FX Dashboard** — FX technical analysis dashboard (`pieter800320.github.io/fx_technical`)
- **FX Signal Board** — Separate scanner dashboard (`pieter800320.github.io/fx-signal-board`)
- **Cookie Noter** — Native Android app (Kotlin), distributed via WhatsApp APK

---

## 2. HOW WE COLLABORATE

These are non-negotiable working rules. Apply them in every session.

### Challenge me
- If I suggest something technically weak, unprofessional, or architecturally inconsistent — say so directly.
- Do not implement a bad idea just because I asked for it. Propose a better alternative first.
- Be straightforward. Skip the softening. I prefer honest and direct over polite and vague.

### Explain the why
- Every significant decision must come with a brief rationale.
- Do not just tell me *what* to do — tell me *why* it is the right call in this context.
- If there are trade-offs, name them.

### Flag conflicts
- If a proposed change conflicts with a previous architectural decision, flag it explicitly before proceeding.
- Format: `⚠️ CONFLICT: This contradicts [decision]. Reason it matters: [explanation]. Suggested resolution: [option].`

### Options over single answers
- For non-trivial decisions, offer 2–3 options with a clear recommendation.
- Label them: `Recommended / Alternative / Avoid`.

### Don't fight platform components
- If the same visual or behavioural bug survives two or three targeted patches that each check out correctly in source, stop adjusting the same code path. That pattern means the wrong component is being used, not that the patch was slightly wrong.
- Hand-rolled re-implementations of things the platform already provides (modal sheets, side drawers, swipe-to-dismiss gestures) are a common source of this. They look simpler at first but accumulate edge cases — touch-event arbitration between a drag and a child tap, theme/elevation resolution order, animation timing — that the platform's purpose-built component already solved.
- When this happens, say so directly and propose switching to the platform component, rather than continuing to patch the custom implementation. Two real examples from Cookie Noter: `BottomSheetDialogFragment`'s background/elevation theming fought every attempted fix for several rounds before being replaced with a plain `DialogFragment`; a custom `View.OnTouchListener` swipe-to-close gesture on the settings panel was structurally unable to distinguish a drag from a button tap, and was replaced with `DrawerLayout` in one pass.

---

## 3. DELIVERY RULES

These apply to every code delivery, no exceptions.

| Rule | Detail |
|---|---|
| **Never break working features** | The #1 constraint. Adding something new must not break anything existing. Verify scope before touching adjacent code. |
| **Patch-based delivery** | Default to find/replace diffs, not full file rewrites. For large single-file projects this prevents version drift and reduces errors. |
| **Syntax check before delivery** | For JS: `node -e "new vm.Script(...)"`. For Kotlin: note any unresolved imports or missing context. Never deliver code you have not mentally traced. |
| **Bump SW cache on PWA delivery** | Every Falkenburg/PWA session: increment the service worker cache version string before final delivery. |
| **No dead code** | Do not leave commented-out blocks or unused variables in delivered code. Clean as you go. |

---

## 4. CODE QUALITY STANDARDS

### Universal (all platforms)

- **Comment complex logic** — any non-obvious algorithm, state machine, or conditional chain gets an inline comment explaining intent, not just mechanics.
- **Consistent naming** — follow the convention already established in the project. When starting fresh: `camelCase` for JS variables/functions, `PascalCase` for classes/components, `SCREAMING_SNAKE` for constants.
- **Single-purpose functions** — if a function does more than one thing, it should probably be two functions.
- **No magic numbers** — extract literals into named constants with comments.

### Web / PWA (Vanilla JS)

```js
// Naming
const CACHE_VERSION = 'falken-v42';       // SCREAMING_SNAKE for constants
function renderWorkoutCard(session) {}     // camelCase, verb-noun
class ProgrammeBuilder {}                 // PascalCase

// Structure
// - All JS inline in index.html (single-file constraint)
// - localStorage key: project-specific prefix (e.g. falken_v1, fx_v1)
// - Always guard stale localStorage keys with try/catch + fallback
// - SW cache version bumped every session
```

### Native Android (Kotlin)

```kotlin
// Naming
val trackerList: List<Tracker>            // camelCase properties
fun buildAffirmationSchedule() {}         // camelCase, verb-noun
class CookieNoteRepository {}             // PascalCase classes
const val MAX_TRACKER_NAME_LENGTH = 20    // SCREAMING_SNAKE constants

// Architecture
// - Room for persistence
// - WorkManager for background scheduling
// - AlarmManager for precise notification timing
// - RemoteViews for widget rendering
// - Never call UI operations from background threads
// - parentFragmentManager for dialogs (not childFragmentManager unless nested)
```

### React / JSX (Artifacts)

```jsx
// - Functional components only, hooks-based
// - No localStorage (not supported in Claude artifacts — use useState/useReducer)
// - Tailwind utility classes only (no custom CSS compiler)
// - No <form> tags — use onClick/onChange handlers
// - Default export required
// - All components at module level (not nested inside other components)
```

---

## 5. REUSABLE UI PATTERNS

These patterns have been proven across projects. Reuse the structure, adapt the theme.

### 5.1 Type Scale (4-level system)

```css
/* Universal type scale — adapt values per project theme */
--type-xs: 0.75rem;    /* labels, badges, captions */
--type-sm: 0.875rem;   /* secondary text, metadata */
--type-md: 1rem;       /* body, default */
--type-lg: 1.25rem;    /* headings, section titles */

/* Usage rule: never use raw font-size values — always reference scale variables */
```

### 5.2 Spacing System (8pt grid)

```css
/* Base unit: 8px. All spacing is a multiple. */
--space-1: 4px;    /* tight: icon padding, badge insets */
--space-2: 8px;    /* default component padding */
--space-3: 16px;   /* section gaps */
--space-4: 24px;   /* card padding, modal insets */
--space-5: 32px;   /* section breaks */
--space-6: 48px;   /* page-level margins */
```

### 5.3 Dark-First Color System

```css
/* Establish these tokens per project — do not hardcode hex values in components */
--color-bg:        /* deepest background */
--color-surface:   /* card / sheet surface */
--color-border:    /* subtle dividers */
--color-text:      /* primary text */
--color-text-muted:/* secondary / metadata text */
--color-accent:    /* primary interactive color */
--color-accent-2:  /* secondary accent */
--color-danger:    /* destructive actions */
```

### 5.4 Bottom Sheets (Web)

```js
// Structure: overlay + sheet panel, dragged up from bottom
// State: hidden → visible via CSS class toggle
// Animation: transform translateY + transition (not display toggling)

function openSheet(sheetId) {
  const sheet = document.getElementById(sheetId);
  const overlay = document.getElementById('sheet-overlay');
  sheet.classList.add('sheet--open');
  overlay.classList.add('overlay--visible');
  document.body.style.overflow = 'hidden'; // prevent background scroll
}

function closeSheet(sheetId) {
  const sheet = document.getElementById(sheetId);
  const overlay = document.getElementById('sheet-overlay');
  sheet.classList.remove('sheet--open');
  overlay.classList.remove('overlay--visible');
  document.body.style.overflow = '';
}
```

```css
.bottom-sheet {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  background: var(--color-surface);
  border-radius: 16px 16px 0 0;
  transform: translateY(100%);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 100;
  max-height: 90vh;
  overflow-y: auto;
}
.bottom-sheet.sheet--open {
  transform: translateY(0);
}
.sheet-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.5);
  opacity: 0; pointer-events: none;
  transition: opacity 0.3s ease;
  z-index: 99;
}
.sheet-overlay.overlay--visible {
  opacity: 1; pointer-events: all;
}
```

### 5.5 Sliding Sheets (Android / Kotlin)

**Do not use `BottomSheetDialogFragment`.** It looks like the obvious choice for a bottom sheet, but its default Material theming (`bottomSheetDialogTheme`, `colorSurface`, and dark-theme elevation overlay) will fight a custom background colour — the sheet can render visibly lighter than its declared colour, the bug can appear to fix itself on an unrelated relayout (e.g. backgrounding the app), and it can look exactly like a build-cache or signature problem for several debugging rounds before the real cause (elevation overlay blending `colorSurface` toward white, proportional to the sheet's default ~16dp elevation) is found. This cost real time on Cookie Noter — see its `ADR-009`.

> **Superseded for Cookie Noter's `CookieSheet` only (2026-07-15).** After ~17 hand-rolled
> `DialogFragment` sheets accumulated the same copy-pasted window/drag/height-cap code — the actual
> cause of a recurring dark-scrim-band bug — Cookie Noter deliberately reintroduced
> `BottomSheetDialogFragment` behind one house base class, sidestepping ADR-009's original failure
> by setting `backgroundTint` directly on the sheet's `MaterialShapeDrawable` rather than letting it
> inherit `?attr/colorSurface` (the specific mechanism the elevation-overlay bug rode). See §5.10
> below for the pattern. This is a project-specific, informed exception — the ban above stays the
> default for any *other* project until it independently proves the same workaround.

**Use a plain `DialogFragment` instead, for both bottom and top sheets.** This is the proven, reliable pattern — confirmed working first try on the original top sheets, and successfully retrofitted onto the bottom sheets after the Material approach failed repeatedly.

```kotlin
class ExampleSheet : DialogFragment() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // SlideUpDialogTheme for bottom sheets, SlideDownDialogTheme for top sheets —
        // each just sets windowBackground transparent, windowIsFloating, a dim amount,
        // and a windowAnimationStyle pointing at the matching slide_in/slide_out anim pair.
        setStyle(STYLE_NO_TITLE, R.style.SlideUpDialogTheme)
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View =
        inflater.inflate(R.layout.sheet_example, container, false)
        // Root view's android:background is the sheet's own background drawable —
        // set directly in the layout, never via theme or findViewById hacks.

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        // Swipe-to-dismiss on a dedicated handle View/FrameLayout (not the whole sheet —
        // that would swallow taps on buttons/inputs inside it).
        val dragHandle = view.findViewById<View>(R.id.handleArea)
        var downY = 0f
        dragHandle.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> downY = event.rawY
                MotionEvent.ACTION_MOVE -> {
                    val dy = event.rawY - downY
                    // Bottom sheet: only follow finger downward (dy > 0).
                    // Top sheet: only follow finger upward (dy < 0) — flip the sign.
                    if (dy > 0) view.translationY = dy
                }
                MotionEvent.ACTION_UP -> {
                    val dy = event.rawY - downY
                    if (dy > 100) {
                        dialog?.window?.setWindowAnimations(0)
                        view.animate().translationY(view.height.toFloat())
                            .setDuration(220).setInterpolator(AccelerateInterpolator(1.5f))
                            .withEndAction { dismiss() }.start()
                    } else {
                        view.animate().translationY(0f)
                            .setDuration(160).setInterpolator(DecelerateInterpolator())
                            .start()
                    }
                }
            }
            true
        }

        // Cap at 50% of usable screen height for short/variable content — let it
        // shrink-wrap naturally below that. Only needed when the window height is
        // WRAP_CONTENT; skip this for sheets with a scrolling list (see below).
        view.viewTreeObserver.addOnGlobalLayoutListener(object : ViewTreeObserver.OnGlobalLayoutListener {
            override fun onGlobalLayout() {
                view.viewTreeObserver.removeOnGlobalLayoutListener(this)
                val cap = usableScreenHeight() / 2
                if (view.height > cap) {
                    view.layoutParams = view.layoutParams.apply { height = cap }
                    view.requestLayout()
                }
            }
        })
    }

    override fun onStart() {
        super.onStart()
        dialog?.setCanceledOnTouchOutside(true)
        dialog?.setOnCancelListener { dismiss() }
        dialog?.window?.apply {
            setWindowAnimations(R.style.BottomDialogAnimation) // or AddNoteDialogAnimation for top
            val params = attributes
            params.gravity = Gravity.BOTTOM // or Gravity.TOP
            params.width = WindowManager.LayoutParams.MATCH_PARENT
            params.height = WindowManager.LayoutParams.WRAP_CONTENT
            attributes = params
        }
    }
}

/** Usable screen height — full display height minus the status bar inset. Shared util. */
fun Fragment.usableScreenHeight(): Int {
    val totalHeight = resources.displayMetrics.heightPixels
    val statusBarId = resources.getIdentifier("status_bar_height", "dimen", "android")
    val statusBarHeight = if (statusBarId > 0) resources.getDimensionPixelSize(statusBarId) else 0
    return totalHeight - statusBarHeight
}
```

**If the sheet contains a scrolling list** (not just static content), don't rely on `WRAP_CONTENT` + the global-layout cap above — a `RecyclerView` inside a `WRAP_CONTENT` dialog window has nothing to bound its scroll container against. Instead set `params.height` directly to the cap value (`usableScreenHeight() / 2`) in `onStart()`, so the window itself is a fixed size and the list scrolls properly within it.

**Visual spec (apply to every sheet, no exceptions):**
```
Background:   midnight_cocoa (or project equivalent — the single darkest token),
              drawn via the root view's own android:background, never via theme
Corners:      28dp, rounded on the edge facing away from the screen edge it slides from
              (top corners for a bottom sheet, bottom corners for a top sheet)
Handle:       40dp × 4dp pill, #66AAAAAA, centred in its own dedicated 48dp-tall
              FrameLayout footer — not crowded tight against content
Max height:   50% of usable screen height (status bar excluded)
Dim/scrim:    backgroundDimAmount 0.6 in the dialog theme
```

Required theme + anim pairs (define both directions even if only one is in use yet):
```xml
<style name="SlideUpDialogTheme" parent="Theme.MaterialComponents.Dialog">
    <item name="android:windowBackground">@android:color/transparent</item>
    <item name="android:windowIsFloating">true</item>
    <item name="android:backgroundDimEnabled">true</item>
    <item name="android:backgroundDimAmount">0.6</item>
    <item name="android:windowAnimationStyle">@style/BottomDialogAnimation</item>
    <item name="android:windowSoftInputMode">adjustResize</item>
</style>
<!-- SlideDownDialogTheme is the same shape, pointed at the top-slide anim pair -->
```

### 5.6 Side Panels / Drawers (Android / Kotlin)

**Use `androidx.drawerlayout.widget.DrawerLayout`.** Do not hand-roll a `FrameLayout` + `View.OnTouchListener` swipe gesture for a side panel — a custom touch listener on the panel cannot reliably tell a swipe-to-close drag apart from a tap on a button or switch inside it, because Android routes a touch sequence to whichever view consumes `ACTION_DOWN` first, and a clickable child (any `Button`, `Switch`, etc.) always consumes it before the parent's listener gets a chance to track the drag. This is a structural limitation of Android's touch dispatch, not something fixable by tuning the listener logic — confirmed on Cookie Noter's settings panel, which never reliably tracked a swipe with the hand-rolled approach and worked correctly the moment it was rebuilt on `DrawerLayout` (see `ADR-010`).

```kotlin
// build.gradle.kts
implementation("androidx.drawerlayout:drawerlayout:1.2.0") // usually present transitively
                                                              // via appcompat — pin explicitly
```

```xml
<androidx.drawerlayout.widget.DrawerLayout
    android:id="@+id/drawerLayout"
    android:layout_width="match_parent"
    android:layout_height="match_parent">

    <!-- Main content — must be the single first child -->
    <FrameLayout android:layout_width="match_parent" android:layout_height="match_parent">
        <!-- ... -->
    </FrameLayout>

    <!-- The drawer — any subsequent child, with layout_gravity set to its edge -->
    <FrameLayout
        android:id="@+id/sidePanel"
        android:layout_width="0dp"
        android:layout_height="match_parent"
        android:layout_gravity="end">
        <!-- panel content -->
    </FrameLayout>

</androidx.drawerlayout.widget.DrawerLayout>
```

```kotlin
class SidePanelController(private val activity: Activity) {
    private val drawerLayout = activity.findViewById<DrawerLayout>(R.id.drawerLayout)
    private val panel = activity.findViewById<View>(R.id.sidePanel)

    fun bind() {
        val screenWidth = activity.resources.displayMetrics.widthPixels
        panel.layoutParams = (panel.layoutParams as DrawerLayout.LayoutParams).also {
            it.width = (screenWidth * 0.82f).toInt() // proven width for a 1-handed side panel
        }
        drawerLayout.setScrimColor(Color.parseColor("#99000000"))
    }

    fun open() = drawerLayout.openDrawer(panel)
    fun close() = drawerLayout.closeDrawer(panel)
    fun isOpen() = drawerLayout.isDrawerOpen(panel)
}
```

No custom handle, no custom touch listener, no custom animation code. `DrawerLayout` provides, natively: drag-to-close from anywhere on the open panel (including over buttons — it correctly arbitrates a tap vs. a drag), tap-the-scrim-to-close, and edge-swipe-to-open from the panel's screen edge. Back-press handling still needs to be wired manually (`if (drawerLayout.isDrawerOpen(panel)) drawerLayout.closeDrawer(panel) else super.onBackPressed()`).

```
Width:    82% of screen width — proven comfortable one-handed reach on a 6"+ phone
Overlay:  #99000000 via setScrimColor — matches the dim amount used by the sheet dialogs
Contents: app-level settings only. Per-item management belongs in detail screens and option sheets.
```

### 5.7 Haptic Feedback (Android / Kotlin)

```kotlin
// Light tap — use for most button presses
fun View.hapticTap() {
    performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
}

// Confirmed action — use for saves, completions, toggles
fun View.hapticConfirm() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        performHapticFeedback(HapticFeedbackConstants.CONFIRM)
    } else {
        performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
    }
}

// Error / rejection — use for failed validation, destructive blocks
fun View.hapticReject() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        performHapticFeedback(HapticFeedbackConstants.REJECT)
    } else {
        performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
    }
}
```

### 5.8 Pulsating Animation (Android / Kotlin)

```kotlin
// Subtle scale pulse — use to draw attention to active state
// Parameters: scale 1.08f, duration 1400ms, infinite repeat
// Rule: MANUAL tracker buttons pulse. SCHEDULED/Ritual tracker buttons do NOT pulse.
fun View.startPulse() {
    if (isReduceMotionEnabled(context)) return
    animate()
        .scaleX(1.08f).scaleY(1.08f)
        .setDuration(1400)
        .withEndAction {
            if (isAttachedToWindow) {
                animate()
                    .scaleX(1.0f).scaleY(1.0f)
                    .setDuration(1400)
                    .withEndAction { if (isAttachedToWindow) startPulse() }
                    .start()
            }
        }
        .start()
}
```

### 5.9 Smooth Swipeable / Paged Content (Android / Kotlin)

**Use `ViewPager2` for any linear swipe sequence** — day/week/month views, image galleries, onboarding steps, next/previous record. That part is fully general, no different from any other use of the platform component.

**The reusable core is the binding strategy, not the pager.** A page/row binds *synchronously* from an in-memory cache when the data is already warm (instant, no visible pop-in); on a cache miss it clears itself and launches its own async load, applying the result guarded by a stale token so a recycled holder can never paint the wrong data once it's been rebound to something else. A background prefetcher warms upcoming neighbours as a pure optimisation — it must never be the only thing that fills a page, or any page outside its window renders blank until the next settle (this exact bug shipped once on Cookie Noter's calendar month view before the self-heal was added). For large or networked datasets, use Jetpack Paging 3 instead of hand-rolling this — build it yourself only when the whole dataset is small and local, as here.

```kotlin
// Shape, not a full implementation — adapt per screen.
class PagedContentAdapter<Key, Data>(
    private val scope: CoroutineScope,
    private val cached: (Key) -> Data?,      // sync; null = miss
    private val load: suspend (Key) -> Data, // build + cache, called on a miss
) : RecyclerView.Adapter<PagedContentAdapter<Key, Data>.PageVH>() {
    inner class PageVH(view: View) : RecyclerView.ViewHolder(view) {
        private var boundKey: Key? = null
        fun bind(key: Key) {
            boundKey = key
            cached(key)?.let { return applyData(it) }
            applyData(emptyData())                   // miss: clear, then self-load
            scope.launch {
                val data = load(key)
                if (boundKey == key) applyData(data)  // stale-guard
            }
        }
    }
}
```

**Don't repeat these three mistakes** (each shipped once, each cost a debugging round):
- Loading data inside bind *without* the cache-first check makes the incoming page populate a frame or two late — visible pop-in during the swipe. Bind must be synchronous whenever the data is already warm.
- Allocating a drawable or child view per cell per bind causes GC pauses mid-animation. Reuse `Paint`/`RectF` objects; zero allocation on the hot bind/draw path.
- An unbounded or too-small raw cache (a plain `HashMap`, or an `LruCache` sized smaller than the prefetch span) evicts under normal use and reintroduces the pop-in. Size the cache to comfortably hold the visible page + prefetch span + a few recents, and use `LruCache` so far-scrolling can't leak memory.

**Custom Canvas view instead of a nested RecyclerView-per-page is a targeted optimisation, not a general rule.** Reach for it only when *all four* hold: many cells, uniform, cheap to draw, and the whole page's content changes wholesale (a month grid, a calendar heatmap). It buys draw speed by giving up clickable child views, accessibility, per-view animations, and text selection — for anything heterogeneous (notes, feeds, cards, variable-height text) a `RecyclerView` is still the right call; a canvas there would be a step backward.

### 5.10 Bottom Sheets via `BottomSheetDialogFragment` — the `CookieSheet` pattern (Cookie Noter)

Cookie Noter's sheet system (`CookieSheet`) is the one deliberate, project-scoped exception to
§5.5's `BottomSheetDialogFragment` ban — see the note there for why it was safe to reintroduce.
The pattern, if another project independently hits the same "N sheets, N copy-pasted window/drag
implementations" problem and wants to evaluate it:

- **One base class owns everything the old hand-rolled sheets duplicated**: window mechanics, drag
  physics, scrim fade, IME + edge-to-edge insets, predictive back. Subclasses implement only
  `onCreate` (read args), a `contentLayout` (`@LayoutRes`), and `onSheetCreated(view)` (wire
  views) — never `onCreateView`/`onStart`/`onCreateDialog`.
- **Theming**: set `backgroundTint` directly on the sheet's `MaterialShapeDrawable`
  (`Widget.Material3.BottomSheet.Modal` + a custom `shapeAppearance`), not via `?attr/colorSurface`
  — this is the specific substitution that avoids ADR-009's original elevation-overlay failure.
  28dp corners on the far edge only; Material's own `BottomSheetDragHandleView`, not a hand-rolled
  handle.
- **Single-anchor drag, not the default multi-state behavior**: `BottomSheetBehavior`'s stock
  collapsed/peek anchor is what makes drags feel "sticky" (a drag-down catches there before it can
  dismiss) and makes short content open at half-height. Force `isFitToContents=true` +
  `skipCollapsed=true` + `state=STATE_EXPANDED` unconditionally in `onStart()` — one open↔dismiss
  anchor, like a `DrawerLayout`. Cap `behavior.maxHeight` at ~92% of the screen (nothing spans
  edge-to-edge; tall content scrolls internally via a `NestedScrollView` instead) and set
  `dismissWithAnimation = true` on the `BottomSheetDialog` (without it, a fast flick cuts the
  dismiss animation short and tall sheets appear to vanish halfway down instead of sliding fully
  off).
- **Content archetypes are a convention, not subclasses**: e.g. a header+rows "Menu" shape (no
  keyboard) vs. a fields+one-primary-button "Form" shape (rides above the IME) — both extend the
  same base, the difference is purely in each sheet's own `contentLayout` XML.
- **Resolved (ADR-031, v177–v194): Views' `BottomSheetBehavior`/`CookieSheet` is fully retired in
  Cookie Noter, replaced end-to-end by a Compose sheet island.** The spike (v177) confirmed
  Compose's drag/settle physics were genuinely better than Views' `BottomSheetBehavior`; the full
  rollout (v178–v188, all ~18 sheets) initially did this via Material3's `ModalBottomSheet`. A
  follow-up perf work order then found `ModalBottomSheet` has its own cost Views' sheet never
  had: it wraps every open in a real platform `Dialog`/`Window` (confirmed by reading the
  decompiled material3 source — `ModalBottomSheetDialogWrapper extends ComponentDialog`), needing
  genuine WindowManager IPC each time — measured at **~503ms warm tap-to-visible latency**, next to
  instant for a same-window `DrawerLayout` panel. Fixed in three staged, measured steps (v189–v194):
  (1) rebuild the sheet Dialog-free — scrim + a hand-rolled `AnchoredDraggableState`-driven
  drag/settle (the same public Compose Foundation primitive Material3's own sheet uses internally;
  its own scrim/drag composable is `internal` to the material3 module, not reusable from outside
  it) rendered directly inside the existing same-window `ComposeView` — cut it to ~205ms; (2) make
  that `ComposeView` host resident per-Activity (created once, reused for every open, instead of
  torn down and rebuilt each time) — cut it further to ~175ms, a smaller second win since
  composing/laying out the sheet's own content is most of what's left; (3) proved both changes
  together on a tall Form with internal scroll + a keyboard (nested-scroll handoff, IME push-up,
  predictive back, edge-to-edge scrim/insets all held up, no regression) before generalizing into
  the one shared host every sheet uses. One real bug surfaced generalizing to all 18: sheets that
  open the *next* sheet and dismiss themselves in the same tap (a picker handing off to an editor)
  need their internal drag state fully isolated per open — sharing it let the outgoing sheet's own
  dismiss-completion callback close the incoming sheet before it ever became visible. Fixed by
  wrapping the sheet's internal state/effects in `key(content)` so Compose tears down and rebuilds
  that whole subtree — cancelling the outgoing sheet's in-flight effects — on every distinct open,
  not just on the transition to/from "no sheet open." If another project hits this same ceiling:
  Compose's own `ModalBottomSheet` is the fast way to a better *feel*; only reach for the
  Dialog-free rebuild above if a measured tap-to-open delay (not a guess) actually clears a real
  bar (Cookie Noter's was ~500ms against a near-instant same-window reference) — for most apps
  `ModalBottomSheet`'s own cost is a fine trade for not maintaining a hand-rolled sheet.
- **A destructive yes/no confirm is a plain `AlertDialog`, not a sheet** — it isn't a modal surface
  in the same sense a menu or form is.
- **A sheet that needs a real row id upfront (e.g. so photo/doc attachments have somewhere to
  attach to) shouldn't leave that row behind just because the sheet opened.** Cookie Noter's
  `QuickNoteSheet` (v195) is the pattern: the caller inserts the note's DB row *before* opening the
  sheet (attachments need a real id immediately), but dismissing without ever tapping Save used to
  leave a permanent blank row — "opening then closing creates a note" was Pieter's own complaint.
  Fix: a `saved` flag set only inside the real save path, plus a `DisposableEffect(Unit) {
  onDispose { ... } }` that runs on *every* way out of the sheet (Save, back, scrim tap, drag-
  dismiss — `onDispose` doesn't care which) and discards the row if `!saved` **and** a fresh DB
  query confirms no attachment ended up attached to it (query the DB directly, don't trust the
  composable's own in-memory attachment list — it can be stale if a pick's own reload hasn't landed
  yet, which would otherwise let the cleanup race a just-added photo). The cleanup coroutine must
  run on a **detached scope** (`CoroutineScope(Dispatchers.IO).launch { ... }`), not the composable's
  own `rememberCoroutineScope()` — that scope is being cancelled in this same moment as the
  composable disposes, so work launched on it can die before the delete finishes.

### 5.10.1 Composable state isolation across a `pending`-style resident host

The reentrancy bug above (§5.10) generalizes beyond sheets: **any resident host that swaps a
`mutableStateOf<Content?>` in and out — instead of creating a fresh composable subtree per
"session" — must key that subtree's internal `remember`/`LaunchedEffect` calls on something that
actually changes per session** (the content lambda itself is the simplest choice, since two
distinct call-site closures are never `equal`). Without that key, replacing the pending content
mid-flight (anything that shows the next thing and tears down the current one in the same handler)
silently reuses the old session's `remember`ed state and in-flight effects instead of starting
fresh ones — exactly the class of bug that made "+ New Item → Event" silently open nothing, since
the outgoing sheet's own dismiss-completion effect fired against what was, from Compose's
perspective, still "the same" composition.

### 5.11 Speed-Dial FAB (Android / Kotlin)

A FAB that fans out into 2–4 related actions. Material has no first-party speed-dial component
(the old answer was the third-party FabSpeedDial lib), so hand-roll it in Views rather than take a
dependency — it's ~40 lines of animation over a `FrameLayout` overlay.

**Structure.** Wrap the screen content in a `FrameLayout` (so the FAB layer floats over it),
containing, in z-order: a full-screen scrim `View` (tap-to-close), a bottom-right vertical
`LinearLayout` of action rows (each = a label pill + a mini `FloatingActionButton`), and the main
FAB. Everything except the FAB starts `visibility="gone"`.

**Open animation.** Scrim fades in; the main FAB rotates 45° (＋→✕); each action row animates in
with a staggered `translationY` + alpha + scale (0.85→1), ~40 ms apart, ~180 ms each, decelerate.
Close reverses it (stagger top-down, faster). The rows nearest the FAB are the most-used actions
(closest to the thumb).

**Non-negotiables:**
- Respect reduce-motion. Gate on `ANIMATOR_DURATION_SCALE == 0` and just show/hide instantly — no
  stagger, no rotation.
- Every part of a row is the tap target — the label pill and the mini-FAB and the row all fire the
  same action (a label that looks tappable but isn't is the first bug users hit). Give the label a
  `?attr/selectableItemBackground` ripple.
- Back closes it first. `if (isOpen) close() else super`.
- Haptic tap on the FAB and each action.

**Purpose it well.** A speed-dial earns its place when the FAB has one clearly-primary job plus a
few siblings — reach for it to expose quick capture (log / jot / remind), not to bury unrelated
navigation.

---

### 5.12 Control pills (Android / Kotlin) — the ONE golden-rimmed pill

Every toggle / filter / selector "pill" in Cookie Noter shares one look and one press, and the
**launcher item/sorting chips are the canonical template**. Any new such control (incl. the coming
Routine rebuild) must adopt this — do not hand-roll a new pill look.

- **Shape / colour:** `bg_control_pill` (neutral: baked-crust, 12dp squircle) and
  `bg_control_pill_selected` (active: soft-gold wash `#29F59E0B` + gold rim `#8CF59E0B`).
- **Font:** `@style/TextAppearance.Cookie.ChipLabel` (13sp nunito over Material LabelLarge — its
  letter-spacing/weight is what makes chips and pills match; plain nunito looks subtly off).
- **Press:** `pill_press_ripple` — a `~25% white` ripple masked to the squircle (the "momentary
  white flash"). **No scale animation** on pills — ripple only, like the chips.
- **Apply it:** `View.styleAsControlPill(selected)` (in `ControlPill.kt`) sets background + ripple
  on any View, plus text appearance + state text-colour when the receiver is a TextView (an
  icon-only pill — an ImageView, e.g. the calendar's "today" locate icon — gets the same
  background/ripple with no text to restyle). Material `Chip`s get the same via `Widget.Cookie.Chip`
  + the `control_chip_*` colour selectors. Both routes resolve to the same pixels.
- **Charts follow suit:** metric chart bars use the same gold-wash-fill + gold-rim treatment
  (`MetricChartView`), so data viz reads as part of the same family.

## 6. DESIGN PRINCIPLES

### 6.1 Mobile-First, Touch-First

Every UI decision starts with the question: how does this feel on a phone, tapped with a thumb?

- Primary actions reachable with one hand
- Destructive actions require confirmation
- No hover states — use press states instead
- Swipe gestures follow platform conventions (down to dismiss sheets, right to close right panels)

### 6.2 Dark-First Theming

All projects default to dark backgrounds. Light mode is not a target.

- Background layers: at least two distinct dark surfaces (background + card/sheet)
- Text contrast: minimum WCAG AA (4.5:1 for body, 3:1 for large text)
- Accent colours: warm, slightly desaturated — avoid pure primaries

### 6.3 Touch Targets — Minimum 48dp

```xml
<!-- Any tappable element must meet this minimum -->
<View
    android:minWidth="48dp"
    android:minHeight="48dp" />
```

```css
.touch-target {
  min-width: 48px;
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

### 6.4 Reduce Motion — Respect System Preferences

```kotlin
fun isReduceMotionEnabled(context: Context): Boolean {
    return Settings.Global.getFloat(
        context.contentResolver,
        Settings.Global.ANIMATOR_DURATION_SCALE,
        1f
    ) == 0f
}
```

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 6.5 State Feedback — Every Action Needs a Response

| Interaction type | Minimum response |
|---|---|
| Button tap | Ripple / colour change + haptic |
| Form submit | Spinner or disabled state while processing |
| Background process | Progress indicator or status text |
| Success | Confirmation (snackbar, animation, or state change) |
| Error | Clear error message — never silent failure |
| Empty state | Purposeful UI — not a blank screen |

### 6.6 Error and Empty States Are First-Class Citizens

Every screen needs three designs: Populated / Empty / Error.

```kotlin
// Toggle between empty state and content
fun updateEmptyState(isEmpty: Boolean) {
    binding.emptyState.isVisible = isEmpty
    binding.recyclerView.isVisible = !isEmpty
}
```

### 6.7 Information Density — Pick a Lane

| Project | Target density | Implication |
|---|---|---|
| Falkenburg PWA | Spacious | One primary action per screen. Settings in drawer. |
| Cookie Noter | Spacious | Cards breathe. Widget is dense by necessity — acceptable exception. |
| FX Dashboard | Dense | Data wins. Spacing is secondary to information. |

---

## 7. BUTTON TIER SYSTEM (Web)

Three tiers. One CTA per screen maximum.

```css
/* Tier 1: CTA — primary action, one per screen */
.btn-cta {
  background: var(--color-accent);
  color: var(--color-bg);
  font-weight: 700;
  padding: var(--space-3) var(--space-4);
  border-radius: 12px;
  border: none;
}

/* Tier 2: Accent — secondary actions */
.btn-acc {
  background: transparent;
  color: var(--color-accent);
  border: 1.5px solid var(--color-accent);
  padding: var(--space-2) var(--space-3);
  border-radius: 10px;
}

/* Tier 3: Ghost — tertiary, destructive, or low-priority */
.btn-ghost {
  background: transparent;
  color: var(--color-text-muted);
  border: none;
  padding: var(--space-2) var(--space-3);
}
```

**Android equivalent for settings/neutral context buttons:**
Dark surface (`#1F2937`), subtle border (`#33F9FAFB`), cream text. Never use the primary accent colour for settings-context actions.

---

## 8. ARCHITECTURE DECISION RECORD (ADR) FORMAT

```
## ADR-001
Date: YYYY-MM-DD
Decision: [What was decided]
Reason: [Why — include what alternatives were considered]
Consequence: [What this constrains or enables going forward]
Status: Active | Superseded by ADR-XXX | Partially superseded
```

---

## 9. PROJECT_CONTEXT.md TEMPLATE

```markdown
# PROJECT_CONTEXT.md — [Project Name]
Last updated: YYYY-MM-DD | Version: vX

## Current state
[One paragraph: what exists and works right now]

## Active branch / focus
[What is currently being built or fixed]

## Architecture
[Key structural decisions — single file? which DB? which patterns in use?]

## Known issues
[Bugs or rough edges that exist and are deferred]

## Decision log
[ADR entries — most recent first]

## Next priorities
[Ordered list of what comes after the current focus]
```

---

## 10. WHAT THIS DOCUMENT IS NOT

- It is not a substitute for a `PROJECT_CONTEXT.md` — that handles per-project state.
- It is not a design spec — visual details live in each project's theme tokens.
- It does not override project-specific constraints — if a project already has an established pattern that differs, flag the conflict and decide intentionally.

---

## 11. END-OF-SESSION UPDATE PROMPT

```
We are done for today. Update [PROJECT]_CONTEXT.md based on everything we did this session.
Specifically:
- Update "Current state" to reflect what now exists and works
- Move completed items out of "Next priorities"
- Add any new known issues discovered
- Add an ADR entry for any architectural decision we made
- Update "Last updated" date
- Flag anything I should verify manually before the next session

Output as a complete updated file, ready to replace the current one.
```

**Rules for this to work:**
- Run it while the chat is still open — the AI has full session context now, not tomorrow.
- Keep one master copy of each context file locally (notes app, Google Drive, desktop folder).
- Always upload the file you received at the end of the last session — that chain of custody is the system.

---

*PIETER_STACK.md is a living document. Update it when a pattern proves itself across two or more projects.*
