import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { loadDecisionFile, renderDecisionMemo, validateDecision } from "./decision-core.js";
import { createDecisionFromQuestion, slugify } from "./decision-agent.js";
import { buildOpenApiSpec } from "./decision-api-contract.js";
import { appendAuditEvent, readAuditEvents } from "./decision-audit-log.js";
import { buildDecisionRows } from "./decision-export.js";
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
      --bg: #f6f7f8;
      --panel: #ffffff;
      --text: #1d252c;
      --muted: #66727f;
      --line: #d9dee3;
      --accent: #166b57;
      --accent-soft: #dff3ed;
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
      padding: 16px 22px;
      background: var(--panel);
      border-bottom: 1px solid var(--line);
    }
    h1 { margin: 0; font-size: 21px; letter-spacing: 0; }
    .meta { color: var(--muted); font-size: 12px; }
    main {
      display: grid;
      grid-template-columns: 280px 1fr;
      min-height: calc(100vh - 65px);
    }
    aside {
      border-right: 1px solid var(--line);
      background: var(--panel);
      padding: 16px;
    }
    .content { padding: 18px 22px 34px; overflow: auto; }
    .workspace {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 310px;
      gap: 14px;
      align-items: start;
    }
    .main-column { min-width: 0; }
    .stats {
      display: grid;
      grid-template-columns: repeat(5, minmax(130px, 1fr));
      gap: 10px;
      margin-bottom: 14px;
    }
    .metric, .panel {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
    }
    .metric { padding: 12px; }
    .metric span { display: block; color: var(--muted); font-size: 12px; }
    .metric strong { display: block; margin-top: 4px; font-size: 24px; line-height: 1; }
    .onboarding {
      position: sticky;
      top: 18px;
      padding: 14px;
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
    .command {
      margin-top: 8px;
      padding: 8px;
      border-radius: 6px;
      background: #101828;
      color: #f9fafb;
      font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      overflow-x: auto;
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
    button.secondary { background: #f8fafb; }
    button.active { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
    button.inline { width: auto; min-width: 74px; }
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
    .actions { display: flex; gap: 8px; align-items: center; padding: 12px; border-bottom: 1px solid var(--line); }
    .actions button { width: auto; }
    .tabs {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      background: #fbfcfd;
    }
    .tabs button { width: auto; }
    .nav { display: grid; gap: 6px; margin-top: 16px; }
    .nav button { text-align: left; }
    .detail { padding: 14px; }
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
      .detail-grid { grid-template-columns: 1fr; }
      .capture-grid, .capture-grid.compact { grid-template-columns: 1fr; }
      table { display: block; overflow-x: auto; }
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
        <input id="new-question" type="text">
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
    const AUTH_STORAGE_KEY = "decision-lab-api-token";
    const search = document.querySelector("#search");
    const type = document.querySelector("#type");
    const decisionStatus = document.querySelector("#decision-status");
    const includeArchive = document.querySelector("#include-archive");
    const newQuestion = document.querySelector("#new-question");
    const newType = document.querySelector("#new-type");
    const createButton = document.querySelector("#create");
    const view = document.querySelector("#view");
    const stats = document.querySelector("#stats");
    const status = document.querySelector("#status");
    const reports = document.querySelector("#reports");
    const onboarding = document.querySelector("#onboarding");

    function escapeHtml(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
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

    function renderList(items, emptyText, renderItem = (item) => escapeHtml(item)) {
      if (!items || !items.length) return '<div class="empty"><p>' + escapeHtml(emptyText) + '</p></div>';
      return '<ul class="list">' + items.map((item) => '<li>' + renderItem(item) + '</li>').join("") + '</ul>';
    }

    function renderStats(payload) {
      const safeStats = payload.stats || {
        total: payload.count || 0,
        operational: 0,
        dueReviews: 0,
        averageCompleteness: 0,
        averageEvidenceQuality: 0
      };
      stats.innerHTML = [
        metric("Total", safeStats.total),
        metric("Operational", safeStats.operational),
        metric("Due Reviews", safeStats.dueReviews),
        metric("Completeness", (safeStats.averageCompleteness ?? safeStats.averageScore ?? 0) + "%"),
        metric("Evidence Quality", (safeStats.averageEvidenceQuality ?? 0) + "%")
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
      onboarding.innerHTML = '<h2>' + (hasRecords ? 'Operating Loop' : 'First Run') + '</h2>'
        + step(1, hasRecords ? 'Review priority' : 'Create a record', hasRecords ? 'Open the action queue or priority report.' : 'Use the field on the left or run the demo command.', hasRecords ? CLI_COMMAND + ' next ' + ROOT_COMMAND_ARG + ' --out outputs/next.md' : CLI_COMMAND + ' demo outputs/demo')
        + step(2, hasRecords ? 'Strengthen evidence' : 'Read the memo', hasRecords ? 'Attach notes, challenge assumptions, then inspect the memo.' : 'Open the generated memo and audit files.', hasRecords ? CLI_COMMAND + ' research-plan ' + ROOT_COMMAND_ARG + ' --out outputs/research.md' : 'less outputs/demo/outputs/run/memo.md')
        + step(3, hasRecords ? 'Schedule review' : 'Start private work', hasRecords ? 'Export dated reviews into a calendar file.' : 'Create a separate private workspace for real decisions.', hasRecords ? CLI_COMMAND + ' ics ' + ROOT_COMMAND_ARG + ' --out outputs/calendar.ics' : CLI_COMMAND + ' private-workspace ../my-private-decisions')
        + step(4, 'Check privacy', 'Run the local privacy check before sharing or pushing.', CLI_COMMAND + ' privacy-check');
    }

    function step(index, title, copy, command) {
      return '<div class="step"><span class="step-index">' + index + '</span><div>'
        + '<div class="step-title">' + escapeHtml(title) + '</div>'
        + '<div class="step-copy">' + escapeHtml(copy) + '</div>'
        + '<div class="command">' + escapeHtml(command) + '</div>'
        + '</div></div>';
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
          + '<h2>' + (hasAny ? 'No matching decisions' : 'No decisions yet') + '</h2>'
          + '<p>' + (hasAny ? 'Adjust the filters or open a report from the left rail.' : 'Create the first decision from the left rail, or generate a disposable demo workspace from the command line.') + '</p>'
          + (hasAny ? '' : '<button class="inline secondary" id="seed-question">Seed question</button>')
          + '</div>';
        const seed = document.querySelector("#seed-question");
        if (seed) seed.addEventListener("click", () => {
          newQuestion.value = "Should we pilot enterprise pricing this quarter?";
          newType.value = "business";
          newQuestion.focus();
        });
        return;
      }
      view.innerHTML = '<div class="toolbar"><strong>Decision Ledger</strong><span class="small">' + rows.length + ' visible</span></div>'
        + '<table><thead><tr><th>Decision</th><th>Type</th><th>Status</th><th>Recommendation</th><th>Priority</th><th>Completeness</th><th>Evidence Quality</th><th>Review</th><th></th></tr></thead><tbody>'
        + rows.map((row) => '<tr>'
          + '<td><div class="title">' + escapeHtml(row.title) + '</div><div class="small">' + escapeHtml(row.question) + '</div><div class="small">' + escapeHtml(row.file) + '</div></td>'
          + '<td><span class="pill">' + escapeHtml(row.type) + '</span></td>'
          + '<td><span class="pill">' + escapeHtml(row.status) + '</span></td>'
          + '<td>' + escapeHtml(row.decision) + '<div class="small">' + escapeHtml(row.owner || "") + '</div></td>'
          + '<td><span class="pill ' + (row.priority >= 50 ? "bad" : row.priority >= 25 ? "warn" : "good") + '">' + escapeHtml(row.priority) + '</span></td>'
          + '<td><span class="pill ' + scoreClass(row) + '">' + escapeHtml((row.completeness_percent ?? Math.round(row.score / row.max_score * 100)) + "% " + (row.completeness_grade || row.grade)) + '</span></td>'
          + '<td><span class="pill ' + scorePercentClass(row.evidence_quality_score || 0) + '">' + escapeHtml((row.evidence_quality_score || 0) + "% " + (row.evidence_quality_grade || "F")) + '</span></td>'
          + '<td>' + escapeHtml(row.review_date || "") + (row.due_review ? '<div class="small">due</div>' : "") + '</td>'
          + '<td><button class="inline secondary" data-open="' + escapeHtml(row.file) + '">Open</button></td>'
          + '</tr>').join("")
        + '</tbody></table>';
      view.querySelectorAll("[data-open]").forEach((button) => {
        button.addEventListener("click", () => openDecision(button.dataset.open));
      });
    }

    function renderReportButtons() {
      reports.innerHTML = '<button data-report="">Ledger</button>' + state.reports.map((report) => (
        '<button data-report="' + escapeHtml(report.id) + '" class="' + (state.activeReport === report.id ? "active" : "") + '">' + escapeHtml(report.title) + '</button>'
      )).join("");
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
        ["raw", "Raw JSON"]
      ];
      view.innerHTML = '<div class="toolbar"><div><strong>' + escapeHtml(decision.title) + '</strong><div class="small">' + escapeHtml(payload.filePath) + '</div></div>'
        + '<button class="inline secondary" id="back-ledger">Ledger</button></div>'
        + '<div class="tabs">' + tabs.map(([id, label]) => '<button class="secondary ' + (tab === id ? "active" : "") + '" data-tab="' + id + '">' + label + '</button>').join("") + '</div>'
        + renderDecisionTab(payload, tab);
      document.querySelector("#back-ledger").addEventListener("click", renderTable);
      view.querySelectorAll("[data-tab]").forEach((button) => {
        button.addEventListener("click", () => renderDecisionDetail(payload, button.dataset.tab));
      });
      attachDecisionTabHandlers(tab);
    }

    function renderDecisionTab(payload, tab) {
      const decision = payload.decision;
      if (tab === "memo") return renderMarkdown(payload.memo);
      if (tab === "evidence") return renderEvidenceTab(decision);
      if (tab === "questions") return renderQuestionsTab(decision);
      if (tab === "risks") return renderRisksTab(decision);
      if (tab === "actions") return renderActionsTab(decision);
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
      return '<div class="detail">'
        + '<div class="detail-grid">'
        + field("Question", decision.question)
        + field("Recommendation", recommendation.decision || recommendation.summary)
        + field("Selected Option", option ? option.name + " (" + option.id + ")" : recommendation.selected_option)
        + field("Confidence", formatPercent(recommendation.confidence))
        + field("Status", decision.status)
        + field("Evidence", strongEvidence + " strong / " + (decision.evidence || []).length + " total")
        + field("Completeness", (row.completeness_percent ?? "") + "% " + (row.completeness_grade || ""))
        + field("Evidence Quality", (row.evidence_quality_score ?? 0) + "% " + (row.evidence_quality_grade || "F"))
        + '</div>'
        + '<div class="detail-card"><h3>Decision Frame</h3><p>'
        + [frame.decision_class, frame.default_action && "default: " + frame.default_action, frame.reversibility && "reversibility: " + frame.reversibility, frame.urgency && "urgency: " + frame.urgency].filter(Boolean).map(escapeHtml).join(" · ")
        + '</p></div>'
        + '<div class="detail-card" style="margin-top:10px"><h3>Options</h3>'
        + renderList(decision.options || [], "No options yet.", (item) => '<div class="title">' + escapeHtml(item.id + ". " + item.name) + '</div><div class="small">' + escapeHtml(item.description || "") + '</div>')
        + '</div>'
        + '<div class="detail-card" style="margin-top:10px"><h3>Validation</h3><p>' + escapeHtml(validation.valid ? "Ready to operate. Keep improving evidence before final commitment." : validation.errors.join(", ")) + '</p></div>'
        + '</div>';
    }

    function renderEvidenceTab(decision) {
      return '<div class="detail">'
        + '<div class="capture-grid">'
        + '<div><label for="capture-claim">Evidence claim</label><input id="capture-claim" type="text" placeholder="What did we learn?"></div>'
        + '<div><label for="capture-source">Source</label><input id="capture-source" type="text" placeholder="customer call, metric, release check"></div>'
        + '<div><label for="capture-strength">Strength</label><select id="capture-strength"><option value="strong">Strong</option><option value="medium">Medium</option><option value="weak">Weak</option></select></div>'
        + '<button id="add-evidence" class="secondary">Add</button>'
        + '</div>'
        + renderList(decision.evidence || [], "No evidence captured yet.", (item) => '<div class="title">' + escapeHtml(item.claim || item) + '</div><div class="small">' + badge(item.strength || "unknown", item.strength === "strong" ? "good" : item.strength === "weak" ? "bad" : "warn") + ' ' + escapeHtml(item.source || "") + '</div>')
        + '</div>';
    }

    function renderQuestionsTab(decision) {
      return '<div class="detail">'
        + '<div class="capture-grid compact"><div><label for="capture-question">Open question</label><input id="capture-question" type="text" placeholder="What would change the decision?"></div><button id="add-question" class="secondary">Add</button></div>'
        + renderList(decision.open_questions || [], "No open questions yet.")
        + '</div>';
    }

    function renderActionsTab(decision) {
      return '<div class="detail">'
        + '<div class="capture-grid compact"><div><label for="capture-action">Next action</label><input id="capture-action" type="text" placeholder="Smallest next move"></div><button id="add-action" class="secondary">Add</button></div>'
        + renderList(decision.next_actions || [], "No next actions yet.")
        + '</div>';
    }

    function renderRisksTab(decision) {
      return '<div class="detail">'
        + '<div class="capture-grid">'
        + '<div><label for="capture-risk">Risk</label><input id="capture-risk" type="text" placeholder="What could break this decision?"></div>'
        + '<div><label for="capture-risk-trigger">Trigger</label><input id="capture-risk-trigger" type="text" placeholder="observable trigger"></div>'
        + '<div><label for="capture-risk-impact">Impact</label><select id="capture-risk-impact"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></div>'
        + '<button id="add-risk" class="secondary">Add</button>'
        + '</div>'
        + renderList(decision.risks || [], "No risks captured yet.", (item) => '<div class="title">' + escapeHtml(item.risk || item) + '</div><div class="small">' + escapeHtml([item.probability, item.impact, item.trigger].filter(Boolean).join(" / ")) + '</div><div class="small">' + escapeHtml(item.mitigation || "") + '</div>')
        + '</div>';
    }

    function attachDecisionTabHandlers(tab) {
      if (tab === "raw") {
        document.querySelector("#save").addEventListener("click", saveDecision);
      }
      if (tab === "evidence") {
        document.querySelector("#add-evidence").addEventListener("click", addEvidence);
      }
      if (tab === "questions") {
        document.querySelector("#add-question").addEventListener("click", addQuestion);
      }
      if (tab === "risks") {
        document.querySelector("#add-risk").addEventListener("click", addRisk);
      }
      if (tab === "actions") {
        document.querySelector("#add-action").addEventListener("click", addAction);
      }
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
        status.textContent = 'Invalid JSON';
        return;
      }
      await persistDecision(decision, "raw");
    }

    async function persistDecision(decision, tab) {
      const response = await apiFetch('/api/decision?file=' + encodeURIComponent(state.activeFile), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision })
      });
      const payload = await response.json();
      if (!response.ok || !payload.saved) {
        status.textContent = 'Not saved';
        return;
      }
      status.textContent = 'Saved';
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
        status.textContent = payload.error || 'Create failed';
        return;
      }
      newQuestion.value = '';
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
    boot().catch((error) => {
      if (error.authRequired) return;
      status.textContent = 'Error';
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
