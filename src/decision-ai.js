import { buildRolePrompt, validateDecision } from "./decision-core.js";

export function buildPatchPrompt(role, decision) {
  const validation = validateDecision(decision);
  return [
    buildRolePrompt(role, decision),
    "",
    "Patch protocol:",
    "- Return only an RFC 6902 JSON Patch array.",
    "- Allowed operations: add, replace, remove.",
    "- Use JSON Pointer paths such as /open_questions/-, /evidence/0/notes, or /recommendation/confidence.",
    "- Prefer small, reviewable patches over large rewrites.",
    "- Do not remove evidence, risks, assumptions, or review fields unless the record is clearly invalid.",
    "- If no patch is warranted, return [].",
    "",
    "Current validation:",
    JSON.stringify(validation, null, 2),
    "",
    "Expected response example:",
    JSON.stringify([
      {
        op: "add",
        path: "/open_questions/-",
        value: "What evidence would most directly disconfirm the recommendation?"
      }
    ], null, 2)
  ].join("\n");
}

export function parsePatchResponse(text) {
  const source = extractJsonArray(text);
  const patch = JSON.parse(source);
  if (!Array.isArray(patch)) throw new Error("Patch response must be a JSON array");
  for (const [index, operation] of patch.entries()) {
    validatePatchOperation(operation, index);
  }
  return patch;
}

export function renderPatchReview(patch) {
  return [
    "# Patch Review",
    "",
    `Operations: ${patch.length}`,
    "",
    patch.length
      ? table(["#", "Op", "Path", "Value"], patch.map((operation, index) => [
        String(index + 1),
        operation.op,
        operation.path,
        operation.value === undefined ? "" : JSON.stringify(operation.value)
      ]))
      : "No operations proposed.",
    "",
    "## Apply",
    "",
    "```bash",
    "node bin/decision-lab.js patch decision.json proposed.patch.json",
    "```"
  ].join("\n") + "\n";
}

function extractJsonArray(text) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  if (candidate.startsWith("[")) return candidate;

  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Could not find a JSON Patch array in the response");
  }
  return candidate.slice(start, end + 1);
}

function validatePatchOperation(operation, index) {
  if (!operation || typeof operation !== "object") {
    throw new Error(`Patch operation ${index} must be an object`);
  }
  if (!["add", "replace", "remove"].includes(operation.op)) {
    throw new Error(`Patch operation ${index} has unsupported op: ${operation.op}`);
  }
  if (typeof operation.path !== "string" || !operation.path.startsWith("/")) {
    throw new Error(`Patch operation ${index} must include a JSON Pointer path`);
  }
  if (operation.op !== "remove" && !Object.hasOwn(operation, "value")) {
    throw new Error(`Patch operation ${index} must include a value`);
  }
}

function table(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`)
  ].join("\n");
}

function escapeCell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}
