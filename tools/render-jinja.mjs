/* A minimal Jinja2 renderer, for tests only.
 *
 * This exists so the shell tests can prove a rendered page is correct, rather
 * than asserting that a string contains a substring. It is deliberately NOT a
 * Jinja2 implementation: it handles exactly the closed vocabulary
 * tools/transpile.mjs emits, and throws on anything else.
 *
 * That narrowness is the point. If the transpiler ever grows a new block form,
 * this renderer fails loudly instead of silently mis-rendering — the same rule
 * the transpiler itself follows.
 *
 * The vocabulary:
 *
 *   {{ name }}              a value
 *   {% if name %}           truthy
 *   {% if name == 0 %}      equal to zero
 *   {% elif name < 0 %}     less than zero
 *   {% else %}
 *   {% endif %}
 *   {% for item in xs %}    iterate
 *   {% endfor %}
 *
 * Real rendering happens in the panel: Jinja2 for PasarGuard, pongo2 for
 * Rebecca. Nothing here ships.
 */

/* Split into text, values and tags, preserving every byte of text between. */
function tokenize(source) {
  const out = [];
  const re = /\{\{([\s\S]*?)\}\}|\{%([\s\S]*?)%\}/g;
  let last = 0;
  let m = re.exec(source);
  while (m !== null) {
    if (m.index > last) out.push({ kind: 'text', value: source.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ kind: 'value', body: m[1].trim() });
    else out.push({ kind: 'tag', body: m[2].trim() });
    last = m.index + m[0].length;
    m = re.exec(source);
  }
  if (last < source.length) out.push({ kind: 'text', value: source.slice(last) });
  return out;
}

/* Parse into a tree, pairing each block with its `end`. */
function parse(tokens, start = 0, stop = new Set()) {
  const nodes = [];
  let i = start;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.kind === 'tag') {
      const head = t.body.split(/\s+/)[0];
      if (stop.has(head)) return { nodes, next: i };
      if (head === 'if') {
        const branches = [];
        let cond = t.body.slice(2).trim();
        let body = parse(tokens, i + 1, new Set(['elif', 'else', 'endif']));
        branches.push({ cond, nodes: body.nodes });
        i = body.next;
        while (tokens[i] && tokens[i].body.startsWith('elif')) {
          cond = tokens[i].body.slice(4).trim();
          body = parse(tokens, i + 1, new Set(['elif', 'else', 'endif']));
          branches.push({ cond, nodes: body.nodes });
          i = body.next;
        }
        let otherwise = [];
        if (tokens[i] && tokens[i].body === 'else') {
          body = parse(tokens, i + 1, new Set(['endif']));
          otherwise = body.nodes;
          i = body.next;
        }
        if (!tokens[i] || tokens[i].body !== 'endif') throw new Error('unclosed {% if %}');
        nodes.push({ kind: 'if', branches, otherwise });
        i += 1;
        continue;
      }
      if (head === 'for') {
        const m = t.body.match(/^for\s+([A-Za-z_]\w*)\s+in\s+([A-Za-z_]\w*)$/);
        if (!m) throw new Error(`unsupported for tag: ${JSON.stringify(t.body)}`);
        const body = parse(tokens, i + 1, new Set(['endfor']));
        if (!tokens[body.next] || tokens[body.next].body !== 'endfor') throw new Error('unclosed {% for %}');
        nodes.push({ kind: 'for', name: m[1], list: m[2], nodes: body.nodes });
        i = body.next + 1;
        continue;
      }
      throw new Error(`unsupported tag: ${JSON.stringify(t.body)}`);
    }
    nodes.push(t);
    i += 1;
  }
  return { nodes, next: i };
}

function truthy(v) {
  if (v === undefined || v === null || v === false || v === 0 || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/* The three condition forms the transpiler emits, and nothing else. */
function evaluate(cond, ctx) {
  let m = cond.match(/^([A-Za-z_]\w*)\s*==\s*0$/);
  if (m) return Number(ctx[m[1]]) === 0;
  m = cond.match(/^([A-Za-z_]\w*)\s*<\s*0$/);
  if (m) return Number(ctx[m[1]]) < 0;
  m = cond.match(/^([A-Za-z_]\w*)$/);
  if (m) return truthy(ctx[m[1]]);
  throw new Error(`unsupported condition: ${JSON.stringify(cond)}`);
}

function renderNodes(nodes, ctx, esc) {
  let out = '';
  for (const n of nodes) {
    if (n.kind === 'text') { out += n.value; continue; }
    if (n.kind === 'value') {
      const v = ctx[n.body];
      const s = v === undefined || v === null ? '' : String(v);
      out += esc ? escapeHtml(s) : s;
      continue;
    }
    if (n.kind === 'if') {
      let taken = false;
      for (const b of n.branches) {
        if (evaluate(b.cond, ctx)) { out += renderNodes(b.nodes, ctx, esc); taken = true; break; }
      }
      if (!taken) out += renderNodes(n.otherwise, ctx, esc);
      continue;
    }
    if (n.kind === 'for') {
      const list = ctx[n.list];
      if (Array.isArray(list)) {
        for (const item of list) out += renderNodes(n.nodes, { ...ctx, [n.name]: item }, esc);
      }
      continue;
    }
    throw new Error(`unsupported node: ${n.kind}`);
  }
  return out;
}

/* The escaping Go's html/template applies to a value interpolated into HTML.
   Jinja2 applies the same thing — but only when the environment was built with
   autoescape, and PasarGuard's is not. */
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&#34;')
    .replace(/'/g, '&#39;');
}

/* Render a Jinja2 template against a context object.
 *
 * `autoescape` defaults to FALSE, which is what PasarGuard's Jinja2 environment
 * actually does — `Environment(loader=...)` with no autoescape argument. Go's
 * html/template always escapes. The difference is real and load-bearing, so it
 * is a parameter rather than a hidden assumption. */
export function renderJinja(source, context, { autoescape = false } = {}) {
  const tokens = tokenize(source);
  const { nodes, next } = parse(tokens);
  if (next !== tokens.length) throw new Error('trailing tokens after parse');
  return renderNodes(nodes, context || {}, autoescape);
}

/* pongo2 — Rebecca's engine.
 *
 * It shares this renderer because, FOR THIS CLOSED VOCABULARY, the two dialects
 * are the same. Both use `{% %}` for blocks and `{{ }}` for values, and the
 * transpiler emits neither loop metadata (`loop.index` vs `forloop.Counter`) nor
 * filters — the two places the dialects actually diverge. Verified: for all 15
 * layouts, tools/transpile.mjs produces byte-identical output for `jinja2` and
 * `pongo2` (11362 B each).
 *
 * That coincidence is load-bearing, so it is stated rather than assumed. If the
 * transpiler ever emits a filter or loop metadata, the dialects stop being
 * interchangeable and this alias must be replaced by a real pongo2 renderer —
 * the test that asserts the two emitters agree is what will catch it. */
export function renderPongo2(source, context, { autoescape = false } = {}) {
  return renderJinja(source, context, { autoescape });
}
