// Astro + Starlight configuration for the Row-Template documentation site.
//
// This file belongs to the documentation workspace only. It reads nothing from the
// product and writes only under docs/dist/.
//
// The locales below are the RTL decision from ADR-0001: Persian and Arabic are
// declared with dir: "rtl" rather than being mirrored after the fact. English is the
// root locale, so its pages live at / and the others at /fa/ and /ar/.

import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  // No "site" yet: hosting is a Phase 5 decision (implementation plan 14.4).
  integrations: [
    starlight({
      title: "Row-Template",
      description: "Documentation for the Row-Template subscription page.",
      // The design system's tokens, applied over Starlight's own variables.
      customCss: ["./src/styles/tokens.css"],
      defaultLocale: "root",
      locales: {
        root: { label: "English", lang: "en" },
        fa: { label: "فارسی", lang: "fa", dir: "rtl" },
        ar: { label: "العربية", lang: "ar", dir: "rtl" },
      },
      // Phase 1 ships no information architecture beyond the pages that exist.
      // The sidebar is left to Starlight's automatic generation: an explicit
      // entry here failed with `slug "" does not exist`, and the full IA is
      // Phase 2 anyway.
    }),
  ],
});
