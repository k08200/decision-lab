import fs from "node:fs";
import path from "node:path";
import { attachEvidence } from "./decision-tools.js";

export function parseEvidenceFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const content = fs.readFileSync(path.resolve(filePath), "utf8");
  if (extension === ".json") return parseEvidenceJson(content);
  if (extension === ".csv") return parseEvidenceCsv(content);
  if (extension === ".tsv") return parseEvidenceTsv(content);
  if ([".md", ".markdown", ".txt"].includes(extension)) {
    return parseEvidenceNotes(content, { sourcePath: filePath });
  }
  if ([".html", ".htm"].includes(extension)) {
    return parseEvidenceHtml(content, { sourcePath: filePath });
  }
  throw new Error("Evidence import supports .csv, .tsv, .json, .md, .txt, .html, .htm, .pdf, and .xlsx files");
}

export async function parseEvidenceFileAsync(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".pdf") return parseEvidencePdf(fs.readFileSync(path.resolve(filePath)), { sourcePath: filePath });
  if (extension === ".xlsx") return parseEvidenceXlsx(path.resolve(filePath));
  return parseEvidenceFile(filePath);
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
  return parseDelimitedEvidence(parseCsv(content));
}

function parseEvidenceTsv(content) {
  return parseDelimitedEvidence(parseTsv(content));
}

function parseDelimitedEvidence(rows) {
  rows = rows.filter((row) => row.some((cell) => cell.trim()));
  if (rows.length < 2) return [];
  const headers = rows[0].map((cell) => cell.trim());
  return rows.slice(1).map((row) => {
    const item = Object.fromEntries(headers.map((header, index) => [header, row[index] || ""]));
    return normalizeImportedEvidence(item);
  });
}

export function parseEvidenceHtml(content, { sourcePath = "" } = {}) {
  return parseEvidenceNotes(htmlToEvidenceText(content), { sourcePath });
}

export async function parseEvidencePdf(buffer, { sourcePath = "" } = {}) {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return parseEvidenceNotes(result.text || "", { sourcePath });
  } finally {
    await parser.destroy();
  }
}

export async function parseEvidenceXlsx(filePath) {
  const { default: readXlsxFile } = await import("read-excel-file/node");
  const workbook = await readXlsxFile(filePath);
  const rows = Array.isArray(workbook?.[0]?.data) ? workbook[0].data : workbook;
  return parseDelimitedEvidence(rows.map((row) => row.map((cell) => cell === null || cell === undefined ? "" : String(cell))));
}

export function parseEvidenceNotes(content, { sourcePath = "" } = {}) {
  const sourceName = sourcePath ? path.basename(sourcePath) : "note";
  const items = [];
  let current = null;

  for (const rawLine of String(content || "").split(/\r?\n/)) {
    const line = normalizeNoteLine(rawLine);
    if (!line || line.startsWith("#")) continue;

    const pipeItem = parsePipeEvidenceLine(line, sourceName);
    if (pipeItem) {
      if (current) items.push(normalizeImportedEvidence(current));
      current = null;
      items.push(normalizeImportedEvidence(pipeItem));
      continue;
    }

    const field = parseKeyValueEvidenceLine(line);
    if (!field) continue;

    if (["claim", "evidence"].includes(field.key)) {
      if (current) items.push(normalizeImportedEvidence(current));
      current = {
        claim: field.value,
        source: sourceName,
        source_type: "note",
        strength: "medium"
      };
      continue;
    }

    if (current) {
      current[field.key] = field.value;
    }
  }

  if (current) items.push(normalizeImportedEvidence(current));
  return items.filter((item) => item.claim);
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

function normalizeNoteLine(line) {
  return String(line || "")
    .trim()
    .replace(/^[-*]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .trim();
}

function parsePipeEvidenceLine(line, sourceName) {
  const parts = line.split("|").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  if (parts.every((part) => /^:?-{3,}:?$/.test(part))) return null;
  if (parts[0].toLowerCase() === "claim" && parts[1].toLowerCase().includes("source")) return null;

  const first = parts[0].replace(/^(claim|evidence)\s*:\s*/i, "").trim();
  if (!first) return null;
  return {
    claim: first,
    source: parts[1] || sourceName,
    strength: parts[2] || "medium",
    source_type: parts[3] || "note",
    recency: parts[4] || "",
    notes: parts[5] || ""
  };
}

function parseKeyValueEvidenceLine(line) {
  const match = line.match(/^(claim|evidence|source|strength|source_type|source type|type|recency|notes?)\s*:\s*(.+)$/i);
  if (!match) return null;
  const key = match[1].toLowerCase().replace(/\s+/g, "_");
  return {
    key: key === "evidence" ? "claim" : key === "type" ? "source_type" : key === "note" ? "notes" : key,
    value: match[2].trim()
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

function parseTsv(content) {
  return String(content || "")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => line.split("\t"));
}

function htmlToEvidenceText(content) {
  return String(content || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<(br|p|div|li|tr|h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/g, "'")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
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
