# Julia Usova — Makeup Artist landing — how we work

Static HTML/CSS/JS site built from Figma, page by page. No build step, no framework. Based on `CLAUDE-universal.md` (kept as the template).

Keep this file current: update the status table, the components list and the "flagged to the client" section after each piece of work.

## Project structure

```
index.html
css/normalize.css (v8.0.1)   css/style.css   css/media.css
css/vendor/lenis-1.1.13.css  css/vendor/aos-2.3.4.css
js/main.js
js/vendor/lenis-1.1.13.min.js  js/vendor/aos-2.3.4.js
assets/fonts  assets/icons  assets/images  assets/images/decor
tools/scale-laptop.py          (generates the laptop ×0.75 block of media.css)
tools/lighthouse.sh            (Lighthouse runner)    tools/lh-summary.mjs (report summary / before-after)
lighthouse/                    (saved reports: lighthouse-<name>.json/.html)
package.json, node_modules/    (tooling only: lighthouse 13.5.0, sharp 0.35.5, lightningcss 1.33.0, esbuild 0.28.2 devDependencies; esbuild's install script is not approved and not needed)
tools/optimize-images.mjs, tools/images.config.json   (responsive WebP/AVIF variants from ../julia-usova-originals/images/)
tools/build-css.mjs            (bundles + minifies CSS into css/site.min.css; `npm run build:css`)
tools/build-js.mjs             (bundles Lenis + AOS + minified main.js into js/site.min.js; `npm run build:js`)
tools/images.manifest.json     (generated: widths per image and whether it has AVIF)
```

### Images (responsive WebP)

- **Originals** (PNG from Figma) live **outside the project** in `../julia-usova-originals/images/` (override with `IMAGES_SRC=/path`) and are never edited or served. The site uses `assets/images/<name>-<width>.webp`.
- `node tools/optimize-images.mjs` rebuilds all variants from `tools/images.config.json` (`widths` per image). Lanczos3, never upscaled. Quality is adaptive per variant: WebP q90 → 94 → 97 → 100 until PSNR ≥ 42 dB vs the original at the same width; q100 is accepted at ≥ 40 dB, otherwise near-lossless. The script prints the quality and PSNR of every file. (`sharp.cache(false)` is required, or the PSNR is measured on a cached earlier encode.)
- **Widths** = the CSS size each `<img>` actually needs (cover crops included) at every breakpoint × 2, plus × 3 on phones, capped at the original width. Large full-bleed photos (hero, expertise, case, lessons palettes, footer) are shown larger than their originals, so they have a single full-resolution variant.
- **AVIF twins:** for every WebP variant the script also encodes AVIF (4:4:4 chroma) at the lowest quality whose PSNR ≥ the WebP's (capped at 44 dB, because near-lossless WebP only exists where lossy WebP could not reach 40 dB). An image gets AVIF only if all its widths pass and the AVIF set is smaller; the result is written to `tools/images.manifest.json`. 16/17 images have AVIF (about-backstage: WebP only). Hero 595 → 174 KB at 41.4 dB.
- AVIF images are wrapped as `<picture><source type="image/avif" srcset=… sizes=…><img …webp…></picture>` on one line. `picture { display: contents }`, so the `<img>` lays out exactly as before; rules written as `.x > *` also list `.x > picture > img` (hero media, services inner, lessons media). Verified: identical image geometry at 8 widths.
- Every `<img>` has `srcset` (all widths, `w` descriptors) and `sizes` with one entry per breakpoint: `(max-width: 359px) …, (max-width: 480px) …, (max-width: 768px) …, (max-width: 1279px) …, (max-width: 1919px) …, <desktop>`. The expertise photo is `100vw` on desktop/laptop. No `<picture>` wrappers (CSS selects the `<img>` directly).
- **Adding or resizing an image:** measure its CSS box at each breakpoint, add the widths to the config, run the script, write `srcset`/`sizes`. Never put originals into `assets/`.
- The grain overlay is `about-grain-256.webp`: a lossless 256×256 crop of the 1024 texture, shown at `background-size: 256px` (192px on laptop), so it renders pixel-identical.
- Verified: rendered page vs the original PNGs at 1920 @2x: hero 44.2 dB, About 45.3 dB, polaroids 48.4 dB (visually identical).

### CSS bundle

