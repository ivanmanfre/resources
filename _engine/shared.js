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

  // Auto-italicize the last meaningful word of a title for sage emphasis,
  // unless the title already contains <em>/<i> markup (data-driven override).
  // Returns HTML safe to assign via innerHTML.
  function italicizePivot(text) {
    var t = String(text || "");
    if (/<em\b|<i\b/i.test(t)) return t;
    var escaped = esc(t);
    var m = escaped.match(/([A-Za-z][\w'\-]*)([?.!:]*)$/);
    if (!m) return escaped;
    var word = m[1];
    var trailing = m[2] || "";
    var fillers = ["the","a","an","of","is","it","to","in","on","at","or","and","but","yet","that","this","with"];
    if (fillers.indexOf(word.toLowerCase()) !== -1) return escaped;
    return escaped.slice(0, -1 * (word.length + trailing.length)) + "<em>" + word + "</em>" + trailing;
  }

  // ── Hero section ──────────────────────────────────────────────────────
  function buildHero(data, opts) {
    opts = opts || {};
    var hero = make("section", { class: "lmc-hero" });
    var inner = make("div", { class: "lmc-hero-inner" });
    if (opts.badge) inner.appendChild(make("div", { class: "lmc-badge" }, esc(opts.badge)));
    var h1 = make("h1", { class: "lmc-h1" });
    h1.innerHTML = italicizePivot(data.title || "Resource");
    inner.appendChild(h1);
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
    // The h2 already greets ("Hey, I'm Ivan.") — strip any leading "Hey," / "Hey there," / "Hi," etc.
    // from the intro paragraph so we don't double-greet.
    welcomeLine = welcomeLine.replace(/^\s*(hey(\s+there)?|hi(\s+there)?|hello)[,\s]*/i, "").replace(/^./, function (c) { return c.toUpperCase(); });
    var pointA = intro.point_time || (data.estimated_minutes ? data.estimated_minutes + " min, at your pace" : "At your own pace");
    var pointB = intro.point_value || opts.defaultValueBullet || "Built to give you the sharpest observation on your team's gaps";
    var pointC = intro.point_next  || opts.defaultNextBullet  || "Your progress auto-saves to this browser. Email only if you want the full report.";
    var startLabel = (opts.startLabel || "Start");
    // Default note removed — was over-disclaimering ("No signup required. Scroll back up anytime to reread.")
    var note = intro.note || opts.defaultNote || "";

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

  // ── Edit mode (lazy-loaded only when ?edit=<token> in URL) ─────────────
  var editModeState = {
    enabled: false,
    token: null,
    sessionFlag: "ivan.lm.edit_session",
    fields: [],         // [{el, path, opts}]
    arrays: [],         // [{el, arrayPath, opts}]
  };

  function editModeIsLoaded() { return !!window.__LM_EDIT_MODE_LOADED; }

  function editModeRegisterField(el, path, opts) {
    if (!el) return el;
    // Always buffer — flush on mount even if token check is still in flight
    editModeState.fields.push({ el: el, path: path, opts: opts || {} });
    if (editModeState.enabled && editModeIsLoaded() && window.__LM_EDIT_MODE_API) {
      window.__LM_EDIT_MODE_API.attachField(el, path, opts || {});
    }
    return el;
  }

  function editModeRegisterArray(el, arrayPath, opts) {
    if (!el) return el;
    editModeState.arrays.push({ el: el, arrayPath: arrayPath, opts: opts || {} });
    if (editModeState.enabled && editModeIsLoaded() && window.__LM_EDIT_MODE_API) {
      window.__LM_EDIT_MODE_API.attachArray(el, arrayPath, opts || {});
    }
    return el;
  }

  function loadEditModeAssets() {
    if (editModeIsLoaded()) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://resources.ivanmanfredi.com/_engine/edit-mode.css";
      document.head.appendChild(link);
      var script = document.createElement("script");
      script.src = "https://resources.ivanmanfredi.com/_engine/edit-mode.js";
      script.onload = function () {
        // edit-mode.js sets window.__LM_EDIT_MODE_LOADED = true
        // and window.__LM_EDIT_MODE_API = { attachField, attachArray, mount }
        if (!window.__LM_EDIT_MODE_API) {
          reject(new Error("edit-mode.js loaded but API not exposed"));
          return;
        }
        // Wait for the engine's render() to set window.__lm_format + window.__lm_data
        // before mounting. Without this, mount fires with format=null on fast cache hits.
        var attempts = 0;
        function tryMount() {
          if (window.__lm_format && window.__lm_data) {
            // Flush any registered fields/arrays buffered before edit-mode.js loaded
            editModeState.fields.forEach(function (f) {
              window.__LM_EDIT_MODE_API.attachField(f.el, f.path, f.opts);
            });
            editModeState.arrays.forEach(function (a) {
              window.__LM_EDIT_MODE_API.attachArray(a.el, a.arrayPath, a.opts);
            });
            window.__LM_EDIT_MODE_API.mount({
              token: editModeState.token,
              slug: window.__lm_slug || (window.__lm_data && window.__lm_data.slug),
              format: window.__lm_format,
              data: window.__lm_data,
            });
            resolve();
          } else if (++attempts < 60) {  // ~6s total wait at 100ms intervals
            setTimeout(tryMount, 100);
          } else {
            reject(new Error("Timed out waiting for engine to set __lm_format / __lm_data"));
          }
        }
        tryMount();
      };
      script.onerror = function () { reject(new Error("edit-mode.js failed to load")); };
      document.head.appendChild(script);
    });
  }

  function editModeMaybeEnable() {
    try {
      var params = new URLSearchParams(location.search);
      var token = params.get("edit");
      if (!token) return Promise.resolve(false);
      // Check sessionStorage first to avoid round-trip on every page load
      var cached = null;
      try { cached = JSON.parse(sessionStorage.getItem(editModeState.sessionFlag) || "null"); } catch (_) {}
      if (cached && cached.token === token && cached.expires_at > Date.now()) {
        editModeState.enabled = true;
        editModeState.token = token;
        // Replace LM.beacon with no-op (mitigation #6)
        window.LM.beacon = function () {};
        return loadEditModeAssets().then(function () { return true; });
      }
      return fetch(BEACON.replace(/\/lm-beacon$/, "/lm-edit-token-check"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token }),
      })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j.ok) return false;
          editModeState.enabled = true;
          editModeState.token = token;
          try {
            sessionStorage.setItem(editModeState.sessionFlag, JSON.stringify({
              token: token, expires_at: j.expires_at,
            }));
          } catch (_) {}
          // Replace LM.beacon with no-op (mitigation #6)
          window.LM.beacon = function () {};
          return loadEditModeAssets().then(function () { return true; });
        })
        .catch(function () { return false; });
    } catch (_) { return Promise.resolve(false); }
  }

  // ── Share helpers ──────────────────────────────────────────────────────
  function shareUrlWithUtm(base, source) {
    var u = new URL(base, location.origin);
    u.searchParams.set("utm_source", source);
    u.searchParams.set("utm_medium", "referral");
    u.searchParams.set("utm_campaign", window.__lm_slug || "lm");
    return u.toString();
  }

  function shareLinkedIn(text, url) {
    var u = shareUrlWithUtm(url || location.href, "linkedin-share");
    return "https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent(u) + "&summary=" + encodeURIComponent(text || "");
  }

  function shareWhatsApp(text, url) {
    var u = shareUrlWithUtm(url || location.href, "whatsapp-share");
    return "https://wa.me/?text=" + encodeURIComponent((text ? text + "\n\n" : "") + u);
  }

  function shareCopy(url) {
    var u = shareUrlWithUtm(url || location.href, "copy-link");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(u).then(function () { return true; });
    }
    return Promise.resolve(false);
  }

  // ── Sticky progress header removed — engines have their own native progress UI.
  // Kept as no-ops so any lingering engine calls don't throw.
  function progressMount() {}
  function progressUpdate() {}

  // ── Footer rebrand (2026-05-21) ─────────────────────────────────────────
  // Per-LM HTML wrapper ships a generic .im-footer-cta block. Replace its
  // inner copy with editorial brand markup (mono label / italic DM Serif h2 /
  // Source Serif p / paper-on-ink CTA). Restyling is in shared.css.
  // Copy lives here because it's the same call-to-build for every LM.
  //
  // Some engines (guide, ai-walkthrough, etc.) have a minimal per-LM HTML
  // wrapper that doesn't include .im-footer at all. For those we INJECT the
  // full footer at the end of <body>.
  function rebrandFooter() {
    var footer = document.querySelector(".im-footer");
    if (!footer) {
      // Inject a fresh editorial footer. Reuses .im-footer styles defined in
      // shared.css so the look matches the per-LM-wrapped engines.
      footer = document.createElement("footer");
      footer.className = "im-footer";
      footer.innerHTML =
        '<div class="im-footer-inner">' +
          '<div class="im-footer-cta"></div>' +
          '<div class="im-footer-meta"></div>' +
        '</div>';
      document.body.appendChild(footer);
    }
    var cta = footer.querySelector(".im-footer-cta");
    if (cta) {
      // Footer pattern lifted from Lemonade-style demand-gen agency CTAs:
      // mono label / outcome question h2 / receipts + invitation body / button.
      // Voice anchors: "scale without scaling payroll" + "Agent-Ready Ops"
      // are Ivan's signature pivots per Voice §0. Italicize "scaling payroll".
      cta.innerHTML =
        '<span class="im-footer-label">Work with me</span>' +
        '<h2 class="im-footer-h">Ready to scale without <em>scaling payroll</em>?</h2>' +
        '<p class="im-footer-p">See how I build Agent-Ready Ops systems that survive past pilot. 40+ live across eight industries. Book a free strategy call.</p>' +
        '<a class="im-footer-btn" href="https://calendly.com/ivan-intelligents/30min" target="_blank" rel="noopener" data-footer-cta>Book a Call</a>';
      var btn = cta.querySelector("[data-footer-cta]");
      if (btn) btn.addEventListener("click", function () { beacon("footer", "cta_click", { answers: { target: "footer_calendly" } }); });
    }
    // Replace footer meta line with cleaner brand-correct version
    var meta = footer.querySelector(".im-footer-meta");
    if (meta) {
      var year = new Date().getFullYear();
      meta.innerHTML =
        '<span>© ' + year + ' Iván Manfredi</span>' +
        '<span><a href="https://ivanmanfredi.com">ivanmanfredi.com</a></span>';
    }
  }

  // ── Resource tracker removed — was a "could be cool" Netflix-style widget,
  // but Ivan's audience arrives via DM/comment-gate for ONE specific LM, not browsing.
  // Kept as no-op so existing engine calls to LM.tracker.touch() don't throw.
  function trackerTouch() {}

  window.LM = {
    make: make, esc: esc, toast: toast, emailIsValid: emailIsValid,
    beacon: beacon, canonicalBeaconEvent: canonicalBeaconEvent,
    readerIdentity: readerIdentity, updateReader: updateReader,
    readKV: readKV, writeKV: writeKV, removeKV: removeKV,
    observeReveal: observeReveal,
    buildHero: buildHero, buildIntro: buildIntro,
    tierFor: tierFor,
    editMode: {
      enabled: function () { return editModeState.enabled; },
      registerField: editModeRegisterField,
      registerArray: editModeRegisterArray,
      maybeEnable: editModeMaybeEnable,
    },
    tracker: { touch: trackerTouch },  // no-op stub, see comment above
    progress: {
      mount: progressMount,
      update: progressUpdate,
    },
    share: {
      linkedIn: shareLinkedIn,
      whatsapp: shareWhatsApp,
      copy: shareCopy,
    },
  };

  // ── Capture enhancer (2026-05-21) ─────────────────────────────────────
  // Each engine renders its own .lmc-capture (PDF/email gate) — but the
  // calendly footer is way below the fold and most readers stop at the
  // capture form. Append a small secondary "Or book a call directly →"
  // link inside every capture card so high-intent readers don't have to
  // scroll past the email gate to find the calendly CTA.
  // Uses MutationObserver because engines render asynchronously after the
  // data.json fetch completes (post-DOMContentLoaded).
  function enhanceCapture(captureEl) {
    if (!captureEl || captureEl.dataset.lmEnhanced === "1") return;
    captureEl.dataset.lmEnhanced = "1";
    var alt = document.createElement("a");
    alt.className = "lmc-capture-alt";
    alt.href = "https://calendly.com/ivan-intelligents/30min";
    alt.target = "_blank";
    alt.rel = "noopener";
    alt.innerHTML = "Or skip the PDF and <strong>book a 30-minute call</strong> directly →";
    alt.addEventListener("click", function () { beacon("capture", "cta_click", { answers: { target: "capture_calendly_alt" } }); });
    var note = captureEl.querySelector(".lmc-note");
    if (note && note.parentNode === captureEl) {
      captureEl.insertBefore(alt, note);
    } else {
      captureEl.appendChild(alt);
    }
  }
  function scanCaptures() {
    document.querySelectorAll(".lmc-capture").forEach(enhanceCapture);
  }

  // Expose for engines / debugging
  window.LM.rebrandFooter = rebrandFooter;
  window.LM.italicizePivot = italicizePivot;
  window.LM.enhanceCapture = enhanceCapture;

  // Auto-trigger edit-mode check + footer rebrand on DOMContentLoaded.
  // Each engine also checks LM.editMode.enabled() before assuming non-edit context.
  function bootstrapShared() {
    editModeMaybeEnable();
    rebrandFooter();
    scanCaptures();
    // Engines render asynchronously after data.json fetch — watch the LM
    // root for late-arriving .lmc-capture nodes.
    try {
      var root = document.getElementById("lmc-root") || document.querySelector("[id$='-root']") || document.body;
      var mo = new MutationObserver(function () { scanCaptures(); });
      mo.observe(root, { childList: true, subtree: true });
      // Stop observing after 30s to avoid leaks on long-lived pages.
      setTimeout(function () { try { mo.disconnect(); } catch (_) {} }, 30000);
    } catch (_) {}
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrapShared);
  } else {
    bootstrapShared();
  }
})();
