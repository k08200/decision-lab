import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { loadDecisionFile, renderDecisionMemo, validateDecision } from "./decision-core.js";
import {
  closeDecision,
  createDecisionFromQuestion,
  localizeDecisionCopy,
  runDecisionWorkflow,
  slugify,
  writeWorkflowArtifacts
} from "./decision-agent.js";
import { buildOpenApiSpec } from "./decision-api-contract.js";
import { appendAuditEvent, readAuditEvents } from "./decision-audit-log.js";
import { buildDecisionRows } from "./decision-export.js";
import {
  CAPTURE_PRESETS,
  FIRST_USER_TEST_STEPS,
  SAMPLE_QUESTIONS
} from "./decision-server-ui-config.js";
import {
  renderActionQueue,
  renderCalendarReport,
  renderCommitmentReport,
  renderDecisionAgenda,
  renderDecisionDebt,
  renderDependencyReport,
  renderExecutiveSummary,
  renderOperatingPlaybook,
  renderOperatingScorecard,
  renderQuestionRegister,
  promoteDecision,
  renderRedTeamReport,
  renderRiskHeatmap,
  renderSignalWatchlist,
  renderTaxonomyReport,
  renderTriageReport
} from "./decision-tools.js";

const REPORTS = {
  agenda: {
    title: "Agenda",
    render: (records, options) => renderDecisionAgenda(records, options)
  },
  calendar: {
    title: "Calendar",
    render: (records, options) => renderCalendarReport(records, options)
  },
  commitments: {
    title: "Commitments",
    render: (records, options) => renderCommitmentReport(records, options)
  },
  debt: {
    title: "Debt",
    render: (records, options) => renderDecisionDebt(records, options)
  },
  dependencies: {
    title: "Dependencies",
    render: (records) => renderDependencyReport(records)
  },
  executive: {
    title: "Executive",
    render: (records, options) => renderExecutiveSummary(records, options)
  },
  next: {
    title: "Actions",
    render: (records, options) => renderActionQueue(records, options.asOf)
  },
  playbook: {
    title: "Playbook",
    render: (records, options) => renderOperatingPlaybook(records, options)
  },
  questions: {
    title: "Questions",
    render: (records) => renderQuestionRegister(records)
  },
  redTeam: {
    title: "Red Team",
    render: (records) => renderRedTeamReport(records)
  },
  riskHeatmap: {
    title: "Risk Heatmap",
    render: (records) => renderRiskHeatmap(records)
  },
  scorecard: {
    title: "Scorecard",
    render: (records, options) => renderOperatingScorecard(records, options)
  },
  signals: {
    title: "Signals",
    render: (records, options) => renderSignalWatchlist(records, options)
  },
  taxonomy: {
    title: "Taxonomy",
    render: (records) => renderTaxonomyReport(records)
  },
  triage: {
    title: "Triage",
    render: (records, options) => renderTriageReport(records, options)
  }
};

export function createDecisionServer({
  root = "decisions",
  asOf = new Date().toISOString().slice(0, 10),
  token = process.env.DECISION_LAB_TOKEN || "",
  actor = process.env.DECISION_LAB_ACTOR || "local-user",
  serverUrl = "http://127.0.0.1:8787"
} = {}) {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://localhost");
      if (url.pathname === "/") return sendHtml(response, renderApp({ root, asOf }));
      if (url.pathname === "/healthz") return sendJson(response, { ok: true, root, asOf });
      if (url.pathname === "/api/openapi.json") return sendJson(response, buildOpenApiSpec({ serverUrl }));
      if (!authorized(request, token)) return sendJson(response, { error: "Unauthorized" }, 401);
      const includeArchive = readsIncludeArchive(url);
      if (url.pathname === "/api/decisions" && request.method === "GET") return sendJson(response, decisionPayload(root, { includeArchive }));
      if (url.pathname === "/api/decisions" && request.method === "POST") {
        const result = createDraftDecision(root, await readJson(request));
        appendAuditEvent(root, {
          action: "decision.create",
          file: result.filePath,
          status: result.validation.valid ? "valid" : "invalid"
        }, { actor });
        return sendJson(response, result, 201);
      }
      if (url.pathname === "/api/decision" && request.method === "GET") {
        return sendJson(response, readDecisionRecord(root, url.searchParams.get("file")));
      }
      if (url.pathname === "/api/decision" && request.method === "PUT") {
        const payload = await readJson(request);
        const file = url.searchParams.get("file");
        const result = saveDecisionRecord(root, file, payload.decision || payload);
        appendAuditEvent(root, {
          action: "decision.save",
          file,
          status: result.saved ? "saved" : "rejected"
        }, { actor });
        return sendJson(response, result);
      }
      if (url.pathname === "/api/decision/run" && request.method === "POST") {
        const payload = await readJson(request);
        const file = url.searchParams.get("file");
        const result = regenerateDecisionArtifacts(root, file, payload);
        appendAuditEvent(root, {
          action: "decision.run",
          file,
          status: result.regenerated ? "regenerated" : "rejected"
        }, { actor });
        return sendJson(response, result);
      }
      if (url.pathname === "/api/decision/promote" && request.method === "POST") {
        const payload = await readJson(request);
        const file = url.searchParams.get("file");
        const result = promoteDecisionRecord(root, file, payload.status);
        appendAuditEvent(root, {
          action: "decision.promote",
          file,
          status: result.decision?.status || payload.status || ""
        }, { actor });
        return sendJson(response, result);
      }
      if (url.pathname === "/api/decision/review" && request.method === "POST") {
        const payload = await readJson(request);
        const file = url.searchParams.get("file");
        const result = reviewDecisionRecord(root, file, payload);
        appendAuditEvent(root, {
          action: "decision.review",
          file,
          status: result.reviewed ? "reviewed" : "rejected"
        }, { actor });
        return sendJson(response, result);
      }
      if (url.pathname === "/api/decision/archive" && request.method === "POST") {
        const file = url.searchParams.get("file");
        const result = archiveDecisionRecord(root, file);
        appendAuditEvent(root, {
          action: "decision.archive",
          file,
          status: result.archived ? "archived" : "rejected"
        }, { actor });
        return sendJson(response, result);
      }
      if (url.pathname === "/api/decision/restore" && request.method === "POST") {
        const file = url.searchParams.get("file");
        const result = restoreArchivedDecisionRecord(root, file);
        appendAuditEvent(root, {
          action: "decision.restore",
          file,
          status: result.restored ? "restored" : "rejected"
        }, { actor });
        return sendJson(response, result);
      }
      if (url.pathname === "/api/decision/localize" && request.method === "POST") {
        const file = url.searchParams.get("file");
        const result = localizeDecisionRecord(root, file);
        appendAuditEvent(root, {
          action: "decision.localize",
          file,
          status: result.localized ? "localized" : "rejected"
        }, { actor });
        return sendJson(response, result);
      }
      if (url.pathname === "/api/reports") return sendJson(response, reportCatalog());
      if (url.pathname === "/api/audit-log") return sendJson(response, {
        events: readAuditEvents(root, { limit: Number(url.searchParams.get("limit") || 100) })
      });
      if (url.pathname.startsWith("/api/report/")) {
        return sendReport(response, root, asOf, url.pathname.replace("/api/report/", ""), { includeArchive });
      }
      if (url.pathname === "/api/memo") return sendMemo(response, root, url.searchParams.get("file"), { includeArchive });
      return sendJson(response, { error: "Not found" }, 404);
    } catch (error) {
      return sendJson(response, { error: error.message }, 500);
    }
  });
}

export async function startDecisionServer(options = {}) {
  const port = Number(options.port || 8787);
  const host = options.host || "127.0.0.1";
  const allowPortFallback = options.allowPortFallback === true;
  const maxAttempts = allowPortFallback ? 10 : 1;
  const serverFactory = options.serverFactory || createDecisionServer;
  const listenFn = options.listen || listen;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidatePort = port + attempt;
    const server = serverFactory({
      ...options,
      serverUrl: `http://${host}:${candidatePort}`
    });
    try {
      await listenFn(server, candidatePort, host);
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : candidatePort;
      return {
        server,
        url: `http://${host}:${actualPort}`,
        port: actualPort,
        fallbackFromPort: candidatePort === port ? null : port
      };
    } catch (error) {
      if (error.code === "EADDRINUSE" && allowPortFallback && attempt < maxAttempts - 1) continue;
      throw friendlyListenError(error, host, port, candidatePort, maxAttempts);
    }
  }

  throw new Error(`Could not start Decision Lab on ${host}:${port}. Try --port ${port + maxAttempts}.`);
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      server.off("error", onError);
      server.off("listening", onListening);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onListening = () => {
      cleanup();
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

function friendlyListenError(error, host, requestedPort, failedPort, attempts) {
  if (error.code === "EADDRINUSE") {
    const nextPort = requestedPort + attempts;
    return new Error(`Port ${failedPort} is already in use on ${host}. Stop the other local server or run with --port ${nextPort}.`);
  }
  return error;
}

export function decisionPayload(root = "decisions", options = {}) {
  const records = loadDecisionRecords(root, options);
  const rows = buildDecisionRows(records);
  return {
    root,
    count: records.length,
    stats: summarizeRows(rows),
    rows
  };
}

export function reportCatalog() {
  return Object.entries(REPORTS).map(([id, report]) => ({
    id,
    title: report.title
  }));
}

export function loadDecisionRecords(root = "decisions", { includeArchive = false } = {}) {
  return walk(root)
    .filter((filePath) => filePath.endsWith(".json"))
    .filter((filePath) => includeArchive || !isArchivedDecisionPath(root, filePath))
    .flatMap((filePath) => {
      try {
        const decision = loadDecisionFile(filePath);
        return decision?.decision_type ? [{ filePath, decision }] : [];
      } catch {
        return [];
      }
    });
}

export function readDecisionRecord(root, filePath) {
  const safePath = resolveInside(root, filePath);
  const decision = loadDecisionFile(safePath);
  if (!decision?.decision_type) throw new Error("File is not a decision record");
  return {
    filePath,
    decision,
    row: buildDecisionRows([{ filePath, decision }])[0],
    validation: validateDecision(decision),
    memo: renderDecisionMemo(decision)
  };
}

export function saveDecisionRecord(root, filePath, decision) {
  if (!decision || typeof decision !== "object") throw new Error("Decision payload is required");
  const validation = validateDecision(decision);
  if (!validation.valid) return { saved: false, validation };
  const safePath = resolveInside(root, filePath);
  fs.writeFileSync(safePath, `${JSON.stringify(decision, null, 2)}\n`);
  return { saved: true, filePath, validation };
}

export function regenerateDecisionArtifacts(root, filePath, { outDir = "" } = {}) {
  const safePath = resolveInside(root, filePath);
  const decision = loadDecisionFile(safePath);
  const validation = validateDecision(decision);
  if (!validation.valid) return { regenerated: false, validation };
  const artifactDir = outDir
    ? resolveInside(root, outDir)
    : path.join(path.dirname(safePath), "run");
  writeWorkflowArtifacts(artifactDir, runDecisionWorkflow(decision));
  return {
    regenerated: true,
    artifactDir,
    ...readDecisionRecord(root, safePath)
  };
}

export function promoteDecisionRecord(root, filePath, status) {
  const safePath = resolveInside(root, filePath);
  const decision = loadDecisionFile(safePath);
  const result = saveDecisionRecord(root, safePath, promoteDecision(decision, status));
  return {
    promoted: result.saved,
    ...readDecisionRecord(root, safePath)
  };
}

export function reviewDecisionRecord(root, filePath, { outcome = "", lesson = "", lessons = [] } = {}) {
  const safePath = resolveInside(root, filePath);
  const decision = loadDecisionFile(safePath);
  const reviewLessons = Array.isArray(lessons) ? lessons : [];
  const normalizedLessons = [
    ...reviewLessons,
    ...String(lesson || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
  ];
  const result = saveDecisionRecord(root, safePath, closeDecision(decision, {
    outcome: String(outcome || "").trim(),
    lessons: normalizedLessons
  }));
  return {
    reviewed: result.saved,
    ...readDecisionRecord(root, safePath)
  };
}

export function localizeDecisionRecord(root, filePath) {
  const safePath = resolveInside(root, filePath);
  const decision = loadDecisionFile(safePath);
  const result = saveDecisionRecord(root, safePath, localizeDecisionCopy(decision));
  return {
    localized: result.saved,
    ...readDecisionRecord(root, safePath)
  };
}

export function archiveDecisionRecord(root, filePath) {
  const safePath = resolveInside(root, filePath);
  if (isArchivedDecisionPath(root, safePath)) throw new Error("Decision is already archived");
  const rootPath = path.resolve(root);
  const parent = path.dirname(safePath);
  const moveDirectory = path.basename(safePath) === "decision.json" && parent !== rootPath;
  const sourcePath = moveDirectory ? parent : safePath;
  const rawName = moveDirectory ? path.basename(parent) : path.basename(safePath, ".json");
  const archiveRoot = path.join(rootPath, "archive");
  const targetPath = uniqueArchivePath(path.join(archiveRoot, rawName));
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.renameSync(sourcePath, targetPath);
  return {
    archived: true,
    filePath: safePath,
    archivedFilePath: moveDirectory ? path.join(targetPath, "decision.json") : targetPath
  };
}

export function restoreArchivedDecisionRecord(root, filePath) {
  const safePath = resolveInside(root, filePath);
  if (!isArchivedDecisionPath(root, safePath)) throw new Error("Decision is not archived");
  const rootPath = path.resolve(root);
  const archiveRoot = path.join(rootPath, "archive");
  const parent = path.dirname(safePath);
  const moveDirectory = path.basename(safePath) === "decision.json" && parent !== archiveRoot;
  const sourcePath = moveDirectory ? parent : safePath;
  const rawName = moveDirectory ? path.basename(parent) : path.basename(safePath);
  const activeRoot = path.join(rootPath, "active");
  const targetPath = uniqueArchivePath(path.join(activeRoot, rawName));
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.renameSync(sourcePath, targetPath);
  const restoredFilePath = moveDirectory ? path.join(targetPath, "decision.json") : targetPath;
  return {
    restored: true,
    filePath: safePath,
    restoredFilePath,
    ...readDecisionRecord(root, restoredFilePath)
  };
}

export function createDraftDecision(root, { question, type = null, owner = "decision owner" } = {}) {
  const decision = createDecisionFromQuestion(question, { type, owner });
  const baseDir = path.resolve(root);
  const slug = slugify(decision.title);
  const directory = uniqueDirectory(path.join(baseDir, slug));
  fs.mkdirSync(directory, { recursive: true });
  const filePath = path.join(directory, "decision.json");
  fs.writeFileSync(filePath, `${JSON.stringify(decision, null, 2)}\n`);
  return {
    filePath: path.relative(process.cwd(), filePath),
    decision,
    validation: validateDecision(decision)
  };
}

function sendReport(response, root, asOf, id, options = {}) {
  const report = REPORTS[id];
  if (!report) return sendJson(response, { error: `Unknown report: ${id}` }, 404);
  return sendText(response, report.render(loadDecisionRecords(root, options), { asOf }));
}

function sendMemo(response, root, filePath, options = {}) {
  const records = loadDecisionRecords(root, options);
  const record = records.find((item) => item.filePath === filePath);
  if (!record) return sendJson(response, { error: "Decision file not found in server root" }, 404);
  return sendText(response, renderDecisionMemo(record.decision));
}

function readsIncludeArchive(url) {
  return ["yes", "true", "1"].includes(String(url.searchParams.get("includeArchive") || "").toLowerCase());
}

function isArchivedDecisionPath(root, filePath) {
  const rootPath = path.resolve(root);
  if (path.basename(rootPath) === "archive") return false;
  const relativePath = path.relative(rootPath, path.resolve(filePath));
  return relativePath.split(path.sep).includes("archive");
}

function authorized(request, token) {
  if (!token) return true;
  const authorization = request.headers.authorization || "";
  const apiKey = request.headers["x-api-key"] || "";
  return authorization === `Bearer ${token}` || apiKey === token;
}

function resolveInside(root, filePath) {
  if (!filePath) throw new Error("file is required");
  const rootPath = path.resolve(root);
  const target = path.resolve(filePath);
  if (target !== rootPath && !target.startsWith(`${rootPath}${path.sep}`)) {
    throw new Error("File must be inside the server root");
  }
  return target;
}

function uniqueDirectory(base) {
  if (!fs.existsSync(base)) return base;
  let counter = 2;
  while (fs.existsSync(`${base}-${counter}`)) counter += 1;
  return `${base}-${counter}`;
}

function uniqueArchivePath(base) {
  if (!fs.existsSync(base)) return base;
  let counter = 2;
  while (fs.existsSync(`${base}-${counter}`)) counter += 1;
  return `${base}-${counter}`;
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        reject(new Error("Request body is too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error(`Invalid JSON body: ${error.message}`));
      }
    });
    request.on("error", reject);
  });
}