- `tools/build-css.mjs` concatenates the five sources in cascade order and minifies them with lightningcss (108.8 KB → 80.9 KB, one request instead of five).
- It has explicit `targets` (Safari/iOS 16.4, Chrome/Edge 111, Firefox 113: the oldest the site already needs for `color-mix`). Without targets lightningcss drops `-webkit-backdrop-filter`, which Safari < 18 needs. Check after changes: the number of `-webkit-backdrop-filter` in the bundle must equal the sources.
- AOS/Lenis CSS stays render-blocking (inside the bundle) on purpose: loading AOS CSS late would show hero elements and then hide them for their entrance animation.
- Verified identical rendering: every computed property of every element (and ::before/::after) at 8 widths, sources vs bundle, scripts off. Only 0.01px rounding and `background-position 0%` → `0px` on buttons without background images differ.

### Performance testing

- `npm install` once (project-local Lighthouse 13.5.0; Node ≥ 22.19).
- `npm run lh -- <name> [mobile|desktop]` → `lighthouse/lighthouse-<name>.json` + `.html`. Starts/stops `python3 -m http.server 8765` itself if the port is free. Headless Chrome from `/Applications/Google Chrome.app` (override with `CHROME_PATH`).
- `npm run lh:summary -- lighthouse/lighthouse-before.json [lighthouse/lighthouse-after.json]` → metrics table, failing audits/insights sorted by savings, main-thread breakdown, largest requests, LCP element.
- Lighthouse mobile uses *simulated* throttling (Lantern): it replays the observed request graph on slow 4G. Requests that start before the observed LCP inflate the simulated LCP.
- Tried and rejected (median of 3 runs, no gain or worse): `<link rel=preload>` for the hero photo (competes with the CSS), dropping its `fetchpriority="high"`, and deferring below-the-fold images (upper bound −0.8 s, not worth the pop-in and no-JS fallback). What moved LCP was fewer early bytes (AVIF).
- Simulated LCP varies ±1.5 s between runs here (6.2–7.7 s for identical code). Compare medians of 3 runs, never single runs; A/B a change by toggling only that change.
- `python3 -m http.server` sends no `Cache-Control`, so `cache-insight` always fails locally; caching is a hosting setting.
- Chrome DevTools MCP comes from the ECC plugin (`chrome-devtools-mcp@1.10.1`): use it for DOM/Console/Network/traces.

### Deploy (Vercel)

- GitHub `halubouski1/julia-usova-landing`, branch `main` → Vercel. **No build on Vercel:** `vercel.json` sets `framework: null`, `installCommand: ""`, `buildCommand: ""`, `outputDirectory: "."`, so the repo root is served as-is. Without it Vercel runs `npm run build` and then fails with `STATIC_BUILD_NO_OUT_DIR` (it expects `public/`).
- That means **the generated files must be committed**: run `npm run build` (and `npm run build:images` for new images) locally before every push; `css/site.min.css`, `js/site.min.js`, `assets/images/*.webp|avif` and `assets/fonts/*` are in git.
- `.vercelignore` keeps docs, tooling, reports and CSS/JS sources off the live site (`CLAUDE*.md`, `tools/`, `lighthouse/`, `package*.json`, sources). When adding a file the page loads, check it is not matched there.
- No custom cache headers yet: CSS/JS filenames are not versioned, so long caching could pair new HTML with old CSS. Add versioned filenames (or `?v=<hash>` written by the build) before long `Cache-Control` for CSS/JS; images and fonts could get long caching once their names change on every content change.

- One inline script is allowed, in `<head>`: it sets `--fixed-vh` before the first paint (the hero height). `main.js` keeps it in sync when the window width changes.

Hard rules:
- Only these CSS files: desktop styles → `style.css`, all responsive overrides → `media.css`. Vendor CSS lives in `css/vendor/`. No per-page CSS files.
- **The page loads only `js/site.min.js`** (Lenis + AOS + minified main.js, built by `npm run build:js`). Edit `js/main.js`; never edit or hand-link the bundle. `npm run build` = CSS + JS.
- **The page loads only `css/site.min.css`**, a generated bundle (normalize → vendor → style → media, minified). After editing any CSS source run `npm run build:css` (it regenerates the laptop block, then the bundle). Never edit `site.min.css`; never link the sources from HTML.
- Only `js/main.js` (vanilla JS, no jQuery). Every feature is an `initX()` that returns early if its elements are missing, so one file serves all pages. Hook into markup with `data-*` attributes, not with styling classes.
- Vendor libraries are local files in `*/vendor/`, pinned to an exact version, never loaded from a CDN.
- Header and footer have identical markup on every page. Change one, change them all.
- Reuse existing components, tokens and assets before adding new ones. Before saving a Figma export, check for duplicate images by md5 (`md5 -q file`).
- Colours, gradients, radii, container width, easing and fonts are CSS custom properties on `:root`. No magic hex values in components.
- Never commit unless the user asks.

