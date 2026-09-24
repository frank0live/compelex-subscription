// Prefix the site's base path to root-relative links in Markdown and MDX content.
//
// The site is served from a sub-path (GitHub Pages serves a project site under
// /<repository>/), but content links are written root-relative — `/installation/`,
// `/fa/branding/` — and Starlight does not rewrite links inside content. Writing
// the base into every page would tie the content to one host; this plugin adds it
// at build time instead, so moving the site only means changing `base` in
// astro.config.mjs.
//
// Only links that start with a single "/" are touched. Protocol-relative ("//"),
// absolute ("https:"), fragment ("#") and relative links are left as written, and
// a link that already carries the base is not prefixed twice.
//
// A Sätteri mdast plugin (Astro's default Markdown processor): one visitor per
// node type that carries a URL, rewriting it through the context.

export default function baseLinks(base = "/") {
  const prefix = base.replace(/\/+$/, "");
  const rewrite = (node, ctx) => {
    const url = node.url;
    if (
      prefix &&
      typeof url === "string" &&
      url.startsWith("/") &&
      !url.startsWith("//") &&
      url !== prefix &&
      !url.startsWith(prefix + "/")
    ) {
      ctx.setProperty(node, "url", prefix + url);
    }
  };
  return { name: "row-template-base-links", link: rewrite, image: rewrite, definition: rewrite };
}