export function renderApp({ root, asOf }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Decision Lab</title>
  <style>
    :root {
      --bg: #eef2f2;
      --panel: #ffffff;
      --text: #1d252c;
      --muted: #66727f;
      --line: #d9dee3;
      --accent: #166b57;
      --accent-soft: #dff3ed;
      --ink: #17211f;
      --surface: #f8faf9;
      --amber: #b25e09;
      --warn: #9a5b05;
      --bad: #b42318;
      --good: #067647;
      --focus: #2f6fed;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 14px;
      line-height: 1.45;
    }
    header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
      padding: 18px 24px;
      background: var(--ink);
      color: #f7fbf9;
      border-bottom: 0;
    }
    h1 { margin: 0; font-size: 21px; letter-spacing: 0; }
    header .meta { color: #b8c5bf; }
    .meta { color: var(--muted); font-size: 12px; }
    #status {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      border-radius: 999px;
      background: rgba(255,255,255,0.1);
      padding: 3px 10px;
      color: #f7fbf9;
    }
    .toast {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 10;
      max-width: 340px;
      border: 1px solid #abcac0;
      border-radius: 8px;
      background: #f6fbf8;
      color: var(--text);
      padding: 10px 12px;
      box-shadow: 0 12px 32px rgba(18, 25, 23, 0.16);
      font-size: 13px;
      opacity: 0;
      transform: translateY(8px);
      pointer-events: none;
      transition: opacity .16s ease, transform .16s ease;
    }
    .toast.show {
      opacity: 1;
      transform: translateY(0);
    }
    .toast.bad {
      border-color: #fda29b;
      background: #fffbfa;
      color: var(--bad);
    }
    .toast.good {
      border-color: #b8e6c7;
      background: #f6fef9;
      color: var(--good);
    }
    main {
      display: grid;
      grid-template-columns: 260px 1fr;
      min-height: calc(100vh - 73px);
    }
    aside {
      border-right: 1px solid var(--line);
      background: #fbfcfc;
      padding: 18px 16px;
    }
    .content { padding: 22px 24px 36px; overflow: auto; }
    .workspace {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 350px;
      gap: 16px;
      align-items: start;
    }
    .main-column { min-width: 0; }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 10px;
      margin-bottom: 14px;
    }
    .metric, .panel {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
    }
    .metric {
      padding: 12px;
      box-shadow: 0 1px 2px rgba(18, 25, 23, 0.04);
    }
    .metric span { display: block; color: var(--muted); font-size: 12px; }
    .metric strong { display: block; margin-top: 4px; font-size: 24px; line-height: 1; }
    .onboarding {
      position: sticky;
      top: 18px;
      padding: 14px;
      max-height: calc(100vh - 118px);
      overflow: auto;
    }
    .onboarding h2 {
      margin: 0 0 10px;
      font-size: 14px;
      letter-spacing: 0;
    }
    .step {
      display: grid;
      grid-template-columns: 26px 1fr;
      gap: 10px;
      padding: 10px 0;
      border-top: 1px solid var(--line);
    }
    .step:first-of-type { border-top: 0; }
    .step-index {
      display: inline-grid;
      place-items: center;
      width: 24px;
      height: 24px;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
    }
    .step-title { font-weight: 700; }
    .step-copy { color: var(--muted); font-size: 12px; margin-top: 2px; }
    .test-checklist {
      display: grid;
      gap: 8px;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--line);
    }
    .test-checklist h3 {
      margin: 0;
      font-size: 13px;
    }
    .test-checklist ol {
      margin: 0;
      padding-left: 18px;
      color: var(--muted);
      font-size: 12px;
    }
    .test-checklist li {
      margin: 0 0 6px;
    }
    .command {
      margin-top: 8px;
      padding: 8px;
      border-radius: 6px;
      background: #101828;
      color: #f9fafb;
      font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .command-toggle {
      margin-top: 8px;
    }
    .command-toggle summary {
      cursor: pointer;
      color: var(--accent);
      font-size: 12px;
      font-weight: 800;
    }
    .command-toggle .command {
      margin-top: 6px;
    }
    .command-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-top: 8px;
    }
    .command-head summary {
      flex: 1;
    }
    .copy-command {
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 3px 8px;
      background: var(--panel);
      color: var(--accent);
      font-size: 11px;
      font-weight: 800;
      cursor: pointer;
    }
    label { display: block; color: var(--muted); font-size: 12px; margin: 0 0 6px; }
    input, select, button {
      width: 100%;
      height: 34px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fff;
      color: var(--text);
      padding: 0 9px;
      font: inherit;
    }
    button { cursor: pointer; }
    button:hover:not(:disabled) {
      border-color: #abcac0;
      box-shadow: 0 1px 6px rgba(18, 25, 23, 0.08);
    }
    button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
      outline: 2px solid rgba(47, 111, 237, .32);
      outline-offset: 2px;
    }
    button:disabled {
      cursor: default;
      opacity: .64;
    }
    button.secondary { background: #f8fafb; }
    button.active { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
    button.inline { width: auto; min-width: 74px; }
    button.danger {
      border-color: #fda29b;
      background: #fffbfa;
      color: var(--bad);
    }
    .field { margin-bottom: 12px; }
    .checkbox-row {
      display: flex;
      gap: 8px;
      align-items: center;
      margin: 0;
      color: var(--text);
      font-size: 13px;
    }
    .checkbox-row input {
      width: 16px;
      height: 16px;
      flex: 0 0 auto;
      padding: 0;
    }
    .sample-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: -4px 0 12px;
    }
    .sample-row button {
      width: auto;
      height: 28px;
      padding: 0 8px;
      color: var(--accent);
      background: #fff;
      font-size: 12px;
      font-weight: 750;
    }
    .actions { display: flex; gap: 8px; align-items: center; padding: 12px; border-bottom: 1px solid var(--line); }
    .actions button { width: auto; }
    .decision-detail {
      overflow: hidden;
      border-radius: 8px;
    }
    .detail-hero {
      display: grid;
      gap: 14px;
      padding: 18px;
      color: #f7fbf9;
      background: linear-gradient(135deg, #12211e 0%, #19352d 62%, #245849 100%);
      border-bottom: 1px solid rgba(255,255,255,.12);
    }
    .detail-hero .brief-label {
      color: #79d2b1;
    }
    .detail-hero-top {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 16px;
      align-items: start;
    }
    .detail-title {
      margin: 4px 0 8px;
      font-size: 24px;
      line-height: 1.16;
      font-weight: 850;
      letter-spacing: 0;
    }
    .detail-path {
      max-width: 760px;
      color: #bed0ca;
      font-size: 12px;
      word-break: break-word;
    }
    .detail-recommendation {
      max-width: 820px;
      color: #eef7f3;
      font-size: 14px;
      line-height: 1.45;
    }
    .detail-hero .pill {
      background: rgba(255,255,255,.12);
      color: #f7fbf9;
    }
    .detail-kpis {
      display: grid;
      grid-template-columns: repeat(4, minmax(120px, 1fr));
      gap: 10px;
    }
    .detail-kpi {
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 8px;
      background: rgba(255,255,255,.08);
      padding: 10px;
    }
    .detail-kpi span {
      display: block;
      color: #bed0ca;
      font-size: 11px;
      margin-bottom: 4px;
    }
    .detail-kpi strong {
      display: block;
      color: #fff;
      font-size: 18px;
      line-height: 1.1;
    }
    .hero-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
      min-width: 260px;
    }
    .hero-actions button {
      width: auto;
      border-color: rgba(255,255,255,.22);
      background: rgba(255,255,255,.09);
      color: #fff;
      font-weight: 750;
    }
    .hero-actions button.primary-action {
      border-color: #79d2b1;
      background: #79d2b1;
      color: #12211e;
    }
    .tabs {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      background: #fbfcfd;
    }
    .detail-tabs {
      position: sticky;
      top: 0;
      z-index: 2;
    }
    .tabs button { width: auto; }
    .nav { display: grid; gap: 6px; margin-top: 16px; }
    .nav button { text-align: left; }
    .nav-section {
      margin-top: 16px;
      border-top: 1px solid var(--line);
      padding-top: 12px;
    }
    .nav-section summary {
      cursor: pointer;
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
      margin-bottom: 8px;
    }
    .nav-list {
      display: grid;
      gap: 6px;
      margin-top: 8px;
    }
    .board-shell {
      display: grid;
      gap: 14px;
      padding: 14px;
    }
    .focus-hero {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 220px;
      gap: 16px;
      align-items: stretch;
      border: 1px solid #abcac0;
      border-radius: 8px;
      background: #f6fbf8;
      padding: 18px;
      box-shadow: 0 8px 24px rgba(22, 107, 87, 0.08);
    }
    .focus-eyebrow {
      color: var(--accent);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    .focus-title {
      margin: 6px 0 8px;
      font-size: 24px;
      line-height: 1.15;
      font-weight: 800;
    }
    .focus-copy {
      max-width: 760px;
      color: var(--muted);
      font-size: 14px;
      margin: 0 0 12px;
    }
    .focus-stats {
      display: grid;
      gap: 8px;
      align-content: center;
    }
    .focus-stat {
      border: 1px solid #cddbd7;
      border-radius: 8px;
      background: #fff;
      padding: 10px;
    }
    .focus-stat span {
      display: block;
      color: var(--muted);
      font-size: 11px;
      margin-bottom: 3px;
    }
    .focus-stat strong {
      font-size: 18px;
      line-height: 1.1;
    }
    .board-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: end;
      gap: 12px;
    }
    .board-toolbar h2 {
      margin: 0;
      font-size: 16px;
      letter-spacing: 0;
    }
    .ledger-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(330px, 1fr));
      gap: 12px;
    }
    .workbench {
      display: grid;
      gap: 10px;
    }
    .workbench h2 {
      margin: 0;
      font-size: 16px;
      letter-spacing: 0;
    }
    .workbench-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 10px;
    }
    .single-dashboard {
      display: grid;
      gap: 12px;
    }
    .single-status-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 10px;
    }
    .single-status-card {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 12px;
    }
    .single-status-card span {
      display: block;
      color: var(--muted);
      font-size: 11px;
      margin-bottom: 4px;
    }
    .single-status-card strong {
      display: block;
      font-size: 18px;
      line-height: 1.15;
    }
    .next-action-strip {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 220px;
      gap: 12px;
      align-items: center;
      border: 1px dashed #abcac0;
      border-radius: 8px;
      background: #fbfdfc;
      padding: 12px;
    }
    .next-action-strip h3 {
      margin: 0 0 4px;
      font-size: 15px;
    }
    .next-action-strip p {
      margin: 0;
      color: var(--muted);
      font-size: 12px;
    }
    .action-tile {
      height: auto;
      min-height: 118px;
      display: grid;
      align-content: space-between;
      justify-items: start;
      text-align: left;
      border-color: var(--line);
      background: #fff;
      padding: 12px;
      box-shadow: 0 2px 10px rgba(18, 25, 23, 0.04);
    }
    .action-tile span {
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
    }
    .action-tile strong {
      display: block;
      margin-top: 4px;
      font-size: 15px;
      line-height: 1.25;
    }
    .action-tile small {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.35;
    }
    .action-tile.primary {
      border-color: #abcac0;
      background: #f6fbf8;
    }
    .decision-card {
      display: grid;
      gap: 14px;
      border: 1px solid var(--line);
      border-left: 5px solid var(--accent);
      border-radius: 8px;
      background: #fff;
      padding: 14px;
      box-shadow: 0 2px 10px rgba(18, 25, 23, 0.04);
    }
    .decision-card.priority-high { border-left-color: var(--bad); }
    .decision-card.priority-medium { border-left-color: var(--amber); }
    .card-title-row {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: start;
    }
    .card-title {
      font-size: 16px;
      font-weight: 800;
      line-height: 1.25;
    }
    .card-question {
      color: var(--muted);
      margin-top: 5px;
    }
    .card-recommendation {
      border-radius: 8px;
      background: var(--surface);
      padding: 10px;
    }
    .card-recommendation span {
      display: block;
      color: var(--muted);
      font-size: 11px;
      margin-bottom: 3px;
    }
    .card-recommendation strong {
      display: block;
      font-size: 14px;
      line-height: 1.35;
    }
    .score-pair {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .score-row span {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 5px;
    }
    .score-track {
      height: 7px;
      border-radius: 999px;
      background: #e8edf0;
      overflow: hidden;
    }
    .score-fill {
      height: 100%;
      border-radius: inherit;
      background: var(--accent);
    }
    .score-fill.warn { background: #d98b22; }
    .score-fill.bad { background: #d92d20; }
    .card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }
    .open-button {
      min-width: 108px;
      border-color: var(--accent);
      background: var(--accent);
      color: #fff;
      font-weight: 700;
    }
    .detail { padding: 14px; }
    .summary-page {
      display: grid;
      gap: 14px;
      padding: 14px;
    }
    .decision-brief {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 260px;
      gap: 14px;
      border: 1px solid #abcac0;
      border-radius: 8px;
      background: #f6fbf8;
      padding: 16px;
    }
    .brief-label {
      color: var(--accent);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    .brief-title {
      margin: 5px 0 10px;
      font-size: 21px;
      line-height: 1.2;
      font-weight: 800;
    }
    .brief-decision {
      border-radius: 8px;
      background: #fff;
      padding: 12px;
      margin-top: 12px;
    }
    .brief-decision span {
      display: block;
      color: var(--muted);
      font-size: 11px;
      margin-bottom: 4px;
    }
    .brief-decision strong {
      font-size: 16px;
      line-height: 1.35;
    }
    .brief-side {
      display: grid;
      gap: 8px;
      align-content: start;
    }
    .brief-stat {
      border: 1px solid #cddbd7;
      border-radius: 8px;
      background: #fff;
      padding: 10px;
    }
    .brief-stat span {
      display: block;
      color: var(--muted);
      font-size: 11px;
      margin-bottom: 3px;
    }
    .brief-stat strong {
      font-size: 17px;
      line-height: 1.15;
    }
    .frame-strip {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 10px;
    }
    .frame-item {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 12px;
    }
    .frame-item span {
      display: block;
      color: var(--muted);
      font-size: 11px;
      margin-bottom: 3px;
    }
    .frame-item strong {
      font-size: 14px;
      line-height: 1.25;
    }
    .option-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 10px;
    }
    .option-card {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 12px;
      min-height: 120px;
    }
    .option-card.selected {
      border-color: #abcac0;
      background: #f6fbf8;
    }
    .option-card h3 {
      margin: 0 0 6px;
      font-size: 14px;
    }
    .option-card p {
      margin: 0;
      color: var(--muted);
      font-size: 12px;
    }
    .option-card-meta {
      margin-top: 10px;
    }
    .edit-panel {
      display: grid;
      gap: 12px;
      border: 1px solid #cddbd7;
      border-radius: 8px;
      background: #fff;
      padding: 14px;
    }
    .edit-panel h3 {
      margin: 0;
      font-size: 15px;
    }
    .edit-panel p {
      margin: 0;
      color: var(--muted);
      font-size: 12px;
    }
    .form-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }
    .form-grid .wide {
      grid-column: 1 / -1;
    }
    .option-edit-list {
      display: grid;
      gap: 8px;
    }
    .option-edit-row {
      display: grid;
      grid-template-columns: 42px minmax(140px, .6fr) minmax(180px, 1fr);
      gap: 8px;
      align-items: end;
    }
    .option-edit-row .option-id {
      align-self: center;
      color: var(--accent);
      font-weight: 800;
    }
    .restore-banner {
      border: 1px dashed #abcac0;
      border-radius: 8px;
      background: #f6fbf8;
      padding: 12px;
    }
    .validation-panel {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 12px;
    }
    .validation-panel.good {
      border-color: #b8e6c7;
      background: #f6fef9;
    }
    .validation-panel.bad {
      border-color: #fda29b;
      background: #fffbfa;
    }
    .memo-page {
      display: grid;
      gap: 14px;
      padding: 14px;
    }
    .memo-hero {
      border: 1px solid #abcac0;
      border-radius: 8px;
      background: #f6fbf8;
      padding: 16px;
    }
    .memo-hero h2 {
      margin: 0 0 8px;
      font-size: 20px;
      line-height: 1.2;
      letter-spacing: 0;
    }
    .memo-hero p {
      margin: 0;
      max-width: 780px;
      color: var(--muted);
    }
    .memo-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 10px;
    }
    .memo-card {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 12px;
    }
    .memo-card h3 {
      margin: 0 0 8px;
      font-size: 14px;
    }
    .memo-card ul {
      display: grid;
      gap: 7px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .memo-card li {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.35;
    }
    .memo-full {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      overflow: hidden;
    }
    .memo-full summary {
      cursor: pointer;
      padding: 12px;
      font-weight: 800;
    }
    .review-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 10px;
    }
    .status-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .status-actions button {
      width: auto;
      min-width: 118px;
    }
    .focus-panel {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 260px;
      gap: 14px;
      align-items: stretch;
      margin-bottom: 14px;
      border: 1px solid #bfd9d0;
      border-radius: 8px;
      background: #f7fbf9;
      padding: 14px;
    }
    .focus-panel h3 {
      margin: 0 0 6px;
      font-size: 13px;
      color: var(--accent);
    }
    .focus-panel p {
      margin: 0;
      color: var(--text);
      font-size: 15px;
      line-height: 1.45;
    }
    .next-move-detail {
      margin-top: 8px;
    }
    .focus-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 10px;
    }
    .quick-actions {
      display: grid;
      gap: 8px;
      align-content: center;
    }
    .quick-actions button {
      text-align: left;
      background: #fff;
    }
    .health-strip {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 14px;
    }
    .health-item {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 12px;
    }
    .health-item span {
      display: block;
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 6px;
    }
    .health-item strong {
      display: block;
      font-size: 19px;
      line-height: 1.1;
    }
    .meter {
      height: 7px;
      border-radius: 999px;
      background: #e8edf0;
      overflow: hidden;
      margin-top: 8px;
    }
    .meter-fill {
      height: 100%;
      border-radius: inherit;
      background: var(--accent);
    }
    .detail-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 14px;
    }
    .detail-card {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: #fff;
    }
    .detail-card h3 { margin: 0 0 8px; font-size: 13px; }
    .detail-card p { margin: 0; color: var(--muted); }
    .list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
    .list li {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 10px;
    }
    .capture-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 180px 110px 86px;
      gap: 8px;
      align-items: end;
      margin-bottom: 12px;
    }
    .capture-grid.compact {
      grid-template-columns: minmax(0, 1fr) 86px;
    }
    .tab-page {
      display: grid;
      gap: 14px;
      padding: 14px;
    }
    .capture-panel {
      border: 1px solid #cddbd7;
      border-radius: 8px;
      background: #fbfdfc;
      padding: 14px;
    }
    .capture-panel h3 {
      margin: 0 0 4px;
      font-size: 15px;
    }
    .capture-panel p {
      margin: 0 0 12px;
      color: var(--muted);
      font-size: 12px;
    }
    .preset-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 0 0 12px;
    }
    .preset-row button {
      width: auto;
      height: 30px;
      border-color: #cddbd7;
      background: #fff;
      color: var(--accent);
      font-size: 12px;
      font-weight: 750;
    }
    .section-heading {
      display: flex;
      justify-content: space-between;
      align-items: end;
      gap: 12px;
    }
    .section-heading h3 {
      margin: 0;
      font-size: 15px;
    }
    .item-grid {
      display: grid;
      gap: 10px;
    }
    .item-card {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 12px;
      box-shadow: 0 1px 6px rgba(18, 25, 23, 0.04);
    }
    .item-card .title {
      margin-bottom: 5px;
      line-height: 1.35;
    }
    .empty-state {
      border: 1px dashed #cddbd7;
      border-radius: 8px;
      background: #fbfdfc;
      padding: 18px;
      color: var(--muted);
      text-align: center;
    }
    textarea {
      width: 100%;
      min-height: 520px;
      resize: vertical;
      border: 0;
      border-radius: 0 0 8px 8px;
      padding: 14px;
      font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: var(--text);
    }
    textarea.short-textarea {
      min-height: 86px;
      border: 1px solid var(--line);
      border-radius: 6px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      border-bottom: 1px solid var(--line);
      padding: 10px 12px;
      text-align: left;
      vertical-align: top;
    }
    th { background: #eef1f4; color: var(--muted); font-size: 12px; }
    tr:last-child td { border-bottom: 0; }
    .title { font-weight: 700; }
    .small { color: var(--muted); font-size: 12px; }
    .pill {
      display: inline-flex;
      align-items: center;
      min-height: 22px;
      border-radius: 999px;
      padding: 2px 8px;
      background: #eef1f4;
      white-space: nowrap;
      font-size: 12px;
    }
    .good { color: var(--good); background: #dcfae6; }
    .warn { color: var(--warn); background: #fef0c7; }
    .bad { color: var(--bad); background: #fee4e2; }
    pre {
      margin: 0;
      white-space: pre-wrap;
      font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .report { padding: 14px; }
    .markdown {
      padding: 14px;
      font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .markdown h1, .markdown h2, .markdown h3 {
      margin: 16px 0 8px;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
    }
    .markdown h1:first-child, .markdown h2:first-child, .markdown h3:first-child { margin-top: 0; }
    .markdown h1 { font-size: 18px; }
    .markdown h2 { font-size: 15px; }
    .markdown h3 { font-size: 13px; }
    .markdown p { margin: 8px 0; }
    .markdown ul { margin: 8px 0 12px 18px; padding: 0; }
    .markdown code {
      border-radius: 4px;
      background: #eef1f4;
      padding: 1px 4px;
    }
    .markdown pre {
      margin: 10px 0;
      padding: 10px;
      border-radius: 6px;
      background: #101828;
      color: #f9fafb;
      overflow-x: auto;
    }
    .markdown table {
      display: table;
      margin: 10px 0 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
    }
    .markdown-card {
      margin: 12px 0;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
    }
    .markdown-card h2:first-child { margin-top: 0; }
    .empty {
      padding: 36px 18px;
      text-align: center;
    }
    .empty h2 {
      margin: 0 0 8px;
      font-size: 18px;
      letter-spacing: 0;
    }
    .empty p {
      max-width: 560px;
      margin: 0 auto 14px;
      color: var(--muted);
    }
    .empty .inline { margin: 0 auto; }
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      background: #fbfcfd;
    }
    @media (max-width: 900px) {
      main { grid-template-columns: 1fr; }
      aside { border-right: 0; border-bottom: 1px solid var(--line); }
      .stats { grid-template-columns: repeat(2, minmax(130px, 1fr)); }
      .workspace { grid-template-columns: 1fr; }
      .onboarding { position: static; }
      .focus-hero { grid-template-columns: 1fr; }
      .ledger-grid { grid-template-columns: 1fr; }
      .workbench-grid { grid-template-columns: 1fr; }
      .next-action-strip { grid-template-columns: 1fr; }
      .detail-hero-top { grid-template-columns: 1fr; }
      .hero-actions { justify-content: stretch; min-width: 0; }
      .hero-actions button { width: 100%; }
      .detail-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .decision-brief { grid-template-columns: 1fr; }
      .score-pair { grid-template-columns: 1fr; }
      .focus-panel { grid-template-columns: 1fr; }
      .health-strip { grid-template-columns: 1fr; }
      .detail-grid { grid-template-columns: 1fr; }
      .form-grid, .option-edit-row { grid-template-columns: 1fr; }
      .capture-grid, .capture-grid.compact { grid-template-columns: 1fr; }
      table { display: block; overflow-x: auto; }
    }
    @media (max-width: 640px) {
      header {
        align-items: flex-start;
        padding: 14px 16px;
      }
      h1 { font-size: 19px; }
      aside { padding: 14px; }
      .content { padding: 14px; }
      .stats { grid-template-columns: 1fr 1fr; gap: 8px; }
      .metric { padding: 10px; }
      .metric strong { font-size: 20px; }
      .board-shell, .summary-page, .memo-page, .tab-page { padding: 10px; }
      .focus-hero, .decision-brief, .detail-hero { padding: 14px; }
      .focus-title, .detail-title { font-size: 21px; }
      .detail-kpis { grid-template-columns: 1fr 1fr; gap: 8px; }
      .tabs {
        flex-wrap: nowrap;
        overflow-x: auto;
        scrollbar-width: thin;
      }
      .tabs button { flex: 0 0 auto; }
      .option-grid, .memo-grid, .single-status-grid { grid-template-columns: 1fr; }
      .preset-row button, .sample-row button { flex: 1 1 auto; }
      textarea { min-height: 360px; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Decision Lab</h1>
      <div class="meta">Root: ${escapeHtml(root)} | As of: ${escapeHtml(asOf)}</div>
    </div>
    <div class="meta" id="status">Loading</div>
  </header>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
  <main>
    <aside>
      <div class="field">
        <label for="search">Search</label>
        <input id="search" type="search">
      </div>
      <div class="field">
        <label for="type">Type</label>
        <select id="type">
          <option value="">All</option>
          <option value="investment">Investment</option>
          <option value="business">Business</option>
          <option value="finance">Finance</option>
          <option value="general">General</option>
        </select>
      </div>
      <div class="field">
        <label for="decision-status">Status</label>
        <select id="decision-status">
          <option value="">All</option>
          <option value="draft">Draft</option>
          <option value="researching">Researching</option>
          <option value="decided">Decided</option>
          <option value="reviewed">Reviewed</option>
        </select>
      </div>
      <div class="field">
        <label class="checkbox-row" for="include-archive">
          <input id="include-archive" type="checkbox">
          <span>Include archive</span>
        </label>
      </div>
      <div class="field">
        <label for="new-question">New Decision</label>
        <input id="new-question" type="text" placeholder="Should we keep productizing this? / 계속 제품화할까?">
      </div>
      <div class="field">
        <select id="new-type">
          <option value="">Infer type</option>
          <option value="investment">Investment</option>
          <option value="business">Business</option>
          <option value="finance">Finance</option>
          <option value="general">General</option>
        </select>
      </div>
      <div class="sample-row" id="sample-questions"></div>
      <button id="create" class="secondary">Create</button>
      <div class="nav" id="reports"></div>
    </aside>
    <section class="content">
      <div class="workspace">
        <div class="main-column">
          <div class="stats" id="stats"></div>
          <div class="panel" id="view"></div>
        </div>
        <div class="panel onboarding" id="onboarding"></div>
      </div>
    </section>
  </main>
  <script>
    const state = { rows: [], reports: [], activeReport: "", activeFile: "", activeTab: "summary", activeDecision: null, includeArchive: false };
    const CLI_COMMAND = "npx @k08200/decision-lab@latest";
    const ROOT_COMMAND_ARG = '${escapeJs(shellArg(root))}';
    const SAMPLE_QUESTIONS = ${jsonForScript(SAMPLE_QUESTIONS)};
    const FIRST_USER_TEST_STEPS = ${jsonForScript(FIRST_USER_TEST_STEPS)};
    const CAPTURE_PRESETS = ${jsonForScript(CAPTURE_PRESETS)};
    const AUTH_STORAGE_KEY = "decision-lab-api-token";
    const search = document.querySelector("#search");
    const type = document.querySelector("#type");
    const decisionStatus = document.querySelector("#decision-status");
    const includeArchive = document.querySelector("#include-archive");
    const newQuestion = document.querySelector("#new-question");
    const newType = document.querySelector("#new-type");
    const sampleQuestions = document.querySelector("#sample-questions");
    const createButton = document.querySelector("#create");
    const view = document.querySelector("#view");
    const stats = document.querySelector("#stats");
    const status = document.querySelector("#status");
    const toast = document.querySelector("#toast");
    const reports = document.querySelector("#reports");
    const onboarding = document.querySelector("#onboarding");

    function escapeHtml(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    function showToast(message, tone = "") {
      status.textContent = message;
      toast.textContent = message;
      toast.className = 'toast show ' + tone;
      window.clearTimeout(showToast.timer);
      showToast.timer = window.setTimeout(() => {
        toast.className = 'toast';
      }, 2600);
    }

    async function withBusy(button, label, task) {
      const previous = button ? button.textContent : "";
      if (button) {
        button.disabled = true;
        button.textContent = label;
      }
      try {
        return await task();
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = previous;
        }
      }
    }

    function isKoreanText(value) {
      return /[가-힣]/.test(String(value || ""));
    }

    function decisionUsesKorean(decision) {
      return isKoreanText([decision.title, decision.question, decision.context].join(" "));
    }

    function isArchivedFile(file) {
      return String(file || "").split(/[\\/]/).includes("archive");
    }

    function undoSnapshotKey(file) {
      return "decision-lab-undo:" + String(file || "");
    }

    function rememberUndoSnapshot(file, decision) {
      if (!file || !decision) return;
      localStorage.setItem(undoSnapshotKey(file), JSON.stringify({
        savedAt: new Date().toISOString(),
        decision
      }));
    }

    function readUndoSnapshot(file) {
      try {
        return JSON.parse(localStorage.getItem(undoSnapshotKey(file)) || "null");
      } catch {
        return null;
      }
    }

    function clearUndoSnapshot(file) {
      localStorage.removeItem(undoSnapshotKey(file));
    }

    function hasUndoSnapshot(file) {
      return !!readUndoSnapshot(file)?.decision;
    }

    function statusLabel(value, korean = false) {
      const labels = korean
        ? { draft: "초안", researching: "근거 수집 중", decided: "결정됨", reviewed: "리뷰 완료" }
        : { draft: "Draft", researching: "Building evidence", decided: "Decided", reviewed: "Reviewed" };
      return labels[value] || value || labels.draft;
    }

    function decisionStateSummary(decision, row = {}) {
      const korean = decisionUsesKorean(decision);
      const evidenceScore = row.evidence_quality_score || 0;
      const confidence = Math.round((decision.recommendation?.confidence || 0) * 100);
      if ((decision.status || "") === "reviewed") {
        return korean ? "리뷰가 끝났습니다. 교훈이 기록되었으면 아카이브해도 됩니다." : "Review is closed. Archive it once lessons are captured.";
      }
      if (evidenceScore < 60) {
        return korean ? "근거가 아직 약합니다. 결정을 믿기 전에 출처 있는 신호 하나를 추가하세요." : "Evidence is still thin. Add one sourced signal before trusting the call.";
      }
      if (confidence < 50) {
        return korean ? "확신도는 낮게 유지 중입니다. 다음 행동은 작고 되돌릴 수 있게 잡으세요." : "Confidence is intentionally low. Keep the next move small and reversible.";
      }
      return korean ? "기록은 작동 가능한 상태입니다. 다음 행동과 리뷰 날짜를 유지하세요." : "The record is operational. Keep the next action and review date current.";
    }

    function scoreClass(row) {
      if (row.maturity === "operational" || row.grade === "A") return "good";
      if (row.grade === "B") return "warn";
      return "bad";
    }

    function scorePercentClass(value) {
      if (value >= 80) return "good";
      if (value >= 50) return "warn";
      return "bad";
    }

    function metric(label, value) {
      return '<div class="metric"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>';
    }

    function healthItem(label, value, score) {
      const width = Math.max(0, Math.min(100, Number(score) || 0));
      return '<div class="health-item"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong><div class="meter"><div class="meter-fill" style="width:' + width + '%"></div></div></div>';
    }

    function nextMoveFor(decision, row) {
      const evidenceScore = row.evidence_quality_score ?? 0;
      if (evidenceScore < 60) return "Add one concrete evidence item, then regenerate the memo.";
      if ((decision.open_questions || []).length) return "Answer the highest-risk open question before changing the recommendation.";
      if ((decision.next_actions || []).length) return decision.next_actions[0];
      return "Review the memo and capture the next observable action.";
    }

    function priorityClass(row) {
      if ((row.priority || 0) >= 50) return "priority-high";
      if ((row.priority || 0) >= 25) return "priority-medium";
      return "priority-low";
    }

    function scoreTone(value) {
      if (value >= 80) return "good";
      if (value >= 50) return "warn";
      return "bad";
    }

    function scoreBar(label, value, grade) {
      const score = Math.max(0, Math.min(100, Number(value) || 0));
      const tone = scoreTone(score);
      return '<div class="score-row"><span><b>' + escapeHtml(label) + '</b><b>' + escapeHtml(score + "% " + (grade || "")) + '</b></span><div class="score-track"><div class="score-fill ' + tone + '" style="width:' + score + '%"></div></div></div>';
    }

    function focusRow(rows) {
      return [...rows].sort((a, b) => {
        if (!!b.due_review !== !!a.due_review) return Number(!!b.due_review) - Number(!!a.due_review);
        if ((a.evidence_quality_score || 0) !== (b.evidence_quality_score || 0)) return (a.evidence_quality_score || 0) - (b.evidence_quality_score || 0);
        return (b.priority || 0) - (a.priority || 0);
      })[0];
    }

    function rowNextMove(row) {
      if ((row.evidence_quality_score || 0) < 60) return "Add one concrete evidence item, then re-run the memo.";
      if (row.due_review) return "Open the review and record the outcome.";
      if ((row.priority || 0) >= 50) return "Resolve the highest-risk open question.";
      return "Open the memo and capture the next useful signal.";
    }

    function renderFocusHero(row, count) {
      const korean = isKoreanText(row.question || row.title);
      return '<section class="focus-hero">'
        + '<div>'
        + '<div class="focus-eyebrow">Focus Today</div>'
        + '<div class="focus-title">' + escapeHtml(row.title || row.question) + '</div>'
        + '<p class="focus-copy">' + escapeHtml(rowNextMove(row)) + '</p>'
        + '<div class="focus-meta">'
        + badge(row.type, "")
        + badge(statusLabel(row.status, korean), "")
        + badge((row.evidence_quality_score || 0) + "% evidence", scorePercentClass(row.evidence_quality_score || 0))
        + badge("priority " + (row.priority || 0), row.priority >= 50 ? "bad" : row.priority >= 25 ? "warn" : "good")
        + '</div>'
        + '</div>'
        + '<div class="focus-stats">'
        + '<div class="focus-stat"><span>Visible Decisions</span><strong>' + escapeHtml(count) + '</strong></div>'
        + '<div class="focus-stat"><span>Review Date</span><strong>' + escapeHtml(row.review_date || "Not set") + '</strong></div>'
        + '<button class="open-button" data-open="' + escapeHtml(row.file) + '">Open Focus</button>'
        + '</div>'
        + '</section>';
    }

    function renderDecisionCard(row) {
      const completeness = row.completeness_percent ?? Math.round(row.score / row.max_score * 100);
      const evidence = row.evidence_quality_score || 0;
      const korean = isKoreanText(row.question || row.title);
      const archived = isArchivedFile(row.file);
      return '<article class="decision-card ' + priorityClass(row) + '">'
        + '<div class="card-title-row">'
        + '<div><div class="card-title">' + escapeHtml(row.title) + '</div><div class="card-question">' + escapeHtml(row.question) + '</div></div>'
        + '<span class="pill ' + (row.priority >= 50 ? "bad" : row.priority >= 25 ? "warn" : "good") + '">' + escapeHtml(row.priority) + '</span>'
        + '</div>'
        + '<div class="card-recommendation"><span>Recommendation</span><strong>' + escapeHtml(row.decision || "Not decided") + '</strong><div class="small">' + escapeHtml(row.owner || "") + '</div></div>'
        + '<div class="score-pair">'
        + scoreBar("Completeness", completeness, row.completeness_grade || row.grade)
        + scoreBar("Evidence", evidence, row.evidence_quality_grade || "F")
        + '</div>'
        + '<div class="card-footer">'
        + '<div><span class="pill">' + escapeHtml(row.type) + '</span> <span class="pill">' + escapeHtml(statusLabel(row.status, korean)) + '</span>' + (archived ? ' <span class="pill warn">archive</span>' : '') + '<div class="small">Review ' + escapeHtml(row.review_date || "not set") + '</div></div>'
        + '<button class="open-button" data-open="' + escapeHtml(row.file) + '">Open</button>'
        + '</div>'
        + '</article>';
    }

    function actionTile(file, tab, label, title, copy, primary = false) {
      return '<button class="action-tile ' + (primary ? "primary" : "") + '" data-open="' + escapeHtml(file) + '" data-tab-target="' + escapeHtml(tab) + '">'
        + '<div><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(title) + '</strong></div>'
        + '<small>' + escapeHtml(copy) + '</small>'
        + '</button>';
    }

    function workflowTile(file, action, label, title, copy, primary = false) {
      return '<button class="action-tile ' + (primary ? "primary" : "") + '" data-workflow-action="' + escapeHtml(action) + '" data-file="' + escapeHtml(file) + '">'
        + '<div><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(title) + '</strong></div>'
        + '<small>' + escapeHtml(copy) + '</small>'
        + '</button>';
    }

    function renderSingleWorkbench(row) {
      const completeness = row.completeness_percent ?? Math.round(row.score / row.max_score * 100);
      const evidence = row.evidence_quality_score || 0;
      return '<section class="single-dashboard">'
        + '<div class="next-action-strip"><div><h3>One active decision</h3><p>' + escapeHtml(rowNextMove(row)) + '</p></div><button class="open-button" data-open="' + escapeHtml(row.file) + '">Open Decision</button></div>'
        + '<div class="single-status-grid">'
        + '<div class="single-status-card"><span>Recommendation</span><strong>' + escapeHtml(row.decision || "Not decided") + '</strong></div>'
        + '<div class="single-status-card"><span>Completeness</span><strong>' + escapeHtml(completeness + "% " + (row.completeness_grade || row.grade || "")) + '</strong></div>'
        + '<div class="single-status-card"><span>Evidence</span><strong>' + escapeHtml(evidence + "% " + (row.evidence_quality_grade || "F")) + '</strong></div>'
        + '<div class="single-status-card"><span>Review</span><strong>' + escapeHtml(row.review_date || "Not set") + '</strong></div>'
        + '</div>'
        + '<section class="workbench">'
        + '<div><h2>Work This Decision</h2><div class="small">Use these shortcuts instead of digging through JSON or the command line.</div></div>'
        + '<div class="workbench-grid">'
        + actionTile(row.file, "evidence", "Evidence", "Add Evidence", "Capture one concrete source or observation.", true)
        + workflowTile(row.file, "run", "Memo", "Regenerate Memo", "Refresh the memo after new signal.")
        + actionTile(row.file, "questions", "Questions", "Resolve Unknowns", "Write what would change the decision.")
        + actionTile(row.file, "actions", "Actions", "Set Next Move", "Record the smallest operational step.")
        + actionTile(row.file, "review", "Review", "Close Loop", "Record outcome, lesson, or status.")
        + '</div>'
        + '</section>'
        + '</section>';
    }

    function formatDate() {
      return new Date().toISOString().slice(0, 10);
    }

    function formatPercent(value) {
      if (typeof value !== "number") return "";
      return Math.round(value * 100) + "%";
    }

    function badge(value, className = "") {
      return '<span class="pill ' + className + '">' + escapeHtml(value || "") + '</span>';
    }

    function field(label, value) {
      return '<div class="detail-card"><h3>' + escapeHtml(label) + '</h3><p>' + escapeHtml(value || "Not set") + '</p></div>';
    }

    function frameItem(label, value) {
      return '<div class="frame-item"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value || "Not set") + '</strong></div>';
    }

    function renderOptions(options, selectedOption) {
      if (!options.length) return '<div class="empty-state">No options yet.</div>';
      return '<div class="option-grid">' + options.map((item) => {
        const selected = item.id === selectedOption;
        return '<article class="option-card ' + (selected ? "selected" : "") + '">'
          + '<h3>' + escapeHtml([item.id, item.name].filter(Boolean).join(". ") || "Unnamed option") + '</h3>'
          + '<p>' + escapeHtml(item.description || "No description yet.") + '</p>'
          + (selected ? '<div class="option-card-meta">' + badge("selected", "good") + '</div>' : '')
          + '</article>';
      }).join("") + '</div>';
    }

    function renderList(items, emptyText, renderItem = (item) => escapeHtml(item)) {
      if (!items || !items.length) return '<div class="empty"><p>' + escapeHtml(emptyText) + '</p></div>';
      return '<ul class="list">' + items.map((item) => '<li>' + renderItem(item) + '</li>').join("") + '</ul>';
    }

    function renderItemCards(items, emptyText, renderItem = (item) => escapeHtml(item)) {
      if (!items || !items.length) return '<div class="empty-state">' + escapeHtml(emptyText) + '</div>';
      return '<div class="item-grid">' + items.map((item) => '<article class="item-card">' + renderItem(item) + '</article>').join("") + '</div>';
    }

    function renderPresetButtons(group, attribute) {
      return '<div class="preset-row">' + Object.entries(CAPTURE_PRESETS[group] || {}).map(([id, preset]) => (
        '<button type="button" ' + attribute + '="' + escapeHtml(id) + '">' + escapeHtml(preset.label) + '</button>'
      )).join("") + '</div>';
    }

    function renderStats(payload) {
      const safeStats = payload.stats || {
        total: payload.count || 0,
        operational: 0,
        dueReviews: 0,
        averageCompleteness: 0,
        averageEvidenceQuality: 0
      };
      const rows = payload.rows || [];
      const needsEvidence = rows.filter((row) => (row.evidence_quality_score || 0) < 60).length;
      stats.innerHTML = [
        metric("Total", safeStats.total),
        metric("Operational", safeStats.operational),
        metric("Due Reviews", safeStats.dueReviews),
        metric("Completeness", (safeStats.averageCompleteness ?? safeStats.averageScore ?? 0) + "%"),
        metric("Evidence Quality", (safeStats.averageEvidenceQuality ?? 0) + "%"),
        metric("Needs Evidence", needsEvidence)
      ].join("");
    }

    function apiHeaders(extra = {}) {
      const token = localStorage.getItem(AUTH_STORAGE_KEY) || "";
      return token ? { ...extra, "x-api-key": token } : extra;
    }

    function archiveQuery() {
      return state.includeArchive ? '?includeArchive=yes' : '';
    }

    async function apiFetch(url, options = {}) {
      const response = await fetch(url, {
        ...options,
        headers: apiHeaders(options.headers || {})
      });
      if (response.status === 401) {
        renderAuthRequired();
        const error = new Error("API token required");
        error.authRequired = true;
        throw error;
      }
      return response;
    }

    function renderAuthRequired() {
      status.textContent = 'Token required';
      stats.innerHTML = '';
      reports.innerHTML = '';
      onboarding.innerHTML = '<h2>API Token</h2>'
        + step(1, 'Use the server token', 'Enter the token used when starting the local UI.', CLI_COMMAND + ' serve ' + ROOT_COMMAND_ARG + ' --token local-dev-token')
        + step(2, 'Retry loading', 'The token is stored only in this browser local storage.', 'Token header: x-api-key');
      attachCommandCopyHandlers(onboarding);
      view.innerHTML = '<div class="empty">'
        + '<h2>API token required</h2>'
        + '<p>This local server was started with token authentication. Enter the same token from your terminal command.</p>'
        + '<div class="field"><label for="api-token">API Token</label><input id="api-token" type="password" autocomplete="off" placeholder="local-dev-token"></div>'
        + '<button class="inline" id="save-token">Use token</button>'
        + '</div>';
      const input = document.querySelector("#api-token");
      const button = document.querySelector("#save-token");
      button.addEventListener("click", () => {
        localStorage.setItem(AUTH_STORAGE_KEY, input.value.trim());
        boot();
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") button.click();
      });
      input.focus();
    }

    function renderOnboarding(payload) {
      const hasRecords = payload.count > 0;
      if (hasRecords) {
        onboarding.innerHTML = '<h2>Operating Loop</h2>'
          + step(1, 'Open focus', 'Use the green Open Focus button, then work inside Evidence, Questions, and Actions.', 'Open Focus')
          + step(2, 'Strengthen evidence', 'Add one concrete source, observation, or customer note before changing the call.', 'Evidence tab -> Add Evidence')
          + step(3, 'Regenerate memo', 'Use the Memo button in the workspace, or re-run the workflow from the terminal.', CLI_COMMAND + ' run <decision.json> --out-dir <decision>/run')
          + step(4, 'Check privacy', 'Run the local privacy check before sharing or pushing.', CLI_COMMAND + ' privacy-check')
          + renderFirstUserTestChecklist();
        attachCommandCopyHandlers(onboarding);
        return;
      }
      onboarding.innerHTML = '<h2>First Run</h2>'
        + step(1, 'Start a decision', 'Create a private workspace and first memo in one command.', CLI_COMMAND + ' start "Should we change enterprise pricing this quarter?" --type business --owner "Your Name" --slug pricing')
        + step(2, 'Read the memo', 'Open the memo before editing JSON or starting the server.', 'less decisions/active/pricing/run/memo.md')
        + step(3, 'Open local UI', 'Use the browser workspace for Evidence, Questions, Actions, and Memo.', CLI_COMMAND + ' serve ' + ROOT_COMMAND_ARG + ' --token local-dev-token --actor "Your Name"')
        + step(4, 'Add one signal', 'Capture the first question or evidence item in the UI, or from the command line.', CLI_COMMAND + ' capture decisions/active/pricing/decision.json --kind evidence --text "What did you learn?" --source "First source" --strength medium')
        + step(5, 'Check privacy', 'Run the local privacy check before sharing or pushing.', CLI_COMMAND + ' privacy-check')
        + renderFirstUserTestChecklist();
      attachCommandCopyHandlers(onboarding);
    }

    function renderFirstUserTestChecklist() {
      return '<section class="test-checklist"><h3>10-minute user test</h3><ol>'
        + FIRST_USER_TEST_STEPS.map((item) => '<li>' + escapeHtml(item) + '</li>').join("")
        + '</ol></section>';
    }

    function step(index, title, copy, command) {
      return '<div class="step"><span class="step-index">' + index + '</span><div>'
        + '<div class="step-title">' + escapeHtml(title) + '</div>'
        + '<div class="step-copy">' + escapeHtml(copy) + '</div>'
        + '<details class="command-toggle"><summary>Command</summary>'
        + '<div class="command-head"><button type="button" class="copy-command" data-command-copy="' + escapeHtml(command) + '">Copy</button></div>'
        + '<div class="command">' + escapeHtml(command) + '</div></details>'
        + '</div></div>';
    }

    function attachCommandCopyHandlers(scope) {
      scope.querySelectorAll("[data-command-copy]").forEach((button) => {
        button.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          await copyCommand(button.dataset.commandCopy || "", button);
        });
      });
    }

    async function copyCommand(command, button) {
      if (!command) return;
      try {
        await navigator.clipboard.writeText(command);
      } catch {
        const fallback = document.createElement("textarea");
        fallback.value = command;
        fallback.setAttribute("readonly", "readonly");
        fallback.style.position = "fixed";
        fallback.style.opacity = "0";
        document.body.appendChild(fallback);
        fallback.select();
        document.execCommand("copy");
        fallback.remove();
      }
      const previous = button.textContent;
      button.textContent = "Copied";
      showToast("Command copied", "good");
      window.setTimeout(() => {
        button.textContent = previous;
      }, 1200);
    }

    function renderSampleQuestions() {
      sampleQuestions.innerHTML = SAMPLE_QUESTIONS.map((sample, index) => (
        '<button type="button" data-sample-question="' + index + '">' + escapeHtml(sample.label) + '</button>'
      )).join("");
      sampleQuestions.querySelectorAll("[data-sample-question]").forEach((button) => {
        button.addEventListener("click", () => {
          const sample = SAMPLE_QUESTIONS[Number(button.dataset.sampleQuestion)] || SAMPLE_QUESTIONS[0];
          newQuestion.value = sample.question;
          newType.value = sample.type || "";
          newQuestion.focus();
        });
      });
    }

    function filteredRows() {
      const query = search.value.trim().toLowerCase();
      return state.rows.filter((row) => {
        const haystack = [row.title, row.question, row.owner, row.decision, row.file].join(" ").toLowerCase();
        return (!query || haystack.includes(query))
          && (!type.value || row.type === type.value)
          && (!decisionStatus.value || row.status === decisionStatus.value);
      });
    }

    function renderTable() {
      state.activeReport = "";
      state.activeFile = "";
      renderReportButtons();
      const rows = filteredRows();
      if (!rows.length) {
        const hasAny = state.rows.length > 0;
        view.innerHTML = '<div class="empty">'
          + '<h2>' + (hasAny ? 'No matching decisions' : 'Start your first decision') + '</h2>'
          + '<p>' + (hasAny ? 'Adjust the filters, include archive, or open a report from the left rail.' : 'Paste one real question in the left rail. Decision Lab will create the JSON record and first memo for you.') + '</p>'
          + (hasAny ? '' : '<button class="inline secondary" id="seed-question">Use sample question</button>')
          + '</div>';
        const seed = document.querySelector("#seed-question");
        if (seed) seed.addEventListener("click", () => {
          newQuestion.value = "Should we pilot enterprise pricing this quarter?";
          newType.value = "business";
          newQuestion.focus();
        });
        return;
      }
      const focus = focusRow(rows);
      view.innerHTML = '<div class="board-shell">'
        + renderFocusHero(focus, rows.length)
        + (rows.length === 1
          ? renderSingleWorkbench(focus)
          : '<div class="board-toolbar"><div><h2>Decision Board</h2><div class="small">Cards are ordered by the current filters. Open the focus item first.</div></div><span class="small">' + rows.length + ' visible</span></div><div class="ledger-grid">' + rows.map(renderDecisionCard).join("") + '</div>')
        + '</div>';
      attachWorkflowHandlers(view);
    }

    function renderReportButtons() {
      reports.innerHTML = '<button data-report="">Ledger</button>'
        + '<details class="nav-section"><summary>Reports</summary><div class="nav-list">'
        + state.reports.map((report) => (
          '<button data-report="' + escapeHtml(report.id) + '" class="' + (state.activeReport === report.id ? "active" : "") + '">' + escapeHtml(report.title) + '</button>'
        )).join("")
        + '</div></details>';
      reports.querySelectorAll("button").forEach((button) => {
        if (!button.dataset.report && !state.activeReport) button.classList.add("active");
        button.addEventListener("click", () => {
          if (!button.dataset.report) renderTable();
          else loadReport(button.dataset.report);
        });
      });
    }

    async function loadReport(id) {
      state.activeReport = id;
      state.activeFile = "";
      renderReportButtons();
      const response = await apiFetch('/api/report/' + encodeURIComponent(id) + archiveQuery());
      view.innerHTML = renderMarkdown(await response.text());
    }

    async function openDecision(file, tab = "summary") {
      state.activeReport = "";
      state.activeFile = file;
      state.activeTab = tab;
      renderReportButtons();
      const response = await apiFetch('/api/decision?file=' + encodeURIComponent(file));
      const payload = await response.json();
      if (!response.ok || payload.error) {
        view.innerHTML = '<div class="report bad">' + escapeHtml(payload.error || "Could not load decision") + '</div>';
        return;
      }
      state.activeDecision = payload;
      renderDecisionDetail(payload, tab);
    }

    function renderDecisionDetail(payload, tab) {
      const decision = payload.decision;
      const tabs = [
        ["summary", "Summary"],
        ["memo", "Memo"],
        ["evidence", "Evidence"],
        ["questions", "Questions"],
        ["risks", "Risks"],
        ["actions", "Actions"],
        ["review", "Review"],
        ["raw", "Raw JSON"]
      ];
      view.innerHTML = '<div class="decision-detail">'
        + renderDecisionHero(payload)
        + '<div class="tabs detail-tabs">' + tabs.map(([id, label]) => '<button class="secondary ' + (tab === id ? "active" : "") + '" data-tab="' + id + '">' + label + '</button>').join("") + '</div>'
        + renderDecisionTab(payload, tab)
        + '</div>';
      document.querySelector("#back-ledger").addEventListener("click", renderTable);
      view.querySelectorAll("[data-tab]").forEach((button) => {
        button.addEventListener("click", () => renderDecisionDetail(payload, button.dataset.tab));
      });
      view.querySelectorAll("[data-jump-tab]").forEach((button) => {
        button.addEventListener("click", () => renderDecisionDetail(payload, button.dataset.jumpTab));
      });
      attachDecisionTabHandlers(tab);
      attachWorkflowHandlers(view);
    }

    function renderDecisionHero(payload) {
      const decision = payload.decision;
      const row = payload.row || {};
      const recommendation = decision.recommendation || {};
      const korean = decisionUsesKorean(decision);
      const completeness = row.completeness_percent ?? 0;
      const evidence = row.evidence_quality_score ?? 0;
      const confidence = Math.round((recommendation.confidence || 0) * 100);
      return '<section class="detail-hero">'
        + '<div class="detail-hero-top">'
        + '<div><div class="brief-label">Decision Workspace</div>'
        + '<div class="detail-title">' + escapeHtml(decision.title || decision.question) + '</div>'
        + '<div class="detail-recommendation">' + escapeHtml(recommendation.decision || recommendation.summary || "No recommendation yet.") + '</div>'
        + '<div class="focus-meta">'
        + badge(statusLabel(decision.status, korean), "")
        + badge(decision.decision_type || "general", "")
        + badge((row.priority ?? 0) + " priority", (row.priority || 0) >= 50 ? "bad" : (row.priority || 0) >= 25 ? "warn" : "good")
        + '</div>'
        + '<div class="detail-path">' + escapeHtml(payload.filePath) + '</div></div>'
        + '<div class="hero-actions">'
        + '<button class="primary-action" data-jump-tab="evidence">Add Evidence</button>'
        + '<button data-jump-tab="memo">Memo</button>'
        + '<button data-workflow-action="run" data-file="' + escapeHtml(state.activeFile) + '">Regenerate</button>'
        + '<button data-workflow-action="undo" data-file="' + escapeHtml(state.activeFile) + '">Undo</button>'
        + '<button data-jump-tab="review">Review</button>'
        + '<button id="back-ledger">Ledger</button>'
        + '</div></div>'
        + '<div class="detail-kpis">'
        + '<div class="detail-kpi"><span>Evidence Quality</span><strong>' + escapeHtml(evidence + "% " + (row.evidence_quality_grade || "F")) + '</strong></div>'
        + '<div class="detail-kpi"><span>Completeness</span><strong>' + escapeHtml(completeness + "% " + (row.completeness_grade || "")) + '</strong></div>'
        + '<div class="detail-kpi"><span>Confidence</span><strong>' + escapeHtml(confidence + "%") + '</strong></div>'
        + '<div class="detail-kpi"><span>Review Date</span><strong>' + escapeHtml(recommendation.review_date || "Not set") + '</strong></div>'
        + '</div>'
        + '</section>';
    }

    function renderDecisionTab(payload, tab) {
      const decision = payload.decision;
      if (tab === "memo") return renderMemoTab(decision, payload.memo, payload.row || {});
      if (tab === "evidence") return renderEvidenceTab(decision);
      if (tab === "questions") return renderQuestionsTab(decision);
      if (tab === "risks") return renderRisksTab(decision);
      if (tab === "actions") return renderActionsTab(decision);
      if (tab === "review") return renderReviewTab(decision);
      if (tab === "raw") {
        return '<div class="actions"><button id="save" class="inline">Save JSON</button><span class="small">' + escapeHtml(payload.validation.valid ? "Valid record" : "Needs fixes") + '</span></div>'
          + '<textarea id="editor" spellcheck="false">' + escapeHtml(JSON.stringify(decision, null, 2)) + '</textarea>';
      }
      return renderSummaryTab(decision, payload.validation, payload.row || {});
    }

    function renderSummaryTab(decision, validation, row) {
      const recommendation = decision.recommendation || {};
      const frame = decision.decision_frame || {};
      const option = (decision.options || []).find((item) => item.id === recommendation.selected_option);
      const strongEvidence = (decision.evidence || []).filter((item) => item.strength === "strong").length;
      const evidenceScore = row.evidence_quality_score ?? 0;
      const completenessScore = row.completeness_percent ?? 0;
      const confidenceScore = Math.round((recommendation.confidence || 0) * 100);
      const nextMove = nextMoveFor(decision, row);
      const decisionType = decision.decision_type || decision.type || "general";
      const korean = decisionUsesKorean(decision);
      const validationIssues = validation.errors || validation.issues || [];
      return '<div class="summary-page">'
        + '<section class="decision-brief">'
        + '<div><div class="brief-label">Decision Brief</div><div class="brief-title">' + escapeHtml(decision.question || decision.title) + '</div>'
        + '<div class="focus-meta">' + badge(statusLabel(decision.status, korean), "") + badge(decisionType, "") + badge(strongEvidence + " strong evidence", strongEvidence > 0 ? "good" : "warn") + '</div>'
        + '<div class="brief-decision"><span>Recommendation</span><strong>' + escapeHtml(recommendation.decision || recommendation.summary || "Not decided") + '</strong><div class="small">' + escapeHtml(option ? option.name + " (" + option.id + ")" : recommendation.selected_option || "") + '</div></div></div>'
        + '<div class="brief-side">'
        + '<div class="brief-stat"><span>Evidence Quality</span><strong>' + escapeHtml(evidenceScore + "% " + (row.evidence_quality_grade || "F")) + '</strong></div>'
        + '<div class="brief-stat"><span>Completeness</span><strong>' + escapeHtml(completenessScore + "% " + (row.completeness_grade || "")) + '</strong></div>'
        + '<div class="brief-stat"><span>Confidence</span><strong>' + escapeHtml(confidenceScore + "%") + '</strong></div>'
        + '</div></section>'
        + '<section class="focus-panel">'
        + '<div><h3>Focus Now</h3><p>' + escapeHtml(decisionStateSummary(decision, row)) + '</p><div class="small next-move-detail">' + escapeHtml(nextMove) + '</div><div class="focus-meta">'
        + badge((row.evidence_quality_grade || "F") + ' evidence', scorePercentClass(evidenceScore))
        + badge((row.completeness_grade || "") + ' completeness', scorePercentClass(completenessScore))
        + badge(statusLabel(decision.status, korean), "")
        + '</div></div>'
        + '<div class="quick-actions">'
        + '<button class="secondary" data-jump-tab="evidence">Add Evidence</button>'
        + '<button class="secondary" data-workflow-action="run" data-file="' + escapeHtml(state.activeFile) + '">Regenerate Memo</button>'
        + '<button class="secondary" data-promote-status="decided" data-file="' + escapeHtml(state.activeFile) + '">Mark Decided</button>'
        + (korean ? '<button class="secondary" data-workflow-action="localize" data-file="' + escapeHtml(state.activeFile) + '">Polish Korean</button>' : '')
        + '<button class="secondary" data-jump-tab="review">Review</button>'
        + '</div>'
        + '</section>'
        + '<div class="frame-strip">'
        + frameItem("Class", frame.decision_class)
        + frameItem("Default", frame.default_action)
        + frameItem("Reversibility", frame.reversibility)
        + frameItem("Urgency", frame.urgency)
        + '</div>'
        + '<div class="section-heading"><h3>Options</h3><span class="small">' + (decision.options || []).length + ' choices</span></div>'
        + renderOptions(decision.options || [], recommendation.selected_option)
        + renderSummaryEditPanel(decision, recommendation, frame)
        + '<div class="validation-panel ' + (validation.valid ? "good" : "bad") + '"><div class="title">Validation</div><div class="small">' + escapeHtml(validation.valid ? "Ready to operate. Keep improving evidence before final commitment." : validationIssues.join(", ")) + '</div></div>'
        + '</div>';
    }

    function renderSummaryEditPanel(decision, recommendation, frame) {
      const options = decision.options || [];
      const optionChoices = options.map((item) => (
        '<option value="' + escapeHtml(item.id || "") + '" ' + (item.id === recommendation.selected_option ? "selected" : "") + '>' + escapeHtml([item.id, item.name].filter(Boolean).join(" - ")) + '</option>'
      )).join("");
      return '<section class="edit-panel" id="summary-edit-panel">'
        + '<div><h3>Edit Decision</h3><p>Tune the recommendation, selected option, and frame without opening Raw JSON.</p></div>'
        + '<div class="form-grid">'
        + '<div class="wide"><label for="edit-recommendation">Recommendation</label><input id="edit-recommendation" type="text" value="' + escapeHtml(recommendation.decision || "") + '" placeholder="Current call"></div>'
        + '<div><label for="edit-selected-option">Selected Option</label><select id="edit-selected-option">' + optionChoices + '</select></div>'
        + '<div><label for="edit-confidence">Confidence %</label><input id="edit-confidence" type="number" min="0" max="100" step="1" value="' + escapeHtml(Math.round((recommendation.confidence || 0) * 100)) + '"></div>'
        + '<div><label for="edit-default-action">Default Action</label><input id="edit-default-action" type="text" value="' + escapeHtml(frame.default_action || "") + '"></div>'
        + '<div><label for="edit-reversibility">Reversibility</label><input id="edit-reversibility" type="text" value="' + escapeHtml(frame.reversibility || "") + '"></div>'
        + '<div><label for="edit-urgency">Urgency</label><input id="edit-urgency" type="text" value="' + escapeHtml(frame.urgency || "") + '"></div>'
        + '</div>'
        + '<div><div class="section-heading"><h3>Option Copy</h3><span class="small">' + options.length + ' editable</span></div><div class="option-edit-list">'
        + options.map((item) => '<div class="option-edit-row" data-option-edit="' + escapeHtml(item.id || "") + '">'
          + '<div class="option-id">' + escapeHtml(item.id || "?") + '</div>'
          + '<div><label>Name</label><input data-option-name type="text" value="' + escapeHtml(item.name || "") + '"></div>'
          + '<div><label>Description</label><input data-option-description type="text" value="' + escapeHtml(item.description || "") + '"></div>'
          + '</div>').join("")
        + '</div></div>'
        + '<div class="status-actions"><button class="inline" id="save-summary-edits">Save edits</button><button class="inline secondary" data-workflow-action="run" data-file="' + escapeHtml(state.activeFile) + '">Regenerate Memo</button></div>'
        + '</section>';
    }

    function memoCard(title, items, emptyText) {
      const safeItems = (items || []).filter(Boolean).slice(0, 5);
      return '<section class="memo-card"><h3>' + escapeHtml(title) + '</h3>'
        + (safeItems.length
          ? '<ul>' + safeItems.map((item) => '<li>' + escapeHtml(item) + '</li>').join("") + '</ul>'
          : '<div class="small">' + escapeHtml(emptyText) + '</div>')
        + '</section>';
    }

    function renderMemoTab(decision, memo, row) {
      const recommendation = decision.recommendation || {};
      const review = decision.post_decision_review || {};
      const korean = decisionUsesKorean(decision);
      const strongEvidence = (decision.evidence || []).filter((item) => item.strength === "strong").map((item) => item.claim || item.source || "");
      const weakEvidence = (decision.evidence || []).filter((item) => item.strength !== "strong").map((item) => item.claim || item.source || "");
      const labels = korean
        ? {
          heading: "결정 메모",
          current: "현재 판단",
          why: "판단 상태",
          evidence: "강한 근거",
          gaps: "근거 갭",
          change: "판단이 바뀌는 조건",
          signals: "리뷰 신호",
          questions: "열린 질문",
          actions: "다음 행동",
          full: "전체 Markdown memo"
        }
        : {
          heading: "Decision Memo",
          current: "Current Call",
          why: "Decision State",
          evidence: "Strong Evidence",
          gaps: "Evidence Gaps",
          change: "Change-Mind Triggers",
          signals: "Review Signals",
          questions: "Open Questions",
          actions: "Next Actions",
          full: "Full Markdown Memo"
        };
      return '<div class="memo-page">'
        + '<section class="memo-hero"><div class="brief-label">' + escapeHtml(labels.heading) + '</div><h2>' + escapeHtml(recommendation.decision || labels.current) + '</h2>'
        + '<p>' + escapeHtml(decisionStateSummary(decision, row)) + '</p>'
        + '<div class="focus-meta">'
        + badge(statusLabel(decision.status, korean), "")
        + badge((row.evidence_quality_score || 0) + "% evidence", scorePercentClass(row.evidence_quality_score || 0))
        + badge(Math.round((recommendation.confidence || 0) * 100) + "% confidence", scorePercentClass(Math.round((recommendation.confidence || 0) * 100)))
        + '</div></section>'
        + '<div class="memo-grid">'
        + memoCard(labels.why, [recommendation.summary || "", nextMoveFor(decision, row)], "No recommendation summary yet.")
        + memoCard(labels.evidence, strongEvidence, "No strong evidence yet.")
        + memoCard(labels.gaps, weakEvidence, "No obvious evidence gaps.")
        + memoCard(labels.change, decision.what_would_change_my_mind || [], "No change-mind triggers.")
        + memoCard(labels.signals, [...(review.expected_signals || []), ...(review.failure_signals || [])], "No review signals.")
        + memoCard(labels.questions, decision.open_questions || [], "No open questions.")
        + memoCard(labels.actions, decision.next_actions || [], "No next actions.")
        + '</div>'
        + '<div class="status-actions">'
        + '<button class="inline" data-workflow-action="run" data-file="' + escapeHtml(state.activeFile) + '">Regenerate Memo</button>'
        + '<button class="inline secondary" data-jump-tab="evidence">Add Evidence</button>'
        + '<button class="inline secondary" data-jump-tab="review">Review</button>'
        + '</div>'
        + '<details class="memo-full"><summary>' + escapeHtml(labels.full) + '</summary>' + renderMarkdown(memo) + '</details>'
        + '</div>';
    }

    function renderEvidenceTab(decision) {
      return '<div class="tab-page">'
        + '<section class="capture-panel"><h3>Add evidence</h3><p>Capture one source, observation, or release check. Strong evidence should be specific and sourced.</p>'
        + renderPresetButtons("evidence", "data-evidence-preset")
        + '<div class="capture-grid">'
        + '<div><label for="capture-claim">Evidence claim</label><input id="capture-claim" type="text" placeholder="What did we learn?"></div>'
        + '<div><label for="capture-source">Source</label><input id="capture-source" type="text" placeholder="customer call, metric, release check"></div>'
        + '<div><label for="capture-strength">Strength</label><select id="capture-strength"><option value="strong">Strong</option><option value="medium">Medium</option><option value="weak">Weak</option></select></div>'
        + '<button id="add-evidence">Add</button>'
        + '</div></section>'
        + '<div class="section-heading"><h3>Evidence Log</h3><span class="small">' + (decision.evidence || []).length + ' items</span></div>'
        + renderItemCards(decision.evidence || [], "No evidence captured yet.", (item) => '<div class="title">' + escapeHtml(item.claim || item) + '</div><div class="small">' + badge(item.strength || "unknown", item.strength === "strong" ? "good" : item.strength === "weak" ? "bad" : "warn") + ' ' + escapeHtml(item.source || "") + '</div>')
        + '</div>';
    }

    function renderQuestionsTab(decision) {
      return '<div class="tab-page">'
        + '<section class="capture-panel"><h3>Add open question</h3><p>Write the uncertainty that would change the recommendation or reduce risk.</p>'
        + renderPresetButtons("questions", "data-question-preset")
        + '<div class="capture-grid compact"><div><label for="capture-question">Open question</label><input id="capture-question" type="text" placeholder="What would change the decision?"></div><button id="add-question">Add</button></div></section>'
        + '<div class="section-heading"><h3>Question Queue</h3><span class="small">' + (decision.open_questions || []).length + ' items</span></div>'
        + renderItemCards(decision.open_questions || [], "No open questions yet.")
        + '</div>';
    }

    function renderActionsTab(decision) {
      return '<div class="tab-page">'
        + '<section class="capture-panel"><h3>Add next action</h3><p>Keep it small, observable, and tied to the current decision state.</p>'
        + renderPresetButtons("actions", "data-action-preset")
        + '<div class="capture-grid compact"><div><label for="capture-action">Next action</label><input id="capture-action" type="text" placeholder="Smallest next move"></div><button id="add-action">Add</button></div></section>'
        + '<div class="section-heading"><h3>Action Queue</h3><span class="small">' + (decision.next_actions || []).length + ' items</span></div>'
        + renderItemCards(decision.next_actions || [], "No next actions yet.")
        + '</div>';
    }

    function renderRisksTab(decision) {
      return '<div class="tab-page">'
        + '<section class="capture-panel"><h3>Add risk</h3><p>Make the risk observable by pairing it with a trigger and impact level.</p>'
        + renderPresetButtons("risks", "data-risk-preset")
        + '<div class="capture-grid">'
        + '<div><label for="capture-risk">Risk</label><input id="capture-risk" type="text" placeholder="What could break this decision?"></div>'
        + '<div><label for="capture-risk-trigger">Trigger</label><input id="capture-risk-trigger" type="text" placeholder="observable trigger"></div>'
        + '<div><label for="capture-risk-impact">Impact</label><select id="capture-risk-impact"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></div>'
        + '<button id="add-risk">Add</button>'
        + '</div></section>'
        + '<div class="section-heading"><h3>Risk Register</h3><span class="small">' + (decision.risks || []).length + ' items</span></div>'
        + renderItemCards(decision.risks || [], "No risks captured yet.", (item) => '<div class="title">' + escapeHtml(item.risk || item) + '</div><div class="small">' + escapeHtml([item.probability, item.impact, item.trigger].filter(Boolean).join(" / ")) + '</div><div class="small">' + escapeHtml(item.mitigation || "") + '</div>')
        + '</div>';
    }

    function renderReviewTab(decision) {
      const review = decision.post_decision_review || {};
      const korean = decisionUsesKorean(decision);
      const archived = isArchivedFile(state.activeFile);
      const outcomeLabel = korean ? "실제 결과" : "Actual outcome";
      const lessonLabel = korean ? "교훈" : "Lesson";
      return '<div class="tab-page">'
        + (archived ? '<section class="restore-banner"><h3>' + escapeHtml(korean ? "아카이브됨" : "Archived decision") + '</h3><p class="small">' + escapeHtml(korean ? "필요하면 active 폴더로 되돌려 다시 운영할 수 있습니다." : "Restore it to active decisions when it needs another operating loop.") + '</p><div class="status-actions"><button class="inline" data-workflow-action="restore" data-file="' + escapeHtml(state.activeFile) + '">Restore to Active</button></div></section>' : '')
        + '<section class="capture-panel"><h3>' + escapeHtml(korean ? "리뷰 닫기" : "Close review") + '</h3><p>' + escapeHtml(korean ? "결과와 교훈을 남기면 상태가 리뷰 완료로 바뀝니다." : "Capture the outcome and lesson, then close this decision as reviewed.") + '</p>'
        + '<div class="review-grid">'
        + '<div><label for="review-outcome">' + escapeHtml(outcomeLabel) + '</label><textarea id="review-outcome" class="short-textarea" placeholder="' + escapeHtml(outcomeLabel) + '">' + escapeHtml(review.actual_outcome || "") + '</textarea></div>'
        + '<div><label for="review-lesson">' + escapeHtml(lessonLabel) + '</label><textarea id="review-lesson" class="short-textarea" placeholder="' + escapeHtml(lessonLabel) + '">' + escapeHtml((review.lessons || [])[0] || "") + '</textarea></div>'
        + '</div><div class="status-actions"><button id="close-review" class="inline">Close Review</button></div></section>'
        + '<section class="capture-panel"><h3>Status</h3><p>' + escapeHtml(decisionStateSummary(decision, state.activeDecision?.row || {})) + '</p>'
        + '<div class="status-actions">'
        + '<button class="secondary" data-promote-status="draft" data-file="' + escapeHtml(state.activeFile) + '">Draft</button>'
        + '<button class="secondary" data-promote-status="researching" data-file="' + escapeHtml(state.activeFile) + '">Researching</button>'
        + '<button class="secondary" data-promote-status="decided" data-file="' + escapeHtml(state.activeFile) + '">Decided</button>'
        + (archived
          ? '<button class="secondary" data-workflow-action="restore" data-file="' + escapeHtml(state.activeFile) + '">Restore</button>'
          : '<button class="danger" data-workflow-action="archive" data-file="' + escapeHtml(state.activeFile) + '">Archive</button>')
        + '</div></section>'
        + '<div class="section-heading"><h3>' + escapeHtml(korean ? "리뷰 기준" : "Review Criteria") + '</h3><span class="small">' + escapeHtml(decision.recommendation?.review_date || "No date") + '</span></div>'
        + renderItemCards(review.success_metrics || [], korean ? "성공 지표가 없습니다." : "No success metrics.")
        + renderItemCards(review.failure_signals || [], korean ? "실패 신호가 없습니다." : "No failure signals.")
        + '</div>';
    }

    function attachDecisionTabHandlers(tab) {
      if (tab === "summary") {
        document.querySelector("#save-summary-edits")?.addEventListener("click", saveSummaryEdits);
      }
      if (tab === "raw") {
        document.querySelector("#save").addEventListener("click", saveDecision);
      }
      if (tab === "evidence") {
        document.querySelector("#add-evidence").addEventListener("click", addEvidence);
        attachEvidencePresets();
      }
      if (tab === "questions") {
        document.querySelector("#add-question").addEventListener("click", addQuestion);
        attachQuestionPresets();
      }
      if (tab === "risks") {
        document.querySelector("#add-risk").addEventListener("click", addRisk);
        attachRiskPresets();
      }
      if (tab === "actions") {
        document.querySelector("#add-action").addEventListener("click", addAction);
        attachActionPresets();
      }
      if (tab === "review") {
        document.querySelector("#close-review").addEventListener("click", closeReview);
      }
    }

    function attachEvidencePresets() {
      const presets = CAPTURE_PRESETS.evidence || {};
      document.querySelectorAll("[data-evidence-preset]").forEach((button) => {
        button.addEventListener("click", () => {
          const preset = presets[button.dataset.evidencePreset] || presets.customer;
          document.querySelector("#capture-claim").value = preset.claim || "";
          document.querySelector("#capture-source").value = preset.source || "";
          document.querySelector("#capture-strength").value = preset.strength || "medium";
          document.querySelector("#capture-claim").focus();
        });
      });
    }

    function attachQuestionPresets() {
      const presets = CAPTURE_PRESETS.questions || {};
      document.querySelectorAll("[data-question-preset]").forEach((button) => {
        button.addEventListener("click", () => {
          const preset = presets[button.dataset.questionPreset] || presets.change;
          document.querySelector("#capture-question").value = preset.text || "";
          document.querySelector("#capture-question").focus();
        });
      });
    }

    function attachActionPresets() {
      const presets = CAPTURE_PRESETS.actions || {};
      document.querySelectorAll("[data-action-preset]").forEach((button) => {
        button.addEventListener("click", () => {
          const preset = presets[button.dataset.actionPreset] || presets.interview;
          document.querySelector("#capture-action").value = preset.text || "";
          document.querySelector("#capture-action").focus();
        });
      });
    }

    function attachRiskPresets() {
      const presets = CAPTURE_PRESETS.risks || {};
      document.querySelectorAll("[data-risk-preset]").forEach((button) => {
        button.addEventListener("click", () => {
          const preset = presets[button.dataset.riskPreset] || presets.adoption;
          document.querySelector("#capture-risk").value = preset.risk || "";
          document.querySelector("#capture-risk-trigger").value = preset.trigger || "";
          document.querySelector("#capture-risk-impact").value = preset.impact || "medium";
          document.querySelector("#capture-risk").focus();
        });
      });
    }

    async function saveSummaryEdits() {
      if (!state.activeDecision?.decision) return;
      const decision = structuredClone(state.activeDecision.decision);
      const recommendation = decision.recommendation || {};
      const frame = decision.decision_frame || {};
      const confidence = Number(document.querySelector("#edit-confidence")?.value || 0);
      decision.updated_at = formatDate();
      decision.recommendation = {
        ...recommendation,
        decision: document.querySelector("#edit-recommendation")?.value.trim() || recommendation.decision || "",
        summary: document.querySelector("#edit-recommendation")?.value.trim() || recommendation.summary || "",
        selected_option: document.querySelector("#edit-selected-option")?.value || recommendation.selected_option || "",
        confidence: Math.max(0, Math.min(1, confidence / 100))
      };
      decision.decision_frame = {
        ...frame,
        default_action: document.querySelector("#edit-default-action")?.value.trim() || frame.default_action || "",
        reversibility: document.querySelector("#edit-reversibility")?.value.trim() || frame.reversibility || "",
        urgency: document.querySelector("#edit-urgency")?.value.trim() || frame.urgency || ""
      };
      const optionEdits = new Map([...document.querySelectorAll("[data-option-edit]")].map((row) => [
        row.dataset.optionEdit,
        {
          name: row.querySelector("[data-option-name]")?.value.trim() || "",
          description: row.querySelector("[data-option-description]")?.value.trim() || ""
        }
      ]));
      decision.options = (decision.options || []).map((item) => {
        const edit = optionEdits.get(item.id);
        return edit ? { ...item, name: edit.name || item.name, description: edit.description || item.description } : item;
      });
      await persistDecision(decision, "summary");
    }

    async function addEvidence() {
      const claim = document.querySelector("#capture-claim").value.trim();
      if (!claim) return;
      const source = document.querySelector("#capture-source").value.trim();
      const strength = document.querySelector("#capture-strength").value;
      const decision = structuredClone(state.activeDecision.decision);
      decision.updated_at = formatDate();
      decision.evidence = [...(decision.evidence || []), {
        claim,
        source: source || "UI capture",
        strength,
        source_type: source ? "quick_capture" : "user_note",
        source_url: "",
        recency: "current",
        notes: "Captured in the local Decision Lab UI."
      }];
      await persistDecision(decision, "evidence");
    }

    async function addQuestion() {
      const text = document.querySelector("#capture-question").value.trim();
      if (!text) return;
      const decision = structuredClone(state.activeDecision.decision);
      decision.updated_at = formatDate();
      decision.open_questions = [...(decision.open_questions || []), text];
      await persistDecision(decision, "questions");
    }

    async function addAction() {
      const text = document.querySelector("#capture-action").value.trim();
      if (!text) return;
      const decision = structuredClone(state.activeDecision.decision);
      decision.updated_at = formatDate();
      decision.next_actions = [...(decision.next_actions || []), text];
      await persistDecision(decision, "actions");
    }

    async function addRisk() {
      const risk = document.querySelector("#capture-risk").value.trim();
      if (!risk) return;
      const trigger = document.querySelector("#capture-risk-trigger").value.trim();
      const impact = document.querySelector("#capture-risk-impact").value;
      const decision = structuredClone(state.activeDecision.decision);
      decision.updated_at = formatDate();
      decision.risks = [...(decision.risks || []), {
        risk,
        probability: "medium",
        impact,
        trigger: trigger || "Captured in the local Decision Lab UI.",
        mitigation: "Define mitigation before commitment."
      }];
      await persistDecision(decision, "risks");
    }

    async function saveDecision() {
      const editor = document.querySelector("#editor");
      let decision;
      try {
        decision = JSON.parse(editor.value);
      } catch (error) {
        showToast('Invalid JSON', 'bad');
        return;
      }
      await persistDecision(decision, "raw");
    }

    function attachWorkflowHandlers(scope) {
      scope.querySelectorAll("[data-open]").forEach((button) => {
        button.addEventListener("click", () => openDecision(button.dataset.open, button.dataset.tabTarget || "summary"));
      });
      scope.querySelectorAll("[data-workflow-action]").forEach((button) => {
        button.addEventListener("click", () => {
          if (button.dataset.workflowAction === "run") regenerateMemo(button.dataset.file, button);
          if (button.dataset.workflowAction === "archive") archiveDecision(button.dataset.file, button);
          if (button.dataset.workflowAction === "restore") restoreDecision(button.dataset.file, button);
          if (button.dataset.workflowAction === "localize") localizeDecision(button.dataset.file, button);
          if (button.dataset.workflowAction === "undo") undoLastChange(button.dataset.file, button);
        });
      });
      scope.querySelectorAll("[data-promote-status]").forEach((button) => {
        button.addEventListener("click", () => promoteStatus(button.dataset.file, button.dataset.promoteStatus, button));
      });
      updateUndoButtons(scope);
    }

    function updateUndoButtons(scope) {
      scope.querySelectorAll('[data-workflow-action="undo"]').forEach((button) => {
        const available = hasUndoSnapshot(button.dataset.file || state.activeFile);
        button.disabled = !available;
        button.title = available ? "Restore the last saved version from this browser" : "No recent UI change to undo";
      });
    }

    async function regenerateMemo(file = state.activeFile, button = null) {
      if (!file) return;
      await withBusy(button, "Regenerating", async () => {
        const response = await apiFetch('/api/decision/run?file=' + encodeURIComponent(file), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}'
        });
        const payload = await response.json();
        if (!response.ok || !payload.regenerated) {
          showToast(payload.error || "Memo was not regenerated", "bad");
          return;
        }
        showToast("Memo regenerated", "good");
        await refresh();
        await openDecision(file, "memo");
      });
    }

    async function promoteStatus(file = state.activeFile, nextStatus, button = null) {
      if (!file || !nextStatus) return;
      await withBusy(button, "Saving", async () => {
        if (state.activeDecision?.decision && file === state.activeFile) {
          rememberUndoSnapshot(file, state.activeDecision.decision);
        }
        const response = await apiFetch('/api/decision/promote?file=' + encodeURIComponent(file), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: nextStatus })
        });
        const payload = await response.json();
        if (!response.ok || !payload.promoted) {
          showToast(payload.error || "Status was not updated", "bad");
          return;
        }
        showToast("Status updated: " + statusLabel(nextStatus, decisionUsesKorean(payload.decision)), "good");
        await refresh();
        await openDecision(file, "summary");
      });
    }

    async function closeReview() {
      const outcome = document.querySelector("#review-outcome").value.trim();
      const lesson = document.querySelector("#review-lesson").value.trim();
      await withBusy(document.querySelector("#close-review"), "Closing", async () => {
        if (state.activeDecision?.decision) rememberUndoSnapshot(state.activeFile, state.activeDecision.decision);
        const response = await apiFetch('/api/decision/review?file=' + encodeURIComponent(state.activeFile), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ outcome, lesson })
        });
        const payload = await response.json();
        if (!response.ok || !payload.reviewed) {
          showToast(payload.error || "Review was not closed", "bad");
          return;
        }
        showToast("Review closed", "good");
        await refresh();
        await openDecision(state.activeFile, "review");
      });
    }

    async function archiveDecision(file = state.activeFile, button = null) {
      if (!file) return;
      if (!window.confirm("Archive this decision?")) return;
      await withBusy(button, "Archiving", async () => {
        const response = await apiFetch('/api/decision/archive?file=' + encodeURIComponent(file), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}'
        });
        const payload = await response.json();
        if (!response.ok || !payload.archived) {
          showToast(payload.error || "Decision was not archived", "bad");
          return;
        }
        state.activeFile = "";
        state.activeDecision = null;
        showToast("Decision archived", "good");
        await refresh();
        renderTable();
      });
    }

    async function restoreDecision(file = state.activeFile, button = null) {
      if (!file) return;
      await withBusy(button, "Restoring", async () => {
        const response = await apiFetch('/api/decision/restore?file=' + encodeURIComponent(file), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}'
        });
        const payload = await response.json();
        if (!response.ok || !payload.restored) {
          showToast(payload.error || "Decision was not restored", "bad");
          return;
        }
        state.includeArchive = false;
        includeArchive.checked = false;
        showToast("Decision restored", "good");
        await refresh();
        await openDecision(payload.restoredFilePath || payload.filePath, "summary");
      });
    }

    async function localizeDecision(file = state.activeFile, button = null) {
      if (!file) return;
      await withBusy(button, "Polishing", async () => {
        if (state.activeDecision?.decision && file === state.activeFile) {
          rememberUndoSnapshot(file, state.activeDecision.decision);
        }
        const response = await apiFetch('/api/decision/localize?file=' + encodeURIComponent(file), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}'
        });
        const payload = await response.json();
        if (!response.ok || !payload.localized) {
          showToast(payload.error || "Decision was not localized", "bad");
          return;
        }
        showToast("Korean copy polished", "good");
        await refresh();
        await openDecision(file, "summary");
      });
    }

    async function undoLastChange(file = state.activeFile, button = null) {
      const snapshot = readUndoSnapshot(file);
      if (!file || !snapshot?.decision) {
        showToast("No recent change to undo", "bad");
        updateUndoButtons(view);
        return;
      }
      await withBusy(button, "Undoing", async () => {
        const response = await apiFetch('/api/decision?file=' + encodeURIComponent(file), {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ decision: snapshot.decision })
        });
        const payload = await response.json();
        if (!response.ok || !payload.saved) {
          showToast(payload.error || "Undo failed", "bad");
          return;
        }
        clearUndoSnapshot(file);
        showToast("Last change undone", "good");
        await refresh();
        await openDecision(file, state.activeTab || "summary");
      });
    }

    async function persistDecision(decision, tab) {
      if (state.activeDecision?.decision) rememberUndoSnapshot(state.activeFile, state.activeDecision.decision);
      const response = await apiFetch('/api/decision?file=' + encodeURIComponent(state.activeFile), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision })
      });
      const payload = await response.json();
      if (!response.ok || !payload.saved) {
        showToast(payload.error || 'Not saved', 'bad');
        return;
      }
      showToast('Saved', 'good');
      await refresh();
      await openDecision(state.activeFile, tab);
    }

    function renderMarkdown(markdown) {
      const lines = String(markdown || "").split("\\n");
      let html = '<div class="markdown">';
      let paragraph = [];
      let list = [];
      let inCode = false;
      let code = [];
      let cardOpen = false;

      function flushParagraph() {
        if (!paragraph.length) return;
        html += '<p>' + inlineMarkdown(paragraph.join(" ")) + '</p>';
        paragraph = [];
      }
      function flushList() {
        if (!list.length) return;
        html += '<ul>' + list.map((item) => '<li>' + inlineMarkdown(item) + '</li>').join("") + '</ul>';
        list = [];
      }
      function flushCode() {
        html += '<pre>' + escapeHtml(code.join("\\n")) + '</pre>';
        code = [];
      }
      function closeCard() {
        if (!cardOpen) return;
        html += '</section>';
        cardOpen = false;
      }
      function isTableStart(index) {
        return lines[index]?.trim().startsWith("|")
          && /^\\|?\\s*:?-{3,}:?\\s*(\\|\\s*:?-{3,}:?\\s*)+\\|?$/.test(lines[index + 1]?.trim() || "");
      }
      function cells(line) {
        return line.trim().replace(/^\\|/, "").replace(/\\|$/, "").split("|").map((cell) => cell.trim());
      }

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const trimmed = line.trim();
        if (trimmed.startsWith("\`\`\`")) {
          flushParagraph();
          flushList();
          if (inCode) {
            flushCode();
            inCode = false;
          } else {
            inCode = true;
          }
          continue;
        }
        if (inCode) {
          code.push(line);
          continue;
        }
        if (!trimmed) {
          flushParagraph();
          flushList();
          continue;
        }
        if (isTableStart(index)) {
          flushParagraph();
          flushList();
          const headers = cells(lines[index]);
          index += 2;
          const rows = [];
          while (index < lines.length && lines[index].trim().startsWith("|")) {
            rows.push(cells(lines[index]));
            index += 1;
          }
          index -= 1;
          html += '<table><thead><tr>' + headers.map((header) => '<th>' + inlineMarkdown(header) + '</th>').join("") + '</tr></thead><tbody>'
            + rows.map((row) => '<tr>' + row.map((cell) => '<td>' + inlineMarkdown(cell) + '</td>').join("") + '</tr>').join("")
            + '</tbody></table>';
          continue;
        }
        if (trimmed.startsWith("# ")) {
          flushParagraph();
          flushList();
          closeCard();
          html += '<h1>' + inlineMarkdown(trimmed.slice(2)) + '</h1>';
          continue;
        }
        if (trimmed.startsWith("## ")) {
          flushParagraph();
          flushList();
          closeCard();
          html += '<section class="markdown-card"><h2>' + inlineMarkdown(trimmed.slice(3)) + '</h2>';
          cardOpen = true;
          continue;
        }
        if (trimmed.startsWith("### ")) {
          flushParagraph();
          flushList();
          html += '<h3>' + inlineMarkdown(trimmed.slice(4)) + '</h3>';
          continue;
        }
        if (trimmed.startsWith("- ")) {
          flushParagraph();
          list.push(trimmed.slice(2));
          continue;
        }
        paragraph.push(trimmed);
      }
      flushParagraph();
      flushList();
      if (inCode) flushCode();
      closeCard();
      return html + '</div>';
    }

    function inlineMarkdown(value) {
      const tick = String.fromCharCode(96);
      return escapeHtml(value).replace(new RegExp(tick + "([^" + tick + "]+)" + tick, "g"), '<code>$1</code>');
    }

    async function createDecision() {
      const question = newQuestion.value.trim();
      if (!question) return;
      const response = await apiFetch('/api/decisions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question, type: newType.value || null })
      });
      const payload = await response.json();
      if (!response.ok || payload.error) {
        showToast(payload.error || 'Create failed', 'bad');
        return;
      }
      newQuestion.value = '';
      showToast('Decision created', 'good');
      await refresh();
      await openDecision(payload.filePath);
    }

    async function refresh() {
      const decisionResponse = await apiFetch('/api/decisions' + archiveQuery());
      const payload = await decisionResponse.json();
      state.rows = payload.rows;
      renderStats(payload);
      renderOnboarding(payload);
      status.textContent = payload.count + ' records' + (state.includeArchive ? ' including archive' : '');
    }

    async function boot() {
      const [decisionResponse, reportResponse] = await Promise.all([
        apiFetch('/api/decisions' + archiveQuery()),
        apiFetch('/api/reports')
      ]);
      const payload = await decisionResponse.json();
      state.rows = payload.rows;
      state.reports = await reportResponse.json();
      renderStats(payload);
      renderOnboarding(payload);
      renderReportButtons();
      renderTable();
      status.textContent = payload.count + ' records' + (state.includeArchive ? ' including archive' : '');
    }

    search.addEventListener("input", renderTable);
    type.addEventListener("change", renderTable);
    decisionStatus.addEventListener("change", renderTable);
    includeArchive.addEventListener("change", async () => {
      state.includeArchive = includeArchive.checked;
      await refresh();
      renderTable();
    });
    createButton.addEventListener("click", createDecision);
    newQuestion.addEventListener("keydown", (event) => {
      if (event.key === "Enter") createDecision();
    });
    renderSampleQuestions();
    boot().catch((error) => {
      if (error.authRequired) return;
      showToast('Error', 'bad');
      view.innerHTML = '<div class="report">' + escapeHtml(error.message) + '</div>';
    });
  </script>
