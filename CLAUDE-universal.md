# <PROJECT NAME> — how we work

Static HTML/CSS/JS site built from Figma, page by page. No build step, no framework.

> Template. Fill in every `<…>` placeholder, then delete this note. Keep this file current: update the status table, the components list and the "flagged to the client" section after each piece of work.

## Project structure

```
index.html  <other pages>.html
css/normalize.css   css/style.css   css/media.css   css/vendor/*.css
js/main.js          js/vendor/*.js
assets/fonts  assets/icons  assets/images
```

Hard rules:
- Only these CSS files: desktop styles → `style.css`, all responsive overrides → `media.css`. Vendor CSS lives in `css/vendor/`. No per-page CSS files.
- Only `js/main.js` (vanilla JS, no jQuery). Every feature is an `initX()` that returns early if its elements are missing, so one file serves all pages. Hook into markup with `data-*` attributes, not with styling classes.
- Vendor libraries are local files in `*/vendor/`, pinned to an exact version, never loaded from a CDN.
- Header, footer and any announcement bar have identical markup on every page. Change one, change them all.
- Reuse existing components, tokens and assets before adding new ones. Before saving a Figma export, check for duplicate images by md5 (`md5 -q file`).
- Colours, radii, container width, easing and fonts are CSS custom properties on `:root`. No magic hex values in components.
- Never commit unless the user asks.

## Figma

- File: "<FIGMA FILE NAME>", key `<FIGMA_FILE_KEY>`. If the file gets copied, node ids stay the same; record the old keys here.
- Figma MCP is the source of truth. Workflow per frame:
  1. Run `get_metadata` on the frame to get the section list and positions.
  2. Run `get_design_context` per section, with the screenshot on.
  3. Build.
  4. Measure in the browser.
  5. Compare to the Figma positions.
- Treat the generated code as a reference only. Translate absolute positioning into flex or grid, and use the project's tokens and components.
- Download MCP assets with curl, **including the file extension** in the URL. Strip `preserveAspectRatio="none" overflow="visible" style="display: block;"` from SVGs before saving.
- Figma sometimes clips text with fixed-height frames, stretches images, or has typos and inconsistent spacing. Don't copy those bugs. Show the full text, keep images undistorted, and tell the user about every deviation.
- Missing content (draft copy, placeholder reviews, missing prices) goes in "Content flagged to the client" below.

## Breakpoints (`css/media.css`)

| Range | Approach |
|---|---|
| ≥1920px | Desktop, exact Figma values (`style.css`) |
| 1280–1919px | Laptop: every px value × 0.75, container <1200>px (`@media (min-width: 1280px) and (max-width: 1919px)`) |
| ≤1279px | **Tablet** (Figma "… — tablet 1024" frames): desktop sizes 1:1, fluid container with 32px gutters, stacked layouts |
| ≤960px | Narrow-tablet tweaks (e.g. stack 2-column card rows) |
| ≤768px | **Mobile** (Figma "… — mobile 360" frames): 16px gutters, single column |

- Order of work per page: 1920 → laptop ×0.75 → tablet 1024 → mobile 360.
- No `transform: scale()`, `zoom` or vw-based layout sizing. Fluid width comes from the container and grid/flex, not from vw.
- In `media.css`, the shared blocks for each breakpoint come first. Page-specific blocks come after them, so they take precedence. Label every block with a comment.
- Before a page has its real tablet or mobile design, it may rely on "Interim fixes" blocks that only stop horizontal overflow. When the real design lands, delete that page's interim lines.
- A `<br>` that gets hidden on smaller screens must have a space before it in the HTML (`text <br>more`), or the words run together.
- Line breaks that exist only in the design go in a `<br class="…">` you can hide. Never break text with fixed widths.

## Components and patterns

Document each shared component here when you create it: class names, modifiers, `data-*` hooks, the `init` function, and the Figma node id.

