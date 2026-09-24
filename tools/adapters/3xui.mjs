/* The 3X-UI adapter — the reference panel.
 *
 * 3X-UI is the reference because its island ALREADY arrives in the normalized
 * shape: the panel renders the data-* attributes the runtime reads, with no
 * translation in between. So this adapter is deliberately thin, and that is the
 * point. It is not a no-op — it is the boundary the contract is checked at, and
 * the shape every future panel's adapter must imitate.
 *
 * What it must NOT do:
 *
 *   - It must not change behaviour. `normalize()` in src/scripts/model.js is
 *     the shipped implementation; this adapter must agree with it on every
 *     island, which tests/adapters.test.mjs proves by comparing the two
 *     directly rather than by re-deriving an opinion.
 *   - It must not fabricate. Every honesty rule in tools/contract.mjs holds:
 *     an absent capability is omitted, `used` is known only when both halves
 *     are, `online` is true only with a reported timestamp, and a negative
 *     counter is unknown rather than negative.
 *   - It must not read the subscriber's address. The panel offers it; the page
 *     has no use for it; the runtime deliberately leaves it out and so does
 *     this.
 *
 * The two methods are the whole of the panel-specific surface:
 *
 *   island(native)      the island as emitted -> the normalized model
 *   livePath(pathname)  the request path -> the info endpoint
 *
 * `livePath` returns exactly what src/scripts/live.js builds today, so nothing
 * about live polling changes by introducing it. Phase 2A/2B do not wire it into
 * the runtime — that is a later, separately-approved step.
 */

import { toModel, readIsland, normalizeIsland, validateIsland, validateModel } from '../contract.mjs';

export const id = '3xui';
export const emitter = 'go';

/* The island as emitted -> the normalized model.
 *
 * `native` is { attributes, announce, links }: the 13 data-* attributes of
 * #sub-data plus the text of the two hidden containers. That is the panel's
 * native output, unmodified — this adapter reads it and validates it, and the
 * contract does the normalizing.
 *
 * Throws on an invalid island rather than coercing it. A malformed island is a
 * shell bug, and silently repairing it here would move the failure somewhere
 * much harder to find. */
export function island(native) {
  return toModel(native || {});
}

/* The info endpoint for live polling.
 *
 * 3X-UI serves the payload as a query parameter on the subscription path, which
 * is what the runtime already requests. Returning the same string keeps the two
 * in step; a test asserts this against the runtime's own construction. */
export function livePath(pathname) {
  return String(pathname === null || pathname === undefined ? '' : pathname) + '?format=info';
}

/* The adapter object, in the shape tools/panels.mjs validates. Exported as a
 * named constant so the registry can reference it without importing the
 * functions separately. */
export const adapter = {
  id,
  emitter,
  island,
  livePath,
};

/* Re-exported so an adapter test can check the intermediate stages without
 * reaching past the adapter into the contract. */
export { readIsland, normalizeIsland, validateIsland, validateModel };
