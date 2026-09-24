/* The normalized panel data contract.
 *
 * This is the schema every panel must satisfy. 3X-UI is the reference: its
 * island already arrives in this shape, so the contract is not a new model
 * invented for the new panels — it is the EXISTING runtime contract, written
 * down and made checkable. Nothing here changes what the runtime does; it
 * describes it, and refuses anything that does not match.
 *
 * The contract is build-side tooling. It is never concatenated into an
 * artifact, so it cannot move a byte of any template.
 *
 * THREE LAYERS, AND WHY THEY ARE SEPARATE
 *
 *   island   the DOM the shell emits: 13 data-* attributes plus two hidden
 *            containers. Panel-specific — this is what an adapter produces.
 *   raw      the island read into plain values, still in the panel's own field
 *            names. Mirrors readDocument() in src/scripts/model.js.
 *   model    the normalized shape the application uses. Mirrors normalize().
 *
 * `island -> raw -> model` is the whole path. The contract pins all three, so
 * a new panel is checked at the boundary it actually crosses.
 *
 * THE HONESTY RULES
 *
 * These are the invariants that stop a panel adapter inventing data. They are
 * enforced in the schema, not merely documented, because a plausible wrong
 * value is worse than an absent one:
 *
 *   1. A capability a panel lacks is OMITTED, never defaulted to a misleading
 *      value. An empty string and an absent field are different things.
 *   2. `used` is the sum of download and upload and is known only when BOTH are
 *      known. It is never synthesised from one of them.
 *   3. `online` is true only when the panel actually reported a last-seen
 *      timestamp. It is never inferred from traffic.
 *   4. A negative counter is not zero — it is a counter that cannot be trusted,
 *      so it normalizes to unknown.
 *   5. `expire` keeps the runtime's documented encoding: 0 is never, a negative
 *      value is a duration that starts on first connection, and a value outside
 *      the plausible range is unknown rather than a year like 5138.
 */

/* The plausible subscription-date range. Mirrors model.js exactly; a date
   outside it is reported as unknown rather than rendered as 1970 or 5138. */
export const EXPIRE_MIN = -3.2e9;
export const EXPIRE_MAX = 4.1e9;

/* The 13 attributes the shell puts on #sub-data, in the order the layout emits
   them. `attr` is the data-* name the runtime reads; `key` is the field name
   readDocument() assigns it to. A layout that renames or drops one of these
   fails the schema check rather than silently producing an undefined model. */
export const ISLAND_ATTRIBUTES = [
  { attr: 'data-enabled', key: 'enabled', kind: 'flag' },
  { attr: 'data-online', key: 'isOnline', kind: 'flag' },
  { attr: 'data-download-byte', key: 'downloadByte', kind: 'counter' },
  { attr: 'data-upload-byte', key: 'uploadByte', kind: 'counter' },
  { attr: 'data-total-byte', key: 'totalByte', kind: 'counter' },
  { attr: 'data-expire', key: 'expire', kind: 'integer' },
  { attr: 'data-last-online', key: 'lastOnline', kind: 'counter' },
  { attr: 'data-sub-url', key: 'subUrl', kind: 'text' },
  { attr: 'data-sub-json-url', key: 'subJsonUrl', kind: 'text' },
  { attr: 'data-sub-clash-url', key: 'subClashUrl', kind: 'text' },
  { attr: 'data-sub-title', key: 'subTitle', kind: 'text' },
  { attr: 'data-support-url', key: 'subSupportUrl', kind: 'text' },
  { attr: 'data-datepicker', key: 'datepicker', kind: 'text' },
];

/* The two hidden containers. `announce` is one text node; `links` is one span
   per raw share link. Both are read by textContent, so both are plain text and
   never markup. */
export const ISLAND_ELEMENTS = [
  { id: 'announce-source', key: 'announce', kind: 'text' },
  { id: 'links-source', key: 'links', kind: 'list' },
];

/* The normalized model the application consumes. `nullable` fields are the
   ones where "unknown" is a real state that must survive to the UI rather than
   collapsing to 0 or ''. */
export const MODEL_FIELDS = [
  { key: 'enabled', type: 'boolean', nullable: false },
  { key: 'online', type: 'boolean', nullable: false },
  { key: 'download', type: 'number', nullable: true },
  { key: 'upload', type: 'number', nullable: true },
  { key: 'used', type: 'number', nullable: true },
  { key: 'total', type: 'number', nullable: true },
  { key: 'expire', type: 'number', nullable: true },
  { key: 'lastOnline', type: 'number', nullable: true },
  { key: 'subUrl', type: 'string', nullable: false },
  { key: 'subJsonUrl', type: 'string', nullable: false },
  { key: 'subClashUrl', type: 'string', nullable: false },
  { key: 'title', type: 'string', nullable: false },
  { key: 'supportUrl', type: 'string', nullable: false },
  { key: 'announce', type: 'string', nullable: false },
  { key: 'jalali', type: 'boolean', nullable: false },
  { key: 'links', type: 'list', nullable: false },
];

