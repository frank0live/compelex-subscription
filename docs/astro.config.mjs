// Astro + Starlight configuration for the Row-Template documentation site.
//
// This file belongs to the documentation workspace only. It reads nothing from the
// product and writes only under docs/dist/.
//
// Locales: English is the root locale (and the documentation source of truth),
// Persian and Arabic are declared with dir: "rtl" rather than mirrored after the fact.
//
// No "site" is configured: hosting is a Phase 5 decision, and setting a URL now would
// mean inventing one. The sitemap integration therefore stays skipped — that warning is
// expected, not suppressed.

import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
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
      // One hierarchy, translated per locale. Slugs resolve against the current locale
      // automatically, so `installation` is /installation/ in English and
      // /fa/installation/ in Persian.
      sidebar: [
        {
          label: "Introduction",
          translations: { fa: "معرفی", ar: "مقدمة" },
          items: [
            { label: "Overview", translations: { fa: "مرور کلی", ar: "نظرة عامة" }, slug: "" },
          ],
        },
        {
          label: "Getting started",
          translations: { fa: "شروع به کار", ar: "البدء" },
          items: [
            { label: "Getting started", translations: { fa: "شروع به کار", ar: "البدء" }, slug: "getting-started" },
            { label: "Installation", translations: { fa: "نصب", ar: "التثبيت" }, slug: "installation" },
            { label: "Configuration", translations: { fa: "پیکربندی", ar: "التهيئة" }, slug: "configuration" },
          ],
        },
        {
          label: "Templates",
          translations: { fa: "تمپلیت‌ها", ar: "القوالب" },
          items: [
            { label: "Gallery", translations: { fa: "گالری", ar: "المعرض" }, slug: "templates" },
            { label: "Selecting a template", translations: { fa: "انتخاب تمپلیت", ar: "اختيار القالب" }, slug: "templates/selecting" },
            { label: "Custom templates", translations: { fa: "تمپلیت‌های سفارشی", ar: "القوالب المخصّصة" }, slug: "custom-templates" },
          ],
        },
        {
          label: "Your identity",
          translations: { fa: "هویت شما", ar: "هويتك" },
          items: [
            { label: "Branding", translations: { fa: "برندسازی", ar: "الهوية" }, slug: "branding" },
          ],
        },
        {
          label: "Reference",
          translations: { fa: "مرجع", ar: "المرجع" },
          items: [
            { label: "Security", translations: { fa: "امنیت", ar: "الأمان" }, slug: "security" },
            { label: "Compatibility", translations: { fa: "سازگاری", ar: "التوافق" }, slug: "compatibility" },
            { label: "Developer reference", translations: { fa: "مرجع توسعه‌دهنده", ar: "مرجع المطوّرين" }, slug: "developer" },
          ],
        },
        {
          label: "Help",
          translations: { fa: "کمک", ar: "المساعدة" },
          items: [
            { label: "Troubleshooting", translations: { fa: "رفع اشکال", ar: "استكشاف الأخطاء" }, slug: "troubleshooting" },
          ],
        },
      ],
    }),
  ],
});
