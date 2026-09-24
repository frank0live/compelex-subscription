/* The authoritative template registry.
 *
 * This is the single source of truth the build, tests, installer and manager
 * all agree on: a template's stable id, its public display name, whether it is
 * selectable in this release, and the ordered style files that make up its
 * stylesheet. The enum is closed — an id never listed here (or listed as
 * unavailable) can never be built, installed or selected — so an unknown or
 * unavailable id fails loudly instead of being silently treated as Row.
 * installer/lib/row-template.sh carries a Bash projection of the available
 * set, and tests/registry.test.mjs holds the two in lockstep.
 *
 * Availability is a property of THIS release, not of a design. The reserved
 * Every design in the registry is now selectable; the enum stays closed so
 * unknown ids still fail loudly.
 *
 * `styles` is a list of [absolute-from-root path, banner label]. The label is
 * what the build writes as the per-file banner in the artifact, so Row's labels
 * are pinned to the historical `styles/<name>` strings to keep the v1.1.0
 * artifact byte-identical. New templates may choose their own labels.
 *
 * `emitDataTemplate` controls whether the built artifact carries a
 * data-template attribute on <html>. Row predates the attribute and must stay
 * byte-identical, so it is the one template that does not emit it. Every other
 * template carries it, so the served page can identify its own design.
 */

