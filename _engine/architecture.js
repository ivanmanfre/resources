/* LM Architecture Engine — vanilla JS, renders an SVG system diagram from data.json,
 * opens a non-blocking side drawer per node, tracks visits in localStorage via
 * LM.readKV/writeKV, fires beacon events, evaluates gated CTAs, and exposes
 * LM.editMode wraps for inline editing of labels / panel content / edge labels.
 */
(function () {
  "use strict";

  var TOOL = "architecture";
  var SVG_NS = "http://www.w3.org/2000/svg";

  // ── Brand logo registry ───────────────────────────────────────────────
  // Each entry: { color, path, viewBox (default "0 0 24 24"), match: [keywords] }
  // Paths are simpleicons.org-style single-path SVGs. Color is brand primary.
  var LOGOS = {
    clickup:  { color: "#7B68EE", match: ["clickup"], path: "M2.035 17.039l3.78-2.9c2.013 2.625 4.155 3.84 6.508 3.84 2.34 0 4.421-1.227 6.34-3.794l3.806 2.852c-2.766 3.717-6.197 5.704-10.146 5.704-3.937 0-7.376-1.974-10.288-5.703zM12.31.918l-7.706 6.643 3.092 3.59 4.628-3.99 4.605 3.997 3.103-3.585L12.31.918z" },
    claude:   { color: "#D97757", match: ["claude", "anthropic"], path: "M4.709 15.955l4.72-2.647.079-.23-.079-.128h-.23l-.79-.048-2.695-.073-2.337-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.517.103 2.276.158 1.65.097 2.447.255h.388l.055-.157-.134-.098-.103-.097-2.358-1.599-2.552-1.687-1.336-.972-.722-.491-.365-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.146-.103.018-.072-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.276.156 6.68 0l.971.398 1.247 1.392 1.604 2.7L7.122 4.61l.85 2.78 1.541-.486.085.523-.395.078-2.05.42 1.166 5.31z" },
    anthropic:{ color: "#D97757", match: ["anthropic"], path: "M13.827 3.52h3.603L24 20h-3.603l-6.57-16.48zm-7.258 0h3.767L16.906 20h-3.674l-1.343-3.461H5.017l-1.344 3.461H0L6.57 3.52zm4.132 9.953L8.453 7.687 6.205 13.473z" },
    supabase: { color: "#3ECF8E", match: ["supabase"], path: "M11.9 1.531 1.522 14.366c-.71.878-.087 2.183 1.04 2.183h10.378v6.92c0 1.524 1.93 2.18 2.86.97L24.478 9.634c.71-.878.087-2.183-1.04-2.183H13.06V.531c0-1.524-1.93-2.18-2.86-.97 0 0-.001 0-.001 0z" },
    n8n:      { color: "#EA4B71", match: ["n8n"], path: "M21 8a3 3 0 0 0-2.83 2H15.83A3 3 0 0 0 13 7.17V5.83a3 3 0 1 0-2 0v1.34A3 3 0 0 0 8.17 10H6.83A3 3 0 1 0 8 13H6.83A3 3 0 0 0 4 15.83v2.34a3 3 0 1 0 2 0v-2.34A3 3 0 0 0 7 13h1.17A3 3 0 0 0 11 15.83v2.34a3 3 0 1 0 2 0v-2.34A3 3 0 0 0 15.83 13h2.34A3 3 0 1 0 21 8z" },
    linkedin: { color: "#0A66C2", match: ["linkedin", "li-"], path: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" },
    resend:   { color: "#000000", match: ["resend", "email", "nurture"], path: "M22 5.508v12.984A3.515 3.515 0 0 1 18.494 22H5.506A3.515 3.515 0 0 1 2 18.492V5.508A3.515 3.515 0 0 1 5.506 2h12.988A3.515 3.515 0 0 1 22 5.508zM10.484 6.04H7.41c-.247 0-.439.198-.439.444v11.022c0 .247.192.451.439.451h2.137c.246 0 .438-.204.438-.45v-3.518h1.42l2.16 3.701c.094.155.255.267.43.267h2.473c.34 0 .553-.366.382-.66l-2.298-3.927c1.305-.572 2.221-1.886 2.221-3.414 0-2.183-1.755-3.916-3.927-3.916h-.001zm-.001 5.687h-1.487V8.39h1.487c.91 0 1.66.749 1.66 1.668 0 .92-.75 1.669-1.66 1.669z" },
    whatsapp: { color: "#25D366", match: ["whatsapp", "whapi"], path: "M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.711.306 1.265.489 1.698.626.713.226 1.362.194 1.876.118.572-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" },
    apify:    { color: "#00B886", match: ["apify"], path: "M12 0 0 12l12 12 12-12L12 0zm0 4.5L19.5 12 12 19.5 4.5 12 12 4.5z" },
    openai:   { color: "#412991", match: ["openai", "gpt"], path: "M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.677l5.815 3.354-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.787a4.49 4.49 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" },
    unipile:  { color: "#5B6CFF", match: ["unipile", "dm send"], path: "M2 21l21-9L2 3v7l15 2-15 2v7z" },
    railway:  { color: "#0B0D0E", match: ["railway"], path: "M22 11.1c-1.7.2-9.3 1.4-12.4 1.4-2.5 0-7-.7-9.6-1.1v1.9c2.6.4 7.1 1.1 9.6 1.1 3.1 0 10.7-1.2 12.4-1.4v-1.9zM22 7c-1.7.5-9.3 2.2-12.4 2.2-2.5 0-7-1.2-9.6-1.9V9c2.6.7 7.1 1.9 9.6 1.9C12.7 10.9 20.3 9.3 22 8.8V7zm-4.5 8.4c0 .7-.6 1.3-1.3 1.3-.7 0-1.3-.6-1.3-1.3 0-.7.6-1.3 1.3-1.3.7 0 1.3.6 1.3 1.3zm-3.8 0c0 .7-.6 1.3-1.3 1.3-.7 0-1.3-.6-1.3-1.3 0-.7.6-1.3 1.3-1.3.7 0 1.3.6 1.3 1.3zm-3.8 0c0 .7-.6 1.3-1.3 1.3-.7 0-1.3-.6-1.3-1.3 0-.7.6-1.3 1.3-1.3.7 0 1.3.6 1.3 1.3z" }
  };

  // Generic glyphs by node type (used when no brand match).
  var TYPE_GLYPHS = {
    trigger:   { color: "#B8860B", path: "M13 2L3 14h9l-1 8 10-12h-9l1-8z" },                                    // lightning bolt
    transform: { color: "#1E5B8C", path: "M12 2l2.5 5 5.5.8-4 4 1 5.5L12 14.8 7 17.3l1-5.5-4-4 5.5-.8L12 2z" },  // star (transform)
    decision:  { color: "#7A2E8C", path: "M12 2L2 12l10 10 10-10L12 2zm0 4.4L17.6 12 12 17.6 6.4 12 12 6.4z" }, // diamond
    storage:   { color: "#A0522D", path: "M12 3c-4.4 0-8 1.3-8 3v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6c0-1.7-3.6-3-8-3zm0 2c3.9 0 6 1 6 1s-2.1 1-6 1-6-1-6-1 2.1-1 6-1z" }, // cylinder
    output:    { color: "#1A6B3F", path: "M2 21l21-9L2 3v7l15 2-15 2v7z" }                                       // paper plane
  };

  function findLogo(label, type) {
    var lc = String(label || "").toLowerCase();
    for (var k in LOGOS) {
      var entry = LOGOS[k];
      for (var i = 0; i < entry.match.length; i++) {
        if (lc.indexOf(entry.match[i]) !== -1) return entry;
      }
    }
    return TYPE_GLYPHS[type] || TYPE_GLYPHS.transform;
  }

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
    var edgeIndex = {}; // edge_id -> { fromId, toId, particleEl }
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

      var edgeId = "lma-edge-" + edgeIdx;
      var path = svgEl("path", {
        id: edgeId,
        d: "M" + startX + " " + startY + " L" + endX + " " + endY,
        class: "lma-edge",
        "marker-end": "url(#lma-arrow)",
        "data-edge-from": e.from,
        "data-edge-to": e.to
      });
      svg.appendChild(path);

      // Single sage particle flowing along edge, staggered start by edge index
      var particle = svgEl("circle", {
        class: "lma-particle",
        r: 3.5,
        cx: startX,
        cy: startY
      });
      var anim = svgEl("animateMotion", {
        dur: "3.6s",
        repeatCount: "indefinite",
        begin: (edgeIdx * 0.28) + "s"
      });
      var mpath = svgEl("mpath", { "href": "#" + edgeId });
      anim.appendChild(mpath);
      particle.appendChild(anim);
      svg.appendChild(particle);

      edgeIndex[edgeId] = { fromId: e.from, toId: e.to, pathEl: path, particleEl: particle };

      // Hover edge → highlight source/target nodes
      path.addEventListener("mouseenter", function () {
        path.classList.add("is-hover");
        [e.from, e.to].forEach(function (nid) {
          var el = svg.querySelector('[data-node-id="' + nid + '"]');
          if (el) el.classList.add("is-edge-hover");
        });
      });
      path.addEventListener("mouseleave", function () {
        path.classList.remove("is-hover");
        [e.from, e.to].forEach(function (nid) {
          var el = svg.querySelector('[data-node-id="' + nid + '"]');
          if (el) el.classList.remove("is-edge-hover");
        });
      });

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

      // Glow/pulse halo behind node (per-type tint)
      var halo = svgEl("rect", {
        class: "lma-node-halo",
        x: n.x - 4, y: n.y - 4,
        width: n.width + 8, height: n.height + 8,
        rx: 12, ry: 12
      });
      g.appendChild(halo);

      var rect = svgEl("rect", {
        class: "lma-node-rect",
        x: n.x, y: n.y, width: n.width, height: n.height,
        rx: 10, ry: 10
      });
      g.appendChild(rect);

      // Brand/type logo — top-left corner inside the rect
      var logo = findLogo(n.label, n.type);
      var logoSize = 22;
      var logoPad = 12;
      var logoG = svgEl("g", {
        class: "lma-node-logo",
        transform: "translate(" + (n.x + logoPad) + "," + (n.y + logoPad) + ") scale(" + (logoSize / 24) + ")"
      });
      var logoBg = svgEl("circle", {
        class: "lma-node-logo-bg",
        cx: 12, cy: 12, r: 13,
        fill: logo.color
      });
      logoG.appendChild(logoBg);
      var logoPath = svgEl("path", {
        d: logo.path,
        fill: "#FFFFFF",
        transform: "scale(0.72) translate(4.6,4.6)"
      });
      logoG.appendChild(logoPath);
      g.appendChild(logoG);

      var typeText = svgEl("text", {
        class: "lma-node-type",
        x: n.x + n.width - 14, y: n.y + 22,
        "text-anchor": "end"
      });
      typeText.textContent = (n.type || "transform").toUpperCase();
      g.appendChild(typeText);

      var label = svgEl("text", {
        class: "lma-node-label",
        x: n.x + n.width / 2,
        y: n.y + n.height / 2 + 18
      });
      label.textContent = n.label || n.id;
      g.appendChild(label);

      var dot = svgEl("circle", {
        class: "lma-node-dot",
        cx: n.x + n.width - 14, cy: n.y + n.height - 14, r: 4
      });
      g.appendChild(dot);

      // Hover-on-node → highlight outgoing edges
      g.addEventListener("mouseenter", function () {
        svg.querySelectorAll('.lma-edge[data-edge-from="' + n.id + '"], .lma-edge[data-edge-to="' + n.id + '"]').forEach(function (p) {
          p.classList.add("is-node-hover");
        });
      });
      g.addEventListener("mouseleave", function () {
        svg.querySelectorAll('.lma-edge.is-node-hover').forEach(function (p) {
          p.classList.remove("is-node-hover");
        });
      });

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
    // Replay one-shot fade-in animations only on fresh open
    drawer.classList.remove("is-fresh");
    void drawer.offsetWidth; // force reflow so the animation restarts
    drawer.classList.add("is-fresh");
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