## Figma

- File: "Мейкап Артур (Copy)", key `KjJyeA5pJFIxovSCJmfX2o`. Desktop frame: "Frame 12", node `61:2`, 1920×9795. Mobile frame: "Frame 13", node `61:242`, 360×9363. No tablet frame.
- The frame is flat: no section frames, many stacked and hidden layers. Section boundaries below were derived from the layer positions.
- Figma MCP is the source of truth. Workflow per frame: `get_metadata` → `get_design_context` (screenshot on) → build → measure in the browser → compare to Figma positions.
- Treat the generated code as a reference only. Use the project's tokens and components.
- Download MCP assets with curl, **including the file extension**. Strip `preserveAspectRatio="none" overflow="visible" style="display: block;"` from SVGs before saving.
- **Rotated nodes:** in `get_metadata`, x/y of rotated layers is NOT the bounding box. Use the generated code (its wrappers are bounding boxes).
- **Masks on rotated layers:** the MCP's `mask-size` is the mask's bounding box, but the mask PNG is the unrotated shape (PNG size ÷ 2). Solve the unrotated window from the bbox: `W = (BW·cos − BH·sin) / (cos² − sin²)`, `H = (BH·cos − BW·sin) / (cos² − sin²)`. The window is centred on the bbox centre (see Polaroid below).
- Figma sometimes clips text with fixed-height frames, stretches images, or has typos and inconsistent spacing. Don't copy those bugs. Show the full text, keep images undistorted, and tell the user about every deviation.

### Section map (frame y → page)

| Section | Figma y | Height | Notes |
|---|---|---|---|
| `.header` | 0 | — | absolute over the hero |
| `.hero` | 0–1197 | `var(--fixed-vh)` (100vh) | `overflow:hidden`, media layer = Figma group 61:11. Title pinned to the top (210); tagline / cards / buttons / glows 1–2 pinned to the bottom with the Figma distances from 1197 (428 / 83 / 85). At a 1197px-tall window it is exactly Figma. |
| `.about` | 1197–2567 | 1370 | cream; circles 61:6 visible only from y 1657 |
| `.expertise` | 2567–3966 | 1399 | `overflow:hidden` (clips "Rio de Janeiro") |
| `.services` | 3966–6614 | 2648 | services + "Considered for every setting"; `z-index:2`, rounded bottom 20; brush polaroid pokes 76px up into expertise |
| `.lessons` | 6554–8586 | 2032 | `margin-top:-60px`, sits under the services' rounded corners |
| `.footer` | 8254–9795 | 1541 | `margin-top:-332px`, `z-index:3`, `overflow:hidden`; its curved black top (61:199) covers the lessons and stretches to 100% width (`footer-curve.svg` has `preserveAspectRatio="none"` on purpose) |

Lessons haze/palettes are centred on their Figma centre x and are never narrower than the viewport (`max(<figma width>, 100% + 160px)`), so wide screens get no gaps.

Inside a section, children are positioned with section-relative px (`top = figmaY − sectionTop`). Full-bleed decorative layers align to the design frame with `left: var(--frame-left)` (`calc(50% − var(--container) / 2)`), so wider screens keep the composition centred.

**Horizontal anchors** (so the layout survives viewports narrower than the scaled frame, e.g. 1280 < 1440):
- Left half → `left: figmaX`.
- Right half → `right: 1920 − figmaX − width` (about photos 1/5/6/8/9, services cards, polaroids, lessons aside, footer legal/to-top/dev).
- Centred → `left: calc(50% ± …)` (services heading, case, features 01/02). Their containers (`.services__polaroids`, `.services__features`) span the full width (`left:0; right:0`) so `%`/`right` resolve.
- The polaroids are anchored right like the cards, so they keep their Figma distance to the cards and only the empty left side shrinks.
- `.about` and `.services` have `overflow-x: clip` (not `hidden`: the brush polaroid must still overflow upwards).

