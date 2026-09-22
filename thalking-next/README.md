# Thalking — Next.js

The Thalking marketing site, converted from the original standalone
`Thalking Website.html` into a Next.js (App Router) app. Content, layout, and
every interaction are preserved exactly.

## Run

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run start    # serve the production build
```

## How the conversion works

The original file was a self-contained artifact: its real content was packed
into a base64/gzip manifest and rendered at runtime by a small client engine
("dc-runtime") that reads a template (HTML with `{{ }}` bindings, `sc-if`,
`sc-for`) plus a logic class, and mounts them as a React tree.

Rather than hand-rewrite ~180 KB of markup and lose fidelity, this app reuses
the original template and logic verbatim, so the output is faithful by
construction:

- `public/dc/dc-runtime.js` — the original rendering engine.
- `public/dc/image-slot.js` — the original `<image-slot>` web component.
- `public/dc/react*.production.min.js` — React 18 UMD the engine renders with
  (served locally; the Next.js shell itself runs on React 19).
- `public/fonts/*.woff2` — the 18 embedded web fonts (Caveat, DM Sans,
  JetBrains Mono, Plus Jakarta Sans), extracted from the bundle.
- `components/template.ts` — the original `<x-dc>` template block plus its
  `<script data-dc-script>` logic, with embedded asset UUIDs rewritten to the
  local `/fonts` and `/dc` URLs.
- `components/ThalkingApp.tsx` — a client component that injects the template
  into the DOM and loads React + the runtime, which then compiles and mounts
  the page.
- `app/.image-slots.state.json/route.ts` — serves an empty image-slot state
  (the original had no user-dropped images).

Global page styles (body background, font stack, keyframes, media queries)
ship inside the template's `<sc-helmet>` block and are injected into `<head>`
by the runtime at boot, exactly as in the original.
