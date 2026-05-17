/* LM Architecture Engine — vanilla JS, renders an SVG system diagram from data.json,
 * opens a non-blocking side drawer per node, tracks visits in localStorage via
 * LM.readKV/writeKV, fires beacon events, evaluates gated CTAs, and exposes
 * LM.editMode wraps for inline editing of labels / panel content / edge labels.
 */
(function () {
  "use strict";

  var TOOL = "architecture";
  var SVG_NS = "http://www.w3.org/2000/svg";

  function SLUG() { return window.__lm_slug || (window.__lm_data && window.__lm_data.slug) || ""; }
  function $(s, c) { return (c || document).querySelector(s); }
  function make(tag, attrs, html) { return window.LM.make(tag, attrs, html); }
  function esc(s) { return window.LM.esc(s); }
  function svgEl(tag, attrs) {
    var e = document.createElementNS(SVG_NS, tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function beacon(event, extra) { window.LM.beacon(TOOL, event, extra || {}); }

  // ── State (per page load) ──────────────────────────────────────────────
  var state = {
    data: null,
    root: null,
    drawer: null,
    activeNodeId: null,
    viewedNodes: {},
    viewStartedAt: Date.now()
  };

  function getViewedKV() { return window.LM.readKV(TOOL, SLUG(), "viewed", {}) || {}; }
  function persistViewedKV() { window.LM.writeKV(TOOL, SLUG(), "viewed", state.viewedNodes); }
  function uniqueViewedCount() { return Object.keys(state.viewedNodes).length; }
  function totalViewedCount() {
    var n = 0;
    for (var k in state.viewedNodes) n += (state.viewedNodes[k] || 0);
    return n;
  }

  // ── CTA gating ─────────────────────────────────────────────────────────
  function ctaCtx() {
    return {
      viewed_node_count: totalViewedCount(),
      unique_node_count: uniqueViewedCount(),
      time_on_page: Math.round((Date.now() - state.viewStartedAt) / 1000)
    };
  }
  // Whitelist mirrors checklist / calculator engines.
  function evalWhen(expr, ctx) {
    try {
      var allowed = /^[\s0-9a-zA-Z_\.\+\-\*\/\%\(\)\?\:\,\<\>\=\!\&\|\"\']+$/;
      if (!allowed.test(expr)) return false;
      var fn = new Function("ctx", "Math", "with (ctx) { return (" + expr + "); }");
      return !!fn(ctx, Math);
    } catch (_) { return false; }
  }
  function pickCta(data, ctx) {
    if (!Array.isArray(data.ctas) || !data.ctas.length) return null;
    for (var i = 0; i < data.ctas.length; i++) {
      var c = data.ctas[i];
      if (c && c.when) {
        if (evalWhen(c.when, ctx)) return c;
      }
    }
    // Final fallback = the last entry (whether or not it has a `when`).
    for (var j = data.ctas.length - 1; j >= 0; j--) {
      if (!data.ctas[j].when) return data.ctas[j];
    }
    return data.ctas[data.ctas.length - 1] || null;
  }

  // ── Hero ───────────────────────────────────────────────────────────────
  function renderHero(data) {
    var hero = make("section", { class: "lma-hero" });
    hero.appendChild(make("span", { class: "lma-badge" }, "System diagram"));
    var h1 = make("h1", { class: "lma-h1" });
    h1.textContent = data.title || "Architecture";
    hero.appendChild(h1);
    var sub = null;
    if (data.subtitle) {
      sub = make("p", { class: "lma-sub" });
      sub.textContent = data.subtitle;
      hero.appendChild(sub);
    }
    var meta = make("div", { class: "lma-meta" });
    var nc = (data.diagram && data.diagram.nodes || []).length;
    var ec = (data.diagram && data.diagram.edges || []).length;
    meta.appendChild(make("div", { class: "lma-meta-chip" }, nc + " nodes"));
    meta.appendChild(make("div", { class: "lma-meta-chip" }, ec + " connections"));
    meta.appendChild(make("div", { class: "lma-meta-chip" }, "Click any node"));
    hero.appendChild(meta);
    if (window.LM.editMode && window.LM.editMode.enabled()) {
      window.LM.editMode.registerField(h1, "title");
      if (sub) window.LM.editMode.registerField(sub, "subtitle");
    }
    return hero;
  }

  // ── SVG diagram ────────────────────────────────────────────────────────
  function renderSvg(data) {
    var d = data.diagram || {};
    var nodes = d.nodes || [];
    var edges = d.edges || [];
    var stage = make("section", { class: "lma-stage" });
    var svg = svgEl("svg", {
      viewBox: d.viewBox || "0 0 1200 800",
      "aria-label": "Architecture diagram",
      role: "img"
    });

    // Arrow marker
    var defs = svgEl("defs");
    var marker = svgEl("marker", {
      id: "lma-arrow",
      viewBox: "0 0 10 10",
      refX: "9", refY: "5",
      markerWidth: "7", markerHeight: "7",
      orient: "auto-start-reverse"
    });
    marker.appendChild(svgEl("path", { d: "M0,0 L10,5 L0,10 Z", fill: "rgba(26,26,26,0.55)" }));
    defs.appendChild(marker);
    svg.appendChild(defs);

    // Background grid (optional)
    if (d.background_grid) {
      var grid = svgEl("g", { class: "lma-grid" });
      for (var x = 0; x <= 1200; x += 40) grid.appendChild(svgEl("path", { d: "M" + x + " 0 L" + x + " 800" }));
      for (var y = 0; y <= 800; y += 40) grid.appendChild(svgEl("path", { d: "M0 " + y + " L1200 " + y }));
      svg.appendChild(grid);
    }

    // Edges first (so nodes paint over them)
    var idMap = {};
    nodes.forEach(function (n) { idMap[n.id] = n; });
    edges.forEach(function (e, edgeIdx) {
      var a = idMap[e.from], b = idMap[e.to];
      if (!a || !b) return;
      var ax = a.x + a.width / 2, ay = a.y + a.height / 2;
      var bx = b.x + b.width / 2, by = b.y + b.height / 2;
      var dx = bx - ax, dy = by - ay;
      // Anchor at rectangle edge along the line from center to center.
      var halfAW = a.width / 2, halfAH = a.height / 2;
      var scaleA = Math.min(halfAW / Math.max(1, Math.abs(dx)), halfAH / Math.max(1, Math.abs(dy)));
      var startX = ax + dx * scaleA, startY = ay + dy * scaleA;
      var halfBW = b.width / 2, halfBH = b.height / 2;
      var scaleB = Math.min(halfBW / Math.max(1, Math.abs(dx)), halfBH / Math.max(1, Math.abs(dy)));
      var endX = bx - dx * scaleB, endY = by - dy * scaleB;
      var midX = (startX + endX) / 2, midY = (startY + endY) / 2;

      var path = svgEl("path", {
        d: "M" + startX + " " + startY + " L" + endX + " " + endY,
        class: "lma-edge",
        "marker-end": "url(#lma-arrow)"
      });
      svg.appendChild(path);
      if (e.label) {
        // Render a white pill behind the label so it doesn't sit on the line.
        var labelText = String(e.label);
        var charW = 6.2;
        var pillW = labelText.length * charW + 12;
        var pillH = 16;
        var bg = svgEl("rect", {
          x: midX - pillW / 2, y: midY - 6 - pillH + 4,
          width: pillW, height: pillH,
          rx: 8, ry: 8,
          class: "lma-edge-label-bg"
        });
        svg.appendChild(bg);
        var lbl = svgEl("text", { x: midX, y: midY - 6, class: "lma-edge-label" });
        lbl.textContent = labelText;
        svg.appendChild(lbl);
        if (window.LM.editMode && window.LM.editMode.enabled()) {
          window.LM.editMode.registerField(lbl, "diagram.edges[" + edgeIdx + "].label");
        }
      }
    });

    // Nodes
    nodes.forEach(function (n, idx) {
      var g = svgEl("g", {
        class: "lma-node t-" + (n.type || "transform"),
        "data-node-id": n.id,
        tabindex: "0",
        role: "button",
        "aria-label": "Open detail for " + (n.label || n.id)
      });
      // Mark visited from KV
      if (state.viewedNodes[n.id]) g.setAttribute("class", g.getAttribute("class") + " is-visited");
      var rect = svgEl("rect", { x: n.x, y: n.y, width: n.width, height: n.height });
      var typeText = svgEl("text", { class: "lma-node-type", x: n.x + n.width / 2, y: n.y + 22 });
      typeText.textContent = (n.type || "transform").toUpperCase();
      var label = svgEl("text", {
        class: "lma-node-label",
        x: n.x + n.width / 2,
        y: n.y + n.height / 2 + 12
      });
      label.textContent = n.label || n.id;
      var dot = svgEl("circle", {
        class: "lma-node-dot",
        cx: n.x + n.width - 14, cy: n.y + 14, r: 4
      });
      g.appendChild(rect);
      g.appendChild(typeText);
      g.appendChild(label);
      g.appendChild(dot);
      svg.appendChild(g);
      if (window.LM.editMode && window.LM.editMode.enabled()) {
        window.LM.editMode.registerField(label, "diagram.nodes[" + idx + "].label");
      }
    });

    if (window.LM.editMode && window.LM.editMode.enabled()) {
      window.LM.editMode.registerArray(svg, "diagram.nodes", { itemLabel: "node" });
      window.LM.editMode.registerArray(svg, "diagram.edges", {
        itemLabel: "edge",
        template: { from: "", to: "", label: "" }
      });
    }

    stage.appendChild(svg);
    return stage;
  }

  // ── Mobile node list (rendered at any width, hidden via CSS on desktop) ─
  function renderMobileList(data) {
    var nodes = (data.diagram && data.diagram.nodes) || [];
    var wrap = make("section", { class: "lma-mobile-list", "aria-label": "Node list (mobile)" });
    var ol = make("ol");
    nodes.forEach(function (n) {
      var card = make("button", {
        class: "lma-mobile-card" + (state.viewedNodes[n.id] ? " is-visited" : ""),
        type: "button",
        "data-node-id": n.id
      });
      card.innerHTML =
        '<span class="m-type">' + esc((n.type || "transform").toUpperCase()) + '</span>' +
        '<span class="m-label">' + esc(n.label || n.id) + '</span>' +
        (n.panel && n.panel.headline ? '<span class="m-hint">' + esc(n.panel.headline) + '</span>' : '');
      var li = make("li");
      li.appendChild(card);
      ol.appendChild(li);
    });
    wrap.appendChild(ol);
    return wrap;
  }

  // ── Drawer ─────────────────────────────────────────────────────────────
  function ensureDrawer() {
    if (state.drawer) return state.drawer;
    var d = make("aside", {
      class: "lma-drawer",
      role: "dialog",
      "aria-hidden": "true",
      "aria-label": "Node detail"
    });
    document.body.appendChild(d);
    state.drawer = d;
    return d;
  }
  function clearActiveMarker() {
    if (!state.activeNodeId) return;
    var sel = '[data-node-id="' + state.activeNodeId + '"]';
    var prev = state.root.querySelector(sel);
    if (prev) prev.classList.remove("is-active");
  }
  function closeDrawer() {
    if (!state.drawer) return;
    state.drawer.classList.remove("open");
    state.drawer.setAttribute("aria-hidden", "true");
    clearActiveMarker();
    state.activeNodeId = null;
  }
  function openDrawerForNode(node) {
    var drawer = ensureDrawer();
    if (state.activeNodeId && state.activeNodeId !== node.id) clearActiveMarker();
    // Mark all matching elements (SVG + mobile card) as active/visited
    var sel = '[data-node-id="' + node.id + '"]';
    state.root.querySelectorAll(sel).forEach(function (el) {
      el.classList.add("is-active", "is-visited");
    });
    state.activeNodeId = node.id;

    var panel = node.panel || {};
    drawer.innerHTML = "";

    var close = make("button", {
      class: "lma-drawer-close",
      type: "button",
      "aria-label": "Close"
    }, "&times;");
    close.addEventListener("click", closeDrawer);
    drawer.appendChild(close);

    var eyebrow = make("p", { class: "lma-drawer-eyebrow" });
    eyebrow.textContent = (node.type || "transform").toUpperCase() + " · " + (node.label || node.id);
    drawer.appendChild(eyebrow);

    var h = make("h2", { class: "lma-drawer-headline" });
    h.textContent = panel.headline || node.label || "Detail";
    drawer.appendChild(h);

    var body = make("div", { class: "lma-drawer-body" });
    body.innerHTML = panel.body_html || "";
    drawer.appendChild(body);

    if (Array.isArray(panel.stack) && panel.stack.length) {
      drawer.appendChild(make("p", { class: "lma-drawer-section-h" }, "Stack"));
      var row = make("div", { class: "lma-chip-row" });
      panel.stack.forEach(function (s) {
        var chip = make("span", { class: "lma-chip" });
        chip.textContent = s;
        row.appendChild(chip);
      });
      drawer.appendChild(row);
    }
    if (Array.isArray(panel.common_mistakes) && panel.common_mistakes.length) {
      drawer.appendChild(make("p", { class: "lma-drawer-section-h" }, "Common mistakes"));
      var ul = make("ul", { class: "lma-list" });
      panel.common_mistakes.forEach(function (m) {
        var li = make("li");
        li.textContent = m;
        ul.appendChild(li);
      });
      drawer.appendChild(ul);
    }
    if (Array.isArray(panel.alternatives) && panel.alternatives.length) {
      drawer.appendChild(make("p", { class: "lma-drawer-section-h" }, "Alternatives"));
      var altRow = make("div", { class: "lma-chip-row" });
      panel.alternatives.forEach(function (a) {
        var chip = make("span", { class: "lma-chip alt" });
        chip.textContent = typeof a === "string" ? a : (a.name || "alt");
        altRow.appendChild(chip);
      });
      drawer.appendChild(altRow);
    }
    if (panel.cta_id) {
      var ctaDef = (state.data.ctas || []).find(function (c) { return c.id === panel.cta_id; });
      if (ctaDef && ctaDef.url) {
        var cta = make("a", {
          class: "lma-drawer-cta",
          href: ctaDef.url,
          target: "_blank",
          rel: "noopener"
        });
        cta.textContent = ctaDef.button || ctaDef.headline || "Talk it through";
        cta.addEventListener("click", function () {
          beacon("cta_click", { answers: { cta_id: ctaDef.id, source: "drawer", node_id: node.id } });
        });
        drawer.appendChild(cta);
      }
    }

    // edit-mode field wraps
    if (window.LM.editMode && window.LM.editMode.enabled()) {
      var nodeIdx = (state.data.diagram.nodes || []).findIndex(function (x) { return x.id === node.id; });
      if (nodeIdx >= 0) {
        window.LM.editMode.registerField(h, "diagram.nodes[" + nodeIdx + "].panel.headline");
        window.LM.editMode.registerField(body, "diagram.nodes[" + nodeIdx + "].panel.body_html", { multiline: true });
      }
    }

    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");

    // Track visit + persist
    state.viewedNodes[node.id] = (state.viewedNodes[node.id] || 0) + 1;
    persistViewedKV();
    beacon("node_click", {
      answers: {
        node_id: node.id,
        node_type: node.type,
        viewed_node_count: totalViewedCount(),
        unique_node_count: uniqueViewedCount()
      }
    });
    beacon("panel_view", {
      answers: { node_id: node.id, headline: panel.headline || null }
    });
    refreshFloatingCta();
  }

  function wireNodeClicks() {
    var nodes = (state.data.diagram && state.data.diagram.nodes) || [];
    var idMap = {};
    nodes.forEach(function (n) { idMap[n.id] = n; });

    // SVG node groups
    state.root.querySelectorAll(".lma-node").forEach(function (g) {
      g.addEventListener("click", function () {
        var n = idMap[g.getAttribute("data-node-id")];
        if (n) openDrawerForNode(n);
      });
      g.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          g.dispatchEvent(new Event("click"));
        }
      });
    });

    // Mobile cards
    state.root.querySelectorAll(".lma-mobile-card").forEach(function (c) {
      c.addEventListener("click", function () {
        var n = idMap[c.getAttribute("data-node-id")];
        if (n) openDrawerForNode(n);
      });
    });

    // ESC closes
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") closeDrawer();
    });
    // Click outside the drawer closes it (but not clicks on nodes / cards)
    document.addEventListener("click", function (ev) {
      if (!state.drawer || !state.drawer.classList.contains("open")) return;
      if (state.drawer.contains(ev.target)) return;
      if (ev.target.closest && ev.target.closest(".lma-node")) return;
      if (ev.target.closest && ev.target.closest(".lma-mobile-card")) return;
      closeDrawer();
    });
  }

  function refreshFloatingCta() {
    var cw = $("#lma-floating-cta");
    if (!cw) return;
    var picked = pickCta(state.data, ctaCtx());
    if (!picked) { cw.innerHTML = ""; return; }
    cw.innerHTML =
      '<section class="lma-cta-card" data-cta-id="' + esc(picked.id || "fallback") + '">' +
        '<h3>' + esc(picked.headline || "Want help with this?") + '</h3>' +
        '<a class="lma-btn" href="' + esc(picked.url) + '" target="_blank" rel="noopener">' +
          esc(picked.button || "Learn more") +
        '</a>' +
      '</section>';
    var a = cw.querySelector("a.lma-btn");
    if (a && !a.__bound) {
      a.__bound = true;
      a.addEventListener("click", function () {
        beacon("cta_click", { answers: { cta_id: picked.id, source: "floating" } });
      });
    }
  }

  // ── PNG download (lazy-loaded html2canvas) ─────────────────────────────
  var H2C_URL = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
  function loadHtml2Canvas() {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = H2C_URL;
      s.async = true;
      s.onload = function () { resolve(window.html2canvas); };
      s.onerror = function () { reject(new Error("html2canvas failed to load")); };
      document.head.appendChild(s);
    });
  }
  function pngFilename(slug) {
    var safe = String(slug || "diagram").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    var d = new Date();
    var ymd = d.getFullYear() + "-" +
              String(d.getMonth() + 1).padStart(2, "0") + "-" +
              String(d.getDate()).padStart(2, "0");
    return (safe || "diagram") + "-" + ymd + ".png";
  }
  function downloadDiagramAsPng() {
    var stage = state.root.querySelector(".lma-stage");
    if (!stage || stage.offsetParent === null) {
      // Mobile: capture the mobile list instead
      stage = state.root.querySelector(".lma-mobile-list");
    }
    if (!stage) return;
    var btn = $("#lma-download");
    var orig = btn ? btn.textContent : null;
    if (btn) { btn.disabled = true; btn.textContent = "Preparing…"; }
    loadHtml2Canvas().then(function (h2c) {
      return h2c(stage, { backgroundColor: "#FFFFFF", scale: 2, useCORS: true });
    }).then(function (canvas) {
      var a = document.createElement("a");
      a.download = pngFilename(SLUG());
      a.href = canvas.toDataURL("image/png");
      document.body.appendChild(a);
      a.click();
      a.remove();
      beacon("share", { answers: { format: "png" } });
    }).catch(function (e) {
      if (window.LM.toast) window.LM.toast("Download failed: " + e.message);
    }).finally(function () {
      if (btn) { btn.disabled = false; btn.textContent = orig || "Download as PNG"; }
    });
  }

  // ── Render orchestration ───────────────────────────────────────────────
  function render(data, root) {
    window.__lm_slug = data.slug || window.__lm_slug;
    window.__lm_data = data;
    state.data = data;
    state.root = root;
    state.viewedNodes = getViewedKV();
    state.viewStartedAt = Date.now();
    root.innerHTML = "";
    root.appendChild(renderHero(data));
    root.appendChild(renderSvg(data));
    root.appendChild(renderMobileList(data));

    var actions = make("div", { class: "lma-actions", id: "lma-actions" });
    var dl = make("button", {
      class: "lma-btn lma-btn-secondary",
      type: "button",
      id: "lma-download"
    }, "Download as PNG");
    dl.addEventListener("click", downloadDiagramAsPng);
    actions.appendChild(dl);
    root.appendChild(actions);

    var ctaWrap = make("div", { id: "lma-floating-cta" });
    root.appendChild(ctaWrap);

    wireNodeClicks();
    refreshFloatingCta();
    beacon("view", {
      answers: { node_count: (data.diagram && data.diagram.nodes || []).length }
    });
  }

  function init() {
    var root = document.getElementById("lma-root") || document.querySelector("[data-lm-architecture-src]");
    if (!root) return;
    var src = root.getAttribute("data-lm-architecture-src") || "./data.json";
    fetch(src, { credentials: "same-origin" })
      .then(function (r) {
        if (!r.ok) throw new Error("data.json " + r.status);
        return r.json();
      })
      .then(function (data) { render(data, root); })
      .catch(function (e) {
        root.innerHTML = '<div style="padding:2rem;color:#a00"><strong>Error loading architecture:</strong> ' + esc(e.message) + '</div>';
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Expose internals for tests / debugging
  window.__lm_architecture = {
    state: state,
    render: render,
    beacon: beacon,
    ctaCtx: ctaCtx,
    pickCta: pickCta,
    pngFilename: pngFilename,
    openDrawerForNode: openDrawerForNode,
    closeDrawer: closeDrawer
  };
})();
