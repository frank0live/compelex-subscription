/* A document just large enough to drive the Connect card and the notice.
 *
 * Text is text and elements are elements: nothing here parses a string as
 * HTML, so a value that reaches the page as a text node is read back exactly as
 * it was written, which is what the escaping tests rely on. Selectors cover the
 * three forms the runtime uses: `.class`, `[attr]` and `.class .class`. */

export class Text {
  constructor(value) { this.data = String(value); this.parent = null; }
  get textContent() { return this.data; }
  set textContent(v) { this.data = String(v); }
}

export class Element {
  constructor(tag, owner) {
    this.tagName = String(tag).toUpperCase();
    this.ownerDocument = owner;
    this.childNodes = [];
    this.attributes = new Map();
    this.parent = null;
    this.hidden = false;
    this.type = '';
    this.listeners = {};
  }

  get id() { return this.getAttribute('id') || ''; }
  set id(v) { this.setAttribute('id', v); }
  get className() { return this.getAttribute('class') || ''; }
  set className(v) { this.setAttribute('class', v); }

  get children() { return this.childNodes.filter((n) => n instanceof Element); }
  get firstElementChild() { return this.children[0] || null; }
  get lastElementChild() { const c = this.children; return c[c.length - 1] || null; }
  get firstChild() { return this.childNodes[0] || null; }

  get textContent() { return this.childNodes.map((n) => n.textContent).join(''); }
  set textContent(v) {
    this.childNodes = [];
    if (v !== '') this.appendChild(new Text(v));
  }

  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  hasAttribute(name) { return this.attributes.has(name); }

  appendChild(node) {
    node.parent = this;
    this.childNodes.push(node);
    return node;
  }
  removeChild(node) {
    const at = this.childNodes.indexOf(node);
    if (at > -1) this.childNodes.splice(at, 1);
    node.parent = null;
    return node;
  }

  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }

  *walk() {
    for (const child of this.children) {
      yield child;
      yield* child.walk();
    }
  }

  matches(sel) {
    if (sel.startsWith('.')) return this.className.split(/\s+/).includes(sel.slice(1));
    if (sel.startsWith('[') && sel.endsWith(']')) return this.hasAttribute(sel.slice(1, -1));
    return this.tagName === sel.toUpperCase();
  }

  querySelectorAll(selector) {
    const parts = selector.trim().split(/\s+/);
    let scope = [this];
    for (const part of parts) {
      const next = [];
      for (const root of scope) for (const el of root.walk()) if (el.matches(part) && !next.includes(el)) next.push(el);
      scope = next;
    }
    return scope;
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }

  closest(selector) {
    for (let el = this; el; el = el.parent instanceof Element ? el.parent : null) if (el.matches(selector)) return el;
    return null;
  }
}

export class Document {
  constructor() { this.body = new Element('body', this); }
  createElement(tag) { return new Element(tag, this); }
  createElementNS(ns, tag) { return new Element(tag, this); }
  createTextNode(value) { return new Text(value); }
  getElementById(id) {
    for (const el of this.body.walk()) if (el.id === id) return el;
    return null;
  }
  /* A detached element with an id, attached to the body so lookups find it. */
  add(tag, id) {
    const el = this.createElement(tag);
    if (id) el.id = id;
    this.body.appendChild(el);
    return el;
  }
}
