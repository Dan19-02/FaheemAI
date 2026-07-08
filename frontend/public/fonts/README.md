# Faheem self-hosted fonts

Faheem is Arabic-first, so the Arabic UI face is self-hosted here instead of
being pulled from a CDN: no third-party request on first paint, and the app
keeps its own face offline or behind school network filters.

## What lives here

Tajawal (the `--font-arabic` / `--font-sans` face) as static WOFF2 files,
downloaded from the Google Fonts API (v12), split by weight and script subset:

| File | Weight | Subset |
|---|---|---|
| `tajawal-400-arabic.woff2` / `tajawal-400-latin.woff2` | 400 | Arabic / Latin |
| `tajawal-500-arabic.woff2` / `tajawal-500-latin.woff2` | 500 | Arabic / Latin |
| `tajawal-700-arabic.woff2` / `tajawal-700-latin.woff2` | 700 | Arabic / Latin |
| `tajawal-800-arabic.woff2` / `tajawal-800-latin.woff2` | 800 | Arabic / Latin |

The matching `@font-face` rules (with `font-display: swap` and the original
`unicode-range` splits, so a page only downloads the subsets it uses) live at
the top of `src/index.css`. There is no Google Fonts `@import` anymore.

Latin technical terms (`--font-latin`) and code (`--font-mono`) intentionally
resolve from system font stacks; Inter and JetBrains Mono are not bundled.

## Updating a weight or adding one

1. Request the CSS with a modern browser user agent so Google serves WOFF2:
   `curl -A "Mozilla/5.0 ... Chrome/120" "https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap"`
2. Download each `fonts.gstatic.com/...woff2` URL into this folder using the
   `tajawal-<weight>-<subset>.woff2` naming above.
3. Mirror any new `@font-face` blocks (weight + `unicode-range`) in
   `src/index.css`.

Tajawal is licensed under the SIL Open Font License 1.1.