export const TEMPLATES = {
  row: {
    id: 'row',
    name: 'Row',
    order: 1,
    available: true,
    emitDataTemplate: false,
    layout: true,
    styles: [
      ['src/styles/tokens.css', 'styles/tokens.css'],
      ['src/styles/base.css', 'styles/base.css'],
      ['src/styles/layout.css', 'styles/layout.css'],
      ['src/styles/components.css', 'styles/components.css'],
      ['src/styles/rtl.css', 'styles/rtl.css'],
    ],
  },
  editorial: {
    id: 'editorial',
    name: 'Editorial',
    order: 2,
    available: true,
    emitDataTemplate: true,
    styles: [
      ['src/templates/editorial/tokens.css', 'templates/editorial/tokens.css'],
      ['src/templates/editorial/base.css', 'templates/editorial/base.css'],
      ['src/templates/editorial/layout.css', 'templates/editorial/layout.css'],
      ['src/templates/editorial/components.css', 'templates/editorial/components.css'],
      ['src/templates/editorial/rtl.css', 'templates/editorial/rtl.css'],
    ],
  },
  canvas: {
    id: 'canvas',
    name: 'Canvas',
    order: 3,
    available: true,
    emitDataTemplate: true,
    styles: [
      ['src/templates/canvas/tokens.css', 'templates/canvas/tokens.css'],
      ['src/templates/canvas/base.css', 'templates/canvas/base.css'],
      ['src/templates/canvas/layout.css', 'templates/canvas/layout.css'],
      ['src/templates/canvas/components.css', 'templates/canvas/components.css'],
      ['src/templates/canvas/rtl.css', 'templates/canvas/rtl.css'],
    ],
  },

/* Reserved designs — known ids, not selectable in v1.2.0. */
  prism: {
    id: 'prism',
    name: 'Prism',
    order: 4,
    available: true,
    emitDataTemplate: true,
    layout: true,
    styles: [
      ['src/templates/prism/tokens.css', 'templates/prism/tokens.css'],
      ['src/templates/prism/base.css', 'templates/prism/base.css'],
      ['src/templates/prism/layout.css', 'templates/prism/layout.css'],
      ['src/templates/prism/components.css', 'templates/prism/components.css'],
      ['src/templates/prism/rtl.css', 'templates/prism/rtl.css'],
    ],
  },
  terminal: {
    id: 'terminal',
    name: 'Terminal',
    order: 5,
    available: true,
    emitDataTemplate: true,
    layout: true,
    styles: [
      ['src/templates/terminal/tokens.css', 'templates/terminal/tokens.css'],
      ['src/templates/terminal/base.css', 'templates/terminal/base.css'],
      ['src/templates/terminal/layout.css', 'templates/terminal/layout.css'],
      ['src/templates/terminal/components.css', 'templates/terminal/components.css'],
      ['src/templates/terminal/rtl.css', 'templates/terminal/rtl.css'],
    ],
  },
  pulse: {
    id: 'pulse',
    name: 'Pulse',
    order: 6,
    available: true,
    emitDataTemplate: true,
    layout: true,
    styles: [
      ['src/templates/pulse/tokens.css', 'templates/pulse/tokens.css'],
      ['src/templates/pulse/base.css', 'templates/pulse/base.css'],
      ['src/templates/pulse/layout.css', 'templates/pulse/layout.css'],
      ['src/templates/pulse/components.css', 'templates/pulse/components.css'],
      ['src/templates/pulse/rtl.css', 'templates/pulse/rtl.css'],
    ],
  },
  brutal: {
    id: 'brutal',
    name: 'Brutal',
    order: 7,
    available: true,
    emitDataTemplate: true,
    layout: true,
    styles: [
      ['src/templates/brutal/tokens.css', 'templates/brutal/tokens.css'],
      ['src/templates/brutal/base.css', 'templates/brutal/base.css'],
      ['src/templates/brutal/layout.css', 'templates/brutal/layout.css'],
      ['src/templates/brutal/components.css', 'templates/brutal/components.css'],
      ['src/templates/brutal/rtl.css', 'templates/brutal/rtl.css'],
    ],
  },
  arcade: {
    id: 'arcade',
    name: 'Arcade',
    order: 8,
    available: true,
    emitDataTemplate: true,
    layout: true,
    styles: [
      ['src/templates/arcade/tokens.css', 'templates/arcade/tokens.css'],
      ['src/templates/arcade/base.css', 'templates/arcade/base.css'],
      ['src/templates/arcade/layout.css', 'templates/arcade/layout.css'],
      ['src/templates/arcade/components.css', 'templates/arcade/components.css'],
      ['src/templates/arcade/rtl.css', 'templates/arcade/rtl.css'],
    ],
  },
  sketch: {
    id: 'sketch',
    name: 'Sketch',
    order: 9,
    available: true,
    emitDataTemplate: true,
    layout: true,
    styles: [
      ['src/templates/sketch/tokens.css', 'templates/sketch/tokens.css'],
      ['src/templates/sketch/base.css', 'templates/sketch/base.css'],
      ['src/templates/sketch/layout.css', 'templates/sketch/layout.css'],
      ['src/templates/sketch/components.css', 'templates/sketch/components.css'],
      ['src/templates/sketch/rtl.css', 'templates/sketch/rtl.css'],
    ],
  },
  signature: {
    id: 'signature',
    name: 'Signature',
    order: 10,
    available: true,
    emitDataTemplate: true,
    layout: true,
    styles: [
      ['src/templates/signature/tokens.css', 'templates/signature/tokens.css'],
      ['src/templates/signature/base.css', 'templates/signature/base.css'],
      ['src/templates/signature/layout.css', 'templates/signature/layout.css'],
      ['src/templates/signature/components.css', 'templates/signature/components.css'],
      ['src/templates/signature/rtl.css', 'templates/signature/rtl.css'],
    ],
  },
  saffron: {
    id: 'saffron',
    name: 'Saffron',
    order: 11,
    available: true,
    emitDataTemplate: true,
    layout: true,
    styles: [
      ['src/templates/saffron/tokens.css', 'templates/saffron/tokens.css'],
      ['src/templates/saffron/base.css', 'templates/saffron/base.css'],
      ['src/templates/saffron/layout.css', 'templates/saffron/layout.css'],
      ['src/templates/saffron/components.css', 'templates/saffron/components.css'],
      ['src/templates/saffron/rtl.css', 'templates/saffron/rtl.css'],
    ],
  },
  pulsenova: {
    id: 'pulsenova',
    name: 'Pulse Nova',
    order: 12,
    available: true,
    emitDataTemplate: true,
    layout: true,
    styles: [
      ['src/templates/pulsenova/tokens.css', 'templates/pulsenova/tokens.css'],
      ['src/templates/pulsenova/base.css', 'templates/pulsenova/base.css'],
      ['src/templates/pulsenova/layout.css', 'templates/pulsenova/layout.css'],
      ['src/templates/pulsenova/components.css', 'templates/pulsenova/components.css'],
      ['src/templates/pulsenova/rtl.css', 'templates/pulsenova/rtl.css'],
    ],
  },
  prismnova: {
    id: 'prismnova',
    name: 'Prism Nova',
    order: 13,
    available: true,
    emitDataTemplate: true,
    layout: true,
    styles: [
      ['src/templates/prismnova/tokens.css', 'templates/prismnova/tokens.css'],
      ['src/templates/prismnova/base.css', 'templates/prismnova/base.css'],
      ['src/templates/prismnova/layout.css', 'templates/prismnova/layout.css'],
      ['src/templates/prismnova/components.css', 'templates/prismnova/components.css'],
      ['src/templates/prismnova/rtl.css', 'templates/prismnova/rtl.css'],
    ],
  },
  terminalnova: {
    id: 'terminalnova',
    name: 'Terminal Nova',
    order: 14,
    available: true,
    emitDataTemplate: true,
    layout: true,
    styles: [
      ['src/templates/terminalnova/tokens.css', 'templates/terminalnova/tokens.css'],
      ['src/templates/terminalnova/base.css', 'templates/terminalnova/base.css'],
      ['src/templates/terminalnova/layout.css', 'templates/terminalnova/layout.css'],
      ['src/templates/terminalnova/components.css', 'templates/terminalnova/components.css'],
      ['src/templates/terminalnova/rtl.css', 'templates/terminalnova/rtl.css'],
    ],
  },
  arcadenova: {
    id: 'arcadenova',
    name: 'Arcade Nova',
    order: 15,
    available: true,
    emitDataTemplate: true,
    layout: true,
    styles: [
      ['src/templates/arcadenova/tokens.css', 'templates/arcadenova/tokens.css'],
      ['src/templates/arcadenova/base.css', 'templates/arcadenova/base.css'],
      ['src/templates/arcadenova/layout.css', 'templates/arcadenova/layout.css'],
      ['src/templates/arcadenova/components.css', 'templates/arcadenova/components.css'],
      ['src/templates/arcadenova/rtl.css', 'templates/arcadenova/rtl.css'],
    ],
  },
};

