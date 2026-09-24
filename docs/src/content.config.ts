// Content collections for the documentation site.
//
// Starlight requires both loaders to be declared. The `i18n` collection was missing in
// Phase 1, which is why the build warned `The collection "i18n" does not exist or is
// empty` even after translation files were added — the files existed, but nothing loaded
// them. Declaring it here is the intended fix, not a warning suppression.
//
// Location note: Astro 7 expects the content config at `src/content.config.ts`.

import { defineCollection } from "astro:content";
import { docsLoader, i18nLoader } from "@astrojs/starlight/loaders";
import { docsSchema, i18nSchema } from "@astrojs/starlight/schema";

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
  i18n: defineCollection({ loader: i18nLoader(), schema: i18nSchema() }),
};
