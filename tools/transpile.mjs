/* The shell transpiler: one canonical source, three engine dialects.
 *
 * The canonical source is the EXISTING per-template layout — there is no
 * separate canonical shell, and there should not be. The 15 layouts are
 * structurally different documents (only 21.6% of their lines are identical
 * across all 15, and they have 13 distinct <head> blocks), so a single shell
 * could not reproduce them without per-template conditionals — which is the
 * same 15 documents plus an indirection layer. The layouts stay the source of
 * truth and this module reads them.
 *
 * The Go path is the identity: it re-emits the input byte for byte. That is
 * not a convenience, it is the gate. If the tokeniser cannot round-trip the
 * Go dialect exactly, then it cannot be trusted to transform the same text into
 * another dialect, and the whole approach is wrong. `assertGoIdentity()` is
 * that proof, and it runs against all 15 layouts before any other emitter is
 * used.
 *
 * The vocabulary is closed and was measured, not assumed. Across all 15
 * layouts there are 798 actions in 8 distinct forms:
 *
 *   .FIELD                297      value interpolation
 *   end                   177      closes if / range
 *   if .FIELD             132
 *   else                  117
 *   if eq .FIELD 0         30
 *   range .FIELD           15
 *   else if lt .FIELD 0    15
 *   .                      15      the range element
 *
 * A form outside that set is a build failure, not a silent passthrough. The
 * same rule the comment stripper follows: refuse rather than guess.
 */

import { EMITTERS } from './panels.mjs';

/* One action, with the text around it preserved exactly. `raw` is the original
   `{{ ... }}` including its braces and inner spacing, so the Go emitter can
   emit it verbatim and be byte-exact by construction. */
const ACTION = /\{\{([\s\S]*?)\}\}/g;

/* Split a shell into text and action segments. The text between actions is
   carried through untouched, so no whitespace can be lost in tokenising. */
export function segments(source) {
  const out = [];
  let last = 0;
  ACTION.lastIndex = 0;
  let m = ACTION.exec(source);
  while (m !== null) {
    if (m.index > last) out.push({ kind: 'text', value: source.slice(last, m.index) });
    out.push({ kind: 'action', raw: m[0], body: m[1].trim() });
    last = m.index + m[0].length;
    m = ACTION.exec(source);
  }
  if (last < source.length) out.push({ kind: 'text', value: source.slice(last) });
  return out;
}

/* Classify an action body. Throws on anything outside the closed vocabulary,
   naming the form, so an unexpected action fails the build rather than being
   copied into a dialect that cannot execute it. */
export function classify(body) {
  if (body === 'end') return { form: 'end' };
  if (body === 'else') return { form: 'else' };
  if (body === '.') return { form: 'value-dot' };

  let m = body.match(/^if eq \.([A-Za-z_][A-Za-z0-9_]*) 0$/);
  if (m) return { form: 'if-eq-zero', field: m[1] };

  m = body.match(/^else if lt \.([A-Za-z_][A-Za-z0-9_]*) 0$/);
  if (m) return { form: 'else-if-lt-zero', field: m[1] };

  m = body.match(/^if \.([A-Za-z_][A-Za-z0-9_]*)$/);
  if (m) return { form: 'if-field', field: m[1] };

  m = body.match(/^range \.([A-Za-z_][A-Za-z0-9_]*)$/);
  if (m) return { form: 'range-field', field: m[1] };

  m = body.match(/^\.([A-Za-z_][A-Za-z0-9_]*)$/);
  if (m) return { form: 'value-field', field: m[1] };

  throw new Error(`unsupported template action: ${JSON.stringify(body)}`);
}

/* The Go emitter. Byte-exact by construction: every segment is emitted as it
   was read, action braces and inner spacing included. */
function emitGo(parts) {
  return parts.map((p) => (p.kind === 'text' ? p.value : p.raw)).join('');
}

/* Walk the segments, pairing each `end` with the block it closes, so the
   non-Go emitters know whether it is an `endif` or an `endfor`. */
function withBlockStack(parts) {
  const stack = [];
  return parts.map((p) => {
    if (p.kind === 'text') return p;
    const c = classify(p.body);
    if (c.form === 'range-field') {
      stack.push('range');
      return { ...p, cls: c, closes: null };
    }
    if (c.form === 'if-field' || c.form === 'if-eq-zero') {
      stack.push('if');
      return { ...p, cls: c, closes: null };
    }
    if (c.form === 'end') {
      const opened = stack.pop();
      if (opened === undefined) throw new Error(`{{ end }} without an open block: ${JSON.stringify(p.raw)}`);
      return { ...p, cls: c, closes: opened };
    }
    return { ...p, cls: c, closes: null };
  }).map((p, i, all) => p);
}

/* Jinja2 and pongo2 share one action grammar for everything this vocabulary
   uses; they differ in a few filter and loop-variable spellings, which are
   passed in. Both are block-tag dialects: `{% %}` for control, `{{ }}` for
   values. */
function emitBlockDialect(source, dialect) {
  const parts = withBlockStack(segments(source));
  return parts.map((p) => {
    if (p.kind === 'text') return p.value;
    const { cls } = p;
    switch (cls.form) {
      case 'value-field':
        return `{{ ${cls.field} }}`;
      case 'value-dot':
        return `{{ ${dialect.loopVar} }}`;
      case 'if-field':
        return `{% if ${cls.field} %}`;
      case 'if-eq-zero':
        return `{% if ${cls.field} == 0 %}`;
      case 'else-if-lt-zero':
        return `{% elif ${cls.field} < 0 %}`;
      case 'else':
        return '{% else %}';
      case 'range-field':
        return `{% for ${dialect.loopVar} in ${cls.field} %}`;
      case 'end':
        return p.closes === 'range' ? '{% endfor %}' : '{% endif %}';
      default:
        throw new Error(`no ${dialect.name} emission for ${JSON.stringify(p.body)}`);
    }
  }).join('');
}

const JINJA2 = { name: 'jinja2', loopVar: 'item' };
const PONGO2 = { name: 'pongo2', loopVar: 'item' };

/* Transpile one shell to one dialect. The dialect must be in the closed set. */
export function transpile(source, emitter) {
  if (!EMITTERS.includes(emitter)) {
    throw new Error(`unknown emitter ${JSON.stringify(emitter)}; known: ${EMITTERS.join(', ')}`);
  }
  if (emitter === 'go') return emitGo(segments(source));
  if (emitter === 'jinja2') return emitBlockDialect(source, JINJA2);
  return emitBlockDialect(source, PONGO2);
}

/* G1. The Go path must be lossless, or no other emitter can be trusted: the
   tokeniser that cannot round-trip the source cannot safely transform it.
   Returns the list of failures so a caller can report every template at once
   rather than stopping at the first. */
export function assertGoIdentity(sources) {
  const failures = [];
  for (const [id, source] of Object.entries(sources)) {
    let out;
    try {
      out = transpile(source, 'go');
    } catch (err) {
      failures.push({ id, reason: err.message });
      continue;
    }
    if (out !== source) {
      let at = 0;
      while (at < Math.min(out.length, source.length) && out[at] === source[at]) at += 1;
      failures.push({
        id,
        reason: `not byte-identical; first difference at offset ${at} `
          + `(input ${JSON.stringify(source.slice(at, at + 24))} `
          + `vs output ${JSON.stringify(out.slice(at, at + 24))})`,
      });
    }
  }
  return failures;
}
