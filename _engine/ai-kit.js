/* AI Kit engine — file-kit browser for downloadable Claude systems (AI Kit +
 * Skill Pack formats). Data.json shape:
 * { slug, title, subtitle, format_label?, kit_name, estimated_minutes?,
 *   intro?, closing_cta?, files: [
 *     { path, folder, name, description, user_editable, content } ] } */
(function () {
  "use strict";
  if (!window.LM) { console.error("shared.js not loaded"); return; }
  var L = window.LM;

  var GROUP_ORDER = ["", "context", "system"];
  var GROUP_LABEL = { "": "Kit root", context: "context/ · you fill these in", system: "system/ · the methodology" };

  function groupFiles(files) {
    var groups = {};
    (files || []).forEach(function (f) {
      var key = f.folder || "";
      if (!groups[key]) groups[key] = [];
      groups[key].push(f);
    });
    var keys = Object.keys(groups).sort(function (a, b) {
      var ia = GROUP_ORDER.indexOf(a), ib = GROUP_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    return keys.map(function (k) { return { key: k, label: GROUP_LABEL[k] || (k + "/"), files: groups[k] }; });
  }

  // --- Quick start (3 steps, editorial numerals) ---
  function buildQuickStart(data) {
    var sec = L.make("section", { class: "lmk-quickstart lmk-reveal", "aria-label": "Quick start" });
    var steps = [
      { n: "1", h: "Download the kit", p: "Grab the ZIP below. Unzip it into a folder. That folder is the system." },
      { n: "2", h: "Fill in your context", p: "Open the files in context/ and replace the [BRACKETS] with your business. Ten minutes, once." },
      { n: "3", h: "Run it with Claude", p: "Open the folder in Claude Code (or paste CLAUDE.md into a Claude Project) and follow the orchestrator." },
    ];
    sec.innerHTML =
      '<h2 class="lmk-qs-h">Up and running in <em>three steps</em></h2>' +
      '<div class="lmk-qs-grid">' +
      steps.map(function (s) {
        return '<div class="lmk-qs-step">' +
          '<span class="lmk-qs-num">' + s.n + '</span>' +
          '<h3>' + L.esc(s.h) + '</h3>' +
          '<p>' + L.esc(s.p) + '</p>' +
        '</div>';
      }).join("") +
      '</div>';
    return sec;
  }

  // --- Download band ---
  function lazyJszip() {
    return new Promise(function (resolve, reject) {
      if (window.JSZip) return resolve(window.JSZip);
      var s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
      s.onload = function () { resolve(window.JSZip); };
      s.onerror = function () { reject(new Error("ZIP library failed to load")); };
      document.head.appendChild(s);
    });
  }

  function downloadBlob(blob, filename) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  function buildDownloadBand(data) {
    var files = data.files || [];
    var editable = files.filter(function (f) { return f.user_editable; }).length;
    var sec = L.make("section", { class: "lmk-download lmk-reveal", "aria-label": "Download the kit" });
    sec.innerHTML =
      '<div class="lmk-dl-inner">' +
        '<div class="lmk-dl-copy">' +
          '<div class="lmk-dl-label">' + L.esc(data.format_label || "AI Kit") + '</div>' +
          '<h2 class="lmk-dl-h">The whole system, <em>one folder</em></h2>' +
          '<p class="lmk-dl-p">' + files.length + " files. " + editable + " you customize, the rest works out of the box. Browse every file below before you download. Nothing is hidden behind the ZIP.</p>" +
        '</div>' +
        '<div class="lmk-dl-action">' +
          '<button class="lmc-btn lmk-dl-btn" type="button">Download the kit <span aria-hidden="true">↓</span></button>' +
          '<span class="lmk-dl-note">.zip · markdown files · no email required</span>' +
        '</div>' +
      '</div>';
    sec.querySelector(".lmk-dl-btn").addEventListener("click", function () {
      var btn = this;
      btn.disabled = true; btn.textContent = "Packing…";
      L.beacon("ai-kit", "download", { kit: data.kit_name, files: files.length });
      lazyJszip().then(function (JSZip) {
        var zip = new JSZip();
        var rootName = data.kit_name || data.slug || "ai-kit";
        files.forEach(function (f) { zip.file(rootName + "/" + (f.path || f.name), f.content || ""); });
        return zip.generateAsync({ type: "blob" });
      }).then(function (blob) {
        downloadBlob(blob, (data.kit_name || data.slug || "ai-kit") + ".zip");
        btn.disabled = false; btn.innerHTML = 'Download the kit <span aria-hidden="true">↓</span>';
        L.toast("Kit downloaded. Unzip and open in Claude Code.");
      }).catch(function () {
        btn.disabled = false; btn.innerHTML = 'Download the kit <span aria-hidden="true">↓</span>';
        L.toast("ZIP failed to build — use the per-file download buttons below.");
      });
    });
    return sec;
  }

  // --- File browser ---
  function buildBrowser(data) {
    var files = data.files || [];
    var sec = L.make("section", { class: "lmk-files lmk-reveal", id: "lmk-files", "aria-label": "Kit files" });
    sec.appendChild(L.make("h2", { class: "lmk-files-h" }, "What's inside"));

    var wrap = L.make("div", { class: "lmk-browser" });
    var tree = L.make("nav", { class: "lmk-tree", "aria-label": "Kit file list" });
    var viewer = L.make("div", { class: "lmk-viewer" });

    var active = null;
    function show(f, btn) {
      if (active) active.classList.remove("is-active");
      active = btn; btn.classList.add("is-active");
      viewer.innerHTML =
        '<div class="lmk-view-head">' +
          '<div class="lmk-view-meta">' +
            '<span class="lmk-view-path">' + L.esc(f.path || f.name) + '</span>' +
            (f.user_editable ? '<span class="lmk-pill lmk-pill-edit">you edit this</span>' : '<span class="lmk-pill">pre-built</span>') +
          '</div>' +
          '<div class="lmk-view-actions">' +
            '<button class="lmk-mini-btn" type="button" data-act="copy">Copy</button>' +
            '<button class="lmk-mini-btn" type="button" data-act="file">Download</button>' +
          '</div>' +
        '</div>' +
        (f.description ? '<p class="lmk-view-desc">' + L.esc(f.description) + '</p>' : '') +
        '<pre class="lmk-code"><code></code></pre>';
      viewer.querySelector("code").textContent = f.content || "";
      viewer.querySelector('[data-act="copy"]').addEventListener("click", function () {
        navigator.clipboard.writeText(f.content || "").then(function () {
          L.toast("Copied " + (f.name || "file"));
          L.beacon("ai-kit", "copy", { file: f.path });
        });
      });
      viewer.querySelector('[data-act="file"]').addEventListener("click", function () {
        downloadBlob(new Blob([f.content || ""], { type: "text/markdown" }), f.name || "file.md");
        L.beacon("ai-kit", "download", { file: f.path });
      });
      L.beacon("ai-kit", "file_view", { file: f.path });
    }

    groupFiles(files).forEach(function (g) {
      tree.appendChild(L.make("div", { class: "lmk-tree-label" }, g.label));
      g.files.forEach(function (f) {
        var btn = L.make("button", { class: "lmk-tree-file", type: "button" });
        btn.innerHTML = '<span class="lmk-tree-name">' + L.esc(f.name || f.path) + '</span>' +
          (f.user_editable ? '<span class="lmk-dot" title="You fill this in" aria-label="You fill this in"></span>' : '');
        btn.addEventListener("click", function () { show(f, btn); });
        tree.appendChild(btn);
      });
    });

    wrap.appendChild(tree);
    wrap.appendChild(viewer);
    sec.appendChild(wrap);

    // Open CLAUDE.md (or first file) by default
    var first = files.filter(function (f) { return /^claude\.md$/i.test(f.name || ""); })[0] || files[0];
    if (first) {
      var idx = files.indexOf(first);
      var btns = tree.querySelectorAll(".lmk-tree-file");
      if (btns[idx]) show(first, btns[idx]);
    }
    return sec;
  }

  function render(data, root) {
    root.innerHTML = "";
    root.classList.add("lmk-page");
    var files = data.files || [];
    var editable = files.filter(function (f) { return f.user_editable; }).length;

    root.appendChild(L.buildHero(data, {
      badge: data.format_label || "AI Kit",
      metaChips: [
        files.length + " files",
        editable + " you customize",
        "Claude Code ready",
        "Free resource",
      ],
    }));

    root.appendChild(L.buildIntro(data, "#lmk-files", {
      tool_type: "ai-kit",
      startLabel: "See what's inside",
      defaultValueBullet: "A working Claude system, not a PDF about one",
      defaultNextBullet: "Browse every file first — download only if it earns it",
    }));

    var container = L.make("div", { class: "lmc-container lmk-root" });
    container.appendChild(buildQuickStart(data));
    // Plugin install strip (primary path); the ZIP band below stays as the
    // no-install secondary affordance. Renders only for kits mapped to a
    // manfredi-marketplace plugin.
    if (L.buildInstallStrip) {
      var installStrip = L.buildInstallStrip("ai-kit", data);
      if (installStrip) container.appendChild(installStrip);
    }
    container.appendChild(buildDownloadBand(data));
    container.appendChild(buildBrowser(data));
    root.appendChild(container);

    // Model-currency line (Spec 3): "Tested against <current models> (as of
    // <confirmed date>)." Rendered at view time from /frontier.json so it can
    // never go stale with the page; absent entirely when no confirmed data.
    if (L.frontier) {
      L.frontier.load().then(function () {
        var line = L.frontier.testedLine();
        if (!line) return;
        var el = L.make("div", { class: "lmk-currency-line", style: "max-width:860px;margin:0 auto;padding:0 1.5rem 2rem;font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:.75rem;letter-spacing:.05em;color:rgba(19, 18, 16,.55)" }, line);
        container.appendChild(el);
      });
    }

    root.appendChild(L.buildClosingCta("ai-kit", data, { toolType: "ai-kit" }));

    L.observeReveal(root, ".lmk-reveal");
    L.beacon("ai-kit", "view");
  }

  document.addEventListener("DOMContentLoaded", function () {
    var root = document.querySelector("[data-lm-ai-kit-src]") || document.querySelector("#lmc-root");
    if (!root) return;
    var defaultSrc = root.getAttribute("data-lm-ai-kit-src") || "./data.json";
    var params = new URLSearchParams(location.search);
    var src = params.get("preview") === "draft" ? "./data.draft.json" : defaultSrc;
    fetch(src, { credentials: "same-origin" })
      .then(function (r) {
        if (params.get("preview") === "draft" && !r.ok) {
          return fetch(defaultSrc, { credentials: "same-origin" }).then(function (r2) {
            if (!r2.ok) throw new Error("data.json " + r2.status);
            return r2.json();
          });
        }
        if (!r.ok) throw new Error("data.json " + r.status);
        return r.json();
      })
      .then(function (data) { render(data, root); })
      .catch(function (e) {
        root.innerHTML = '<div style="padding:2rem;color:#a00"><strong>Error loading kit:</strong> ' + L.esc(e.message) + "</div>";
      });
  });
})();
