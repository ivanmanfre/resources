/* LM Checklist Engine — vanilla JS, reads data.json, persists to localStorage, email-gated capture, beacon-integrated */
(function () {
  "use strict";
  var BEACON = window.__lm_beacon_url || "https://bjbvqvzbzczjbatgmccb.supabase.co/functions/v1/lm-beacon";

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function make(tag, attrs, html) { var e = document.createElement(tag); if (attrs) for (var k in attrs) { if (k === "class") e.className = attrs[k]; else e.setAttribute(k, attrs[k]); } if (html !== undefined) e.innerHTML = html; return e; }
  function escapeHtml(s) { return String(s || "").replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }

  function toast(msg) {
    var t = $("#lmc-toast");
    if (!t) { t = make("div", { id: "lmc-toast", class: "lmc-toast" }); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    setTimeout(function () { t.classList.remove("show"); }, 2500);
  }

  function beacon(event_type, payload) {
    try {
      var q = new URLSearchParams(location.search);
      var body = Object.assign({
        event_type: event_type,
        lm_slug: window.__lm_slug || (window.__lm_data && window.__lm_data.slug) || "",
        src: q.get("src") || "direct",
        utm: { source: q.get("utm_source"), medium: q.get("utm_medium"), campaign: q.get("utm_campaign") },
        prospect_id: q.get("pid") || null,
        referrer: document.referrer || ""
      }, payload || {});
      if (navigator.sendBeacon) {
        navigator.sendBeacon(BEACON, new Blob([JSON.stringify(body)], { type: "application/json" }));
      } else {
        fetch(BEACON, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(function () {});
      }
    } catch (_) {}
  }

  function loadState(slug) { try { return JSON.parse(localStorage.getItem("ivan.checklist." + slug) || "{}"); } catch (_) { return {}; } }
  function saveState(slug, state) { try { localStorage.setItem("ivan.checklist." + slug + ".checked", JSON.stringify(state.checked || {})); localStorage.setItem("ivan.checklist." + slug + ".email", state.email || ""); } catch (_) {} }
  function readState(slug) {
    var checked = {}; var email = "";
    try { checked = JSON.parse(localStorage.getItem("ivan.checklist." + slug + ".checked") || "{}"); } catch (_) {}
    try { email = localStorage.getItem("ivan.checklist." + slug + ".email") || ""; } catch (_) {}
    return { checked: checked, email: email };
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
    var img = make("img", { class: "lmc-intro-avatar", src: "https://ivanmanfredi.com/ivan-portrait.jpg", alt: "Ivan Manfredi" });
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
    var state = readState(data.slug);
    root.innerHTML = "";

    // Hero
    var hero = make("section", { class: "lmc-hero" });
    var heroInner = make("div", { class: "lmc-container" });
    heroInner.appendChild(make("div", { class: "lmc-badge" }, escapeHtml(data.brand && data.brand.hero_badge || "Action Checklist")));
    heroInner.appendChild(make("h1", { class: "lmc-h1" }, escapeHtml(data.title || "Checklist")));
    if (data.subtitle) heroInner.appendChild(make("p", { class: "lmc-sub" }, escapeHtml(data.subtitle)));
    var meta = make("div", { class: "lmc-meta" });
    var total = 0; (data.sections || []).forEach(function (s) { total += (s.items || []).length; });
    meta.appendChild(make("div", { class: "lmc-meta-chip" }, total + " items"));
    if (data.estimated_minutes) meta.appendChild(make("div", { class: "lmc-meta-chip" }, data.estimated_minutes + " min"));
    meta.appendChild(make("div", { class: "lmc-meta-chip" }, "Auto-saves"));
    heroInner.appendChild(meta);
    hero.appendChild(heroInner);
    root.appendChild(hero);

    var introSection = buildIntro(data, ".lmc-progress-wrap", {
      defaultValueBullet: "Built to find the 3 highest-impact gaps in about 30 min",
      defaultNextBullet: "Email only if you want a tailored follow-up with the gaps you didn't check",
      startLabel: "Start the checklist",
      defaultNote: "No signup to use it. Check items off; progress auto-saves in this browser."
    });
    root.appendChild(introSection);

    // Progress bar (sticky)
    var prog = make("div", { class: "lmc-progress-wrap" });
    prog.innerHTML = '<div class="lmc-progress-inner"><span id="lmc-prog-label">0 / ' + total + ' complete</span><div class="lmc-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + total + '" aria-valuenow="0"><div class="lmc-progress-fill" id="lmc-prog-fill"></div></div><span id="lmc-prog-pct">0%</span></div>';
    root.appendChild(prog);

    // Sections
    var content = make("main", { class: "lmc-container" });
    (data.sections || []).forEach(function (s) {
      var sec = make("section", { class: "lmc-section" });
      sec.appendChild(make("h2", { class: "lmc-section-title" }, escapeHtml(s.title || "")));
      if (s.description) sec.appendChild(make("p", { class: "lmc-section-desc" }, escapeHtml(s.description)));
      (s.items || []).forEach(function (it) {
        var row = make("div", { class: "lmc-item" + (state.checked[it.id] ? " checked" : "") });
        row.setAttribute("data-item-id", it.id);
        var box = make("button", { class: "lmc-checkbox" + (state.checked[it.id] ? " checked" : ""), type: "button", role: "checkbox", "aria-checked": state.checked[it.id] ? "true" : "false", "aria-label": "Toggle: " + (it.text || "item") });
        box.innerHTML = state.checked[it.id] ? "&#10003;" : "";
        var txt = make("div", { class: "lmc-text" });
        txt.appendChild(make("span", null, escapeHtml(it.text || "")));
        if (it.tip) txt.appendChild(make("span", { class: "lmc-tip" }, escapeHtml(it.tip)));
        if (it.impact) {
          var imp = make("span", { class: "lmc-impact lmc-impact-" + it.impact }, (it.impact || "").toUpperCase() + " IMPACT");
          txt.appendChild(imp);
        }
        row.appendChild(box); row.appendChild(txt);
        sec.appendChild(row);
      });
      content.appendChild(sec);
    });

    // Completion banner — appears when all items are checked
    var completeBanner = make("div", { class: "lmc-complete-banner", "aria-live": "polite" });
    completeBanner.innerHTML =
      '<h3>Every box checked. <em>Now ship it.</em></h3>' +
      '<p>You just mapped the full gap set. Pick the 3 highest-impact items, assign them this week, and re-run this audit in 30 days to verify they stuck.</p>';
    content.appendChild(completeBanner);

    // Capture (collapsed until 50% done)
    var cta = data.completion_cta || {};
    var capture = make("section", { class: "lmc-capture", id: "lmc-capture", "aria-hidden": "false" });
    capture.innerHTML =
      '<h2>' + escapeHtml(cta.headline || "Want the fix for your top 3 gaps?") + '</h2>' +
      '<p>' + escapeHtml(cta.description || "Enter your email and I'll send you a tailored automation plan based on what you didn't check.") + '</p>' +
      '<form class="lmc-form" id="lmc-capture-form">' +
      '<label class="sr-only" for="lmc-email">Email</label>' +
      '<input class="lmc-input" id="lmc-email" name="email" type="email" autocomplete="email" required placeholder="you@company.com" value="' + escapeHtml(state.email) + '" />' +
      '<button class="lmc-btn" type="submit">Email me my plan</button>' +
      '</form>' +
      '<p class="lmc-note">No spam. One email, then you decide.</p>';
    content.appendChild(capture);

    // Footer actions
    var actions = make("div", { class: "lmc-footer-actions" });
    actions.innerHTML =
      '<button class="lmc-btn lmc-btn-secondary" id="lmc-copy-md" type="button">Copy as Markdown</button>' +
      '<button class="lmc-btn lmc-btn-secondary" id="lmc-reset" type="button">Reset progress</button>';
    content.appendChild(actions);
    root.appendChild(content);

    // Wire up
    function update() {
      var current = readState(data.slug);
      var done = 0, highGaps = 0, totalItems = 0;
      (data.sections || []).forEach(function (s) {
        (s.items || []).forEach(function (it) {
          totalItems++;
          if (current.checked[it.id]) done++;
          else if (it.impact === "high") highGaps++;
        });
      });
      var pct = totalItems ? Math.round((done / totalItems) * 100) : 0;
      var fill = $("#lmc-prog-fill"); if (fill) fill.style.width = pct + "%";
      var pctEl = $("#lmc-prog-pct"); if (pctEl) pctEl.textContent = pct + "%";
      var lbl = $("#lmc-prog-label"); if (lbl) lbl.textContent = done + " / " + totalItems + " complete" + (highGaps ? " · " + highGaps + " high-impact gap" + (highGaps === 1 ? "" : "s") : "");
      var bar = document.querySelector(".lmc-progress-bar"); if (bar) bar.setAttribute("aria-valuenow", done);
      // Completion flourish
      root.classList.toggle("complete", pct === 100 && totalItems > 0);
    }
    update();

    // Scroll-triggered entrance for sections + items (editorial reveal)
    try {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) { entry.target.classList.add("in-view"); io.unobserve(entry.target); }
        });
      }, { root: null, rootMargin: "0px 0px -10% 0px", threshold: 0.08 });
      root.querySelectorAll(".lmc-section, .lmc-item").forEach(function (el, i) {
        // Tiny stagger so rows don't all pop at once
        el.style.transitionDelay = Math.min(i, 8) * 40 + "ms";
        io.observe(el);
      });
    } catch (_) {
      // Older browsers without IntersectionObserver — just reveal everything immediately.
      root.querySelectorAll(".lmc-section, .lmc-item").forEach(function (el) { el.classList.add("in-view"); });
    }

    // Checkbox toggles
    root.querySelectorAll(".lmc-item").forEach(function (row) {
      row.addEventListener("click", function (e) {
        if (e.target.closest("a")) return;
        var id = row.getAttribute("data-item-id");
        var st = readState(data.slug);
        st.checked = st.checked || {};
        st.checked[id] = !st.checked[id];
        saveState(data.slug, st);
        row.classList.toggle("checked", !!st.checked[id]);
        var box = row.querySelector(".lmc-checkbox");
        if (box) { box.classList.toggle("checked", !!st.checked[id]); box.setAttribute("aria-checked", st.checked[id] ? "true" : "false"); box.innerHTML = st.checked[id] ? "&#10003;" : ""; }
        update();
        beacon("cta_click", { answers: { item_id: id, checked: !!st.checked[id] } });
      });
    });

    // Capture form
    var form = $("#lmc-capture-form");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var email = ($("#lmc-email") || {}).value || "";
        if (!email || email.indexOf("@") === -1) { toast("Enter a valid email"); return; }
        var st = readState(data.slug); st.email = email; saveState(data.slug, st);
        var unchecked = [];
        (data.sections || []).forEach(function (s) { (s.items || []).forEach(function (it) { if (!st.checked[it.id]) unchecked.push({ section: s.id, item_id: it.id, impact: it.impact || null, text: (it.text || "").slice(0, 200) }); }); });
        beacon("capture", { email: email, answers: { unchecked: unchecked, completion_pct: Math.round(((Object.keys(st.checked).filter(function (k) { return st.checked[k]; }).length) / (function(){var n=0;(data.sections||[]).forEach(function(s){n+=(s.items||[]).length;});return n||1;})()) * 100) } });
        toast("Got it. Check your inbox in the next few minutes.");
        form.innerHTML = '<p style="font-weight:700;color:#00E676">&#10003; Sent to ' + escapeHtml(email) + '. If it doesn\'t arrive, check Promotions.</p>';
      });
    }

    // Copy-as-markdown
    var copyBtn = $("#lmc-copy-md");
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        var md = "# " + (data.title || "Checklist") + "\n\n";
        var st = readState(data.slug);
        (data.sections || []).forEach(function (s) {
          md += "\n## " + (s.title || "") + "\n\n";
          (s.items || []).forEach(function (it) {
            md += "- [" + (st.checked[it.id] ? "x" : " ") + "] " + (it.text || "") + (it.impact ? "  *(" + it.impact + " impact)*" : "") + "\n";
          });
        });
        md += "\n---\nFrom Ivan Manfredi: " + location.href;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(md).then(function () { toast("Copied Markdown to clipboard"); });
        } else {
          toast("Copy not supported in this browser");
        }
        beacon("share", { answers: { format: "markdown" } });
      });
    }

    // Reset
    var resetBtn = $("#lmc-reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        if (!confirm("Clear all checkmarks for this checklist?")) return;
        try { localStorage.removeItem("ivan.checklist." + data.slug + ".checked"); } catch (_) {}
        location.reload();
      });
    }

    // Fire view
    beacon("view", {});
  }

  function init() {
    var root = document.getElementById("lmc-root") || document.querySelector("[data-lm-checklist-src]");
    if (!root) return;
    var src = root.getAttribute("data-lm-checklist-src") || "./data.json";
    fetch(src, { credentials: "same-origin" }).then(function (r) { if (!r.ok) throw new Error("data.json " + r.status); return r.json(); }).then(function (data) {
      render(data, root);
    }).catch(function (e) {
      root.innerHTML = '<div style="padding:2rem;color:#a00"><strong>Error loading checklist:</strong> ' + escapeHtml(e.message) + '</div>';
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
