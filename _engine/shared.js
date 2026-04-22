/* Shared primitives for every LM engine.
 * Exposes `window.LM` with: make, esc, toast, beacon, readerIdentity,
 * readKV/writeKV, observeReveal, buildIntro, buildHero, emailIsValid,
 * canonicalBeaconEvent, tierFor. */
(function () {
  "use strict";

  var BEACON = window.__lm_beacon_url || "https://bjbvqvzbzczjbatgmccb.supabase.co/functions/v1/lm-beacon";

  function make(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "class") e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function toast(msg) {
    var t = document.getElementById("lmc-toast");
    if (!t) { t = make("div", { id: "lmc-toast", class: "lmc-toast" }); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    setTimeout(function () { t.classList.remove("show"); }, 2500);
  }

  function emailIsValid(e) { return !!e && /[^@\s]+@[^@\s]+\.[^@\s]+/.test(e); }

  function canonicalBeaconEvent(tool_type, event, extra) {
    var q = new URLSearchParams(location.search);
    return Object.assign({
      event_type: event,
      tool_type: tool_type,
      lm_slug: window.__lm_slug || (window.__lm_data && window.__lm_data.slug) || "",
      src: q.get("src") || "direct",
      utm: { source: q.get("utm_source"), medium: q.get("utm_medium"), campaign: q.get("utm_campaign") },
      prospect_id: q.get("pid") || null,
      referrer: document.referrer || "",
      session_id: readerIdentity().session_id
    }, extra || {});
  }

  function beacon(tool_type, event, extra) {
    try {
      var body = canonicalBeaconEvent(tool_type, event, extra);
      if (navigator.sendBeacon) {
        navigator.sendBeacon(BEACON, new Blob([JSON.stringify(body)], { type: "application/json" }));
      } else {
        fetch(BEACON, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(function () {});
      }
    } catch (_) {}
  }

  // ── Reader identity (universal across all tools) ──────────────────────
  function readerIdentity() {
    var id = {};
    try { id = JSON.parse(localStorage.getItem("ivan.reader") || "{}") || {}; } catch (_) {}
    if (!id.session_id) {
      id.session_id = "s_" + Math.random().toString(36).slice(2, 10) + "_" + Date.now().toString(36);
      try { localStorage.setItem("ivan.reader", JSON.stringify(id)); } catch (_) {}
    }
    return id;
  }
  function updateReader(patch) {
    var id = readerIdentity();
    Object.assign(id, patch, { last_active: Date.now() });
    try { localStorage.setItem("ivan.reader", JSON.stringify(id)); } catch (_) {}
    return id;
  }

  // ── Per-tool KV persistence ───────────────────────────────────────────
  function kvKey(tool_type, slug, suf) { return "ivan." + tool_type + "." + slug + "." + suf; }
  function readKV(tool_type, slug, suf, fallback) {
    try { return JSON.parse(localStorage.getItem(kvKey(tool_type, slug, suf)) || "null") || fallback; }
    catch (_) { return fallback; }
  }
  function writeKV(tool_type, slug, suf, value) {
    try { localStorage.setItem(kvKey(tool_type, slug, suf), JSON.stringify(value)); } catch (_) {}
  }
  function removeKV(tool_type, slug, suf) {
    try { localStorage.removeItem(kvKey(tool_type, slug, suf)); } catch (_) {}
  }

  // ── Scroll-triggered entrance ─────────────────────────────────────────
  function observeReveal(rootEl, selector) {
    try {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) { entry.target.classList.add("in-view"); io.unobserve(entry.target); }
        });
      }, { root: null, rootMargin: "0px 0px -10% 0px", threshold: 0.08 });
      rootEl.querySelectorAll(selector).forEach(function (el, i) {
        el.style.transitionDelay = Math.min(i, 8) * 40 + "ms";
        io.observe(el);
      });
    } catch (_) {
      rootEl.querySelectorAll(selector).forEach(function (el) { el.classList.add("in-view"); });
    }
  }

  // ── Hero section ──────────────────────────────────────────────────────
  function buildHero(data, opts) {
    opts = opts || {};
    var hero = make("section", { class: "lmc-hero" });
    var inner = make("div", { class: "lmc-hero-inner" });
    if (opts.badge) inner.appendChild(make("div", { class: "lmc-badge" }, esc(opts.badge)));
    inner.appendChild(make("h1", { class: "lmc-h1" }, esc(data.title || "Resource")));
    if (data.subtitle) inner.appendChild(make("p", { class: "lmc-sub" }, esc(data.subtitle)));
    var meta = make("div", { class: "lmc-meta" });
    (opts.metaChips || []).forEach(function (c) { meta.appendChild(make("div", { class: "lmc-meta-chip" }, esc(c))); });
    if (meta.children.length) inner.appendChild(meta);
    hero.appendChild(inner);
    return hero;
  }

  // ── Intro block ───────────────────────────────────────────────────────
  function buildIntro(data, startTargetSelector, opts) {
    opts = opts || {};
    var intro = data.intro || {};
    var welcomeLine = intro.paragraph ||
      (data.subtitle ? "You just grabbed " + (data.title || "this resource") + ". " + String(data.subtitle).replace(/\.$/, "") + "." :
                       "You just grabbed " + (data.title || "this resource") + ". Here's the quickest way to use it.");
    var pointA = intro.point_time || (data.estimated_minutes ? data.estimated_minutes + " min, at your pace" : "At your own pace");
    var pointB = intro.point_value || opts.defaultValueBullet || "Built to give you the sharpest observation on your team's gaps";
    var pointC = intro.point_next  || opts.defaultNextBullet  || "Your progress auto-saves to this browser. Email only if you want the full report.";
    var startLabel = (opts.startLabel || "Start");
    var note = intro.note || opts.defaultNote || "No signup required. Scroll back up anytime to reread.";

    var sec = make("section", { class: "lmc-intro", "aria-labelledby": "lmc-intro-h" });
    var inner = make("div", { class: "lmc-intro-inner" });
    var img = make("img", { class: "lmc-intro-avatar", src: "https://ivanmanfredi.com/ivan-portrait.jpg", alt: "Ivan Manfredi" });
    var body = make("div", { class: "lmc-intro-body" });
    body.appendChild(make("div", { class: "lmc-intro-badge" }, "Welcome"));
    body.appendChild(make("h2", { class: "lmc-intro-h", id: "lmc-intro-h" }, "Hey, I&rsquo;m Ivan."));
    body.appendChild(make("p", { class: "lmc-intro-p" }, esc(welcomeLine)));
    var ul = make("ul", { class: "lmc-intro-points" });
    [["a", "\u23F1", pointA], ["b", "\u2192", pointB], ["c", "\u2713", pointC]].forEach(function (p) {
      var li = make("li");
      li.appendChild(make("span", { class: "lmc-intro-icon " + p[0], "aria-hidden": "true" }, p[1]));
      li.appendChild(make("span", null, esc(p[2])));
      ul.appendChild(li);
    });
    body.appendChild(ul);
    var startBtn = make("button", { class: "lmc-intro-start", type: "button", "aria-label": startLabel },
                        esc(startLabel) + " <span aria-hidden=\"true\">\u2193</span>");
    startBtn.addEventListener("click", function () {
      var target = document.querySelector(startTargetSelector);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      beacon(opts.tool_type || "lm", "intro_start");
    });
    body.appendChild(startBtn);
    if (note) body.appendChild(make("p", { class: "lmc-intro-note" }, esc(note)));
    inner.appendChild(img);
    inner.appendChild(body);
    sec.appendChild(inner);
    return sec;
  }

  // ── Tier helper ───────────────────────────────────────────────────────
  function tierFor(pct) {
    if (pct < 50) return { key: "critical", label: "Critical", note: "Close the high-impact gaps before you scale anything else." };
    if (pct < 80) return { key: "growth",   label: "Growth stage", note: "You're on the curve. Close these gaps to compound." };
    return          { key: "optimized",label: "Optimized", note: "Maintain the streak and re-audit in 60 days." };
  }

  window.LM = {
    make: make, esc: esc, toast: toast, emailIsValid: emailIsValid,
    beacon: beacon, canonicalBeaconEvent: canonicalBeaconEvent,
    readerIdentity: readerIdentity, updateReader: updateReader,
    readKV: readKV, writeKV: writeKV, removeKV: removeKV,
    observeReveal: observeReveal,
    buildHero: buildHero, buildIntro: buildIntro,
    tierFor: tierFor
  };
})();
