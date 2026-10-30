// The layout rules (MRV-8.0 AC-2 to AC-6). `auditDom` runs INSIDE the page (Playwright serialises it), so it must stay
// self-contained: no imports, no references to module scope. It returns a list of { rule, selector, detail }.
//
// Rule ids and the acceptance criterion each serves:
//   overflow-page, overflow-element, fixed-outside-viewport   AC-2 (and the fixed-layer part of AC-9)
//   overlap, covered-text                                     AC-3
//   wrapped-control, button-row-height                        AC-4
//   form-left-edge, form-column-width, form-row, card-height, container-edge   AC-5
//   exceeds-parent, box-sizing                                AC-6
//   popover                                                   MRV-9.2 AC-5 (an open pop-up widget, marked [data-popover])
export const RULES = [
  'overflow-page', 'overflow-element', 'fixed-outside-viewport',
  'overlap', 'covered-text',
  'wrapped-control', 'button-row-height',
  'form-left-edge', 'form-column-width', 'form-row', 'card-height', 'container-edge',
  'exceeds-parent', 'box-sizing',
  'popover',
];

export function auditDom() {
  const out = [];
  const seen = new Set();
  const TOL = 1; // px of sub-pixel tolerance
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'TITLE', 'HEAD', 'NOSCRIPT', 'TEMPLATE', 'OPTION', 'OPTGROUP', 'BR', 'WBR', 'COL', 'COLGROUP', 'AREA', 'MAP']);
  const TABLE_PARTS = new Set(['THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD', 'CAPTION']);
  const cs = (el) => getComputedStyle(el);
  const px = (v) => parseFloat(v) || 0;

  const add = (rule, el, detail) => {
    const selector = sel(el);
    const key = rule + '|' + selector;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ rule, selector, detail });
  };

  function sel(el) {
    const part = (e) => {
      let s = e.tagName.toLowerCase();
      if (e.id && !/\d{3,}/.test(e.id)) s += '#' + e.id;
      const cls = [...e.classList].filter((c) => !c.startsWith('ng-') && !c.startsWith('cdk-')).slice(0, 3);
      if (cls.length) s += '.' + cls.join('.');
      const p = e.parentElement;
      if (p) {
        const same = [...p.children].filter((c) => c.tagName === e.tagName);
        if (same.length > 1) s += ':nth-of-type(' + (same.indexOf(e) + 1) + ')';
      }
      return s;
    };
    const parts = [];
    let e = el;
    for (let i = 0; e && e.nodeType === 1 && i < 4; i++) {
      parts.unshift(part(e));
      if (e.tagName === 'BODY' || e.tagName === 'HTML') break;
      e = e.parentElement;
    }
    return parts.join(' > ');
  }

  const rectOf = (el) => el.getBoundingClientRect();
  const r1 = (n) => Math.round(n * 10) / 10;

  function visible(el) {
    if (SKIP_TAGS.has(el.tagName)) return false;
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') return false;
    const s = cs(el);
    if (s.display === 'none' || s.display === 'contents' || s.visibility === 'hidden' || s.visibility === 'collapse') return false;
    if (px(s.opacity) === 0) return false;
    const r = rectOf(el);
    if (r.width <= 0 || r.height <= 0) return false;
    // Visually hidden helpers (1px clip boxes) are not layout.
    if (r.width <= 1 && r.height <= 1) return false;
    if (s.clip === 'rect(0px, 0px, 0px, 0px)' || s.clipPath === 'inset(50%)') return false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      if (p.hasAttribute('hidden') || p.getAttribute('aria-hidden') === 'true' && cs(p).display === 'none') return false;
    }
    return true;
  }
  const inFlow = (el) => ['static', 'relative', 'sticky'].includes(cs(el).position);
  const isScroller = (el) => {
    const s = cs(el);
    return ['auto', 'scroll'].includes(s.overflowX) || ['auto', 'scroll'].includes(s.overflowY);
  };
  const clips = (el) => {
    const s = cs(el);
    return [s.overflowX, s.overflowY].some((o) => o !== 'visible');
  };
  const hasClippingAncestor = (el) => {
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) if (clips(p)) return true;
    return false;
  };
  const isInlineMultiLine = (el) => cs(el).display === 'inline' && el.getClientRects().length > 1;
  const contentBox = (el) => {
    const r = rectOf(el), s = cs(el);
    return {
      left: r.left + px(s.borderLeftWidth) + px(s.paddingLeft),
      right: r.right - px(s.borderRightWidth) - px(s.paddingRight),
      top: r.top + px(s.borderTopWidth) + px(s.paddingTop),
      bottom: r.bottom - px(s.borderBottomWidth) - px(s.paddingBottom),
    };
  };

  const all = [...document.querySelectorAll('body, body *')].filter(visible);
  const allSet = new Set(all);

  // ---- AC-2 overflow ------------------------------------------------------------------------------------------------
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 0) {
    add('overflow-page', document.documentElement, 'scrollWidth ' + de.scrollWidth + ' > clientWidth ' + de.clientWidth);
  }
  for (const el of all) {
    if (el === document.body) continue;
    const r = rectOf(el);
    const p = cs(el).position;
    if (p === 'fixed') {
      if (r.left < -TOL || r.right > vw + TOL || r.top < -TOL || r.bottom > vh + TOL) {
        add('fixed-outside-viewport', el, 'box ' + r1(r.left) + '..' + r1(r.right) + ' x ' + r1(r.top) + '..' + r1(r.bottom) + ' in ' + vw + 'x' + vh);
      }
      continue;
    }
    if (p === 'absolute') continue;
    if (hasClippingAncestor(el)) continue;
    if (isInlineMultiLine(el)) continue;
    if (r.right > vw + TOL || r.left < -TOL) {
      add('overflow-element', el, 'box ' + r1(r.left) + '..' + r1(r.right) + ' outside 0..' + vw);
    }
  }

  // ---- AC-3 overlap between in-flow siblings --------------------------------------------------------------------------
  // A sticky box pinned by a scrolled page sits over its siblings by design (the 'popover' rule and covered-text judge that case), so while the
  // page is scrolled with a pop-up open (it scrolls itself into view, MRV-9.2) it is not a sibling box to compare.
  const layoutKid = (el) => allSet.has(el) && inFlow(el) && !isInlineMultiLine(el) && !TABLE_PARTS.has(el.tagName) && !(cs(el).position === 'sticky' && window.scrollY > 0 && document.querySelector('[data-popover]'));
  for (const parent of [document.body, ...all]) {
    const kids = [...parent.children].filter(layoutKid);
    for (let i = 0; i < kids.length; i++) {
      for (let j = i + 1; j < kids.length; j++) {
        const a = rectOf(kids[i]), b = rectOf(kids[j]);
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > TOL && h > TOL) {
          add('overlap', kids[j], 'intersects ' + sel(kids[i]) + ' by ' + r1(w) + 'x' + r1(h));
        }
      }
    }
  }

  // ---- AC-4 single-line controls --------------------------------------------------------------------------------------
  const CONTROL = 'button, [role="button"], .btn, [class~="chip"], [class*="chip--"], [class*="chip__"], [role="tab"], .tab, header a, nav a, footer nav a, summary';
  const controls = [...document.querySelectorAll(CONTROL)].filter((e) => allSet.has(e));
  // Icon + short label pairs: a small element with an svg beside text.
  for (const e of all) {
    if (e.tagName === 'svg' || e.matches(CONTROL)) continue;
    if (e.querySelector(':scope > svg') && (e.textContent || '').trim().length > 0 && (e.textContent || '').trim().length <= 40 && [...e.children].every((c) => c.tagName.toLowerCase() === 'svg' || cs(c).display.startsWith('inline'))) controls.push(e);
  }
  const textLineTops = (el) => {
    const tops = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.nodeValue.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const rc of range.getClientRects()) {
        if (rc.width < 1) continue;
        if (!tops.some((t) => Math.abs(t - rc.top) < 3)) tops.push(rc.top);
      }
    }
    return tops;
  };
  // A logo lockup (badge beside a stacked name and tagline) is several lines by design: marked data-lockup, it is judged per
  // text run, so each run must still stay on one line (MRV-8.2 decisions). Anything unmarked is judged as a whole.
  const lockupWraps = (el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.nodeValue.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const tops = [];
      for (const rc of range.getClientRects()) if (rc.width >= 1 && !tops.some((t) => Math.abs(t - rc.top) < 3)) tops.push(rc.top);
      if (tops.length > 1) return tops.length;
    }
    return 0;
  };
  for (const el of controls) {
    const tops = el.hasAttribute('data-lockup') ? new Array(lockupWraps(el)).fill(0) : textLineTops(el);
    // .btn--wrap is the one opt-out: a call to action too long for a phone wraps its text beside the icon (MRV-8.2 decisions).
    if (tops.length > 1 && !(el.matches('.btn--wrap') && vw < 640)) {
      add('wrapped-control', el, tops.length + ' text lines in a single-line control');
      continue;
    }
    const s = cs(el);
    if (s.display.includes('flex') || s.display.includes('grid')) {
      const kids = [...el.children].filter((c) => allSet.has(c) && inFlow(c));
      for (let i = 0; i < kids.length; i++) {
        for (let j = i + 1; j < kids.length; j++) {
          const a = rectOf(kids[i]), b = rectOf(kids[j]);
          if (b.top >= a.bottom - TOL || a.top >= b.bottom - TOL) {
            add('wrapped-control', el, 'icon and label stack on separate rows');
          }
        }
      }
    }
  }
  // Controls that are siblings in one row share a height (buttons and nav links of the same kind).
  {
    const byParent = new Map();
    for (const el of controls) {
      if (!inFlow(el) || isInlineMultiLine(el)) continue;
      const k = el.parentElement;
      if (!byParent.has(k)) byParent.set(k, []);
      byParent.get(k).push(el);
    }
    for (const [, list] of byParent) {
      const rows = [];
      for (const el of list) {
        const r = rectOf(el);
        const row = rows.find((g) => Math.min(g.bottom, r.bottom) - Math.max(g.top, r.top) > Math.min(g.bottom - g.top, r.height) * 0.5);
        if (row) { row.items.push(el); row.top = Math.min(row.top, r.top); row.bottom = Math.max(row.bottom, r.bottom); }
        else rows.push({ top: r.top, bottom: r.bottom, items: [el] });
      }
      for (const row of rows) {
        if (row.items.length < 2) continue;
        const kinds = new Map();
        for (const el of row.items) {
          const k = el.tagName + (cs(el).display);
          if (!kinds.has(k)) kinds.set(k, []);
          kinds.get(k).push(el);
        }
        for (const [, same] of kinds) {
          if (same.length < 2) continue;
          const hs = same.map((e) => rectOf(e).height);
          if (Math.max(...hs) - Math.min(...hs) > TOL) {
            for (const e of same) if (Math.abs(rectOf(e).height - Math.min(...hs)) > TOL) add('button-row-height', e, 'height ' + r1(rectOf(e).height) + ' vs row minimum ' + r1(Math.min(...hs)));
          }
        }
      }
    }
  }

  // ---- AC-5 alignment ---------------------------------------------------------------------------------------------------
  const FIELD = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]), select, textarea';
  const fields = [...document.querySelectorAll(FIELD)].filter((e) => allSet.has(e) && inFlow(e));
  const blockOf = (field) => {
    let b = field;
    for (let p = field.parentElement; p && p !== document.body; p = p.parentElement) {
      if (['FORM', 'FIELDSET'].includes(p.tagName)) break;
      if (p.querySelectorAll(FIELD).length !== 1) break;
      b = p;
    }
    return b;
  };
  const inMultiFieldRow = (items, it) => {
    const r = rectOf(it.field);
    return items.some((o) => o !== it && Math.min(r.bottom, rectOf(o.field).bottom) - Math.max(r.top, rectOf(o.field).top) > Math.min(r.height, rectOf(o.field).height) * 0.5);
  };
  const formOf = (field) => field.closest('form, fieldset, [role="dialog"], dialog') || field.closest('section, main') || document.body;
  {
    const byForm = new Map();
    for (const f of fields) {
      const k = formOf(f);
      if (!byForm.has(k)) byForm.set(k, []);
      byForm.get(k).push({ field: f, block: blockOf(f) });
    }
    for (const [, items] of byForm) {
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const A = items[i], B = items[j];
          const ba = rectOf(A.block), bb = rectOf(B.block);
          const fa = rectOf(A.field), fb = rectOf(B.field);
          const vOverlap = Math.min(fa.bottom, fb.bottom) - Math.max(fa.top, fb.top);
          const sameRow = vOverlap > Math.min(fa.height, fb.height) * 0.5;
          if (sameRow) {
            if (Math.abs(fa.top - fb.top) > TOL || Math.abs(fa.height - fb.height) > TOL) {
              add('form-row', B.field, 'same row as ' + sel(A.field) + ': top ' + r1(fa.top) + '/' + r1(fb.top) + ', height ' + r1(fa.height) + '/' + r1(fb.height));
            }
          } else {
            // Stacked fields: a near-miss left edge is a misalignment; the same left edge means the same column, so the same width.
            const dl = Math.abs(ba.left - bb.left);
            if (dl > TOL && dl <= 24 && Math.min(ba.right, bb.right) - Math.max(ba.left, bb.left) > 0) {
              add('form-left-edge', B.block, 'left edge ' + r1(bb.left) + ' vs ' + r1(ba.left) + ' of ' + sel(A.block));
            } else if (dl <= TOL && Math.abs(ba.width - bb.width) > TOL && !inMultiFieldRow(items, A) && !inMultiFieldRow(items, B)) {
              // (A field that shares its row with others is a column of a multi-column row; a full-width field above it spans those columns.)
              add('form-column-width', B.block, 'width ' + r1(bb.width) + ' vs ' + r1(ba.width) + ' of ' + sel(A.block));
            }
          }
        }
      }
    }
  }
  // Cards that sit in one row of a grid/flex parent have equal heights.
  const cardLike = (el) => {
    const s = cs(el);
    const hasBorder = px(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none';
    const hasBg = s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent';
    if (s.display.startsWith('inline') || ['SPAN', 'A', 'BUTTON'].includes(el.tagName) || rectOf(el).height < 64) return false;
    return s.boxShadow !== 'none' || hasBorder || hasBg || /card|tile|panel/.test(el.className && el.className.toString());
  };
  for (const parent of all) {
    const ps = cs(parent);
    if (!(ps.display.includes('grid') || ps.display.includes('flex'))) continue;
    const kids = [...parent.children].filter((c) => allSet.has(c) && inFlow(c) && cardLike(c));
    if (kids.length < 2) continue;
    const rows = [];
    for (const el of kids) {
      const r = rectOf(el);
      const row = rows.find((g) => Math.min(g.bottom, r.bottom) - Math.max(g.top, r.top) > Math.min(g.bottom - g.top, r.height) * 0.5);
      if (row) { row.items.push(el); row.top = Math.min(row.top, r.top); row.bottom = Math.max(row.bottom, r.bottom); }
      else rows.push({ top: r.top, bottom: r.bottom, items: [el] });
    }
    for (const row of rows) {
      if (row.items.length < 2) continue;
      const hs = row.items.map((e) => rectOf(e).height);
      const min = Math.min(...hs);
      if (Math.max(...hs) - min > TOL) {
        for (const e of row.items) if (rectOf(e).height - min > TOL) add('card-height', e, 'height ' + r1(rectOf(e).height) + ' vs shortest ' + r1(min) + ' in its row');
      }
    }
  }
  // Direct children of a content container start on the container's left content edge (no margin hacks).
  for (const parent of all) {
    if (!['MAIN', 'SECTION', 'ARTICLE'].includes(parent.tagName) && !/container|wrap|inner|page/.test((parent.className || '').toString())) continue;
    const ps = cs(parent);
    if (ps.display.includes('flex') || ps.display.includes('grid')) continue;
    const box = contentBox(parent);
    for (const k of parent.children) {
      if (!allSet.has(k) || !inFlow(k)) continue;
      if (!/^(H1|H2|H3|P|UL|OL|FORM|TABLE|DIV|SECTION|ARTICLE|FIELDSET)$/.test(k.tagName)) continue;
      const ks = cs(k);
      if (ks.display.startsWith('inline') || ks.float !== 'none') continue;
      // A child of a scroll container (a `.table-wrap`) is measured where it sits unscrolled: the user's sideways scroll (or the focus moving
      // into a form inside it) shifts it by `scrollLeft` and that is not a layout miss.
      const shift = isScroller(parent) ? parent.scrollLeft : 0;
      const r0 = rectOf(k);
      const r = { left: r0.left + shift, right: r0.right + shift };
      // A box centred by auto margins (or max-width) sits symmetrically in its parent: that is not a left-edge miss.
      if (Math.abs((r.left - box.left) - (box.right - r.right)) <= TOL) continue;
      if (Math.abs(r.left - box.left) > TOL && r.left < box.right) {
        add('container-edge', k, 'left ' + r1(r.left) + ' vs container content edge ' + r1(box.left) + ' of ' + sel(parent));
      }
    }
  }

  // ---- AC-6 box model ------------------------------------------------------------------------------------------------------
  for (const el of all) {
    if (el === document.body) continue;
    const s = cs(el);
    if (s.boxSizing !== 'border-box' && el.tagName.toLowerCase() !== 'svg' && !(el.tagName === 'INPUT' && ['checkbox', 'radio'].includes(el.type))) {
      add('box-sizing', el, 'box-sizing is ' + s.boxSizing);
    }
    if (!inFlow(el) || TABLE_PARTS.has(el.tagName) || isInlineMultiLine(el)) continue;
    const parent = el.parentElement;
    if (!parent || parent === document.body || parent === document.documentElement) continue;
    if (!allSet.has(parent) || isScroller(parent) || TABLE_PARTS.has(parent.tagName)) continue;
    const ps = cs(parent);
    if (ps.display === 'inline' || ps.display.startsWith('table')) continue;
    const box = contentBox(parent);
    const r = rectOf(el);
    const mL = Math.max(0, -px(s.marginLeft)); // a deliberate negative margin is still measured on the border box
    if (r.right > box.right + TOL || r.left < box.left - TOL) {
      add('exceeds-parent', el, 'x ' + r1(r.left) + '..' + r1(r.right) + ' vs parent content ' + r1(box.left) + '..' + r1(box.right) + ' of ' + sel(parent) + (mL ? ' (negative margin)' : ''));
    } else if (r.bottom > box.bottom + TOL && ps.display !== 'inline-block') {
      // Taller than the parent's content box only matters when the parent's height is not content-sized.
      if (ps.height !== 'auto' && ps.blockSize !== 'auto' && parent.scrollHeight > parent.clientHeight + TOL) {
        add('exceeds-parent', el, 'bottom ' + r1(r.bottom) + ' vs parent content ' + r1(box.bottom) + ' of ' + sel(parent));
      }
    }
  }

  // ---- MRV-9.2 AC-5 open pop-up widget -------------------------------------------------------------------------------------------
  // A pop-up marked [data-popover] hides the page behind it on purpose, so it is judged on where it sits: inside the viewport sideways,
  // no taller than the viewport (it scrolls its own content), and clear of every visible fixed or sticky layer (the header, the privacy
  // notice, the WhatsApp button) at the scroll position the page was left in.
  for (const pop of all.filter((e) => e.hasAttribute('data-popover'))) {
    const r = rectOf(pop);
    if (r.left < -TOL || r.right > vw + TOL) add('popover', pop, 'x ' + r1(r.left) + '..' + r1(r.right) + ' outside 0..' + vw);
    else if (r.height > vh + TOL) add('popover', pop, 'height ' + r1(r.height) + ' taller than the viewport ' + vh);
    else {
      for (const layer of all) {
        if (layer === pop || pop.contains(layer) || layer.contains(pop) || !['fixed', 'sticky'].includes(cs(layer).position)) continue;
        const l = rectOf(layer);
        const w = Math.min(r.right, l.right) - Math.max(r.left, l.left);
        const h = Math.min(r.bottom, l.bottom) - Math.max(r.top, l.top);
        if (w > TOL && h > TOL) { add('popover', pop, 'overlaps ' + sel(layer) + ' by ' + r1(w) + 'x' + r1(h)); break; }
      }
    }
  }

  // ---- AC-3 covered text -------------------------------------------------------------------------------------------------------
  const textOwners = all.filter((el) => inFlow(el) && [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim()) && !el.closest('select, option, textarea'));
  const fixedOrSticky = (e) => { for (let p = e; p && p.nodeType === 1; p = p.parentElement) { const pos = cs(p).position; if (pos === 'fixed' || pos === 'sticky') return true; } return false; };
  const layerOf = (e) => { for (let p = e; p && p.nodeType === 1; p = p.parentElement) { const pos = cs(p).position; if (pos === 'fixed' || pos === 'sticky') return p; } return e; };
  const isControl = (e) => !!e.closest('a, button, label, input, select, textarea, [role="button"], [role="tab"]');
  const clipRect = (el) => {
    let l = -Infinity, t = -Infinity, r = Infinity, b = Infinity;
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      if (clips(p)) { const pr = rectOf(p); l = Math.max(l, pr.left); t = Math.max(t, pr.top); r = Math.min(r, pr.right); b = Math.min(b, pr.bottom); }
    }
    return { l, t, r, b };
  };
  const maxScroll = Math.max(0, de.scrollHeight - vh);
  const positions = [];
  for (let y = 0; y < maxScroll; y += Math.max(200, Math.floor(vh * 0.8))) positions.push(y);
  positions.push(maxScroll);
  const startScroll = window.scrollY;
  for (const y of positions) {
    window.scrollTo({ top: y, left: 0, behavior: 'instant' });
    const atEdge = y === 0 || y === maxScroll;
    for (const el of textOwners) {
      const range = document.createRange();
      let rect = null;
      for (const n of el.childNodes) {
        if (n.nodeType === 3 && n.nodeValue.trim()) { range.selectNodeContents(n); const rc = range.getClientRects()[0]; if (rc && rc.width > 1 && rc.height > 1) { rect = rc; break; } }
      }
      if (!rect) continue;
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      if (cx < 0 || cy < 0 || cx > vw || cy > vh) continue;
      const c = clipRect(el);
      if (cx < c.l || cx > c.r || cy < c.t || cy > c.b) continue;
      const top = document.elementFromPoint(cx, cy);
      if (!top || top === el || el.contains(top) || top.contains(el)) continue;
      // An open pop-up widget covers the page behind it on purpose (the 'popover' rule judges where it may sit).
      if (top.closest('[data-popover]')) continue;
      if (fixedOrSticky(top)) {
        // A sticky header or a fixed layer passing over content mid-scroll is normal. At rest it must not cover a control or field:
        // at the top of the page any such layer counts; at the very bottom only a layer anchored in the lower half (a notice, a floating button),
        // because content scrolled up behind a top header can still be scrolled back.
        if (!atEdge || !isControl(el)) continue;
        if (y !== 0 && rectOf(layerOf(top)).top <= vh / 2) continue;
        // At the top, a layer anchored in the lower half hides only what scrolling can clear: covered content that the page can
        // scroll above the layer is reachable (the end-of-page case above has no scroll left, so it still counts). MRV-8.2.
        if (y === 0 && rectOf(layerOf(top)).top > vh / 2 && maxScroll >= rect.bottom - rectOf(layerOf(top)).top) continue;
      }
      add('covered-text', el, 'covered by ' + sel(top) + ' at scroll ' + y);
    }
  }
  window.scrollTo({ top: startScroll, left: 0, behavior: 'instant' });

  return out;
}