## Breakpoints (`css/media.css`)

| Range | Approach |
|---|---|
| ≥1920px | Desktop, exact Figma values (`style.css`) |
| ≤1919px | Laptop: every px value × 0.75, `--container: 1440px` (`@media (max-width: 1919px)` — it cascades below 1280 too; the compact blocks override it). **Generated** — see below |
| ≤1279px | **Compact** (tablet + mobile): the mobile Figma frame scaled by `--m: 1.35`, `--spread: 1.9` |
| ≤960px | No extra rules (the ≤1279 composition holds) |
| ≤768px | `--m: 1.2`, `--spread: 1.25` |
| ≤480px | `--m: 1`, `--spread: 1` — exact mobile Figma (360) |
| ≤359px | `--m: 0.889` (320/360) + the lessons button fits the column |

- Order of work per page: 1920 → laptop ×0.75 → tablet 1024 → mobile 360.
- **Laptop block is generated:** after any change to `style.css`, run `python3 tools/scale-laptop.py`. It copies every declaration with px values, × 0.75 (1px hairlines/borders kept), into the block between `/* laptop:generated:start */` and `/* laptop:generated:end */` in `media.css` (shared selectors first). Never edit inside the markers. Hand-written laptop overrides go after the end marker: images sized only by HTML `width`/`height` attributes (logo, hero glows, circles, stat icon, sparkles, dev logo) and the burger gap (kept 3px so the 1px lines stay on whole pixels).
- JS effects need no laptop changes: they measure geometry from the DOM (scrub distance stays 260px, parallax speeds are relative).
- No `transform: scale()`, `zoom` or vw-based layout sizing.
- In `media.css`, the shared blocks for each breakpoint come first, page-specific blocks after. Label every block with a comment.
- The desktop is an art-directed collage: section heights are fixed and blocks are absolutely positioned.

### Compact layout (≤1279: tablet + mobile)

- **Source of truth: the mobile frame 61:242.** Every value is the Figma 360 value written as `calc(Npx * var(--m))`. `--m` scales the whole composition per range (see table). At ≤480 the page is exactly Figma: height 9363 with the hero at 913, 44/46 positions within 1.5px.
- **Horizontal anchoring:** content uses offsets from the centre — `calc(50% ± Npx * var(--m))` where N = figmaX − 180. So the content is a centred column of 360 × m with full-bleed backgrounds and decor. Exceptions:
  - Hero text follows the screen edges (`left/right: N * m`), like the logo/burger.
  - The About collage x-offsets use `--spread` instead of `--m`, so on tablets the photos spread towards the edges like on desktop.
- **Not scaled:** buttons (65/52px, desktop internals) and form fields (51px). Only their placement scales.
- **Hero:** `height: var(--fixed-vh)`, `min-height: 560 × m`. Title from the top, tagline + "View Portfolio" from the bottom. Hidden: stat cards, "Booking Enquiries", glows (off-canvas in the mobile frame).
- **Sections (mobile frame y):** about 913–1939 · expertise 1939–3300 · services 3300–6128 · lessons 6060–7371 (`margin-top: -68m`) · footer 7243–9363 (`margin-top: -128m`). The dark → red gradient 62:440 (2576–5082) is split across expertise (`::after` of `.expertise__media`) and `.services__bg-top` with the same `background-size` and an offset `background-position`.
- **Mobile-only assets** via `<picture>` (`media="(max-width: 1279px)"`): `footer-curve-mobile.svg`, `circles-light-mobile.svg`.
- **Mobile-only markup:** the 4th service card `.service-card--compact-only` (hidden ≥1280); `<br class="br-compact">` breaks (hidden ≥1280), `<br class="br-design">` breaks (hidden ≤1279).
- **Polaroids** were solved from the mobile masks the same way as on desktop (windows 7.5/8.5/10.4px from the sides, 40/45/56 from the bottom); the blonde one has the desktop geometry.
- The compact block in `media.css` was hand-written from the Figma values (no generator). Keep the `calc(N * var(--m))` form when editing it.
- A `<br>` that gets hidden on smaller screens must have a space before it in the HTML (`text <br>more`).
- Design-only line breaks are `<br class="br-design">` (About paragraph). Hide them below desktop: `.br-design { display: none; }`.

## Typography