/* Fields a panel may legitimately not have. Absence is allowed for these and
   they normalize to their documented empty state; the UI omits the section. */
export const OPTIONAL_MODEL_KEYS = new Set(['announce', 'links', 'subJsonUrl', 'subClashUrl']);

/* --- island -> raw ------------------------------------------------------- */

/* Mirrors readDocument(). Given a plain map of the island's attributes and its
   two container texts, produce the raw shape. Kept deliberately dumb: it does
   no coercion, because readDocument() does none either — coercion is the
   normalizer's single job. */
export function readIsland({ attributes = {}, announce = '', links = [] } = {}) {
  const raw = {};
  for (const { attr, key } of ISLAND_ATTRIBUTES) {
    raw[key] = Object.prototype.hasOwnProperty.call(attributes, attr)
      ? attributes[attr]
      : undefined;
  }
  raw.announce = announce;
  raw.links = links;
  return raw;
}

/* Pull the island out of a rendered document's HTML text. This is the
   build-side reader used by the tests; the runtime has its own DOM path.

   Entity references are decoded, because a DOM reader does: an engine that
   escapes its output writes `&lt;img` into the attribute, and `el.dataset` hands
   back `<img`. Without this the reader would see a different string from the
   browser for any value containing markup, and the round trip from model to
   rendered page and back would appear to fail for a case that is in fact
   correct. The five entities below are exactly the ones the escaping writes. */
const ENTITIES = [
  ['&lt;', '<'], ['&gt;', '>'], ['&quot;', '"'], ['&#34;', '"'],
  ['&#39;', "'"], ['&apos;', "'"], ['&amp;', '&'],
];

function unescapeEntities(text) {
  let out = text;
  for (const [entity, char] of ENTITIES) out = out.split(entity).join(char);
  return out;
}

export function extractIsland(html) {
  const attributes = {};
  const open = html.match(/<div id="sub-data"[^>]*>/);
  if (open) {
    for (const m of open[0].matchAll(/(data-[a-z-]+)="([^"]*)"/g)) {
      attributes[m[1]] = unescapeEntities(m[2]);
    }
  }
  const announce = html.match(/<div id="announce-source"[^>]*>([\s\S]*?)<\/div>/);
  const linksBlock = html.match(/<div id="links-source"[^>]*>([\s\S]*?)<\/div>/);
  const links = linksBlock
    ? [...linksBlock[1].matchAll(/<span>([\s\S]*?)<\/span>/g)].map((m) => unescapeEntities(m[1]))
    : [];
  return {
    attributes,
    announce: announce ? unescapeEntities(announce[1]) : '',
    links,
  };
}

/* --- raw -> model -------------------------------------------------------- */

function truthy(value) {
  return value === true || value === 1 || value === '1';
}

