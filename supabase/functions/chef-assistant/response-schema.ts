export const RESPONSE_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["schema", "version", "answer", "evidence_mode", "source_usage", "assumptions", "cautions"],
  properties: {
    schema: { type: "string", enum: ["cucina-hub.chef-assistant.response"] },
    version: { type: "integer", enum: [1] },
    answer: { type: "string" },
    evidence_mode: { type: "string", enum: ["sources", "mixed", "general"] },
    source_usage: { type: "array", items: { type: "object", additionalProperties: false, required: ["source_id", "usage"], properties: { source_id: { type: "string" }, usage: { type: "string" } } } },
    assumptions: { type: "array", items: { type: "string" } },
    cautions: { type: "array", items: { type: "string" } },
  },
} as const;
