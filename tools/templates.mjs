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
 * ids below (canvas…signature) are placeholder designs that exist so the set is
 * explicitly bounded; they carry no styles and cannot be selected yet.
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
  /* Reserved designs — known ids, not selectable in v1.2.0. */
  canvas:    { id: 'canvas',    name: 'Canvas',    order: 3, available: false, emitDataTemplate: true, styles: [] },
  prism:     { id: 'prism',     name: 'Prism',     order: 4, available: false, emitDataTemplate: true, styles: [] },
  terminal:  { id: 'terminal',  name: 'Terminal',  order: 5, available: false, emitDataTemplate: true, styles: [] },
  pulse:     { id: 'pulse',     name: 'Pulse',     order: 6, available: false, emitDataTemplate: true, styles: [] },
  brutal:    { id: 'brutal',    name: 'Brutal',    order: 7, available: false, emitDataTemplate: true, styles: [] },
  arcade:    { id: 'arcade',    name: 'Arcade',    order: 8, available: false, emitDataTemplate: true, styles: [] },
  sketch:    { id: 'sketch',    name: 'Sketch',    order: 9, available: false, emitDataTemplate: true, styles: [] },
  signature: { id: 'signature', name: 'Signature', order: 10, available: false, emitDataTemplate: true, styles: [] },
};

/* The default template. A missing or legacy selection falls back here. */
export const DEFAULT_TEMPLATE = 'row';

export function templateIds() {
  return Object.keys(TEMPLATES);
}

export function availableTemplateIds() {
  return templateIds().filter((id) => TEMPLATES[id].available);
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
