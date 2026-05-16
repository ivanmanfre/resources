/* JSON Schemas for LM data.json files. Used by:
 *  - edit-mode raw JSON modal (client-side validation hint)
 *  - n8n LM Inline Edit Saver webhook (server-side gate before commit)
 *
 * Format: lightweight JSON Schema subset. Validators check:
 *  - required top-level fields
 *  - type of arrays / objects
 *  - presence of stable IDs on each item
 */
(function () {
  "use strict";
  var schemas = {
    checklist: {
      required: ["slug", "title", "sections"],
      properties: {
        slug: "string",
        title: "string",
        subtitle: "string?",
        estimated_minutes: "number?",
        sections: {
          type: "array",
          items: {
            required: ["id", "title", "items"],
            properties: {
              id: "string",
              title: "string",
              description: "string?",
              items: {
                type: "array",
                items: {
                  required: ["id", "text"],
                  properties: {
                    id: "string",
                    text: "string",
                    tip: "string?",
                    impact: "string?",
                  },
                },
              },
            },
          },
        },
        ctas: { type: "array?" },
      },
    },
    calculator: {
      required: ["slug", "title", "inputs", "outputs"],
      properties: {
        slug: "string",
        title: "string",
        subtitle: "string?",
        inputs: {
          type: "array",
          items: {
            required: ["id", "label"],
            properties: { id: "string", label: "string", type: "string?", default: "any?", min: "number?", max: "number?" },
          },
        },
        outputs: {
          type: "array",
          items: {
            required: ["id", "label", "formula"],
            properties: { id: "string", label: "string", formula: "string", format: "string?" },
          },
        },
        recommendations: { type: "array?" },
        ctas: { type: "array?" },
      },
    },
    assessment: {
      required: ["slug", "title", "categories"],
      properties: {
        slug: "string",
        title: "string",
        subtitle: "string?",
        categories: {
          type: "array",
          items: {
            required: ["id", "name", "questions"],
            properties: {
              id: "string",
              name: "string",
              questions: {
                type: "array",
                items: {
                  required: ["id", "text"],
                  properties: { id: "string", text: "string", type: "string?", weight: "number?" },
                },
              },
            },
          },
        },
        ctas: { type: "array?" },
        computed_outputs: { type: "array?" },
      },
    },
  };

  function typeOf(v) {
    if (v === null) return "null";
    if (Array.isArray(v)) return "array";
    return typeof v;
  }

  function validateAgainst(schema, value, path) {
    var errors = [];
    path = path || "$";
    if (schema.required) {
      schema.required.forEach(function (k) {
        if (value == null || value[k] == null) errors.push("Missing required field: " + path + "." + k);
      });
    }
    if (schema.properties) {
      Object.keys(schema.properties).forEach(function (k) {
        var spec = schema.properties[k];
        var v = value && value[k];
        if (v == null) return;  // optional or already flagged above
        if (typeof spec === "string") {
          var optional = spec.endsWith("?");
          var expectedType = optional ? spec.slice(0, -1) : spec;
          if (expectedType === "any") return;
          if (typeOf(v) !== expectedType) errors.push("Wrong type at " + path + "." + k + ": expected " + expectedType + ", got " + typeOf(v));
        } else if (spec.type === "array" || spec.type === "array?") {
          if (typeOf(v) !== "array") { errors.push("Expected array at " + path + "." + k); return; }
          if (spec.items) v.forEach(function (item, i) { errors = errors.concat(validateAgainst(spec.items, item, path + "." + k + "[" + i + "]")); });
        }
      });
    }
    return errors;
  }

  function validate(format, data) {
    var schema = schemas[format];
    if (!schema) return ["Unknown format: " + format];
    return validateAgainst(schema, data);
  }

  window.LM_SCHEMAS = { schemas: schemas, validate: validate };
})();
