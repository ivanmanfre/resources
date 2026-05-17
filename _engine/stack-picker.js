/* LM Stack Picker Engine — vanilla JS, branching decision tree, hash-routed for shareability */
(function () {
  "use strict";

  function encode(path) {
    if (!Array.isArray(path) || !path.length) return "";
    return "path=" + path.map(function (p) { return p.node + ":" + p.branch; }).join(",");
  }
  function decode(hash) {
    if (!hash) return [];
    var s = String(hash).replace(/^#/, "");
    if (s.indexOf("path=") !== 0) return [];
    var body = s.slice(5);
    if (!body) return [];
    return body.split(",").filter(Boolean).map(function (pair) {
      var i = pair.indexOf(":");
      if (i < 0) return null;
      return { node: pair.slice(0, i), branch: pair.slice(i + 1) };
    }).filter(Boolean);
  }
  window.LM_SP_HASH = { encode: encode, decode: decode };
})();
