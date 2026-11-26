/**
 * Converts the JSON Schema used for Claude tools into the OpenAPI-style
 * schema that Gemini's `responseSchema` accepts:
 * - `type: ["string", "null"]` becomes `type: "string", nullable: true`
 * - object properties are all listed in `propertyOrdering` so output is stable
 */
export function toGeminiSchema(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== "object") return {};
  const src = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  let type = src.type;
  if (Array.isArray(type)) {
    const nonNull = type.filter((t) => t !== "null");
    if (nonNull.length !== type.length) out.nullable = true;
    type = nonNull[0] ?? "string";
  }
  if (typeof type === "string") out.type = type;
  if (typeof src.description === "string") out.description = src.description;
  if (Array.isArray(src.enum)) out.enum = src.enum;
  if (src.items) out.items = toGeminiSchema(src.items);
  if (src.properties && typeof src.properties === "object") {
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(src.properties as Record<string, unknown>)) props[k] = toGeminiSchema(v);
    out.properties = props;
    out.propertyOrdering = Object.keys(props);
  }
  if (Array.isArray(src.required)) out.required = src.required;
  return out;
}