function integer(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function counter(value) {
  const n = integer(value);
  return n === null || n < 0 ? null : n;
}

function text(value) {
  return typeof value === 'string' ? value : '';
}

/* Mirrors normalize(). This is the function the contract exists to pin: its
   output must equal the runtime's for every island the runtime accepts. */
export function normalizeIsland(raw) {
  const src = raw || {};
  const download = counter(src.downloadByte);
  const upload = counter(src.uploadByte);

  let expire = integer(src.expire);
  if (expire !== null && (expire < EXPIRE_MIN || expire > EXPIRE_MAX)) expire = null;

  return {
    enabled: truthy(src.enabled),
    online: truthy(src.isOnline),
    download,
    upload,
    /* Rule 2: known only when both halves are known. */
    used: download === null || upload === null ? null : download + upload,
    total: counter(src.totalByte),
    expire,
    lastOnline: counter(src.lastOnline),
    subUrl: text(src.subUrl).trim(),
    subJsonUrl: text(src.subJsonUrl).trim(),
    subClashUrl: text(src.subClashUrl).trim(),
    title: text(src.subTitle).trim(),
    supportUrl: text(src.subSupportUrl).trim(),
    announce: text(src.announce),
    jalali: src.datepicker === 'jalali',
    links: Array.isArray(src.links) ? src.links.slice() : [],
  };
}

/* --- validation ---------------------------------------------------------- */

function checkKind(kind, value, label, errors) {
  const t = typeof value;
  switch (kind) {
    case 'flag':
      if (value !== '0' && value !== '1' && value !== true && value !== false) {
        errors.push(`${label}: a flag must be "0" or "1", got ${JSON.stringify(value)}`);
      }
      break;
    case 'counter':
      if (value !== '' && value !== undefined && !/^-?\d+$/.test(String(value))) {
        errors.push(`${label}: a counter must be an integer or empty, got ${JSON.stringify(value)}`);
      }
      break;
    case 'integer':
      if (value !== '' && value !== undefined && !/^-?\d+$/.test(String(value))) {
        errors.push(`${label}: must be an integer or empty, got ${JSON.stringify(value)}`);
      }
      break;
    case 'text':
      if (value !== undefined && t !== 'string') {
        errors.push(`${label}: must be a string, got ${t}`);
      }
      break;
    case 'list':
      if (!Array.isArray(value)) errors.push(`${label}: must be an array, got ${t}`);
      break;
    default:
      errors.push(`${label}: unknown kind ${JSON.stringify(kind)}`);
  }
}

/* Validate the island as emitted. Every attribute in the schema must be
   present: an island missing one is a shell bug, not a panel limitation,
   because the shell emits all 13 unconditionally. */
export function validateIsland({ attributes = {}, announce, links } = {}) {
  const errors = [];
  for (const { attr, kind } of ISLAND_ATTRIBUTES) {
    if (!Object.prototype.hasOwnProperty.call(attributes, attr)) {
      errors.push(`missing attribute ${attr}`);
      continue;
    }
    checkKind(kind, attributes[attr], attr, errors);
  }
  for (const [attr] of Object.entries(attributes)) {
    if (!ISLAND_ATTRIBUTES.some((f) => f.attr === attr)) {
      errors.push(`unknown attribute ${attr}`);
    }
  }
  if (announce !== undefined && typeof announce !== 'string') errors.push('announce must be a string');
  if (links !== undefined && !Array.isArray(links)) errors.push('links must be an array');
  return errors;
}

/* Validate a normalized model. This is the check a new panel's adapter output
   must pass, and the check the reference panel already passes. */
export function validateModel(model) {
  const errors = [];
  if (model === null || typeof model !== 'object' || Array.isArray(model)) {
    return ['model must be an object'];
  }

  for (const { key, type, nullable } of MODEL_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(model, key)) {
      if (OPTIONAL_MODEL_KEYS.has(key)) continue;
      errors.push(`missing model field ${key}`);
      continue;
    }
    const value = model[key];
    if (value === null) {
      if (!nullable) errors.push(`${key} must not be null`);
      continue;
    }
    if (type === 'list') {
      if (!Array.isArray(value)) errors.push(`${key} must be an array`);
      else if (!value.every((v) => typeof v === 'string')) errors.push(`${key} must contain only strings`);
      continue;
    }
    if (typeof value !== type) errors.push(`${key} must be a ${type}, got ${typeof value}`);
    if (type === 'number' && !Number.isFinite(value)) errors.push(`${key} must be finite`);
    if (type === 'number' && value < 0 && key !== 'expire') {
      errors.push(`${key} must not be negative`);
    }
  }

  for (const key of Object.keys(model)) {
    if (!MODEL_FIELDS.some((f) => f.key === key)) errors.push(`unknown model field ${key}`);
  }

  /* Rule 2, as an invariant rather than a hope. */
  if (model.download !== null && model.upload !== null && model.used !== null
      && model.used !== model.download + model.upload) {
    errors.push('used must equal download + upload when all three are known');
  }
  /* Rule 3. */
  if (model.online === true && (model.lastOnline === null || model.lastOnline === undefined)) {
    errors.push('online may only be true when lastOnline was reported');
  }
  /* Rule 4. */
  for (const key of ['download', 'upload', 'used', 'total', 'lastOnline']) {
    if (typeof model[key] === 'number' && model[key] < 0) {
      errors.push(`${key} must never be negative — an untrusted counter is unknown, not negative`);
    }
  }
  return errors;
}

export function assertModel(model) {
  const errors = validateModel(model);
  if (errors.length > 0) {
    throw new Error(`normalized model is invalid:\n  ${errors.join('\n  ')}`);
  }
  return model;
}

/* The full path, validated at both ends. This is what a panel adapter will call
   once one exists; today only the reference panel can satisfy it. */
export function toModel(island) {
  const islandErrors = validateIsland(island);
  if (islandErrors.length > 0) {
    throw new Error(`island is invalid:\n  ${islandErrors.join('\n  ')}`);
  }
  return assertModel(normalizeIsland(readIsland(island)));
}
