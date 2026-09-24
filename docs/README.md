# Row-Template documentation workspace

This directory is the documentation site. It is **separate from the product**.

## Working on the docs

```sh
cd docs
npm ci          # reproducible install — see PHASE-1-BOOTSTRAP-PLAN.md 2.7
npm run build   # writes docs/dist/
npm run dev     # local preview
```

## Rules

- **The product is read-only from here.** Nothing under `docs/` may modify `src/`,
  `tools/`, `tests/`, `installer/`, `template/`, `release/` or `VERSION`.
- **The root `package.json` is never touched.** This workspace has its own manifest and
  its own `node_modules`. There is deliberately no `workspaces` field.
- **`npm ci`, not `npm install`.** The lockfile is committed; `npm ci` fails if it drifts
  from the manifest, which is the point.
- **`.nvmrc` lives here, never at the repository root.** The product itself needs no
  Node; a root `.nvmrc` would imply it does.

## Why Starlight

See `../ADR-0001-DOCUMENTATION-FRAMEWORK.md`. The short version: Pagefind gives a
build-time search index served from this site's own origin, which is the only option
consistent with the product's promise that the artifact fetches nothing from anywhere.

## Where things live

| path | purpose |
|---|---|
| `src/content/docs/en/` | English content (root locale) |
| `src/content/docs/fa/` | Persian content |
| `src/content/docs/ar/` | Arabic content |
| `src/styles/` | design tokens from the design system proposal |
| `src/components/` | the design-system components |
| `src/data/` | generated data (gallery, error center) — never hand-edited |
| `public/` | static passthrough — favicons |
| `brand/` | logo assets |
| `dist/` | build output, gitignored |