/* Tier defaults.
 *
 * Every template belongs to a tier. `core` templates ship in the release and are
 * byte-locked; `custom` templates are added later and are never locked. The
 * difference between the tiers is the lock, not the build: both are held to the
 * same hook and runtime contract.
 *
 * The fields are applied here rather than written into all fifteen entries, so
 * adding a core template stays a one-line change and a custom template only has
 * to declare `tier: 'custom'`. An entry may override `locked` explicitly, which
 * is how a core design still in development would opt out of its lock.
 */
export function applyTierDefaults(entry) {
  const tier = entry.tier === 'custom' ? 'custom' : 'core';
  return {
    tier,
    locked: entry.locked === undefined ? tier === 'core' : Boolean(entry.locked),
  };
}

for (const id of Object.keys(TEMPLATES)) {
  const tpl = TEMPLATES[id];
  if (tpl.tier !== undefined || tpl.locked !== undefined) {
    throw new Error(`template ${JSON.stringify(id)} must not declare tier or locked in the literal`);
  }
  Object.assign(tpl, applyTierDefaults(tpl));
}

/* The default template. A missing or legacy selection falls back here. */
export const DEFAULT_TEMPLATE = 'row';

export function templateIds() {
  return Object.keys(TEMPLATES);
}

/* The selectable set, ordered by `order`. Sorting explicitly means a custom
   template appended out of order still appears in the right place; today the
   registry literal is already order-sorted, so this is a no-op. */
export function availableTemplateIds() {
  return templateIds()
    .filter((id) => TEMPLATES[id].available)
    .sort((a, b) => TEMPLATES[a].order - TEMPLATES[b].order);
}

export function coreTemplateIds() {
  return templateIds().filter((id) => TEMPLATES[id].tier === 'core');
}

export function lockedTemplateIds() {
  return templateIds().filter((id) => TEMPLATES[id].locked);
}

/* Resolve an id to a template descriptor. Throws on an unknown id and on a
   known-but-unavailable id, stating which, so a typo and a not-yet-shipped
   design are distinguished but neither is ever silently accepted. */
export function resolveTemplate(id) {
  const tpl = TEMPLATES[id];
  if (!tpl) {
    throw new Error(`unknown template id: ${JSON.stringify(id)}`);
  }
  if (!tpl.available) {
    throw new Error(`template ${JSON.stringify(id)} is not available in this release`);
  }
  return tpl;
}