</body>
</html>`;
}

function summarizeRows(rows) {
  const total = rows.length;
  const averageCompleteness = total ? Math.round(avg(rows.map((row) => row.completeness_ratio ?? row.score / row.max_score)) * 100) : 0;
  const averageEvidenceQuality = total ? Math.round(avg(rows.map((row) => row.evidence_quality_score || 0))) : 0;
  return {
    total,
    operational: rows.filter((row) => row.maturity === "operational").length,
    reviewed: rows.filter((row) => row.status === "reviewed").length,
    dueReviews: rows.filter((row) => row.due_review).length,
    averageCompleteness,
    averageEvidenceQuality,
    averageScore: averageCompleteness
  };
}

function walk(root) {
  if (!fs.existsSync(root)) return [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return [fullPath];
  });
}

function sendHtml(response, body) {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(body);
}

function sendText(response, body) {
  response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  response.end(body);
}

function sendJson(response, body, status = 200) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(body, null, 2)}\n`);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function jsonForScript(value) {
  return JSON.stringify(value)
    .replaceAll("</", "<\\/")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function escapeJs(value) {
  return String(value ?? "").replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

function shellArg(value) {
  const text = String(value ?? "");
  if (/^[A-Za-z0-9_./:-]+$/.test(text)) return text;
  return `'${text.replaceAll("'", "'\\''")}'`;
}

function avg(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