- Font: **Helvetica Neue** (Light 300 / Regular 400 / Medium 500 / Bold 700), **self-hosted** in `assets/fonts/` as WOFF2.
  - Files supplied by the client; originals (WOFF + WOFF2) are kept outside the project in `../julia-usova-originals/fonts/`.
  - `assets/fonts/` holds Latin subsets made with fontTools (`U+0000-00FF`, Latin Extended bits, General Punctuation, €, ™, arrows, minus; all layout features incl. kerning, hinting kept). 217 KB → 64 KB. Every character on the page is covered (checked incl. `text-transform: uppercase` and the JS messages). Re-subset from the originals if new characters appear.
  - Subset command (per weight): `python3 -m fontTools.subset <original>.woff2 --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" --layout-features='*' --name-IDs='*' --name-legacy --name-languages='*' --notdef-outline --glyph-names --symbol-cmap --legacy-cmap --flavor=woff2`.
- Two @font-face families, both with `ascent-override: 84.25%; descent-override: 31.75%` (puts the cap top at the text-box top like Figma; Chrome's default draws text ~0.105em lower; verified within 1px across 10 text blocks):
  1. `"Helvetica Neue Figma"`: the webfonts, `font-display: swap`. Only Regular (hero title = LCP) is preloaded in `<head>`.
  2. `"Helvetica Neue Figma Local"`: the system Helvetica Neue via `local()`, shown while the webfonts load on Apple devices, so the swap moves nothing.
  - Stack: `"Helvetica Neue Figma", "Helvetica Neue Figma Local", "Helvetica Neue", Helvetica, Arial, sans-serif`.
- Verified against the system font (Figma reference): Light and Bold identical, Medium within 0.5%, line heights/positions identical everywhere (Δ 0.00px). **The supplied Regular is a different edition (Adobe 1988, 208 glyphs) and is 2–4% wider** (hero title ~2%, small captions up to 4%). No wraps change, but it is not 1:1 with Figma. See "Content flagged to the client".
- The supplied files come from three different sources (Linotype for Light/Bold, Adobe for Regular, the Cyrillic "HelveticaNeueCyr" for Medium) and contain no licence field.
- Lighthouse (median of 3): system font 86, full webfonts 74 (217 KB on the critical path), subsets 82. Preloading Regular is neutral in the lab and helps devices without a local Helvetica Neue.
- Safari ignores `ascent-override`, so in Safari text sits ~0.1em lower.
- Sizes, line-heights and letter-spacing are Figma px values.

## Components and patterns

- **Buttons** (`.btn`, Figma 61:30/61:37/61:140/61:147/61:224): pill with `.btn__text` and optional `.btn__ring` (circle, mask `icons/ring.svg`) + `.btn__arrow` (mask `icons/arrow.png`, rotated −45°). Colours via `--btn-color` (currentColor).
  - `--white` (white fill), `--outline` (1px white border, text centred left of the arrow), `--gray` (#6a6c74), `--muted` (#8a8d96), `--md` (52px, uses `ring-sm.svg` / `arrow-sm.png`).
  - Per-instance width and left padding come from a layout class (`.hero__btn-portfolio`, `.services__btn`, `.lessons__btn`, `.booking-form__submit`), never from a new button class.
  - Hover/focus: `::before` fill grows as a circle (`clip-path`) from the ring/arrow (`--btn-fill-origin`), text/ring/arrow switch to `--btn-hover-fg`, the ring grows 8%, the arrow nudges 2px up-right. White buttons: fill = `--btn-color`, fg white. Outline: fill white, fg red. The white base is `.btn--white::after`; it fades out after the fill to avoid an anti-aliased white rim.
- **Section label** `.label` + `--wine` / `--light`: "{ ABOUT JULIA }" style, 16/41 Medium uppercase.
- **Stat card** `.stat-card--light` / `--glass` (hero, 61:48/61:49). Children are absolute. In the glass card, offsets are 1px smaller because of the border.
- **Service card** `.service-card` (61:125…): 578×299 glass panel, number top-right, text pinned to the bottom (`margin-top:auto`).
- **Polaroid** `.polaroid--{camera|brush|mirror|blonde}` (61:104/61:109/61:114/61:118): one rotated element (`--rot`) with background `--c-polaroid` > `.polaroid__photo` (window, `overflow:hidden`) > `img`. Values were solved from the Figma masks (windows are 15px from the sides/top and 80px from the bottom, or 12.7/68 and 11.4/61 for the smaller ones). The blonde polaroid in Figma also holds two fully covered photos, which were dropped.
- **About collage** `.about__photo--1…11`: crop boxes (`overflow:hidden`) with the image offset inside. Figma masks there are opaque rectangles, so a crop is equivalent. `--grain` adds the grain overlay (`about-grain.png`, lighten blend).
- **Gradient text** (feature numbers 01/02, footer links, phone/address): `background-clip: text` + `color: transparent`. Gradients are tokens `--g-*`.
- **Booking form** `.booking-form` [data-booking-form] `novalidate`: grid 226 + 235, gap 8. Each `.field` sits in a `.field-wrap` (`--wide` spans both columns); `.field--select` is the future custom dropdown (no options, not validated yet).
  - Validation (`initBookingForm()`, rules in `VALIDATORS`, picked by `data-validate="name|phone|email"`): name ≥ 2 letters, phone 7–15 digits (letters are stripped while typing), email `x@y.zz`. The error appears on blur (if something was typed) or on submit, clears live while fixing, and the first invalid field gets focus.
  - Error UI: `.field-wrap.is-invalid` → red border (`--c-error`, not in Figma) + `.field-error` text inside the field on the right (linked via `aria-describedby`, `aria-invalid`).
  - Success: no backend yet. The form resets and `[data-form-status]` (`role="status"`) shows a thank-you line for 6 s. Replace this branch with a real submit when an endpoint exists.
- **Hovers** (all ~0.3–0.55s, `--ease`): nav links get an underline drawn from the left; the burger lines shorten to a right-aligned staggered stack; fields brighten their border/background; footer links, the phone and "Privacy Terms" turn white; "Website development" dims; the to-top circle lifts and glows.
  - **Rule:** hover transitions never go on an element with `data-aos` (aos.css overrides its `transition-property/duration/delay`). Put them on children or pseudo-elements (`.btn::before`, `.to-top__inner`, `.footer__dev > *`, `.field` inside `.field-wrap`).
  - No `translate`/transforms on children of `background-clip: text` gradients (footer links): a transformed child can drop out of the clip.
- **Mobile menu:** `[data-menu-toggle]` burger in the header, `aria-expanded="false"`. **Not built yet.** Planned: drawer + backdrop, Esc to close, scroll lock, `aria-controls`.
- **JS** (`js/main.js`):
  - `initFixedVh()`: re-sets `--fixed-vh` only when the width changes (ignores mobile toolbar height changes).
  - `initSmoothScroll()`: Lenis 1.1.13 (`lerp: 0.1`, own rAF loop; this version has no `autoRaf`). Not started with `prefers-reduced-motion`.
  - `initAnchors()`: every `a[href^="#"]` scrolls via `lenis.scrollTo` (native smooth scroll as fallback). The header is not sticky, so no offset.
  - `initScrollTop()`: `[data-scroll-top]`.
  - `initAnimations()` / `initParallax()`: see below.
  - `initBookingForm()`: see Booking form.
  - `initWorldtime()`: `[data-worldtime="America/Sao_Paulo"]` → live Rio time ("Worldtime (3:32 am)").

## Animations and smooth scroll

- **AOS 2.3.4.** Attributes are set in `main.js` from the `ANIMATIONS` list (selector, effect, delay, stagger, staggerGroup, duration, offset), never in HTML. Global settings: `once: true`, duration 900, `ease-out-cubic`, offset 80. `AOS.refresh()` runs on `load`.
  - aos.css only has delay rules in 50ms steps, so delays are rounded to 50.
  - AOS has no `fade-in`; use `fade`.
  - Custom effects live in `style.css` → "Animations": `polaroid` (drop + untwist), `reveal` (clip-path from the bottom + image settle), `draw` (rules). They use the individual `translate`/`scale`/`rotate` properties, so they compose with an element's own `transform` (the polaroids' tilt). **Never put a built-in AOS effect on an element that has its own `transform`**: AOS overwrites `transform`.
  - The last items on the page (footer contacts, divider) need `offset: 0`, or they sit below the trigger line at max scroll.
  - The footer has `overflow:hidden`, so AOS start offsets of its bottom items don't make the page taller.
- **Parallax:** `PARALLAX` list in `main.js` (hero portrait 0.06, lessons palettes 0.015, footer portrait 0.06). It writes the `translate` property: offset = (viewport centre − section centre) × speed, measured on the parent section (not on the moving element). Speeds are limited by each image's hidden buffer (hero 72px top, footer 47px top, palettes ≈ haze overlap).
- **Scroll-linked effects** (parallax, scrub, fill) are registered with `addScrollEffect({ measure, update })` in `main.js`. They follow the scroll instead of firing once, so they never look abrupt:
  - **Scrub** (`SCRUB` list): "Rio de Janeiro" slides in 260px from the right with smoothstep easing and fades in while its top moves from the viewport bottom to 35% of the viewport height. Position is measured with `offsetTop` (via `layoutPageTop()`), because the element's own `translate` would skew `getBoundingClientRect`.
  - **Fill** (`FILL` list): the About text (`.about__text`) is split into `<span class="fill-word">` per word. Each word's `--fill` (0→1) moves from `--c-wine-35` to `--c-wine` (`color-mix`) while the block goes from its top at 85% of the viewport to its bottom at 50%; `soft: 4` words are mid-transition at once. Both paragraphs end fully wine-coloured. Without JS or with reduced motion, the Figma colours (dark lead + light second paragraph) stay.
- **Hero title fade-in starts before first paint:** an inline `<head>` script adds `html.aos-pending` (not with reduced motion), and `.aos-pending .hero__title:not(.aos-animate)` holds it at `opacity: 0.01`. That looks the same as 0, avoids the old visible → hidden → fade flash, and lets Chrome count the title as LCP at first paint (opacity 0 text is ignored for LCP). `initAnimations()` removes the class if AOS is unavailable; a CSS fallback animation shows the title after 3 s if no script ever animates it. Don't animate LCP text from `opacity: 0`.
- **Hero portrait** fades in with a slow scale (`hero-settle`, CSS only, inside `prefers-reduced-motion: no-preference`).

### Performance rules (keep these when adding effects)

- **No layout reads during scroll.** `measure()` reads geometry (page coordinates) and runs only on init, `resize`, `load`, `document.fonts.ready` and body size changes (ResizeObserver). `update(scrollY, vh)` only computes and writes. Never call `getBoundingClientRect`/`offsetTop` inside `update`.
- **Same frame as Lenis.** Updates run from `lenis.on('scroll')` (inside Lenis' rAF tick), plus a rAF-throttled native `scroll` fallback that skips if `scrollY` didn't change.
- **Write only on change** (`setStyle()` cache; fill keeps per-word values). Round to 0.1px / 0.01.
- **Compositor-only properties** for anything that moves every frame: `translate`, `scale`, `rotate`, `opacity`. Parallax/scrub layers have `will-change`. Avoid animating `filter`, `box-shadow`, `width/height`, `top/left` on scroll.
- Lazy images use `decoding="async"`, so decoding large PNGs doesn't block a frame.
- **Measured (Oct 2026, Chrome, 1920×1080, CPU 6× slowdown, scrolling the whole page at 30px/frame):**
  - Frames: p50 8.3 ms, p99 9.3 ms, worst 9.4 ms; no frames > 33 ms, no long animation frames, CLS 0.
  - Forced style recalcs inside scripts during scroll went from 184 (15 ms) to 3 (the one-off measure); longest frame callback from 24.6 ms to 12.5 ms.
  - Through Lenis (wheel events), parallax matched the scroll position in every frame (max 0.05px off).
  - How to re-check: emulate with `viewport` **and** `cpuThrottlingRate` in the same call (a CPU-only call resets the viewport), then run a rAF loop of `scrollTo(y += 30)` and record frame deltas and `long-animation-frame` / `layout-shift` entries; or take a performance trace and count `UpdateLayoutTree`/`Layout` events nested inside `FunctionCall`.
- **Biggest remaining cost: images.** ≈29 MB of PNG (Chrome estimates ~22 MB of savings). On weak phones this means memory and decode time, not animation. Convert to WebP/AVIF (with 2× originals) before launch.
- With `prefers-reduced-motion: reduce`: no Lenis, no AOS attributes, no parallax, no scrub, no fill, no hero animation.

## Accessibility baseline

- Semantic landmarks (`header`, `nav`, `main`, `footer`) and one `h1` per page (hero title; the footer repeat is a `p`).
- Every control is a real `<button>` or `<a>`. Icon-only buttons have an `aria-label`. Decorative layers have `aria-hidden="true"` / `alt=""`.
- Focus states are visible (`:focus-visible` outline).

## Status (October 2026)

| Page | Desktop 1920 | Laptop ×0.75 | Tablet 1024 | Mobile 360 |
|---|---|---|---|---|
| index.html | done (node 61:2) | done (×0.75, generated) | done (mobile frame × 1.35 / 1.2, no tablet frame) | done (node 61:242) |

## Deviations from Figma (desktop)

- Hidden/covered layers not exported: hero photos 61:4, 61:5, 61:10 (fully under group 61:11); expertise base photo 61:75 (only a 1px column showed, so 61:76 now spans the full 1920); footer photos 61:171 and 61:173 (under 61:174 and black); two photos under the blonde polaroid.
- The lessons haze 61:94 is masked in Figma by the palettes image; the Figma render shows it unmasked, so it is drawn without the mask.
- Lines (61:160/161/168/181/239) are CSS 1px blocks, not SVG files.
- Footer title: Figma's box top is 8579, but its glyphs render 11px lower than in the hero; matched to the rendered position (`top: 336px`).
- "Product selector" placeholder is 3px lower in Figma than in the other fields; all fields are now centred the same way.
- About paragraph 2: Figma wraps it narrower than its 878px box; reproduced with `br-design`.

## Content flagged to the client

- Mobile Figma frame vs desktop:
  - It has a 4th service, "Photography & Production" (not on desktop). Implemented as mobile/tablet only; should desktop get it too?
  - Card numbers on mobile read 001, 002, 002, 002 → implemented as 001–004.
  - The lessons label reads "{ MAKEUP SERVICES }" and its button "Enquire About a Service" (copy-paste from services) → kept "{ Individual makeup lessons }" / "Enquire About Lessons".
  - No stat cards and no "Booking Enquiries" button in the mobile hero (hidden ≤1279).

- Phone `+373 (231)-111-31-31` is a Moldovan number format, and "Viige 11, 13516" looks like a Tallinn address, not Rio de Janeiro. Placeholders?
- Footer "Pages": PRODUCTS / CLASSES / ONLINE / DEVICES look like template leftovers. Real pages and URLs are needed.
- Social links (Instagram, YouTube, WhatsApp, TikTok), "Privacy Terms", "Website development" have no URLs (`href="#"`).
- Header nav "INDUSTRIES" → currently anchors to the services section. Confirm the label and target.
- "Product selector" in the booking form: no option list. Where should the form submit?
- Images are now responsive WebP (29 MB of PNG → ≈1.4 MB per mobile visit). Several are still shown larger than their source: hero 1233→1372px (desktop) / 940×2–3 (phones), expertise 1469→1920px, lessons palettes 1585→2181px, case 1312→1734px. 2× originals from the photographer would make them sharper on Retina.
- Fonts: confirm a Neue Helvetica **web** licence (Monotype / MyFonts / Fonts.com) covers self-hosting. The supplied files carry no licence info and come from three different editions; ideally replace them with the official WOFF2 set from the licence account. At minimum the **Regular** should be replaced: the supplied one is 2–4% wider than the Helvetica Neue Regular used in Figma.

## How to verify (every change)

1. Run `python3 -m http.server 8765` in the project folder. Stop it afterwards with `pkill -f "http.server 8765"`.
2. In the browser (chrome-devtools MCP), measure positions with `getBoundingClientRect` and compare them to Figma. Lazy images: set `loading='eager'` before a full-page screenshot.
3. Check for horizontal overflow (`scrollWidth > width`) at 1920, 1440, 1280, 1279, 1024, 960, 769, 768, 600, 360 and 320px:
   - Sweep with iframes of the given width.
   - Reload CSS/JS with `fetch(url, {cache: 'reload'})` or `ignoreCache` first; stale files cause false alarms.
4. For dropdowns, menus and drawers, open them and use `document.elementFromPoint` at their centre to confirm they really are on top.
5. Laptop: at 1440 every position is exactly Figma × 0.75 (with `--fixed-vh: 897.75px`) and text wraps into the same number of lines as at 1920; no horizontal overflow from 1280 to 1919.
6. Regression: with `--fixed-vh: 1197px` (navigate with an initScript) page height at 1920 is 9795 and positions match Figma; and the console has no errors (a missing `favicon.ico` 404 is harmless).
7. Report deviations from Figma honestly, along with what was verified and what wasn't. Nothing is committed unless the user asks.
