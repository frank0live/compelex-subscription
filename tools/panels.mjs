/* The panel registry and the adapter interface.
 *
 * A "panel" is the server-side subscription service whose data Row-Template
 * renders. 3X-UI is the reference: its data island is already the shape the
 * shared runtime reads, so its adapter is the identity. PasarGuard and Rebecca
 * are declared here but deliberately NOT implemented — they carry no adapter,
 * and the panel builder refuses them rather than emitting a half-built
 * artifact. That makes "do not implement them yet" a structural property of
 * the registry rather than a promise in a document.
 *
 * Nothing in this file is concatenated into an artifact. It is build-side
 * tooling, so it cannot move a byte of any template.
 *
 * THE ADAPTER INTERFACE
 *
 * An adapter is a plain object. Every method is optional except `id` and
 * `emitter`; a method that is absent means the panel cannot supply that input,
 * and the caller must omit rather than default it (see the honesty rules in
 * PANEL-COMPATIBILITY-AUDIT.md §13.2).
 *
 *   id        string   the panel's stable id, matching its key in PANELS
 *   emitter   string   which shell dialect this panel's engine needs
 *   island    fn       native payload -> the normalized model (Phase 2)
 *   livePath  fn       request pathname -> the info endpoint, or null
 *
 * `island` is the only method that touches panel data, and it is the only one
 * that can fabricate a value, so it is the only one the validator reasons
 * about. `livePath` returns null when a panel has no reachable info endpoint —
 * which is the honest answer for both new panels today, and the reason no
 * polling is attempted for them.
 */

/* The three shell dialects the transpiler can emit. Kept as a closed set for
   the same reason the template registry is closed: an unknown emitter must
   fail loudly rather than silently falling back to Go. */
export const EMITTERS = ['go', 'jinja2', 'pongo2'];

/* A panel's implementation status.
 *
 *   reference  the canonical implementation; its output is the oracle every
 *              other panel is compared against
 *   planned    declared, with no adapter; the builder refuses it
 *   active     a real adapter exists and the builder may emit for it */
export const STATUSES = ['reference', 'planned', 'active'];

/* The adapter interface, as data, so the validator and the docs cannot drift
   from each other. `required` is enforced; `optional` is typed but may be
   absent. A panel with no adapter is not an error — it is `planned`. */
export const ADAPTER_INTERFACE = {
  required: {
    id: 'string',
    emitter: 'string',
  },
  optional: {
    island: 'function',
    livePath: 'function',
  },
};

export const PANELS = {
  '3xui': {
    id: '3xui',
    name: '3X-UI',
    status: 'reference',
    emitter: 'go',
    /* The reference panel needs no adapter: its payload already arrives in the
       normalized shape, so there is nothing to translate and nothing to get
       wrong. An absent adapter is the correct representation of that. */
    adapter: null,
  },
  pasarguard: {
    id: 'pasarguard',
    name: 'PasarGuard',
    status: 'planned',
    emitter: 'jinja2',
    adapter: null,
  },
  rebecca: {
    id: 'rebecca',
    name: 'Rebecca',
    status: 'planned',
    emitter: 'pongo2',
    adapter: null,
  },
};

export function panelIds() {
  return Object.keys(PANELS);
}

export function panelStatus(panelId) {
  return resolvePanel(panelId).status;
}

/* The panel whose output is the oracle. Exactly one must exist, and it must be
   the one the frozen artifacts are built from. */
export function referencePanel() {
  const refs = panelIds().filter((id) => PANELS[id].status === 'reference');
  if (refs.length !== 1) {
    throw new Error(`exactly one reference panel is required, found ${refs.length}`);
  }
  return refs[0];
}

/* Panels the builder may actually emit for: those with a real adapter. The
   reference qualifies; a `planned` panel never does. */
export function buildablePanelIds() {
  return panelIds().filter((id) => PANELS[id].status === 'reference'
    || (PANELS[id].status === 'active' && PANELS[id].adapter));
}

/* The registry is a closed enum, so an unknown id fails loudly rather than
   being treated as the reference panel — the same rule the template registry
   follows. */
export function resolvePanel(panelId) {
  const panel = PANELS[panelId];
  if (!panel) {
    throw new Error(`unknown panel ${JSON.stringify(panelId)}; known: ${panelIds().join(', ')}`);
  }
  return panel;
}

/* Validate an adapter against ADAPTER_INTERFACE. Returns the adapter so a
   caller can validate and use it in one expression. Throws on the first
   violation, naming the field, because a malformed adapter that silently
   produced an artifact is the failure this exists to prevent. */
export function assertAdapter(adapter, panelId) {
  const label = `adapter for ${JSON.stringify(panelId)}`;
  if (adapter === null || typeof adapter !== 'object' || Array.isArray(adapter)) {
    throw new Error(`${label} must be an object`);
  }

  for (const [field, type] of Object.entries(ADAPTER_INTERFACE.required)) {
    if (!(field in adapter)) throw new Error(`${label} is missing required field ${field}`);
    if (typeof adapter[field] !== type) {
      throw new Error(`${label} field ${field} must be a ${type}, got ${typeof adapter[field]}`);
    }
  }

  for (const [field, type] of Object.entries(ADAPTER_INTERFACE.optional)) {
    if (field in adapter && adapter[field] !== null && typeof adapter[field] !== type) {
      throw new Error(`${label} field ${field} must be a ${type} or null`);
    }
  }

  if (adapter.id !== panelId) {
    throw new Error(`${label} declares id ${JSON.stringify(adapter.id)}`);
  }
  if (!EMITTERS.includes(adapter.emitter)) {
    throw new Error(`${label} declares unknown emitter ${JSON.stringify(adapter.emitter)}`);
  }

  return adapter;
}

/* The adapter for a panel, or null when the panel has none. `planned` panels
   have none, which is why the builder refuses them. */
export function adapterFor(panelId) {
  const panel = resolvePanel(panelId);
  if (panel.adapter === null) return null;
  return assertAdapter(panel.adapter, panelId);
}

/* The emitter dialect a panel's shell must be written in. The reference panel
   needs no transpilation; every other panel does. */
export function emitterFor(panelId) {
  return resolvePanel(panelId).emitter;
}
