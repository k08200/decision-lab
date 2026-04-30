import fs from "node:fs";
import path from "node:path";

export function appendAuditEvent(root, event, {
  now = new Date().toISOString(),
  actor = "local-user",
  auditPath = auditLogPath(root)
} = {}) {
  const entry = {
    ts: now,
    actor,
    ...event
  };
  fs.mkdirSync(path.dirname(auditPath), { recursive: true });
  fs.appendFileSync(auditPath, `${JSON.stringify(entry)}\n`);
  return entry;
}

export function readAuditEvents(root, {
  limit = 100,
  auditPath = auditLogPath(root)
} = {}) {
  if (!fs.existsSync(auditPath)) return [];
  return fs.readFileSync(auditPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .slice(-Math.max(1, Number(limit) || 100));
}

export function renderAuditLog(events) {
  return [
    "# Audit Log",
    "",
    `Events: ${events.length}`,
    "",
    events.length
      ? table(["Time", "Actor", "Action", "File", "Status"], events.map((event) => [
        event.ts || "",
        event.actor || "",
        event.action || "",
        event.file || "",
        event.status || ""
      ]))
      : "No audit events found."
  ].join("\n") + "\n";
}

export function auditLogPath(root) {
  return path.join(path.resolve(root), ".decision-lab", "audit.jsonl");
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
