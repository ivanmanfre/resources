/* Rise DTC AI Kit — landing. Vanilla IIFE, no build step. Email gate reveals
   the download + per-skill "copy into Claude" actions. Beacon plumbing follows
   the sibling Rise tools. */
(function () {
  "use strict";

  var SLUG = window.__lm_slug || "rise-dtc-ai-kit";
  var BEACON_URL = window.__lm_beacon_url || "https://bjbvqvzbzczjbatgmccb.supabase.co/functions/v1/lm-beacon";

  var SKILLS = [
    { id: "rise-return-rate-rescue", name: "Return Rate Rescue", lever: "Financial Health",
      blurb: "Feed it your monthly orders, AOV, return rate, and category. It shows the exact dollar amount returns cost you last year, names the severity, and hands you three moves ranked by how much each one gets back.",
      paste: "Return numbers", get: "Dollar leak + 3-move plan" },
    { id: "rise-pdp-doctor", name: "PDP Doctor", lever: "Conversion",
      blurb: "Paste one product page plus its worst return reason and the rate behind it. Get a rewrite built to sell it and stop the returns, with every missing real detail flagged instead of made up.",
      paste: "A product page", get: "Rewritten PDP + fit block + tests" },
    { id: "rise-review-angle-miner", name: "Review-to-Angles Miner", lever: "Acquisition",
      blurb: "Paste your reviews. Claude pulls out the exact words customers use to sell your product for you: 5 ad angles, 10 hooks, 3 UGC briefs, each traced to the review it came from.",
      paste: "Your reviews", get: "Angles, hooks, UGC briefs" },
    { id: "rise-winback-flows", name: "Winback Flows", lever: "Retention",
      blurb: "Tell Claude your product, repeat cycle, and where customers drop off. It writes the post-purchase and winback sequences, the segmentation, and a recovery number built from your own numbers.",
      paste: "Product + churn signal", get: "Email/SMS flows + recovery math" },
    { id: "rise-weekly-triage", name: "Weekly Store Triage", lever: "Monday cadence",
      blurb: "Every Monday, paste last week's numbers. Get the three things actually costing you money this week, ranked in dollars, with one move each and which skill in the kit fixes it.",
      paste: "Last week's numbers", get: "Ranked fix list + routing" }
  ];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
  function $(id) { return document.getElementById(id); }

  /* beacon (sibling-tool plumbing) */
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
  function beacon(event, extra) {
    try {
      var q = new URLSearchParams(location.search);
      var body = Object.assign({
        event_type: event, tool_type: "kit", lm_slug: SLUG,
        src: q.get("src") || "direct",
        utm: { source: q.get("utm_source"), medium: q.get("utm_medium"), campaign: q.get("utm_campaign") },
        prospect_id: q.get("pid") || null, referrer: document.referrer || "",
        session_id: readerIdentity().session_id
      }, extra || {});
      if (navigator.sendBeacon) {
        navigator.sendBeacon(BEACON_URL, new Blob([JSON.stringify(body)], { type: "application/json" }));
      } else {
        fetch(BEACON_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(function () {});
      }
    } catch (_) {}
  }

  function buildCards() {
    var host = $("cards");
    SKILLS.forEach(function (s) {
      var el = document.createElement("div");
      el.className = "card";
      el.innerHTML =
        '<p class="lever">' + esc(s.lever) + '</p>' +
        '<h3>' + esc(s.name) + '</h3>' +
        '<p>' + esc(s.blurb) + '</p>' +
        '<div class="io"><span><b>Paste:</b> ' + esc(s.paste) + '</span><span><b>Get:</b> ' + esc(s.get) + '</span></div>';
      host.appendChild(el);
    });
  }

  function buildSkillRows() {
    var host = $("skill-rows");
    SKILLS.forEach(function (s) {
      var row = document.createElement("div");
      row.className = "skill-row";
      row.innerHTML =
        '<div class="meta"><h4>' + esc(s.name) + '</h4><p>' + esc(s.lever) + '</p></div>' +
        '<div class="acts">' +
          '<button class="copy-btn" type="button" data-skill="' + esc(s.id) + '">Copy for Claude</button>' +
          '<a class="view-btn" href="./kit/' + esc(s.id) + '/SKILL.md" target="_blank" rel="noopener">View</a>' +
        '</div>';
      host.appendChild(row);
    });
    host.addEventListener("click", function (e) {
      var btn = e.target.closest(".copy-btn");
      if (!btn) return;
      copySkill(btn.getAttribute("data-skill"), btn);
    });
  }

  function copySkill(id, btn) {
    fetch("./kit/" + id + "/SKILL.md").then(function (r) { return r.text(); }).then(function (text) {
      var payload = text + "\n\n---\nPaste your own numbers or copy below this line, then send.\n";
      function done() {
        var label = btn.textContent;
        btn.textContent = "Copied";
        btn.classList.add("done");
        setTimeout(function () { btn.textContent = label; btn.classList.remove("done"); }, 1800);
        beacon("cta_click", { answers: { target: "copy_skill", skill: id } });
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(payload).then(done, function () { legacyCopy(payload); done(); });
      } else { legacyCopy(payload); done(); }
    }).catch(function () {
      window.open("./kit/" + id + "/SKILL.md", "_blank");
    });
  }
  function legacyCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.left = "-9999px";
      document.body.appendChild(ta); ta.select(); document.execCommand("copy");
      document.body.removeChild(ta);
    } catch (_) {}
  }

  function emailValid(e) { return /[^@\s]+@[^@\s]+\.[^@\s]+/.test(e || ""); }

  function wireGate() {
    var form = $("gate-form");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = $("g-email").value.trim();
      var store = $("g-store").value.trim();
      var ee = $("g-email-err"), se = $("g-store-err");
      ee.textContent = ""; se.textContent = "";
      var ok = true;
      if (!emailValid(email)) { ee.textContent = "Enter a valid email so we can send the kit."; ok = false; }
      if (!store) { se.textContent = "Add your store URL."; ok = false; }
      if (!ok) return;
      updateReader({ email: email });
      beacon("capture", { email: email, answers: { store_url: store, kit: "rise-dtc-ai-kit", skills: SKILLS.length } });
      $("reveal").hidden = false;
      $("reveal").scrollIntoView({ behavior: "smooth", block: "start" });
      beacon("complete", { answers: { store_url: store } });
    });
  }

  function wireDownload() {
    $("dl-kit").addEventListener("click", function () {
      beacon("cta_click", { answers: { target: "download_kit" } });
    });
  }

  function init() {
    buildCards();
    buildSkillRows();
    wireGate();
    wireDownload();
    beacon("view");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
