// Content collections for the documentation site.
//
// Starlight 0.42 requires this file: without it Astro reports
// `The collection "docs" does not exist or is empty` and the build fails.
//
// Location note: Astro 7 expects the content config at `src/content.config.ts`.
// The bootstrap plan originally listed it at `src/content/content.config.ts`,
// which is the older location; corrected here during execution.

import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
};
