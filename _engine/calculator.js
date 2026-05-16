/* LM Calculator Engine — vanilla JS, reads data.json, live-computes outputs, email-gated beacon integration */
(function () {
  "use strict";
  var BEACON = window.__lm_beacon_url || "https://bjbvqvzbzczjbatgmccb.supabase.co/functions/v1/lm-beacon";

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function make(tag, attrs, html) { var e = document.createElement(tag); if (attrs) for (var k in attrs) { if (k === "class") e.className = attrs[k]; else e.setAttribute(k, attrs[k]); } if (html !== undefined) e.innerHTML = html; return e; }
  function escapeHtml(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
  function toast(msg) { var t = $("#lmc-toast"); if (!t) { t = make("div", { id: "lmc-toast", class: "lmc-toast" }); document.body.appendChild(t); } t.textContent = msg; t.classList.add("show"); setTimeout(function () { t.classList.remove("show"); }, 2500); }
  function beacon(event_type, payload) {
    try {
      var q = new URLSearchParams(location.search);
      var body = Object.assign({ event_type: event_type, lm_slug: window.__lm_slug || (window.__lm_data && window.__lm_data.slug) || "", src: q.get("src") || "direct", utm: { source: q.get("utm_source"), medium: q.get("utm_medium"), campaign: q.get("utm_campaign") }, prospect_id: q.get("pid") || null, referrer: document.referrer || "" }, payload || {});
      if (navigator.sendBeacon) navigator.sendBeacon(BEACON, new Blob([JSON.stringify(body)], { type: "application/json" }));
      else fetch(BEACON, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(function () {});
    } catch (_) {}
  }

  function fmt(spec, val) {
    if (val == null || isNaN(val)) return "—";
    var n = Number(val);
    if (spec === "currency") return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
    if (spec === "percent") return n.toFixed(0) + "%";
    if (spec === "hours") return n.toFixed(n < 10 ? 1 : 0) + " hrs";
    if (spec === "decimal") return n.toFixed(2);
    if (spec === "integer") return Math.round(n).toLocaleString("en-US");
    return n.toLocaleString("en-US");
  }

  function safeEval(expr, ctx) {
    // Whitelist: only allow variable names (a-z 0-9 _ .), numbers, operators ( + - * / % ( ) ), ternary ? :, Math.*, and comparison
    // Replace identifiers with ctx[name]
    try {
      var allowed = /^[\s0-9a-zA-Z_\.\+\-\*\/\%\(\)\?\:\,\<\>\=\!\&\|]+$/;
      if (!allowed.test(expr)) return null;
      // eslint-disable-next-line no-new-func
      var fn = new Function("ctx", "Math", "with (ctx) { return (" + expr + "); }");
      var v = fn(ctx, Math);
      if (typeof v === "number" && isFinite(v)) return v;
      if (typeof v === "boolean") return v;
      return null;
    } catch (_) { return null; }
  }

  function tierFor(value, thresholds) {
    if (!thresholds) return { name: null, class: "" };
    if (value >= (thresholds.high || Infinity)) return { name: thresholds.high_label || "Optimized", class: "" };
    if (value >= (thresholds.mid || 0)) return { name: thresholds.mid_label || "Growth", class: "medium" };
    return { name: thresholds.low_label || "Critical", class: "low" };
  }


  function buildIntro(data, startTargetSelector, opts) {
    opts = opts || {};
    var intro = data.intro || {};
    var welcomeLine = intro.paragraph || (data.subtitle ? "You just grabbed " + (data.title || "this resource") + ". " + String(data.subtitle).replace(/\.$/, "") + "." : "You just grabbed " + (data.title || "this resource") + ". Here's the quickest way to use it.");
    var pointA = intro.point_time || (data.estimated_minutes ? data.estimated_minutes + " min, at your pace" : "At your own pace");
    var pointB = intro.point_value || opts.defaultValueBullet || "Built to give you the sharpest observation on your team's gaps";
    var pointC = intro.point_next || opts.defaultNextBullet || "Your progress auto-saves to this browser. Email only if you want the full report.";
    var startLabel = (opts.startLabel || "Start");
    var note = intro.note || opts.defaultNote || "No signup required. Scroll back up anytime to reread.";
    var sec = make("section", { class: "lmc-intro", "aria-labelledby": "lmc-intro-h" });
    var inner = make("div", { class: "lmc-intro-inner" });
    var img = make("img", { class: "lmc-intro-avatar", src: "https://ivanmanfredi.com/profile.jpg", alt: "Ivan Manfredi" });
    var body = make("div", { class: "lmc-intro-body" });
    body.appendChild(make("div", { class: "lmc-intro-badge" }, "Welcome"));
    body.appendChild(make("h2", { class: "lmc-intro-h", id: "lmc-intro-h" }, "Hey, I&rsquo;m Ivan."));
    body.appendChild(make("p", { class: "lmc-intro-p" }, escapeHtml(welcomeLine)));
    var ul = make("ul", { class: "lmc-intro-points" });
    [["a", "\u23F1", pointA], ["b", "\u2192", pointB], ["c", "\u2713", pointC]].forEach(function (p) {
      var li = make("li");
      li.appendChild(make("span", { class: "lmc-intro-icon " + p[0], "aria-hidden": "true" }, p[1]));
      li.appendChild(make("span", null, escapeHtml(p[2])));
      ul.appendChild(li);
    });
    body.appendChild(ul);
    var startBtn = make("button", { class: "lmc-intro-start", type: "button", "aria-label": startLabel }, escapeHtml(startLabel) + " <span aria-hidden=\"true\">\u2193</span>");
    startBtn.addEventListener("click", function () {
      var target = document.querySelector(startTargetSelector);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      beacon("cta_click", { answers: { target: "intro_start" } });
    });
    body.appendChild(startBtn);
    if (note) body.appendChild(make("p", { class: "lmc-intro-note" }, escapeHtml(note)));
    inner.appendChild(img);
    inner.appendChild(body);
    sec.appendChild(inner);
    return sec;
  }

  function render(data, root) {
    window.__lm_slug = data.slug;
    window.__lm_data = data;
    root.innerHTML = "";

    // Hero
    var hero = make("section", { class: "lmc-hero" });
    var inner = make("div", { class: "lmc-container" });
    inner.appendChild(make("div", { class: "lmc-badge" }, escapeHtml(data.brand && data.brand.hero_badge || "Interactive Calculator")));
    inner.appendChild(make("h1", { class: "lmc-h1" }, escapeHtml(data.title || "Calculator")));
    if (data.subtitle) inner.appendChild(make("p", { class: "lmc-sub" }, escapeHtml(data.subtitle)));
    var meta = make("div", { class: "lmc-meta" });
    meta.appendChild(make("div", { class: "lmc-meta-chip" }, (data.inputs || []).length + " inputs"));
    if (data.estimated_minutes) meta.appendChild(make("div", { class: "lmc-meta-chip" }, data.estimated_minutes + " min"));
    meta.appendChild(make("div", { class: "lmc-meta-chip" }, "Live math"));
    inner.appendChild(meta);
    hero.appendChild(inner);
    root.appendChild(hero);

    var introSection = buildIntro(data, ".lmc-grid", {
      defaultValueBullet: "Plug in your numbers; live math shows payback window + top 3 priorities",
      defaultNextBullet: "Email only to get a PDF with your numbers plus the n8n workflows I'd build",
      startLabel: "Run the calculator",
      defaultNote: "Nothing is stored until you submit. Tweak freely."
    });
    root.appendChild(introSection);

    // Content grid
    var container = make("div", { class: "lmc-container" });
    var grid = make("div", { class: "lmc-grid" });

    // LEFT: inputs
    var inputsCard = make("div", { class: "lmc-card" });
    inputsCard.appendChild(make("h2", null, "Your numbers"));
    (data.inputs || []).forEach(function (inp) {
      var field = make("div", { class: "lmc-field" });
      var labelId = "lmc-in-" + inp.id;
      var lbl = make("label", { for: labelId }, escapeHtml(inp.label || inp.id));
      field.appendChild(lbl);
      var wrap = make("div", { class: "lmc-input-wrap" });
      if (inp.prefix) wrap.appendChild(make("span", { class: "lmc-prefix" }, escapeHtml(inp.prefix)));
      var attrs = { id: labelId, class: "lmc-input", name: inp.id, type: inp.type === "range" ? "number" : (inp.type || "number"), inputmode: inp.type === "text" ? "text" : "decimal" };
      if (inp.min != null) attrs.min = inp.min;
      if (inp.max != null) attrs.max = inp.max;
      if (inp.step != null) attrs.step = inp.step;
      if (inp.placeholder) attrs.placeholder = inp.placeholder;
      var el = make("input", attrs);
      el.value = inp.default != null ? inp.default : "";
      wrap.appendChild(el);
      if (inp.suffix) wrap.appendChild(make("span", { class: "lmc-suffix" }, escapeHtml(inp.suffix)));
      field.appendChild(wrap);
      if (inp.type === "range" || inp.slider) {
        var r = make("input", { type: "range", class: "lmc-range", min: inp.min != null ? inp.min : 0, max: inp.max != null ? inp.max : 100, step: inp.step != null ? inp.step : 1, value: inp.default != null ? inp.default : 0 });
        r.addEventListener("input", function () { el.value = r.value; el.dispatchEvent(new Event("input", { bubbles: true })); });
        el.addEventListener("input", function () { if (!isNaN(Number(el.value))) r.value = el.value; });
        field.appendChild(r);
      }
      if (inp.hint) field.appendChild(make("span", { class: "hint" }, escapeHtml(inp.hint)));
      inputsCard.appendChild(field);
    });
    grid.appendChild(inputsCard);

    // RIGHT: outputs
    var outputsCard = make("div", { class: "lmc-card", id: "lmc-outputs" });
    outputsCard.appendChild(make("h2", null, "Your result"));
    var primary = (data.outputs || []).find(function (o) { return o.primary; }) || (data.outputs || [])[0];
    if (primary) {
      var ring = make("div", { class: "lmc-output-ring" });
      ring.appendChild(make("div", { class: "lmc-big-num", id: "lmc-big-num" }, "—"));
      ring.appendChild(make("div", { class: "lmc-big-unit" }, escapeHtml(primary.label || "")));
      ring.appendChild(make("span", { class: "lmc-tier-pill", id: "lmc-tier" }, "Fill in the numbers"));
      outputsCard.appendChild(ring);
    }
    var secondaryWrap = make("div", { id: "lmc-secondary-outputs" });
    (data.outputs || []).forEach(function (out) {
      if (out === primary) return;
      var row = make("div", { class: "lmc-output-row" });
      row.innerHTML = '<span class="label">' + escapeHtml(out.label || out.id) + '</span><span class="value" data-out-id="' + out.id + '">—</span>';
      secondaryWrap.appendChild(row);
    });
    outputsCard.appendChild(secondaryWrap);
    // Recommendations
    var recsWrap = make("div", { class: "lmc-recs", id: "lmc-recs" });
    outputsCard.appendChild(recsWrap);
    grid.appendChild(outputsCard);

    container.appendChild(grid);

    // Capture
    var cta = data.capture_cta || {};
    var capture = make("section", { class: "lmc-capture" });
    capture.innerHTML =
      '<h2>' + escapeHtml(cta.headline || "Want the full breakdown?") + '</h2>' +
      '<p>' + escapeHtml(cta.description || "Enter your email and I'll send you a PDF with your numbers, sensitivity analysis, and the next 3 automations I'd prioritize for your setup.") + '</p>' +
      '<form class="lmc-form" id="lmc-capture-form">' +
      '<label class="sr-only" for="lmc-email">Email</label>' +
      '<input class="lmc-form-input" id="lmc-email" name="email" type="email" autocomplete="email" required placeholder="you@company.com" />' +
      '<button class="lmc-btn" type="submit">Send me the plan</button>' +
      '</form>' +
      '<p class="lmc-note">No spam. One email, then you decide.</p>';
    container.appendChild(capture);

    // Footer actions
    var footer = make("div", { class: "lmc-footer-actions" });
    footer.innerHTML = '<button class="lmc-btn lmc-btn-secondary" id="lmc-copy" type="button">Copy result</button><button class="lmc-btn lmc-btn-secondary" id="lmc-reset" type="button">Reset</button>';
    container.appendChild(footer);
    root.appendChild(container);

    // Live compute
    function getCtx() {
      var ctx = {};
      (data.inputs || []).forEach(function (inp) {
        var el = document.getElementById("lmc-in-" + inp.id);
        var v = el ? (inp.type === "text" ? el.value : Number(el.value)) : null;
        ctx[inp.id] = (v == null || (typeof v === "number" && isNaN(v))) ? (inp.default != null ? inp.default : 0) : v;
      });
      return ctx;
    }
    function compute() {
      var ctx = getCtx();
      var results = {};
      (data.outputs || []).forEach(function (out) {
        var val = out.formula ? safeEval(out.formula, Object.assign({}, ctx, results)) : null;
        results[out.id] = val;
      });
      // Paint
      if (primary) {
        var main = results[primary.id];
        var bn = $("#lmc-big-num"); if (bn) bn.textContent = fmt(primary.format, main);
        var tp = $("#lmc-tier");
        if (tp && primary.tier_thresholds && typeof main === "number") {
          var t = tierFor(main, primary.tier_thresholds);
          tp.className = "lmc-tier-pill " + (t.class || "");
          tp.textContent = t.name || "—";
        }
      }
      (data.outputs || []).forEach(function (out) {
        if (out === primary) return;
        var el = document.querySelector('[data-out-id="' + out.id + '"]');
        if (el) el.textContent = fmt(out.format, results[out.id]);
      });
      // Recs
      var recs = data.recommendations || [];
      var matched = recs.filter(function (r) { return r.when ? !!safeEval(r.when, Object.assign({}, ctx, results)) : false; }).slice(0, 3);
      var rcEl = $("#lmc-recs");
      if (rcEl) {
        if (matched.length === 0) { rcEl.innerHTML = ""; }
        else {
          rcEl.innerHTML = '<h3>What to do next</h3>' + matched.map(function (m) { return '<div class="lmc-rec"><strong>' + escapeHtml(m.tag || "Recommended") + '</strong>' + escapeHtml(m.text || "") + '</div>'; }).join("");
        }
      }
      return { ctx: ctx, results: results, matched_recs: matched.map(function (m) { return m.tag; }) };
    }
    // Attach
    (data.inputs || []).forEach(function (inp) {
      var el = document.getElementById("lmc-in-" + inp.id);
      if (el) el.addEventListener("input", compute);
    });
    compute();

    // Capture
    var form = $("#lmc-capture-form");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var email = ($("#lmc-email") || {}).value || "";
        if (!email || email.indexOf("@") === -1) { toast("Enter a valid email"); return; }
        var snap = compute();
        beacon("capture", { email: email, answers: { inputs: snap.ctx, outputs: snap.results, matched_recs: snap.matched_recs } });
        toast("Got it. Check your inbox.");
        form.innerHTML = '<p style="font-weight:700;color:#00E676">&#10003; Sent to ' + escapeHtml(email) + '. If it doesn\'t arrive, check Promotions.</p>';
      });
    }

    // Copy result
    var copyBtn = $("#lmc-copy");
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        var snap = compute();
        var lines = [data.title || "Calculator"];
        (data.inputs || []).forEach(function (inp) { lines.push("- " + (inp.label || inp.id) + ": " + snap.ctx[inp.id] + (inp.suffix || "")); });
        lines.push("");
        (data.outputs || []).forEach(function (out) { lines.push(" → " + (out.label || out.id) + ": " + fmt(out.format, snap.results[out.id])); });
        lines.push("\nFrom: " + location.href);
        var text = lines.join("\n");
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { toast("Copied to clipboard"); });
          beacon("share", { answers: { format: "text" } });
        } else { toast("Copy not supported"); }
      });
    }

    // Reset
    var resetBtn = $("#lmc-reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        (data.inputs || []).forEach(function (inp) {
          var el = document.getElementById("lmc-in-" + inp.id);
          if (el) el.value = inp.default != null ? inp.default : "";
        });
        compute();
      });
    }

    // View beacon
    beacon("view", {});
  }

  function init() {
    var root = document.getElementById("lmc-root") || document.querySelector("[data-lm-calculator-src]");
    if (!root) return;
    var src = root.getAttribute("data-lm-calculator-src") || "./data.json";
    fetch(src, { credentials: "same-origin" }).then(function (r) { if (!r.ok) throw new Error("data.json " + r.status); return r.json(); }).then(function (data) { render(data, root); }).catch(function (e) {
      root.innerHTML = '<div style="padding:2rem;color:#a00"><strong>Error loading calculator:</strong> ' + escapeHtml(e.message) + '</div>';
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