- **Icons:** SVG masks, `<span class="icon icon--name" aria-hidden="true">`. They take their colour from `currentColor` and their size from `--icon-size`. One SVG file per icon in `assets/icons/`.
- **Buttons:** `.btn` plus modifiers (`--primary/--outline/--white/--ghost`, sizes `--md/--lg/--xl`). Never create a new button class for one place.
- **Custom dropdown:** `[data-dropdown]` root, a toggle with `aria-expanded`/`aria-controls`, and a `role="listbox"` menu with `role="option"` items. The value lives in the root's `data-value`, and the component fires `change` on the root. It closes on outside click and on Esc, and supports arrow keys.
- **Mobile menu / drawers:** a toggle with `aria-expanded`, a backdrop, and Esc to close. Lock page scroll while open (and stop smooth scroll, if it's used).
- **Inner-page banner:** one shared hero class plus a per-page modifier. Per-page differences go through custom properties (e.g. `--hero-overlay`), not duplicated rules.
- **Page background patterns** (grid, texture): put them on **one wrapper** around everything between the banner and the footer, never per section. Sections inside stay transparent. Spacing under the banner goes on `.hero + .wrapper` (padding-top), so the pattern starts right at the banner edge. Offset the pattern so it opens the way the design does (e.g. half a cell).
- **Dismissible bars and notices:** remember "closed" in `sessionStorage`, not `localStorage`. A permanent flag makes important content vanish for good, and nobody remembers why.
- **Cart and other state:** frontend only, exposed as one global (`window.<Project>Cart`). Keep it to the current page's DOM.

## Animations and smooth scroll (if used)

- **Scroll animations (e.g. AOS):** set the attributes in `main.js` from one `ANIMATIONS` list (selector → effect, optional stagger), not in the HTML. Re-run the library's refresh after showing, hiding or reordering content. Nothing inside tabs or sliders animates. Respect `prefers-reduced-motion`.
- **Transforms create stacking contexts.** An animated or hover-lifted element paints over popups in earlier siblings. Any bar or toolbar that holds a dropdown or popover gets `position: relative; z-index: <n>` so its menu opens over the content below.
- **Measuring scroll targets:** while elements are animating, use `offsetTop` (not `getBoundingClientRect`), because a transform shifts the rect.
- **Smooth scroll (e.g. Lenis):**
  - Inner scroll areas (drawers, modals, long lists) must keep native scroll. Use the library's `prevent` option or `data-lenis-prevent`.
  - Stop smooth scroll while a drawer or modal is open.
  - In-page `#` links must land below the sticky header.

## Accessibility baseline

- Semantic landmarks (`header`, `nav`, `main`, `footer`) and one `h1` per page.
- Every control is a real `<button>` or `<a>`.
- Icon-only buttons have an `aria-label`. Decorative icons and images have `aria-hidden="true"` or `alt=""`.
- Use `aria-expanded`/`aria-controls` on toggles and `aria-live="polite"` on status text that changes.
- Focus states are visible. Everything works from the keyboard (Tab, Enter/Space, Esc, arrow keys in listboxes).

## Status (<month year>)

| Page | Desktop/laptop | Tablet 1024 | Mobile 360 |
|---|---|---|---|
| <Page> | todo (node <id>) | todo (node <id>) | todo (node <id>) |

## Content flagged to the client

- <e.g. "FAQ: 17 of 18 answers are draft copy">

## How to verify (every change)

1. Run `python3 -m http.server 8765` in the project folder. Stop it afterwards with `pkill -f "http.server 8765"`.
2. In the browser (chrome-devtools MCP), measure section positions with `getBoundingClientRect` and compare them to Figma.
3. Check for horizontal overflow (`scrollWidth > width`) at 1920, 1440, 1280, 1279, 1024, 960, 769, 768, 600, 360 and 320px:
   - Sweep with iframes of the given width.
   - Reload CSS/JS with `fetch(url, {cache: 'reload'})` or `ignoreCache` first; stale files have caused false alarms.
4. For dropdowns, menus and drawers, open them and use `document.elementFromPoint` at their centre to confirm they really are on top. Make sure the element under test is visible first (open tab, finished animation, non-zero rect).
5. Regression: the other pages keep the same height at 1920/1440 and at the widths already designed, and the console has no errors (a missing `favicon.ico` 404 is harmless).
6. Report deviations from Figma honestly, along with what was verified and what wasn't. Nothing is committed unless the user asks.
