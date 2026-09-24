# Row-Template documentation workspace

This directory is the documentation site. It is **separate from the product**.

## Working on the docs

```sh
cd docs
npm ci          # reproducible install — see design/PHASE-1-BOOTSTRAP-PLAN.md 2.7
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

See [`design/ADR-0001-DOCUMENTATION-FRAMEWORK.md`](design/ADR-0001-DOCUMENTATION-FRAMEWORK.md). The short version: Pagefind gives a
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
| `public/` | static passthrough — template previews |
| `plugins/` | build-time helpers (the site-base link rewriter) |
| `assets/` | the banner and screenshots, shared by the repository README and the site |
| `design/` | design records: audits, designs and decisions — [index](design/README.md) |
| `dist/` | build output, gitignored |

## Publishing

`.github/workflows/docs.yml` builds this site on every pull request that touches
`docs/`, and publishes it to GitHub Pages on every push to `main` that does:

<https://iitzseridev.github.io/Row-Template/>

The site is served under `/Row-Template/`, which `astro.config.mjs` sets as its
`base`. Write links in content as root-relative paths (`/installation/`,
`/fa/branding/`) and reference files in `public/` the same way;
`plugins/base-links.mjs` and the components add the base at build time,
so content never hard-codes it.
