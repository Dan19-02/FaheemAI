# Fahim self-hosted Arabic font

Fahim is Arabic-first, so we self-host the Arabic UI face rather than pulling it
from a CDN (no `@import` from Google Fonts for Arabic — see `src/index.css`).
Until the file below is added, the app falls back to the platform Arabic fonts
declared in the `--font-arabic` stack (`Noto Sans Arabic`, `Segoe UI`, `Tahoma`,
`system-ui`).

## What to drop here

A **subsetted IBM Plex Sans Arabic variable WOFF2** covering:

- Arabic block (U+0600–06FF) + Arabic Supplement / Presentation Forms as needed
- Basic Latin (U+0000–00FF) so mixed Arabic/English UI stays in one face
- Western (Latin) digits 0–9

Name it exactly:

```
public/fonts/IBMPlexSansArabic-Variable.woff2
```

Recommended source: the official IBM Plex Sans Arabic variable font, subsetted
with a tool like `fonttools`/`glyphhanger` to keep the download small.

## Enable it (two steps)

### 1. Declare the `@font-face` in `src/index.css`

Paste this near the top of `src/index.css` (after `@import "tailwindcss";`) and
uncomment it. `font-family` matches the first entry of `--font-arabic`, so no
other CSS needs to change — the app root already uses `var(--font-arabic)`.

```css
/*
@font-face {
  font-family: "IBM Plex Sans Arabic";
  src: url("/fonts/IBMPlexSansArabic-Variable.woff2") format("woff2");
  font-weight: 100 700;
  font-style: normal;
  font-display: swap;
}
*/
```

### 2. Preload it in `index.html`

Add this inside `<head>` (before the module script) so the Arabic face starts
downloading during first paint, avoiding a flash of fallback text:

```html
<!--
<link
  rel="preload"
  href="/fonts/IBMPlexSansArabic-Variable.woff2"
  as="font"
  type="font/woff2"
  crossorigin
/>
-->
```

That's it — no code changes, no new dependencies.
