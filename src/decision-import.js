import fs from "node:fs";
import path from "node:path";
import { attachEvidence } from "./decision-tools.js";

export function parseEvidenceFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const content = fs.readFileSync(path.resolve(filePath), "utf8");
  if (extension === ".json") return parseEvidenceJson(content);
  if (extension === ".csv") return parseEvidenceCsv(content);
  throw new Error("Evidence import supports .csv and .json files");
}

export function importEvidenceItems(decision, items, options = {}) {
  return items.reduce((next, item) => attachEvidence(next, item, options), decision);
}

export function renderEvidenceImportReport(items, { sourcePath = "" } = {}) {
  return [
    "# Evidence Import Report",
    "",
    `Source: ${sourcePath || "inline"}`,
    `Evidence items: ${items.length}`,
    "",
    items.length
      ? table(["#", "Claim", "Source", "Strength", "Type", "Recency"], items.map((item, index) => [
        String(index + 1),
        item.claim,
        item.source,
        item.strength,
        item.source_type || "",
        item.recency || ""
      ]))
      : "No evidence items found."
  ].join("\n") + "\n";
}

function parseEvidenceJson(content) {
  const parsed = JSON.parse(content);
  const items = Array.isArray(parsed) ? parsed : parsed.evidence;
  if (!Array.isArray(items)) throw new Error("Evidence JSON must be an array or an object with an evidence array");
  return items.map(normalizeImportedEvidence);
}

function parseEvidenceCsv(content) {
  const rows = parseCsv(content).filter((row) => row.some((cell) => cell.trim()));
  if (rows.length < 2) return [];
  const headers = rows[0].map((cell) => cell.trim());
  return rows.slice(1).map((row) => {
    const item = Object.fromEntries(headers.map((header, index) => [header, row[index] || ""]));
    return normalizeImportedEvidence(item);
  });
}

function normalizeImportedEvidence(item) {
  return {
    claim: item.claim || item.Claim || "",
    source: item.source || item.Source || "",
    strength: item.strength || item.Strength || "medium",
    source_type: item.source_type || item.sourceType || item["source type"] || item.Type || "",
    recency: item.recency || item.Recency || "",
    notes: item.notes || item.Notes || ""
  };
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    if (quoted && char === "\"" && next === "\"") {
      cell += "\"";
      index += 1;
      continue;
    }
    if (char === "\"") {
      quoted = !quoted;
      continue;
    }
    if (!quoted && char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  row.push(cell);
  rows.push(row);
  return rows;
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
