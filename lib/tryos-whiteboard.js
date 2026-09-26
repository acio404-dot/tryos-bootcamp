/*!
 * TR-YOS Zone · Черновик v1.1
 * Лист для решения рядом с заданием пробника: ручка, маркер, ластик, выделение, фигуры, текст.
 * У каждого задания свой лист (setSheet), листы сохраняются в браузере.
 * Без зависимостей. Работает с мышью, пальцем и стилусом (Apple Pencil, S Pen, Surface Pen).
 */
(function (global) {
  'use strict';

  const INK = [
    { v: '#1F2937', n: 'Графит' },
    { v: '#2563EB', n: 'Синий' },
    { v: '#DC2626', n: 'Красный' },
    { v: '#15803D', n: 'Зелёный' },
    { v: '#EA580C', n: 'Оранжевый' }
  ];
  const MARK = [
    { v: '#FDE047', n: 'Жёлтый' },
    { v: '#86EFAC', n: 'Зелёный' },
    { v: '#F9A8D4', n: 'Розовый' },
    { v: '#93C5FD', n: 'Голубой' },
    { v: '#FDBA74', n: 'Оранжевый' }
  ];
  // Три размера: тонко / средне / толсто
  const SIZES = { ink: [2, 3.5, 6], hl: [14, 22, 34], text: [20, 28, 40], eraser: [8, 16, 30] };
  const SIZE_NAMES = ['Тонко', 'Средне', 'Толсто'];
  const GRID = 25;          // шаг клетки в единицах листа
  const MIN_S = 0.25;
  const MAX_S = 5;
  const HISTORY = 200;
  const HOLD_MS = 550;      // «нарисуй и задержи» — через сколько штрих превращается в фигуру
  const PREFS_KEY = 'tryos-whiteboard:prefs';
  const TOOLS = ['hand', 'select', 'pen', 'hl', 'eraser', 'shape', 'text'];
  const SHAPES = [
    ['line', 'Линия', 'L'],
    ['arrow', 'Стрелка', 'A'],
    ['rect', 'Прямоугольник', 'R'],
    ['ellipse', 'Окружность', 'O'],
    ['tri', 'Треугольник', ''],
    ['rtri', 'Прямоугольный треугольник', ''],
    ['axes', 'Оси координат', '']
  ];
  const SHAPE_IDS = SHAPES.map(s => s[0]);
  const PAPERS = [['plain', 'Чистый лист'], ['grid', 'Клетка'], ['dots', 'Точки']];
  const SYMBOLS = ['²', '³', '√', 'π', '°', '∠', '△', '⊥', '∥', '≠', '≈', '≤', '≥', '±', '·', '÷', '×', '∞', 'α', 'β', '→'];

  const svg = d => '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  const ICON = {
    hand: svg('<path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>'),
    select: svg('<path d="M7 22a5 5 0 0 1-2-4"/><path d="M3.3 14A6.8 6.8 0 0 1 2 10c0-4.4 4.5-8 10-8s10 3.6 10 8-4.5 8-10 8a12 12 0 0 1-5-1"/><circle cx="5" cy="16" r="2"/>'),
    pen: svg('<path d="M21.17 6.81a2.82 2.82 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/><path d="m15 5 4 4"/>'),
    hl: svg('<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>'),
    eraser: svg('<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>'),
    partial: svg('<path d="M3 17c3-6 6-6 9-2s6 4 9-2" stroke-dasharray="3 3"/><circle cx="12" cy="15" r="3.5"/>'),
    text: svg('<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>'),
    line: svg('<path d="M5 19 19 5"/>'),
    arrow: svg('<path d="M5 19 19 5"/><path d="M10 5h9v9"/>'),
    rect: svg('<rect x="3.5" y="6" width="17" height="12" rx="1"/>'),
    ellipse: svg('<ellipse cx="12" cy="12" rx="9" ry="7"/>'),
    tri: svg('<path d="M12 4 21 20H3z"/>'),
    rtri: svg('<path d="M4 4v16h16z"/><path d="M4 15h5v5"/>'),
    axes: svg('<path d="M6 21V3"/><path d="M3 18h18"/><path d="m3 6 3-3 3 3"/><path d="m18 15 3 3-3 3"/><path d="M11 17v2M16 17v2M5 13h2M5 8h2" stroke-width="1.5"/>'),
    dash: svg('<path d="M3 12h4M10 12h4M17 12h4"/>'),
    undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
    redo: svg('<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>'),
    trash: svg('<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
    copy: svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
    more: svg('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'),
    plain: svg('<rect x="4" y="3" width="16" height="18" rx="2"/>'),
    grid: svg('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M9.3 3v18M14.7 3v18" stroke-width="1.5"/>'),
    dots: svg('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 8.5h.01M15 8.5h.01M9 15.5h.01M15 15.5h.01" stroke-width="3"/>'),
    fingerDraw: svg('<path d="M9 11V5a2 2 0 0 1 4 0v6"/><path d="M13 10a2 2 0 0 1 4 0v4a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.6-2.2L3 16.2a1.8 1.8 0 0 1 2.7-2.4L9 16"/>'),
    fingerPan: svg('<path d="M5 9 2 12l3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>'),
    zoomIn: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6M11 8v6"/>'),
    zoomOut: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6"/>'),
    fit: svg('<path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"/><rect x="8" y="8" width="8" height="8" rx="1"/>'),
    home: svg('<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>')
  };

  const FONT_UI = 'Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
  const CSS = `
.twb-root{overflow:hidden;background:#fff;-webkit-tap-highlight-color:transparent}
.twb-canvas{position:absolute;inset:0;z-index:0;display:block;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;outline:none;cursor:crosshair}
.twb-canvas[data-mode="hand"],.twb-canvas.twb-space{cursor:grab}
.twb-canvas.twb-grabbing{cursor:grabbing}
.twb-canvas[data-mode="text"]{cursor:text}
.twb-canvas[data-mode="select"]{cursor:default}
.twb-canvas[data-mode="eraser"]{cursor:none}
.twb-bar{position:absolute;left:50%;bottom:calc(12px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:30;display:flex;align-items:center;gap:3px;box-sizing:border-box;max-width:calc(100% - 24px);padding:5px;overflow-x:auto;scrollbar-width:none;background:#fff;border:1px solid #DCE4EE;border-radius:16px;box-shadow:0 12px 32px -10px rgba(15,35,66,.32),0 2px 6px rgba(15,35,66,.07);font:500 13px/1.2 ${FONT_UI};color:#1E293B;user-select:none;-webkit-user-select:none;touch-action:pan-x}
.twb-bar::-webkit-scrollbar{display:none}
.twb-group{display:flex;align-items:center;gap:1px;flex:none}
.twb-sep{flex:none;width:1px;align-self:stretch;margin:4px 3px;background:#E2E8F0}
.twb-btn{appearance:none;position:relative;flex:none;display:grid;place-items:center;width:40px;height:40px;padding:0;border:0;border-radius:11px;background:transparent;color:#334155;font:inherit;cursor:pointer}
.twb-btn:hover{background:#F1F5F9}
.twb-btn[aria-pressed="true"]{background:#0F2342;color:#fff}
.twb-btn:disabled{opacity:.32;cursor:default;background:transparent}
.twb-has-menu::after{content:"";position:absolute;right:5px;bottom:5px;border:3px solid transparent;border-right-color:currentColor;border-bottom-color:currentColor;opacity:.55}
.twb-chip{width:auto;min-width:52px;padding:0 8px;font-weight:600;font-size:12.5px;white-space:nowrap;font-variant-numeric:tabular-nums}
.twb-danger.twb-confirm{width:auto;padding:0 12px;background:#DC2626;color:#fff;font-weight:600;white-space:nowrap}
.twb-swatch{appearance:none;flex:none;display:grid;place-items:center;width:29px;height:40px;padding:0;border:0;border-radius:10px;background:transparent;cursor:pointer}
.twb-swatch::before{content:"";width:20px;height:20px;border-radius:50%;background:var(--c);box-shadow:inset 0 0 0 1px rgba(15,35,66,.16)}
.twb-swatch[aria-pressed="true"]::before{box-shadow:0 0 0 2px #fff,0 0 0 4px #0F2342}
.twb-size{width:30px}
.twb-size i{display:block;width:var(--d);height:var(--d);border-radius:50%;background:var(--c,#1F2937)}
.twb-size[aria-pressed="true"],.twb-dash[aria-pressed="true"]{background:#E8EEF5;color:#0F2342}
.twb-btn:focus-visible,.twb-swatch:focus-visible,.twb-pop-item:focus-visible,.twb-toast button:focus-visible,.twb-selmenu button:focus-visible,.twb-symbols button:focus-visible{outline:2px solid #38B2AC;outline-offset:2px}
.twb-pop{position:absolute;z-index:31;display:grid;gap:2px;min-width:236px;max-height:calc(100% - 16px);overflow:auto;box-sizing:border-box;padding:6px;background:#fff;border:1px solid #DCE4EE;border-radius:14px;box-shadow:0 16px 36px -12px rgba(15,35,66,.35);font:500 14px/1.2 ${FONT_UI};color:#1E293B}
.twb-pop-label{padding:8px 10px 4px;font-size:11.5px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:#64748B}
.twb-pop-note{max-width:250px;padding:2px 10px 8px;font-size:12.5px;line-height:1.4;color:#475569}
.twb-pop-sep{height:1px;margin:4px 6px;background:#E2E8F0}
.twb-pop-item{display:flex;align-items:center;gap:10px;padding:8px 10px;border:0;border-radius:9px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.twb-pop-item:hover{background:#F1F5F9}
.twb-pop-item[aria-checked="true"]{background:#E6FFFA;color:#134E4A}
.twb-pop-item kbd{margin-left:auto;padding:3px 6px;border:1px solid #E2E8F0;border-radius:5px;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:#64748B}
.twb-pop-item small{display:block;margin-top:2px;font-size:12px;color:#64748B;font-weight:400}
.twb-toast{position:absolute;left:50%;bottom:calc(74px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:32;display:flex;align-items:center;gap:14px;box-sizing:border-box;width:max-content;max-width:calc(100% - 32px);padding:10px 14px;border-radius:12px;background:#0F2342;color:#fff;font:500 13.5px/1.4 ${FONT_UI};box-shadow:0 12px 30px -10px rgba(15,35,66,.5)}
.twb-toast button{flex:none;padding:4px 2px;border:0;background:transparent;color:#5EEAD4;font:inherit;font-weight:600;white-space:nowrap;cursor:pointer}
.twb-eraser{position:absolute;z-index:5;pointer-events:none;border:1.5px solid #0F2342;border-radius:50%;background:rgba(255,255,255,.45);transform:translate(-50%,-50%)}
.twb-text{position:absolute;z-index:20;box-sizing:content-box;margin:0;padding:0;border:0;border-radius:2px;outline:none;background:rgba(56,178,172,.07);box-shadow:0 0 0 1px rgba(56,178,172,.75);resize:none;overflow:hidden;white-space:pre;min-width:12px}
.twb-selmenu,.twb-symbols{position:absolute;display:flex;gap:2px;padding:4px;box-sizing:border-box;background:#fff;border:1px solid #DCE4EE;border-radius:12px;box-shadow:0 10px 26px -10px rgba(15,35,66,.35);font:600 13px/1 ${FONT_UI};color:#1E293B;user-select:none;-webkit-user-select:none}
.twb-selmenu{z-index:25}
.twb-selmenu button{display:flex;align-items:center;gap:6px;height:34px;padding:0 10px;border:0;border-radius:8px;background:transparent;color:inherit;font:inherit;cursor:pointer;white-space:nowrap}
.twb-selmenu button svg{width:18px;height:18px}
.twb-selmenu button:hover{background:#F1F5F9}
.twb-selmenu .twb-del{color:#B91C1C}
.twb-symbols{z-index:26;flex-wrap:wrap;max-width:min(372px,calc(100% - 16px))}
.twb-symbols button{min-width:32px;height:32px;padding:0 4px;border:0;border-radius:8px;background:transparent;color:inherit;font:500 17px/1 system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer}
.twb-symbols button:hover{background:#F1F5F9}
.twb-pop[hidden],.twb-toast[hidden],.twb-eraser[hidden],.twb-btn[hidden],.twb-selmenu[hidden],.twb-symbols[hidden]{display:none!important}
`;

  function injectCSS() {
    if (document.getElementById('twb-style')) return;
    const s = document.createElement('style');
    s.id = 'twb-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  const localAdapter = {
    load(key) { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch (e) { return null; } },
    save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; } },
    remove(key) { try { localStorage.removeItem(key); } catch (e) { /* нет доступа к хранилищу */ } }
  };

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const r1 = v => Math.round(v * 10) / 10;
  const r2 = v => Math.round(v * 100) / 100;
  const pres = e => clamp(e.pressure || 0.5, 0.08, 1);
  const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const isTyping = n => n && (n.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName));
  const DASHABLE = new Set(['line', 'arrow', 'rect', 'ellipse', 'tri', 'rtri', 'poly']);

  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  function pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
      const xi = poly[i], yi = poly[i + 1], xj = poly[j], yj = poly[j + 1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function snapShape(t, a, b, force) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    if (t === 'line' || t === 'arrow') {
      const len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
      if (force) {
        const step = Math.PI / 12, s = Math.round(ang / step) * step;
        return [a[0] + Math.cos(s) * len, a[1] + Math.sin(s) * len];
      }
      // без Shift: почти горизонтальная/вертикальная линия выпрямляется сама
      const q = Math.round(ang / (Math.PI / 2)) * (Math.PI / 2);
      if (Math.abs(ang - q) < 0.06) return [a[0] + Math.cos(q) * len, a[1] + Math.sin(q) * len];
      return b;
    }
    if (!force) return b;
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    return [a[0] + (dx < 0 ? -m : m), a[1] + (dy < 0 ? -m : m)];
  }

  function box(it) {
    return {
      x0: Math.min(it.a[0], it.b[0]), y0: Math.min(it.a[1], it.b[1]),
      x1: Math.max(it.a[0], it.b[0]), y1: Math.max(it.a[1], it.b[1])
    };
  }

  function axesOrigin(it) {
    const b = box(it);
    return {
      ox: clamp(Math.round((b.x0 + b.x1) / 2 / GRID) * GRID, b.x0, b.x1),
      oy: clamp(Math.round((b.y0 + b.y1) / 2 / GRID) * GRID, b.y0, b.y1)
    };
  }

  /** Копия элемента со сдвигом/масштабом: x' = x·s + tx */
  function transformItem(it, m) {
    const o = Object.assign({}, it);
    const X = x => r1(x * m.s + m.tx), Y = y => r1(y * m.s + m.ty);
    if (it.pts) {
      o.pts = it.pts.slice();
      for (let i = 0; i < o.pts.length; i += 3) { o.pts[i] = X(it.pts[i]); o.pts[i + 1] = Y(it.pts[i + 1]); }
    }
    if (it.p) o.p = it.p.map((v, i) => i % 2 ? Y(v) : X(v));
    if (it.a) { o.a = [X(it.a[0]), Y(it.a[1])]; o.b = [X(it.b[0]), Y(it.b[1])]; }
    if (it.t === 'text') { o.x = X(it.x); o.y = Y(it.y); o.size = clamp(r1(it.size * m.s), 6, 400); }
    else if (m.s !== 1) o.w = clamp(r2(it.w * m.s), 0.5, 120);
    return o;
  }

  /* ---------- распознавание фигур («нарисуй и задержи») ---------- */

  function rdp(P, eps) {
    if (P.length < 3) return P.slice();
    const keep = new Uint8Array(P.length);
    keep[0] = keep[P.length - 1] = 1;
    const stack = [[0, P.length - 1]];
    while (stack.length) {
      const [s, e] = stack.pop();
      let md = 0, mi = -1;
      for (let i = s + 1; i < e; i++) {
        const d = segDist(P[i][0], P[i][1], P[s][0], P[s][1], P[e][0], P[e][1]);
        if (d > md) { md = d; mi = i; }
      }
      if (md > eps && mi > 0) { keep[mi] = 1; stack.push([s, mi], [mi, e]); }
    }
    return P.filter((_, i) => keep[i]);
  }

  function turn(a, b, c) {
    const a1 = Math.atan2(b[1] - a[1], b[0] - a[0]), a2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
    let d = Math.abs(a2 - a1);
    if (d > Math.PI) d = 2 * Math.PI - d;
    return d;
  }

  /** Убрать вершины, где линия почти не поворачивает (< 25°) */
  function dropStraight(V, closed) {
    let changed = true;
    while (changed && V.length > (closed ? 3 : 2)) {
      changed = false;
      for (let i = closed ? 0 : 1; i < (closed ? V.length : V.length - 1); i++) {
        const a = V[(i - 1 + V.length) % V.length], b = V[i], c = V[(i + 1) % V.length];
        if (turn(a, b, c) < 0.44) { V.splice(i, 1); changed = true; break; }
      }
    }
    return V;
  }

  function recognize(it) {
    const raw = it.pts, P = [];
    for (let i = 0; i < raw.length; i += 3) P.push([raw[i], raw[i + 1]]);
    if (P.length < 4) return null;
    let L = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    P.forEach((q, i) => {
      if (i) L += Math.hypot(q[0] - P[i - 1][0], q[1] - P[i - 1][1]);
      x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]);
    });
    const diag = Math.hypot(x1 - x0, y1 - y0);
    if (diag < 14) return null;
    const first = P[0], last = P[P.length - 1];
    const gap = Math.hypot(last[0] - first[0], last[1] - first[1]);
    const base = { c: it.c, w: it.w };
    const R = v => r1(v);
    const flat = V => [].concat(...V).map(R);

    if (gap / L > 0.93) {
      if (it.t === 'hl') return Object.assign({}, it, { pts: [R(first[0]), R(first[1]), 0.5, R(last[0]), R(last[1]), 0.5] });
      return Object.assign({ t: 'line', a: [R(first[0]), R(first[1])], b: [R(last[0]), R(last[1])] }, base);
    }
    if (it.t === 'hl') return null;

    const eps = diag * 0.065;
    if (gap < 0.2 * L && gap < diag * 0.35) {
      // замкнутая фигура
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2 || 1, ry = (y1 - y0) / 2 || 1;
      let err = 0;
      P.forEach(q => { err += Math.abs(Math.hypot((q[0] - cx) / rx, (q[1] - cy) / ry) - 1); });
      err /= P.length;
      let V = rdp(P.concat([first]), eps);
      V.pop();
      V = dropStraight(V, true);
      if (V.length === 3) return Object.assign({ t: 'poly', closed: 1, p: flat(V) }, base);
      if (V.length === 4) {
        const axisAligned = V.every((a, i) => {
          const b = V[(i + 1) % 4], ang = Math.abs(Math.atan2(b[1] - a[1], b[0] - a[0])) % (Math.PI / 2);
          return ang < 0.26 || ang > Math.PI / 2 - 0.26;
        });
        if (axisAligned) {
          const xs = V.map(v => v[0]).sort((a, b) => a - b), ys = V.map(v => v[1]).sort((a, b) => a - b);
          return Object.assign({ t: 'rect', a: [R((xs[0] + xs[1]) / 2), R((ys[0] + ys[1]) / 2)], b: [R((xs[2] + xs[3]) / 2), R((ys[2] + ys[3]) / 2)] }, base);
        }
        if (err > 0.1) return Object.assign({ t: 'poly', closed: 1, p: flat(V) }, base);
      }
      if (err < 0.14) {
        let ex = rx, ey = ry;
        const ratio = rx / ry;
        if (ratio > 0.82 && ratio < 1.22) ex = ey = (rx + ry) / 2; // почти круг → круг
        return Object.assign({ t: 'ellipse', a: [R(cx - ex), R(cy - ey)], b: [R(cx + ex), R(cy + ey)] }, base);
      }
      if (V.length >= 5 && V.length <= 6) return Object.assign({ t: 'poly', closed: 1, p: flat(V) }, base);
      return null;
    }
    // незамкнутая ломаная (угол, зигзаг) из 2–3 отрезков
    let V = rdp(P, eps * 0.8);
    V = dropStraight(V, false);
    if (V.length >= 3 && V.length <= 4) return Object.assign({ t: 'poly', closed: 0, p: flat(V) }, base);
    return null;
  }

  /** Стереть кусок штриха: возвращает оставшиеся части */
  function splitStroke(it, x, y, r) {
    const p = it.pts, R = r + it.w * 0.5, step = Math.max(0.6, r / 3), q = [];
    for (let i = 0; i < p.length; i += 3) {
      if (i) {
        const dx = p[i] - p[i - 3], dy = p[i + 1] - p[i - 2], n = Math.floor(Math.hypot(dx, dy) / step);
        for (let k = 1; k < n; k++) {
          const t = k / n;
          q.push(r1(p[i - 3] + dx * t), r1(p[i - 2] + dy * t), r2(p[i - 1] + (p[i + 2] - p[i - 1]) * t));
        }
      }
      q.push(p[i], p[i + 1], p[i + 2]);
    }
    const pieces = [];
    let cur = [];
    for (let i = 0; i < q.length; i += 3) {
      if (Math.hypot(q[i] - x, q[i + 1] - y) > R) cur.push(q[i], q[i + 1], q[i + 2]);
      else { if (cur.length >= 6) pieces.push(cur); cur = []; }
    }
    if (cur.length >= 6) pieces.push(cur);
    return pieces.map(pts => Object.assign({}, it, { pts }));
  }

  /**
   * Контур штриха для отрисовки (кэшируется).
   * Штрих без нажима — сглаженная линия (stroke), с нажимом — залитый контур переменной толщины (fill):
   * так он рисуется одним вызовом и без швов.
   */
  function strokePath(it) {
    const p = it.pts, n = p.length / 3, path = new Path2D();
    const wOf = i => it.pr ? it.w * (0.35 + 1.3 * p[i * 3 + 2]) : it.w;
    if (n === 1) { path.arc(p[0], p[1], wOf(0) / 2, 0, Math.PI * 2); return path; }
    if (!it.pr) {
      path.moveTo(p[0], p[1]);
      if (n === 2) { path.lineTo(p[3], p[4]); return path; }
      // сглаживание: кривые через середины соседних точек
      for (let i = 1; i < n - 1; i++) {
        path.quadraticCurveTo(p[i * 3], p[i * 3 + 1], (p[i * 3] + p[i * 3 + 3]) / 2, (p[i * 3 + 1] + p[i * 3 + 4]) / 2);
      }
      path.lineTo(p[(n - 1) * 3], p[(n - 1) * 3 + 1]);
      return path;
    }
    // лёгкое сглаживание точек и толщины
    const X = [], Y = [], W = [];
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      const edge = i === 0 || i === n - 1;
      X.push(edge ? p[i * 3] : (p[a * 3] + 2 * p[i * 3] + p[b * 3]) / 4);
      Y.push(edge ? p[i * 3 + 1] : (p[a * 3 + 1] + 2 * p[i * 3 + 1] + p[b * 3 + 1]) / 4);
      W.push((wOf(a) + 2 * wOf(i) + wOf(b)) / 8); // половина толщины
    }
    const L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      let dx = X[b] - X[a], dy = Y[b] - Y[a];
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      L.push(X[i] - dy * W[i], Y[i] + dx * W[i]);
      R.push(X[i] + dy * W[i], Y[i] - dx * W[i]);
    }
    path.moveTo(L[0], L[1]);
    for (let i = 2; i < L.length; i += 2) path.lineTo(L[i], L[i + 1]);
    for (let i = R.length - 2; i >= 0; i -= 2) path.lineTo(R[i], R[i + 1]);
    path.closePath();
    // круглые концы — отдельным контуром, иначе при заливке они вырезают «дырку» в линии
    const caps = new Path2D();
    caps.arc(X[0], Y[0], W[0], 0, Math.PI * 2);
    caps.moveTo(X[n - 1] + W[n - 1], Y[n - 1]);
    caps.arc(X[n - 1], Y[n - 1], W[n - 1], 0, Math.PI * 2);
    path.caps = caps;
    return path;
  }

  function validItems(d) {
    return d && Array.isArray(d.items) ? d.items.filter(it => it && typeof it.t === 'string') : [];
  }
  function validView(d) {
    const v = d && d.view;
    return v && isFinite(v.x) && isFinite(v.y) && v.s > 0 ? { x: +v.x, y: +v.y, s: clamp(+v.s, MIN_S, MAX_S) } : { x: 0, y: 0, s: 1 };
  }

  class Whiteboard {
    constructor(opts) {
      opts = opts || {};
      if (!opts.container) throw new Error('TryosWhiteboard: нужен параметр container');
      injectCSS();
      this.root = opts.container;
      this.ns = opts.storageKey || 'tryos-whiteboard';
      this.store = opts.storage === false ? null : (opts.storage || localAdapter);
      this.onChange = typeof opts.onChange === 'function' ? opts.onChange : null;
      this.font = opts.textFont || 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      this.shortcuts = opts.shortcuts !== false;

      const saved = localAdapter.load(PREFS_KEY) || {};
      this.prefs = Object.assign({ tool: 'pen', shape: 'line', ink: 0, hl: 0, size: 1, paper: 'plain', finger: 'draw', fingerChosen: false, erase: 'object', dash: false }, saved);
      const p = this.prefs;
      if (!TOOLS.includes(p.tool)) p.tool = 'pen';
      if (!SHAPE_IDS.includes(p.shape)) p.shape = 'line';
      if (!INK[p.ink]) p.ink = 0;
      if (!MARK[p.hl]) p.hl = 0;
      if (!SIZES.ink[p.size]) p.size = 1;
      if (!PAPERS.some(x => x[0] === p.paper)) p.paper = 'plain';
      if (p.erase !== 'partial') p.erase = 'object';
      if (p.finger !== 'pan') p.finger = 'draw';
      p.dash = !!p.dash;

      this.sheets = new Map();
      this.pointers = new Map();
      this.saveTimers = new Map();
      this.bbox = new WeakMap();
      this.paths = new WeakMap();
      this.selection = [];
      this.clip = null;
      this.gesture = null;
      this.active = null;
      this.editing = null;
      this.multi = null;
      this.dirty = true;
      this.raf = 0;
      this.w = this.h = 0;
      this.dpr = 1;

      this.sheet = this._getSheet(opts.sheet != null ? String(opts.sheet) : 'default');
      this._build();
      this._bind();
    }

    get view() { return this.sheet.view; }
    get sheetId() { return this.sheet.id; }

    /* ---------- публичное API ---------- */

    /** Переключиться на лист задания. Лист создаётся при первом обращении и сохраняется. */
    setSheet(id) {
      id = String(id);
      if (this.sheet && this.sheet.id === id) return this;
      if (this.editing) this._commitText();
      this._cancelGesture();
      this.pointers.clear();
      this.multi = null;
      if (this.saveTimers.has(this.sheet.id)) this._save(this.sheet.id);
      this.sheet = this._getSheet(id);
      this.selection = [];
      this._closePop();
      this.dirty = true;
      this._draw();
      this._syncHistory();
      this._syncView();
      return this;
    }

    setTool(t) {
      if (SHAPE_IDS.includes(t)) { this.prefs.shape = t; t = 'shape'; }
      if (!TOOLS.includes(t)) return this;
      if (this.editing && t !== 'text') this._commitText();
      this.prefs.tool = t;
      this.canvas.dataset.mode = t;
      this.canvas.style.cursor = '';
      if (t !== 'eraser') this.eraserEl.hidden = true;
      if (t !== 'select' && this.selection.length) { this.selection = []; this._requestDraw(); }
      this._savePrefs();
      this._syncBar();
      return this;
    }

    undo() {
      if (this.editing) this._commitText();
      const sh = this.sheet;
      if (!sh.undo.length) return this;
      sh.redo.push(sh.items);
      sh.items = sh.undo.pop();
      this.dirty = true;
      this._afterChange();
      return this;
    }

    redo() {
      if (this.editing) this._commitText();
      const sh = this.sheet;
      if (!sh.redo.length) return this;
      sh.undo.push(sh.items);
      sh.items = sh.redo.pop();
      this.dirty = true;
      this._afterChange();
      return this;
    }

    /** Очистить лист (текущий или указанный). На текущем листе можно отменить. */
    clearSheet(id) {
      if (id == null || String(id) === this.sheet.id) {
        if (this.editing) this._commitText();
        if (this.sheet.items.length) this._change(sh => { sh.items = []; });
        return this;
      }
      const sh = this._getSheet(String(id));
      sh.items = []; sh.undo = []; sh.redo = [];
      this._save(sh.id);
      return this;
    }

    /** Удалить все листы этого пробника (например, при повторном прохождении). */
    clearAll() {
      if (this.editing) this._commitText();
      this._cancelGesture();
      const ids = new Set(this._index().concat([...this.sheets.keys()]));
      for (const t of this.saveTimers.values()) clearTimeout(t);
      this.saveTimers.clear();
      if (this.store) {
        ids.forEach(id => this.store.remove(this._key(id)));
        this.store.remove(this.ns + '::sheets');
      }
      const cur = this.sheet.id;
      this.sheets.clear();
      this.sheet = this._getSheet(cur);
      this.selection = [];
      this.dirty = true;
      this._draw();
      this._syncHistory();
      this._syncView();
      return this;
    }

    hasContent(id) {
      id = id == null ? this.sheet.id : String(id);
      const sh = this.sheets.get(id);
      if (sh) return sh.items.length > 0;
      const d = this.store ? this.store.load(this._key(id)) : null;
      return validItems(d).length > 0;
    }

    /** Данные листа (JSON) — например, чтобы сохранить на сервере. */
    exportData(id) {
      const sh = id == null ? this.sheet : this._getSheet(String(id));
      return JSON.parse(JSON.stringify({ v: 1, items: sh.items, view: sh.view }));
    }

    /** Загрузить данные в лист (например, с сервера). Заменяет содержимое листа. */
    importData(id, data) {
      id = String(id);
      if (this.sheet.id === id) { if (this.editing) this._commitText(); this._cancelGesture(); this.selection = []; }
      const sh = this._getSheet(id);
      sh.items = validItems(data).map(it => Object.assign({}, it));
      sh.view = validView(data);
      sh.undo = []; sh.redo = [];
      this._save(id);
      if (sh === this.sheet) { this.dirty = true; this._draw(); this._syncHistory(); this._syncView(); }
      return this;
    }

    /** PNG-картинка листа (только область с записями). Возвращает data URL или null для пустого листа. */
    exportPNG(id, opts) {
      opts = opts || {};
      const sh = id == null ? this.sheet : this._getSheet(String(id));
      const b = this._union(sh.items);
      if (!b) return null;
      const pad = opts.padding != null ? opts.padding : 24;
      const bw = b[2] - b[0] + pad * 2, bh = b[3] - b[1] + pad * 2;
      const sc = Math.min(opts.scale || 2, 8000 / bw, 8000 / bh);
      const c = el('canvas');
      c.width = Math.max(1, Math.ceil(bw * sc));
      c.height = Math.max(1, Math.ceil(bh * sc));
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.setTransform(sc, 0, 0, sc, (pad - b[0]) * sc, (pad - b[1]) * sc);
      for (const it of sh.items) this._drawItem(ctx, it);
      return c.toDataURL('image/png');
    }

    resetView() { this._setView(0, 0, 1); return this; }

    /** Показать все записи листа целиком */
    fitView() {
      const b = this._union(this.sheet.items);
      if (!b) return this.resetView();
      const pad = 32, bottom = 76, aw = Math.max(40, this.w - pad * 2), ah = Math.max(40, this.h - pad * 2 - bottom);
      const s = clamp(Math.min(aw / (b[2] - b[0] || 1), ah / (b[3] - b[1] || 1)), MIN_S, 2);
      this._setView(pad + (aw - (b[2] - b[0]) * s) / 2 - b[0] * s, pad + (ah - (b[3] - b[1]) * s) / 2 - b[1] * s, s);
      return this;
    }

    zoomBy(f) {
      const v = this.view, cx = this.w / 2, cy = this.h / 2, s = clamp(v.s * f, MIN_S, MAX_S);
      this._setView(cx - (cx - v.x) / v.s * s, cy - (cy - v.y) / v.s * s, s);
      return this;
    }

    deleteSelection() {
      if (!this.selection.length) return this;
      const set = new Set(this.selection);
      this._change(sh => { sh.items = sh.items.filter(it => !set.has(it)); this.selection = []; });
      return this;
    }

    duplicateSelection() {
      if (!this.selection.length) return this;
      const copies = this.selection.map(it => transformItem(it, { s: 1, tx: 20, ty: 20 }));
      this._change(sh => { sh.items.push(...copies); this.selection = copies; });
      return this;
    }

    destroy() {
      if (this.destroyed) return;
      this._flush();
      cancelAnimationFrame(this.raf);
      clearTimeout(this.toastTimer);
      clearTimeout(this.clearTimer);
      this._cancelGesture();
      window.removeEventListener('keydown', this._onKeyDown);
      window.removeEventListener('keyup', this._onKeyUp);
      window.removeEventListener('pagehide', this._onHide);
      window.removeEventListener('blur', this._onBlur);
      window.removeEventListener('resize', this._onResize);
      document.removeEventListener('visibilitychange', this._onVis);
      document.removeEventListener('pointerdown', this._onDocDown, true);
      if (document.fonts && document.fonts.removeEventListener) document.fonts.removeEventListener('loadingdone', this._onFonts);
      if (this.ro) this.ro.disconnect();
      if (this.editing) { const ta = this.editing.ta; this.editing = null; ta.remove(); }
      [this.canvas, this.bar, this.pop, this.toastEl, this.eraserEl, this.selMenu, this.symEl].forEach(n => n.remove());
      this.root.classList.remove('twb-root');
      this.destroyed = true;
    }

    /* ---------- листы и сохранение ---------- */

    _key(id) { return this.ns + ':' + id; }

    _getSheet(id) {
      let sh = this.sheets.get(id);
      if (sh) return sh;
      const d = this.store ? this.store.load(this._key(id)) : null;
      sh = { id, items: validItems(d), view: validView(d), undo: [], redo: [] };
      this.sheets.set(id, sh);
      return sh;
    }

    _index() {
      const v = this.store ? this.store.load(this.ns + '::sheets') : null;
      return Array.isArray(v) ? v : [];
    }

    _scheduleSave(id) {
      id = id || this.sheet.id;
      clearTimeout(this.saveTimers.get(id));
      this.saveTimers.set(id, setTimeout(() => this._save(id), 400));
    }

    _save(id) {
      clearTimeout(this.saveTimers.get(id));
      this.saveTimers.delete(id);
      const sh = this.sheets.get(id);
      if (!sh) return;
      const data = { v: 1, items: sh.items, view: sh.view };
      if (this.store) {
        const ok = this.store.save(this._key(id), data);
        if (ok === false && !this._warned) {
          this._warned = true;
          this._toast('Браузер не сохранил лист: закончилось место. Очистите старые листы.');
        }
        const idx = this._index();
        if (!idx.includes(id)) { idx.push(id); this.store.save(this.ns + '::sheets', idx); }
      }
      if (this.onChange) {
        try { this.onChange(id, JSON.parse(JSON.stringify(data))); } catch (e) { console.error(e); }
      }
    }

    _flush() { [...this.saveTimers.keys()].forEach(id => this._save(id)); }

    _savePrefs() { localAdapter.save(PREFS_KEY, this.prefs); }

    _pushUndo() {
      const sh = this.sheet;
      sh.undo.push(sh.items.slice());
      if (sh.undo.length > HISTORY) sh.undo.shift();
      sh.redo.length = 0;
    }

    _change(fn, appended) {
      this._pushUndo();
      fn(this.sheet);
      if (appended && !this.dirty) { this._applyView(this.cctx); this._drawItem(this.cctx, appended); }
      else this.dirty = true;
      this._afterChange();
    }

    _afterChange() {
      if (this.selection.length) {
        const all = new Set(this.sheet.items);
        this.selection = this.selection.filter(it => all.has(it));
      }
      this._requestDraw();
      this._scheduleSave();
      this._syncHistory();
    }

    /* ---------- интерфейс ---------- */

    _build() {
      const r = this.root;
      r.classList.add('twb-root');
      if (getComputedStyle(r).position === 'static') r.style.position = 'relative';

      this.canvas = el('canvas', 'twb-canvas');
      this.canvas.tabIndex = -1;
      this.canvas.dataset.mode = this.prefs.tool;
      this.canvas.setAttribute('aria-label', 'Лист для решения');
      this.ctx = this.canvas.getContext('2d');
      this.cache = el('canvas');
      this.cctx = this.cache.getContext('2d');
      this.mctx = el('canvas').getContext('2d');

      this.eraserEl = el('div', 'twb-eraser'); this.eraserEl.hidden = true;
      this.pop = el('div', 'twb-pop'); this.pop.hidden = true; this.pop.setAttribute('role', 'menu');
      this.toastEl = el('div', 'twb-toast'); this.toastEl.hidden = true; this.toastEl.setAttribute('role', 'status');
      this.selMenu = el('div', 'twb-selmenu'); this.selMenu.hidden = true;
      this.selMenu.innerHTML =
        `<button type="button" data-sel="copy" title="Копия (Ctrl+D)">${ICON.copy}Копия</button>` +
        `<button type="button" data-sel="delete" class="twb-del" title="Удалить (Delete)">${ICON.trash}Удалить</button>`;
      this.symEl = el('div', 'twb-symbols'); this.symEl.hidden = true;
      this.symEl.setAttribute('aria-label', 'Математические символы');
      this.symEl.innerHTML = SYMBOLS.map(s => `<button type="button" data-sym="${s}" aria-label="Вставить ${s}">${s}</button>`).join('');

      this.bar = el('div', 'twb-bar');
      this.bar.setAttribute('role', 'toolbar');
      this.bar.setAttribute('aria-label', 'Инструменты черновика');
      const tb = (tool, label, key, menu) =>
        `<button type="button" class="twb-btn${menu ? ' twb-has-menu' : ''}" data-tool="${tool}" title="${label} (${key})" aria-label="${label}">${ICON[tool === 'shape' ? this.prefs.shape : tool]}</button>`;
      this.bar.innerHTML =
        `<div class="twb-group">
          ${tb('hand', 'Двигать лист', 'H')}
          ${tb('select', 'Выделить', 'V')}
          ${tb('pen', 'Ручка', 'P')}
          ${tb('hl', 'Маркер', 'M')}
          ${tb('eraser', 'Ластик', 'E', true)}
          ${tb('shape', 'Фигуры', 'S', true)}
          ${tb('text', 'Текст', 'T')}
        </div>
        <span class="twb-sep"></span>
        <div class="twb-group" data-role="swatches"></div>
        <div class="twb-group">
          ${[0, 1, 2].map(i => `<button type="button" class="twb-btn twb-size" data-size="${i}" title="${SIZE_NAMES[i]}" aria-label="Толщина: ${SIZE_NAMES[i]}"><i style="--d:${[5, 9, 14][i]}px"></i></button>`).join('')}
          <button type="button" class="twb-btn twb-dash" data-act="dash" title="Пунктир для фигур" aria-label="Пунктир для фигур">${ICON.dash}</button>
        </div>
        <span class="twb-sep"></span>
        <div class="twb-group">
          <button type="button" class="twb-btn" data-act="undo" title="Отменить (Ctrl+Z, касание двумя пальцами)" aria-label="Отменить">${ICON.undo}</button>
          <button type="button" class="twb-btn" data-act="redo" title="Повторить (Ctrl+Shift+Z, касание тремя пальцами)" aria-label="Повторить">${ICON.redo}</button>
          <button type="button" class="twb-btn twb-chip" data-act="zoom" title="Масштаб" aria-label="Масштаб" aria-haspopup="menu"></button>
          <button type="button" class="twb-btn" data-act="more" title="Фон листа и настройки" aria-label="Фон листа и настройки" aria-haspopup="menu">${ICON.more}</button>
          <button type="button" class="twb-btn twb-danger" data-act="clear" title="Очистить лист" aria-label="Очистить лист">${ICON.trash}</button>
        </div>`;
      this.swatches = this.bar.querySelector('[data-role="swatches"]');

      r.prepend(this.canvas);
      r.append(this.eraserEl, this.selMenu, this.symEl, this.bar, this.pop, this.toastEl);
      this._syncBar();
    }

    _syncBar() {
      const p = this.prefs, hl = p.tool === 'hl';
      this.bar.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === p.tool)));
      const sb = this.bar.querySelector('[data-tool="shape"]');
      const sn = SHAPES.find(s => s[0] === p.shape);
      sb.innerHTML = ICON[p.shape];
      sb.title = 'Фигуры: ' + sn[1] + ' (S)';
      const eb = this.bar.querySelector('[data-tool="eraser"]');
      eb.innerHTML = p.erase === 'partial' ? ICON.partial : ICON.eraser;
      eb.title = (p.erase === 'partial' ? 'Ластик: стирает часть линии' : 'Ластик: стирает линию целиком') + ' (E). Нажмите ещё раз, чтобы сменить режим';

      const pal = hl ? MARK : INK, sel = hl ? p.hl : p.ink;
      if (this._pal !== pal) {
        this._pal = pal;
        this.swatches.innerHTML = pal.map((c, i) =>
          `<button type="button" class="twb-swatch" data-color="${i}" style="--c:${c.v}" title="${c.n}" aria-label="Цвет: ${c.n}"></button>`).join('');
      }
      this.swatches.querySelectorAll('[data-color]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.color === sel)));
      const col = hl ? MARK[p.hl].v : INK[p.ink].v;
      this.bar.querySelectorAll('[data-size]').forEach(b => {
        b.setAttribute('aria-pressed', String(+b.dataset.size === p.size));
        b.style.setProperty('--c', col);
      });
      this.bar.querySelector('[data-act="dash"]').setAttribute('aria-pressed', String(p.dash));
      this._syncHistory();
      this._syncView();
    }

    _syncHistory() {
      if (!this.bar) return;
      this.bar.querySelector('[data-act="undo"]').disabled = !this.sheet.undo.length;
      this.bar.querySelector('[data-act="redo"]').disabled = !this.sheet.redo.length;
    }

    _syncView() {
      if (!this.bar) return;
      this.bar.querySelector('[data-act="zoom"]').textContent = Math.round(this.view.s * 100) + '%';
    }

    _onBarClick(e) {
      const b = e.target.closest('button');
      if (!b || !this.bar.contains(b)) return;
      const p = this.prefs;
      if (b.dataset.tool) {
        const t = b.dataset.tool, again = p.tool === t;
        const wasOpen = !this.pop.hidden && this.popFor === t;
        this.setTool(t);
        this._closePop();
        if (wasOpen) return;
        if (t === 'shape') this._openMenu(b, t, this._shapeMenu());
        else if (t === 'eraser' && again) this._openMenu(b, t, this._eraserMenu());
        return;
      }
      if (b.dataset.act === 'zoom' || b.dataset.act === 'more') {
        const wasOpen = !this.pop.hidden && this.popFor === b.dataset.act;
        this._closePop();
        if (!wasOpen) this._openMenu(b, b.dataset.act, b.dataset.act === 'zoom' ? this._zoomMenu() : this._moreMenu());
        return;
      }
      this._closePop();
      if (b.dataset.color != null) {
        const i = +b.dataset.color;
        if (p.tool === 'hl') p.hl = i;
        else {
          p.ink = i;
          if (p.tool === 'select' && this.selection.length) this._recolor(INK[i].v);
          else if (p.tool === 'hand' || p.tool === 'eraser' || p.tool === 'select') this.setTool('pen');
        }
        if (this.editing) { this.editing.draft.c = INK[p.ink].v; this._placeTextarea(); }
        this._savePrefs(); this._syncBar();
        return;
      }
      if (b.dataset.size != null) {
        p.size = +b.dataset.size;
        if (this.editing) { this.editing.draft.size = SIZES.text[p.size]; this._placeTextarea(); }
        this._savePrefs(); this._syncBar();
        return;
      }
      switch (b.dataset.act) {
        case 'undo': this.undo(); break;
        case 'redo': this.redo(); break;
        case 'dash':
          p.dash = !p.dash;
          if (p.tool !== 'shape') this.setTool('shape');
          this._savePrefs(); this._syncBar();
          this._toast(p.dash ? 'Фигуры рисуются пунктиром.' : 'Фигуры рисуются сплошной линией.');
          break;
        case 'clear':
          if (!this.sheet.items.length) { this._toast('Лист уже чистый.'); break; }
          if (!b.classList.contains('twb-confirm')) {
            b.classList.add('twb-confirm');
            b.textContent = 'Очистить?';
            clearTimeout(this.clearTimer);
            this.clearTimer = setTimeout(() => this._resetClearBtn(), 3000);
          } else {
            this._resetClearBtn();
            this.clearSheet();
            this._toast('Лист очищен.', 'Вернуть', () => this.undo());
          }
          break;
      }
    }

    _resetClearBtn() {
      clearTimeout(this.clearTimer);
      const b = this.bar.querySelector('[data-act="clear"]');
      b.classList.remove('twb-confirm');
      b.innerHTML = ICON.trash;
    }

    _item(attr, val, icon, label, checked, extra) {
      return `<button type="button" role="menuitemradio" class="twb-pop-item" data-${attr}="${val}" aria-checked="${!!checked}">${icon || ''}<span>${label}</span>${extra || ''}</button>`;
    }

    _shapeMenu() {
      return SHAPES.map(([id, name, key]) =>
        this._item('shape', id, ICON[id], esc(name), id === this.prefs.shape, key ? '<kbd>' + key + '</kbd>' : '')).join('') +
        '<div class="twb-pop-sep"></div>' +
        '<div class="twb-pop-note">Или нарисуйте фигуру ручкой и задержите стилус или палец на месте — она станет ровной.</div>';
    }

    _eraserMenu() {
      const m = this.prefs.erase;
      return this._item('erase', 'object', ICON.eraser, 'Целиком<small>стирает всю линию или фигуру</small>', m === 'object') +
        this._item('erase', 'partial', ICON.partial, 'Частично<small>стирает только там, где провели</small>', m === 'partial');
    }

    _zoomMenu() {
      return this._item('zoom', 'in', ICON.zoomIn, 'Приблизить', false, '<kbd>+</kbd>') +
        this._item('zoom', 'out', ICON.zoomOut, 'Отдалить', false, '<kbd>−</kbd>') +
        this._item('zoom', 'fit', ICON.fit, 'Показать все записи', false, '<kbd>⇧1</kbd>') +
        this._item('zoom', 'reset', ICON.home, 'Масштаб 100%, к началу листа', false, '<kbd>⇧0</kbd>');
    }

    _moreMenu() {
      const p = this.prefs;
      let html = '<div class="twb-pop-label">Фон листа</div>' +
        PAPERS.map(([id, name]) => this._item('paper', id, ICON[id], name, p.paper === id)).join('');
      if ((navigator.maxTouchPoints || 0) > 0 || this.sawPen) {
        html += '<div class="twb-pop-sep"></div><div class="twb-pop-label">Касание пальцем</div>' +
          this._item('finger', 'draw', ICON.fingerDraw, 'Рисует<small>удобно без стилуса</small>', p.finger === 'draw') +
          this._item('finger', 'pan', ICON.fingerPan, 'Двигает лист<small>рисует только стилус, ладонь не мешает</small>', p.finger === 'pan');
      }
      return html;
    }

    _openMenu(btn, owner, html) {
      this.pop.innerHTML = html;
      this.pop.hidden = false;
      this.popFor = owner;
      const rr = this.root.getBoundingClientRect(), br = btn.getBoundingClientRect(), pr = this.pop.getBoundingClientRect();
      const left = clamp(br.left - rr.left + br.width / 2 - pr.width / 2, 8, Math.max(8, rr.width - pr.width - 8));
      this.pop.style.left = left + 'px';
      this.pop.style.top = Math.max(8, br.top - rr.top - pr.height - 10) + 'px';
      if (btn.matches(':focus-visible')) {
        const cur = this.pop.querySelector('[aria-checked="true"]') || this.pop.querySelector('button');
        if (cur) cur.focus();
      }
    }

    _onPopClick(e) {
      const b = e.target.closest('button');
      if (!b) return;
      const d = b.dataset, p = this.prefs;
      if (d.shape) this.setTool(d.shape);
      else if (d.erase) { p.erase = d.erase; this.setTool('eraser'); }
      else if (d.zoom) {
        if (d.zoom === 'in') this.zoomBy(1.25);
        else if (d.zoom === 'out') this.zoomBy(0.8);
        else if (d.zoom === 'fit') this.fitView();
        else this.resetView();
        return; // меню масштаба остаётся открытым, чтобы нажимать несколько раз
      } else if (d.paper) {
        p.paper = d.paper;
        this.dirty = true; this._requestDraw();
      } else if (d.finger) {
        p.finger = d.finger;
        p.fingerChosen = true;
      } else return;
      this._savePrefs();
      this._syncBar();
      this._closePop();
    }

    _closePop() { if (this.pop) { this.pop.hidden = true; this.popFor = null; } }

    _toast(msg, label, fn) {
      clearTimeout(this.toastTimer);
      this.toastEl.textContent = '';
      const s = el('span'); s.textContent = msg;
      this.toastEl.appendChild(s);
      if (label) {
        const b = el('button'); b.type = 'button'; b.textContent = label;
        b.addEventListener('click', () => { this.toastEl.hidden = true; fn(); });
        this.toastEl.appendChild(b);
      }
      this.toastEl.hidden = false;
      this.toastTimer = setTimeout(() => { this.toastEl.hidden = true; }, label ? 6000 : 3000);
    }

    /* ---------- выделение ---------- */

    _union(items) {
      if (!items.length) return null;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const it of items) {
        const b = this._bboxOf(it);
        x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]);
      }
      return [x0, y0, x1, y1];
    }

    /** Рамка выделения на экране (с учётом перетаскивания) */
    _selRect() {
      const b = this._union(this.selection);
      if (!b) return null;
      const g = this.gesture, m = g && g.m ? g.m : { s: 1, tx: 0, ty: 0 }, v = this.view;
      const X = x => (x * m.s + m.tx) * v.s + v.x, Y = y => (y * m.s + m.ty) * v.s + v.y;
      return { x0: X(b[0]) - 6, y0: Y(b[1]) - 6, x1: X(b[2]) + 6, y1: Y(b[3]) + 6 };
    }

    _selHit(p) {
      const r = this._selRect();
      if (!r) return null;
      if (Math.hypot(p.x - r.x1, p.y - r.y1) < 20) return 'handle';
      if (p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1) return 'inside';
      return null;
    }

    _samples(it) {
      if (it.pts) {
        const n = it.pts.length / 3, step = Math.max(1, Math.floor(n / 40)), out = [];
        for (let i = 0; i < n; i += step) out.push(it.pts[i * 3], it.pts[i * 3 + 1]);
        return out;
      }
      if (it.t === 'text') {
        const b = this._bboxOf(it);
        return [b[0], b[1], b[2], b[1], b[0], b[3], b[2], b[3], (b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
      }
      const out = [];
      this._outline(it).forEach(poly => {
        for (let i = 0; i < poly.length - 2; i += 2) out.push(poly[i], poly[i + 1], (poly[i] + poly[i + 2]) / 2, (poly[i + 1] + poly[i + 3]) / 2);
        out.push(poly[poly.length - 2], poly[poly.length - 1]);
      });
      return out;
    }

    _topHit(w, rScreen) {
      const items = this.sheet.items, r = rScreen / this.view.s;
      for (let i = items.length - 1; i >= 0; i--) if (this._hit(items[i], w.x, w.y, r)) return items[i];
      return null;
    }

    _applySel(fn) {
      if (!this.selection.length) return;
      const set = new Set(this.selection);
      this._change(sh => {
        const next = [];
        sh.items = sh.items.map(it => { if (!set.has(it)) return it; const n = fn(it); next.push(n); return n; });
        this.selection = next;
      });
    }

    _recolor(c) { this._applySel(it => it.t === 'hl' ? it : Object.assign({}, it, { c })); }

    _paste() {
      if (!this.clip || !this.clip.items.length) return;
      const off = this.clip.sheet === this.sheet.id ? 20 : 0;
      const copies = this.clip.items.map(it => transformItem(it, { s: 1, tx: off, ty: off }));
      if (this.prefs.tool !== 'select') this.setTool('select');
      this._change(sh => { sh.items.push(...copies); this.selection = copies; });
      this.clip = { sheet: this.sheet.id, items: copies };
    }

    _onSelMenu(e) {
      const b = e.target.closest('[data-sel]');
      if (!b) return;
      if (b.dataset.sel === 'copy') this.duplicateSelection();
      else this.deleteSelection();
    }

    /* ---------- события ---------- */

    _bind() {
      const c = this.canvas;
      c.addEventListener('pointerdown', e => this._down(e));
      c.addEventListener('pointermove', e => this._move(e));
      c.addEventListener('pointerup', e => this._up(e, false));
      c.addEventListener('pointercancel', e => this._up(e, true));
      c.addEventListener('pointerleave', e => { if (!this.pointers.has(e.pointerId)) this.eraserEl.hidden = true; });
      c.addEventListener('wheel', e => this._wheel(e), { passive: false });
      c.addEventListener('contextmenu', e => e.preventDefault());
      // жесты Safari (щипок трекпадом) не должны масштабировать страницу
      c.addEventListener('gesturestart', e => e.preventDefault());
      this.bar.addEventListener('click', e => this._onBarClick(e));
      // во время ввода текста кнопки не забирают фокус, поэтому цвет/размер применяются к тексту
      const keepFocus = e => { if (this.editing) e.preventDefault(); };
      this.bar.addEventListener('pointerdown', keepFocus);
      this.bar.addEventListener('mousedown', keepFocus);
      this.symEl.addEventListener('pointerdown', e => e.preventDefault());
      this.symEl.addEventListener('mousedown', e => e.preventDefault());
      this.symEl.addEventListener('click', e => {
        const b = e.target.closest('[data-sym]');
        if (!b || !this.editing) return;
        const ta = this.editing.ta;
        ta.setRangeText(b.dataset.sym, ta.selectionStart, ta.selectionEnd, 'end');
        this._placeTextarea();
      });
      this.pop.addEventListener('click', e => this._onPopClick(e));
      this.selMenu.addEventListener('click', e => this._onSelMenu(e));
      this._onDocDown = e => {
        if (this.pop.hidden || this.pop.contains(e.target)) return;
        const t = e.target.closest && e.target.closest('[data-tool="shape"],[data-tool="eraser"],[data-act="zoom"],[data-act="more"]');
        if (t && this.bar.contains(t)) return;
        this._closePop();
        // касание листа, закрывшее меню, не должно рисовать точку
        if (e.target === this.canvas) this._swallow = e.pointerId;
      };
      document.addEventListener('pointerdown', this._onDocDown, true);
      this._onKeyDown = e => this._onKey(e, true);
      this._onKeyUp = e => this._onKey(e, false);
      window.addEventListener('keydown', this._onKeyDown);
      window.addEventListener('keyup', this._onKeyUp);
      this._onBlur = () => { this.space = false; this.canvas.classList.remove('twb-space'); };
      window.addEventListener('blur', this._onBlur);
      this._onHide = () => this._flush();
      this._onVis = () => { if (document.visibilityState === 'hidden') this._flush(); };
      window.addEventListener('pagehide', this._onHide);
      document.addEventListener('visibilitychange', this._onVis);
      this._onResize = () => this._resize();
      window.addEventListener('resize', this._onResize); // смена devicePixelRatio (другой монитор, масштаб браузера)
      if (typeof ResizeObserver === 'function') {
        this.ro = new ResizeObserver(this._onResize);
        this.ro.observe(this.root);
      }
      this._onFonts = () => { if (this.destroyed) return; this.bbox = new WeakMap(); this.dirty = true; this._requestDraw(); };
      if (document.fonts && document.fonts.addEventListener) {
        document.fonts.addEventListener('loadingdone', this._onFonts);
        if (document.fonts.ready) document.fonts.ready.then(this._onFonts);
      }
      this._resize();
    }

    _pos(e) { return { x: e.clientX - this.rect.left, y: e.clientY - this.rect.top }; }
    _toWorld(p) { const v = this.view; return { x: (p.x - v.x) / v.s, y: (p.y - v.y) / v.s }; }

    _down(e) {
      e.preventDefault();
      if (this._swallow === e.pointerId) { this._swallow = null; return; }
      this._closePop();
      if (this.editing) { this._commitText(); return; }
      // большое пятно касания при подключённом стилусе — это ладонь
      if (e.pointerType === 'touch' && this.sawPen && (e.width > 44 || e.height > 44)) return;
      try { this.canvas.focus({ preventScroll: true }); } catch (_) { /* старые браузеры */ }
      this.rect = this.canvas.getBoundingClientRect();
      const p = this._pos(e);
      if (e.pointerType === 'pen' && !this.sawPen) this._penDetected();
      this.pointers.set(e.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y, type: e.pointerType });
      try { this.canvas.setPointerCapture(e.pointerId); } catch (_) { /* указатель уже отпущен */ }

      const g0 = this.gesture;
      if (e.pointerType === 'touch') {
        this._trackTaps(true);
        if (g0 && g0.ptype !== 'touch') return; // рисует стилус — касания ладони игнорируем
        if (this._touches().length >= 2) {
          if (!g0 || g0.type !== 'pinch') { this._cancelGesture(); this._startPinch(); }
          return;
        }
      } else if (e.pointerType === 'pen' && g0 && g0.ptype === 'touch') {
        this._cancelGesture(); // стилус важнее пальца
      }
      if (this.gesture) return;

      const tool = this.prefs.tool;
      const g = { id: e.pointerId, ptype: e.pointerType };
      // обратный конец стилуса (Surface Pen и др.) — ластик
      const penEraser = e.pointerType === 'pen' && (e.button === 5 || (e.buttons & 32) !== 0);
      const pan = !penEraser && (tool === 'hand' || e.button === 1 || (e.button === 2 && e.pointerType === 'mouse') || this.space ||
        (e.pointerType === 'touch' && this.prefs.finger === 'pan'));
      if (pan) {
        Object.assign(g, { type: 'pan', sx: p.x, sy: p.y, vx: this.view.x, vy: this.view.y });
        this.gesture = g;
        this.canvas.classList.add('twb-grabbing');
        return;
      }
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const w = this._toWorld(p), pr = this.prefs;

      if (penEraser || tool === 'eraser') {
        Object.assign(g, { type: 'erase', last: w, pushed: false });
        this._showEraser(p);
        this._eraseAt(w, g);
      } else if (tool === 'pen' || tool === 'hl') {
        const hl = tool === 'hl', usesPressure = !hl && e.pointerType === 'pen';
        const pp = usesPressure ? pres(e) : 0.5;
        this.active = {
          t: tool,
          c: hl ? MARK[pr.hl].v : INK[pr.ink].v,
          w: SIZES[hl ? 'hl' : 'ink'][pr.size],
          pts: [r1(w.x), r1(w.y), r2(pp)]
        };
        if (usesPressure) this.active.pr = 1;
        Object.assign(g, { type: 'draw', last: p, pp, anchor: p });
      } else if (tool === 'shape') {
        this.active = { t: pr.shape, c: INK[pr.ink].v, w: SIZES.ink[pr.size], a: [r1(w.x), r1(w.y)], b: [r1(w.x), r1(w.y)] };
        if (pr.dash && DASHABLE.has(pr.shape)) this.active.d = 1;
        g.type = 'shape';
      } else if (tool === 'text') {
        Object.assign(g, { type: 'text', sx: p.x, sy: p.y });
      } else if (tool === 'select') {
        const hs = this._selHit(p);
        if (hs) {
          const b = this._union(this.selection);
          Object.assign(g, { type: hs === 'handle' ? 'scale' : 'move', sw: w, sp: p, moved: false, m: { s: 1, tx: 0, ty: 0 }, A: [b[0], b[1]], H: [b[2], b[3]] });
          this.selHidden = true;
          this.dirty = true;
        } else {
          Object.assign(g, { type: 'lasso', pts: [p.x, p.y], sp: p });
        }
      }
      this.gesture = g;
      this._requestDraw();
    }

    _move(e) {
      if (!this.pointers.size) this.rect = this.canvas.getBoundingClientRect();
      else if (!this.rect) return;
      const p = this._pos(e);
      const q = this.pointers.get(e.pointerId);
      if (q) {
        q.x = p.x; q.y = p.y;
        if (q.type === 'touch' && this.multi && Math.hypot(p.x - q.sx, p.y - q.sy) > 10) this.multi.moved = true;
      }
      const g = this.gesture;
      if ((this.prefs.tool === 'eraser' || (g && g.type === 'erase' && g.id === e.pointerId)) && (q || e.pointerType !== 'touch')) this._showEraser(p);
      if (!g) {
        if (this.prefs.tool === 'select' && e.pointerType !== 'touch') {
          const hs = this._selHit(p);
          this.canvas.style.cursor = hs === 'handle' ? 'nwse-resize' : hs === 'inside' ? 'move' : '';
        }
        return;
      }
      if (g.type === 'pinch') { if (g.ids.includes(e.pointerId)) this._pinchMove(); return; }
      if (g.id !== e.pointerId) return;

      switch (g.type) {
        case 'pan':
          this._setView(g.vx + p.x - g.sx, g.vy + p.y - g.sy, this.view.s);
          break;
        case 'draw': {
          if (g.snapped) {
            // после распознавания линию можно дотянуть, не отпуская
            const w = this._toWorld(p), it = this.active;
            if (it.t === 'line') { const b = snapShape('line', it.a, [w.x, w.y], e.shiftKey); it.b = [r1(b[0]), r1(b[1])]; }
            else if (it.t === 'hl') { it.pts[3] = r1(w.x); it.pts[4] = r1(w.y); this.bbox.delete(it); }
            this._requestDraw();
            break;
          }
          const list = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
          (list && list.length ? list : [e]).forEach(ev => this._addPoint(g, this._pos(ev), ev));
          if (Math.hypot(p.x - g.anchor.x, p.y - g.anchor.y) > 4) {
            g.anchor = p;
            clearTimeout(g.hold);
            g.hold = setTimeout(() => this._snap(g), HOLD_MS);
          }
          this._requestDraw();
          break;
        }
        case 'shape': {
          const w = this._toWorld(p), it = this.active;
          const b = snapShape(it.t, it.a, [w.x, w.y], e.shiftKey);
          it.b = [r1(b[0]), r1(b[1])];
          this._requestDraw();
          break;
        }
        case 'erase': {
          const w = this._toWorld(p);
          const step = Math.max(1, SIZES.eraser[this.prefs.size] / this.view.s / 2);
          const n = Math.ceil(Math.hypot(w.x - g.last.x, w.y - g.last.y) / step);
          for (let i = 1; i <= n; i++) {
            this._eraseAt({ x: g.last.x + (w.x - g.last.x) * i / n, y: g.last.y + (w.y - g.last.y) * i / n }, g);
          }
          g.last = w;
          break;
        }
        case 'move': {
          const w = this._toWorld(p);
          if (Math.hypot(p.x - g.sp.x, p.y - g.sp.y) > 3) g.moved = true;
          g.m = { s: 1, tx: w.x - g.sw.x, ty: w.y - g.sw.y };
          this._requestDraw();
          break;
        }
        case 'scale': {
          const w = this._toWorld(p), vx = g.H[0] - g.A[0], vy = g.H[1] - g.A[1];
          const f = clamp(((w.x - g.A[0]) * vx + (w.y - g.A[1]) * vy) / (vx * vx + vy * vy || 1), 0.1, 10);
          if (Math.hypot(p.x - g.sp.x, p.y - g.sp.y) > 3) g.moved = true;
          g.m = { s: f, tx: g.A[0] * (1 - f), ty: g.A[1] * (1 - f) };
          this._requestDraw();
          break;
        }
        case 'lasso':
          g.pts.push(p.x, p.y);
          this._requestDraw();
          break;
      }
    }

    _up(e, cancelled) {
      const had = this.pointers.delete(e.pointerId);
      if (had && e.pointerType === 'touch') this._trackTaps(false, cancelled);
      const g = this.gesture;
      if (e.pointerType === 'touch' && this.prefs.tool === 'eraser') this.eraserEl.hidden = true;
      if (!g) return;
      if (g.type === 'pinch') { if (g.ids.includes(e.pointerId)) this.gesture = null; return; }
      if (g.id !== e.pointerId) return;
      this.gesture = null;
      clearTimeout(g.hold);
      this.canvas.classList.remove('twb-grabbing');

      switch (g.type) {
        case 'draw': {
          const it = this.active;
          this.active = null;
          if (it && !cancelled) this._change(sh => sh.items.push(it), it);
          else this._requestDraw();
          break;
        }
        case 'shape': {
          const it = this.active;
          this.active = null;
          const len = Math.hypot(it.b[0] - it.a[0], it.b[1] - it.a[1]) * this.view.s;
          if (!cancelled && len >= 4) this._change(sh => sh.items.push(it), it);
          else this._requestDraw();
          break;
        }
        case 'text': {
          if (cancelled) break;
          const p = this._pos(e);
          if (Math.hypot(p.x - g.sx, p.y - g.sy) > 12) break;
          const w = this._toWorld(p);
          this._startText(this._hitText(w), w);
          break;
        }
        case 'erase':
          if (this.prefs.tool !== 'eraser') this.eraserEl.hidden = true;
          break;
        case 'pan':
          this._scheduleSave();
          break;
        case 'move':
        case 'scale': {
          this.selHidden = false;
          const m = g.m;
          if (!cancelled && g.moved && (m.s !== 1 || m.tx || m.ty)) {
            this._applySel(it => transformItem(it, m));
          } else {
            this.dirty = true;
            this._requestDraw();
            // повторное касание выделенного текста — редактирование
            if (!cancelled && !g.moved && g.type === 'move' && this.selection.length === 1 && this.selection[0].t === 'text') {
              const it = this.selection[0], w = this._toWorld(this._pos(e)), b = this._bboxOf(it);
              if (w.x >= b[0] - 4 && w.x <= b[2] + 4 && w.y >= b[1] - 4 && w.y <= b[3] + 4) { this.selection = []; this._startText(it, w); }
            }
          }
          break;
        }
        case 'lasso': {
          if (cancelled) { this._requestDraw(); break; }
          const p = this._pos(e);
          const tap = Math.hypot(p.x - g.sp.x, p.y - g.sp.y) < 8 && this._pathLen(g.pts) < 16;
          if (tap) {
            const hit = this._topHit(this._toWorld(p), 10);
            this.selection = hit ? [hit] : [];
          } else {
            const v = this.view, poly = g.pts.map((val, i) => i % 2 ? (val - v.y) / v.s : (val - v.x) / v.s);
            this.selection = this.sheet.items.filter(it => {
              const s = this._samples(it);
              if (!s.length) return false;
              let inside = 0;
              for (let i = 0; i < s.length; i += 2) if (pointInPoly(s[i], s[i + 1], poly)) inside++;
              return inside / (s.length / 2) >= 0.6;
            });
          }
          this._requestDraw();
          break;
        }
      }
    }

    _pathLen(pts) {
      let L = 0;
      for (let i = 2; i < pts.length; i += 2) L += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
      return L;
    }

    /** Касание двумя пальцами — отменить, тремя — повторить */
    _trackTaps(down, cancelled) {
      const n = this._touches().length;
      if (down) {
        if (n === 1 || !this.multi) this.multi = { t: performance.now(), max: n, moved: false, v0: Object.assign({}, this.view) };
        else this.multi.max = Math.max(this.multi.max, n);
        return;
      }
      if (n > 0 || !this.multi) return;
      const m = this.multi;
      this.multi = null;
      if (cancelled || m.moved || m.max < 2 || performance.now() - m.t > 320) return;
      const v = this.view;
      if (v.x !== m.v0.x || v.y !== m.v0.y || v.s !== m.v0.s) this._setView(m.v0.x, m.v0.y, m.v0.s);
      if (m.max === 2) this.undo(); else this.redo();
    }

    _touches() { return [...this.pointers.entries()].filter(([, q]) => q.type === 'touch'); }

    _startPinch() {
      const t = this._touches().slice(0, 2), a = t[0][1], b = t[1][1];
      this.gesture = {
        type: 'pinch', ptype: 'touch', ids: [t[0][0], t[1][0]],
        d0: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)),
        m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        v0: Object.assign({}, this.view)
      };
    }

    _pinchMove() {
      const g = this.gesture, a = this.pointers.get(g.ids[0]), b = this.pointers.get(g.ids[1]);
      if (!a || !b) return;
      const s = clamp(g.v0.s * Math.hypot(a.x - b.x, a.y - b.y) / g.d0, MIN_S, MAX_S);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const wx = (g.m0.x - g.v0.x) / g.v0.s, wy = (g.m0.y - g.v0.y) / g.v0.s;
      this._setView(mx - wx * s, my - wy * s, s);
    }

    _cancelGesture() {
      const g = this.gesture;
      this.gesture = null;
      if (this.canvas) this.canvas.classList.remove('twb-grabbing');
      if (!g) return;
      clearTimeout(g.hold);
      if (g.type === 'draw' || g.type === 'shape') this.active = null;
      if (g.type === 'move' || g.type === 'scale') { this.selHidden = false; this.dirty = true; }
      this._requestDraw();
    }

    _addPoint(g, p, ev) {
      if (Math.hypot(p.x - g.last.x, p.y - g.last.y) < 1.2) return;
      g.last = p;
      const w = this._toWorld(p), it = this.active;
      if (it.pr) g.pp = g.pp * 0.6 + pres(ev) * 0.4;
      it.pts.push(r1(w.x), r1(w.y), r2(g.pp));
    }

    /** «Нарисуй и задержи»: штрих превращается в ровную фигуру */
    _snap(g) {
      if (this.gesture !== g || g.type !== 'draw' || g.snapped || !this.active) return;
      const shape = recognize(this.active);
      if (!shape) return;
      this.active = shape;
      g.snapped = true;
      try { if (navigator.vibrate) navigator.vibrate(8); } catch (_) { /* нет вибрации */ }
      this._requestDraw();
    }

    _wheel(e) {
      e.preventDefault();
      if (this.editing) this._commitText();
      const rect = this.canvas.getBoundingClientRect();
      const p = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      let dx = e.deltaX, dy = e.deltaY;
      if (e.deltaMode === 1) { dx *= 16; dy *= 16; } else if (e.deltaMode === 2) { dx *= rect.width; dy *= rect.height; }
      const v = this.view;
      if (e.ctrlKey || e.metaKey) {
        const s = clamp(v.s * Math.exp(-clamp(dy, -50, 50) * 0.01), MIN_S, MAX_S);
        const wx = (p.x - v.x) / v.s, wy = (p.y - v.y) / v.s;
        this._setView(p.x - wx * s, p.y - wy * s, s);
      } else {
        if (e.shiftKey && !dx) { dx = dy; dy = 0; }
        this._setView(v.x - dx, v.y - dy, v.s);
      }
    }

    _setView(x, y, s) {
      this.sheet.view = { x: r1(x), y: r1(y), s: Math.round(s * 1000) / 1000 };
      this.dirty = true;
      this._requestDraw();
      this._syncView();
      this._scheduleSave();
    }

    _onKey(e, down) {
      if (!this.shortcuts || this.destroyed) return;
      const ae = document.activeElement;
      if (isTyping(e.target) || isTyping(ae)) return;
      if (ae && ae !== document.body && ae !== this.canvas && ae !== document.documentElement) {
        // фокус на кнопке самого черновика — горячие клавиши работают; на элементах сайта (ответы и т.п.) — нет
        const own = this.bar.contains(ae) || this.pop.contains(ae) || this.selMenu.contains(ae);
        if (!own || e.code === 'Space' || e.key === 'Enter') return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        this.space = down;
        this.canvas.classList.toggle('twb-space', down);
        return;
      }
      if (!down) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); return; }
      if (mod && e.code === 'KeyY') { e.preventDefault(); this.redo(); return; }
      if (mod && e.code === 'KeyA') {
        e.preventDefault();
        this.setTool('select');
        this.selection = this.sheet.items.slice();
        this._requestDraw();
        return;
      }
      if (mod && (e.code === 'KeyC' || e.code === 'KeyX') && this.selection.length) {
        e.preventDefault();
        this.clip = { sheet: this.sheet.id, items: this.selection.slice() };
        if (e.code === 'KeyX') this.deleteSelection();
        return;
      }
      if (mod && e.code === 'KeyV' && this.clip) { e.preventDefault(); this._paste(); return; }
      if (mod && e.code === 'KeyD' && this.selection.length) { e.preventDefault(); this.duplicateSelection(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && this.selection.length) { e.preventDefault(); this.deleteSelection(); return; }
      if (e.key === 'Escape') {
        this._closePop();
        if (this.selection.length) { this.selection = []; this._requestDraw(); }
        return;
      }
      if (mod || e.altKey || e.repeat) return;
      if (e.shiftKey && e.code === 'Digit1') { e.preventDefault(); this.fitView(); return; }
      if (e.shiftKey && e.code === 'Digit0') { e.preventDefault(); this.resetView(); return; }
      if (e.key === '+' || e.key === '=') { e.preventDefault(); this.zoomBy(1.25); return; }
      if (e.key === '-' || e.key === '_') { e.preventDefault(); this.zoomBy(0.8); return; }
      if (e.shiftKey) return;
      const map = { KeyP: 'pen', KeyM: 'hl', KeyE: 'eraser', KeyH: 'hand', KeyV: 'select', KeyT: 'text', KeyS: 'shape', KeyL: 'line', KeyA: 'arrow', KeyR: 'rect', KeyO: 'ellipse' };
      if (map[e.code]) { e.preventDefault(); this.setTool(map[e.code]); }
    }

    _penDetected() {
      this.sawPen = true;
      if (this.prefs.finger === 'draw' && !this.prefs.fingerChosen) {
        this.prefs.finger = 'pan';
        this._savePrefs();
        this._toast('Стилус подключён: рисует стилус, а пальцем двигается лист.', 'Рисовать пальцем', () => {
          this.prefs.finger = 'draw';
          this.prefs.fingerChosen = true;
          this._savePrefs();
        });
      }
    }

    /* ---------- ластик ---------- */

    _showEraser(p) {
      const d = SIZES.eraser[this.prefs.size] * 2;
      Object.assign(this.eraserEl.style, { left: p.x + 'px', top: p.y + 'px', width: d + 'px', height: d + 'px' });
      this.eraserEl.hidden = false;
    }

    _eraseAt(w, g) {
      const sh = this.sheet, r = SIZES.eraser[this.prefs.size] / this.view.s, partial = this.prefs.erase === 'partial';
      let changed = false;
      const out = [];
      for (const it of sh.items) {
        if (!this._hit(it, w.x, w.y, r)) { out.push(it); continue; }
        changed = true;
        if (partial && it.pts) out.push(...splitStroke(it, w.x, w.y, r));
      }
      if (!changed) return;
      if (!g.pushed) { this._pushUndo(); g.pushed = true; }
      sh.items = out;
      this.dirty = true;
      this._afterChange();
    }

    _bboxOf(it) {
      let b = this.bbox.get(it);
      if (b) return b;
      if (it.pts) {
        const p = it.pts, pad = it.w * (it.pr ? 0.9 : 0.5);
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let i = 0; i < p.length; i += 3) {
          x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]);
          y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]);
        }
        b = [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
      } else if (it.t === 'text') {
        this.mctx.font = it.size + 'px ' + this.font;
        const lines = String(it.text).split('\n');
        const tw = Math.max.apply(null, lines.map(l => this.mctx.measureText(l).width));
        b = [it.x, it.y, it.x + tw, it.y + lines.length * it.size * 1.25];
      } else if (it.p) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let i = 0; i < it.p.length; i += 2) {
          x0 = Math.min(x0, it.p[i]); x1 = Math.max(x1, it.p[i]);
          y0 = Math.min(y0, it.p[i + 1]); y1 = Math.max(y1, it.p[i + 1]);
        }
        const pad = it.w / 2 + 1;
        b = [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
      } else if (it.a) {
        const bx = box(it), pad = it.w / 2 + (it.t === 'arrow' ? Math.max(11, it.w * 4) * 0.5 : it.t === 'axes' ? 22 : 1);
        b = [bx.x0 - pad, bx.y0 - pad, bx.x1 + pad, bx.y1 + pad];
      } else b = [0, 0, 0, 0];
      this.bbox.set(it, b);
      return b;
    }

    _outline(it) {
      if (it.p) return [it.closed ? it.p.concat([it.p[0], it.p[1]]) : it.p];
      if (!it.a) return [];
      const [ax, ay] = it.a, [bx, by] = it.b, b = box(it);
      switch (it.t) {
        case 'line':
        case 'arrow': return [[ax, ay, bx, by]];
        case 'rect': return [[b.x0, b.y0, b.x1, b.y0, b.x1, b.y1, b.x0, b.y1, b.x0, b.y0]];
        case 'tri': return [[b.x0, b.y1, b.x1, b.y1, (b.x0 + b.x1) / 2, b.y0, b.x0, b.y1]];
        case 'rtri': return [[b.x0, b.y0, b.x0, b.y1, b.x1, b.y1, b.x0, b.y0]];
        case 'axes': { const o = axesOrigin(it); return [[b.x0, o.oy, b.x1, o.oy], [o.ox, b.y0, o.ox, b.y1]]; }
        case 'ellipse': {
          const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, rx = (b.x1 - b.x0) / 2, ry = (b.y1 - b.y0) / 2, pts = [];
          for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2; pts.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry); }
          return [pts];
        }
      }
      return [];
    }

    _hit(it, x, y, r) {
      const bb = this._bboxOf(it);
      if (x < bb[0] - r || x > bb[2] + r || y < bb[1] - r || y > bb[3] + r) return false;
      if (it.t === 'text') return true;
      if (it.pts) {
        const p = it.pts, tol = r + it.w * (it.pr ? 0.9 : 0.5);
        if (p.length === 3) return Math.hypot(p[0] - x, p[1] - y) <= tol;
        for (let i = 3; i < p.length; i += 3) if (segDist(x, y, p[i - 3], p[i - 2], p[i], p[i + 1]) <= tol) return true;
        return false;
      }
      const tol = r + it.w / 2;
      for (const poly of this._outline(it)) {
        for (let i = 2; i < poly.length; i += 2) if (segDist(x, y, poly[i - 2], poly[i - 1], poly[i], poly[i + 1]) <= tol) return true;
      }
      return false;
    }

    /* ---------- текст ---------- */

    _hitText(w) {
      const items = this.sheet.items;
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (it.t !== 'text') continue;
        const b = this._bboxOf(it);
        if (w.x >= b[0] - 4 && w.x <= b[2] + 4 && w.y >= b[1] - 4 && w.y <= b[3] + 4) return it;
      }
      return null;
    }

    _startText(item, w) {
      const size = SIZES.text[this.prefs.size];
      const draft = item
        ? Object.assign({}, item)
        : { t: 'text', x: r1(w.x - 2), y: r1(w.y - size * 0.625), text: '', size, c: INK[this.prefs.ink].v };
      const ta = el('textarea', 'twb-text');
      ta.spellcheck = false;
      ta.setAttribute('aria-label', 'Текст на листе');
      ta.setAttribute('autocapitalize', 'off');
      ta.setAttribute('autocomplete', 'off');
      ta.value = draft.text;
      this.editing = { item, draft, ta };
      this.root.appendChild(ta);
      this.symEl.hidden = false;
      this._placeTextarea();
      ta.focus({ preventScroll: true });
      if (item) ta.setSelectionRange(ta.value.length, ta.value.length);
      ta.addEventListener('input', () => this._placeTextarea());
      ta.addEventListener('blur', () => this._commitText());
      ta.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); this._commitText(); }
      });
      this.dirty = true;
      this._requestDraw();
    }

    _placeTextarea() {
      const ed = this.editing;
      if (!ed) return;
      const d = ed.draft, v = this.view, fs = d.size * v.s;
      const lines = ed.ta.value.split('\n');
      this.mctx.font = d.size + 'px ' + this.font;
      const tw = Math.max(d.size, ...lines.map(l => this.mctx.measureText(l).width)) * v.s;
      const left = d.x * v.s + v.x, top = d.y * v.s + v.y, h = lines.length * fs * 1.25;
      Object.assign(ed.ta.style, {
        left: left + 'px', top: top + 'px',
        width: tw + fs * 0.8 + 'px', height: h + 'px',
        fontSize: fs + 'px', lineHeight: '1.25', fontFamily: this.font, color: d.c
      });
      // панель символов — над полем ввода (снизу её может закрыть экранная клавиатура)
      const sw = this.symEl.offsetWidth || 300, sh = this.symEl.offsetHeight || 80;
      let st = top - sh - 8;
      if (st < 8) st = top + h + 8;
      this.symEl.style.left = clamp(left, 8, Math.max(8, this.w - sw - 8)) + 'px';
      this.symEl.style.top = clamp(st, 8, Math.max(8, this.h - sh - 8)) + 'px';
    }

    _commitText() {
      const ed = this.editing;
      if (!ed) return;
      this.editing = null;
      this.symEl.hidden = true;
      const text = ed.ta.value.replace(/\s+$/, '');
      ed.ta.remove();
      const old = ed.item;
      if (!text.trim()) {
        if (old) this._change(sh => { sh.items = sh.items.filter(x => x !== old); });
        else { this.dirty = true; this._requestDraw(); }
        return;
      }
      const next = Object.assign({}, ed.draft, { text });
      if (!old) { this._change(sh => sh.items.push(next)); return; }
      if (old.text === next.text && old.c === next.c && old.size === next.size) { this.dirty = true; this._requestDraw(); return; }
      this._change(sh => {
        const i = sh.items.indexOf(old);
        if (i >= 0) sh.items[i] = next; else sh.items.push(next);
      });
    }

    /* ---------- отрисовка ---------- */

    _resize() {
      if (this.destroyed) return;
      const w = this.root.clientWidth, h = this.root.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 3);
      if (w === this.w && h === this.h && dpr === this.dpr) return;
      this.w = w; this.h = h; this.dpr = dpr;
      [this.canvas, this.cache].forEach(c => {
        c.width = Math.max(1, Math.round(w * dpr));
        c.height = Math.max(1, Math.round(h * dpr));
      });
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.rect = this.canvas.getBoundingClientRect();
      this.dirty = true;
      this._draw();
    }

    _requestDraw() {
      if (!this.raf && !this.destroyed) this.raf = requestAnimationFrame(() => this._draw());
    }

    _applyView(ctx) {
      const v = this.view, d = this.dpr;
      ctx.setTransform(d * v.s, 0, 0, d * v.s, d * v.x, d * v.y);
    }

    _draw() {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      if (this.destroyed) return;
      if (this.dirty) this._renderCache();
      const ctx = this.ctx, g = this.gesture, d = this.dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.drawImage(this.cache, 0, 0);
      if (this.active) { this.paths.delete(this.active); this._applyView(ctx); this._drawItem(ctx, this.active); }
      if (this.selHidden && g && g.m) {
        this._applyView(ctx);
        ctx.transform(g.m.s, 0, 0, g.m.s, g.m.tx, g.m.ty);
        for (const it of this.selection) this._drawItem(ctx, it);
      }
      // рамка выделения и лассо — в экранных координатах
      ctx.setTransform(d, 0, 0, d, 0, 0);
      const r = this._selRect();
      if (r) {
        ctx.save();
        ctx.strokeStyle = '#2C9A94';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
        ctx.setLineDash([]);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(r.x1, r.y1, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      if (g && g.type === 'lasso' && g.pts.length > 2) {
        ctx.save();
        ctx.strokeStyle = '#2C9A94';
        ctx.fillStyle = 'rgba(56,178,172,.08)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(g.pts[0], g.pts[1]);
        for (let i = 2; i < g.pts.length; i += 2) ctx.lineTo(g.pts[i], g.pts[i + 1]);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      this._placeSelMenu(r && !(g && (g.type === 'move' || g.type === 'scale')) ? r : null);
      if (this.editing) this._placeTextarea();
    }

    _placeSelMenu(r) {
      if (!r) { this.selMenu.hidden = true; return; }
      this.selMenu.hidden = false;
      const mw = this.selMenu.offsetWidth, mh = this.selMenu.offsetHeight;
      let top = r.y0 - mh - 10;
      if (top < 8) top = r.y1 + 14;
      this.selMenu.style.left = clamp((r.x0 + r.x1) / 2 - mw / 2, 8, Math.max(8, this.w - mw - 8)) + 'px';
      this.selMenu.style.top = clamp(top, 8, Math.max(8, this.h - mh - 8)) + 'px';
    }

    _renderCache() {
      this.dirty = false;
      const c = this.cctx;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = '#FFFFFF';
      c.fillRect(0, 0, this.cache.width, this.cache.height);
      this._drawPaper(c);
      this._applyView(c);
      const skipText = this.editing && this.editing.item;
      const skipSel = this.selHidden ? new Set(this.selection) : null;
      for (const it of this.sheet.items) {
        if (it === skipText || (skipSel && skipSel.has(it))) continue;
        this._drawItem(c, it);
      }
    }

    _drawPaper(c) {
      const mode = this.prefs.paper;
      if (mode === 'plain') return;
      const v = this.view, d = this.dpr;
      let step = GRID * v.s;
      while (step < 12) step *= 2;
      const ox = ((v.x % step) + step) % step, oy = ((v.y % step) + step) % step;
      c.save();
      c.setTransform(d, 0, 0, d, 0, 0);
      if (mode === 'grid') {
        c.strokeStyle = '#D3E0EB';
        c.lineWidth = 1 / d;
        c.beginPath();
        for (let x = ox; x < this.w; x += step) { const X = Math.round(x * d) / d; c.moveTo(X, 0); c.lineTo(X, this.h); }
        for (let y = oy; y < this.h; y += step) { const Y = Math.round(y * d) / d; c.moveTo(0, Y); c.lineTo(this.w, Y); }
        c.stroke();
      } else {
        c.fillStyle = '#AFC0D0';
        const r = 1.1;
        for (let x = ox; x < this.w; x += step) for (let y = oy; y < this.h; y += step) c.fillRect(x - r, y - r, r * 2, r * 2);
      }
      c.restore();
    }

    _drawItem(c, it) {
      c.save();
      c.strokeStyle = c.fillStyle = it.c;
      c.lineWidth = it.w;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      if (it.d && DASHABLE.has(it.t)) c.setLineDash([Math.max(7, it.w * 3), Math.max(6, it.w * 2.4)]);
      const b = it.a ? box(it) : null;
      switch (it.t) {
        case 'pen': this._stroke(c, it); break;
        case 'hl': c.globalCompositeOperation = 'multiply'; this._stroke(c, it); break;
        case 'line':
          c.beginPath(); c.moveTo(it.a[0], it.a[1]); c.lineTo(it.b[0], it.b[1]); c.stroke();
          break;
        case 'arrow': this._arrow(c, it.a[0], it.a[1], it.b[0], it.b[1], Math.max(11, it.w * 4)); break;
        case 'rect':
          c.beginPath(); c.rect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); c.stroke();
          break;
        case 'ellipse':
          c.beginPath();
          c.ellipse((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.x1 - b.x0) / 2, (b.y1 - b.y0) / 2, 0, 0, Math.PI * 2);
          c.stroke();
          break;
        case 'tri':
          c.beginPath(); c.moveTo(b.x0, b.y1); c.lineTo(b.x1, b.y1); c.lineTo((b.x0 + b.x1) / 2, b.y0); c.closePath(); c.stroke();
          break;
        case 'rtri': {
          c.beginPath(); c.moveTo(b.x0, b.y0); c.lineTo(b.x0, b.y1); c.lineTo(b.x1, b.y1); c.closePath(); c.stroke();
          const k = Math.min(14, (b.x1 - b.x0) / 4, (b.y1 - b.y0) / 4);
          if (k > 3) {
            c.setLineDash([]);
            c.lineWidth = Math.max(1, it.w * 0.6);
            c.beginPath(); c.moveTo(b.x0 + k, b.y1); c.lineTo(b.x0 + k, b.y1 - k); c.lineTo(b.x0, b.y1 - k); c.stroke();
          }
          break;
        }
        case 'poly': {
          const p = it.p;
          if (!p || p.length < 4) break;
          c.beginPath(); c.moveTo(p[0], p[1]);
          for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]);
          if (it.closed) c.closePath();
          c.stroke();
          break;
        }
        case 'axes': this._axes(c, it, b); break;
        case 'text': {
          c.font = it.size + 'px ' + this.font;
          c.textBaseline = 'middle';
          const lh = it.size * 1.25;
          String(it.text).split('\n').forEach((l, i) => c.fillText(l, it.x, it.y + lh * (i + 0.5)));
          break;
        }
      }
      c.restore();
    }

    _stroke(c, it) {
      const p = it.pts, n = p.length / 3;
      if (!n) return;
      let path = this.paths.get(it);
      if (!path) { path = strokePath(it); this.paths.set(it, path); }
      if (n === 1 || it.pr) { c.fill(path); if (path.caps) c.fill(path.caps); }
      else c.stroke(path);
    }

    _arrow(c, ax, ay, bx, by, L) {
      const len = Math.hypot(bx - ax, by - ay), ang = Math.atan2(by - ay, bx - ax);
      const cut = len > L ? L * 0.6 : 0;
      c.beginPath();
      c.moveTo(ax, ay);
      c.lineTo(bx - Math.cos(ang) * cut, by - Math.sin(ang) * cut);
      c.stroke();
      if (len <= L) return;
      c.beginPath();
      c.moveTo(bx, by);
      c.lineTo(bx - L * Math.cos(ang - 0.42), by - L * Math.sin(ang - 0.42));
      c.lineTo(bx - L * Math.cos(ang + 0.42), by - L * Math.sin(ang + 0.42));
      c.closePath();
      c.fill();
    }

    _axes(c, it, b) {
      const { ox, oy } = axesOrigin(it);
      const lw = Math.min(it.w, 2.5), H = 10 + lw * 2, t = 4;
      c.lineWidth = lw;
      this._arrow(c, b.x0, oy, b.x1, oy, H);
      this._arrow(c, ox, b.y1, ox, b.y0, H);
      c.lineWidth = Math.max(1, lw * 0.7);
      c.beginPath();
      for (let x = ox + GRID; x < b.x1 - H; x += GRID) { c.moveTo(x, oy - t); c.lineTo(x, oy + t); }
      for (let x = ox - GRID; x > b.x0 + 2; x -= GRID) { c.moveTo(x, oy - t); c.lineTo(x, oy + t); }
      for (let y = oy - GRID; y > b.y0 + H; y -= GRID) { c.moveTo(ox - t, y); c.lineTo(ox + t, y); }
      for (let y = oy + GRID; y < b.y1 - 2; y += GRID) { c.moveTo(ox - t, y); c.lineTo(ox + t, y); }
      c.stroke();
      c.font = 'italic 16px ' + this.font;
      c.textBaseline = 'top';
      c.textAlign = 'right';
      c.fillText('x', b.x1 - 2, oy + 7);
      c.fillText('0', ox - 5, oy + 5);
      c.textAlign = 'left';
      c.fillText('y', ox + 8, b.y0);
    }
  }

  const api = {
    version: '1.1.0',
    /** Создать черновик внутри container. См. README.md */
    create: opts => new Whiteboard(opts),
    /** Распознавание фигуры по штриху (используется «нарисуй и задержи»; открыто для тестов) */
    recognize
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (global) global.TryosWhiteboard = api;
})(typeof window !== 'undefined' ? window : undefined);
