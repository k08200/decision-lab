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
      if (url.pathname === "/api/decisions" && request.method === "GET") return sendJson(response, decisionPayload(root));
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
        return sendReport(response, root, asOf, url.pathname.replace("/api/report/", ""));
      }
      if (url.pathname === "/api/memo") return sendMemo(response, root, url.searchParams.get("file"));
      return sendJson(response, { error: "Not found" }, 404);
    } catch (error) {
      return sendJson(response, { error: error.message }, 500);
    }
  });
}

export function startDecisionServer(options = {}) {
  const port = Number(options.port || 8787);
  const host = options.host || "127.0.0.1";
  const server = createDecisionServer({
    ...options,
    serverUrl: `http://${host}:${port}`
  });
  server.listen(port, host);
  return { server, url: `http://${host}:${port}` };
}

export function decisionPayload(root = "decisions") {
  const records = loadDecisionRecords(root);
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

export function loadDecisionRecords(root = "decisions") {
  return walk(root)
    .filter((filePath) => filePath.endsWith(".json"))
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

function sendReport(response, root, asOf, id) {
  const report = REPORTS[id];
  if (!report) return sendJson(response, { error: `Unknown report: ${id}` }, 404);
  return sendText(response, report.render(loadDecisionRecords(root), { asOf }));
}

function sendMemo(response, root, filePath) {
  const records = loadDecisionRecords(root);
  const record = records.find((item) => item.filePath === filePath);
  if (!record) return sendJson(response, { error: "Decision file not found in server root" }, 404);
  return sendText(response, renderDecisionMemo(record.decision));
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
      grid-template-columns: repeat(4, minmax(130px, 1fr));
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
    .actions { display: flex; gap: 8px; align-items: center; padding: 12px; border-bottom: 1px solid var(--line); }
    .actions button { width: auto; }
    .nav { display: grid; gap: 6px; margin-top: 16px; }
    .nav button { text-align: left; }
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
    const state = { rows: [], reports: [], activeReport: "", activeFile: "" };
    const search = document.querySelector("#search");
    const type = document.querySelector("#type");
    const decisionStatus = document.querySelector("#decision-status");
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

    function metric(label, value) {
      return '<div class="metric"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>';
    }

    function renderStats(payload) {
      stats.innerHTML = [
        metric("Total", payload.stats.total),
        metric("Operational", payload.stats.operational),
        metric("Due Reviews", payload.stats.dueReviews),
        metric("Average Score", payload.stats.averageScore + "%")
      ].join("");
    }

    function renderOnboarding(payload) {
      const hasRecords = payload.count > 0;
      onboarding.innerHTML = '<h2>' + (hasRecords ? 'Operating Loop' : 'First Run') + '</h2>'
        + step(1, hasRecords ? 'Review priority' : 'Create a record', hasRecords ? 'Open the action queue or priority report.' : 'Use the field on the left or run the demo command.', hasRecords ? 'node bin/decision-lab.js next ${escapeJs(root)} --out outputs/next.md' : 'node bin/decision-lab.js demo outputs/demo')
        + step(2, hasRecords ? 'Strengthen evidence' : 'Read the memo', hasRecords ? 'Attach notes, challenge assumptions, then inspect the memo.' : 'Open the generated memo and audit files.', hasRecords ? 'node bin/decision-lab.js research-plan ${escapeJs(root)} --out outputs/research.md' : 'less outputs/demo/outputs/run/memo.md')
        + step(3, hasRecords ? 'Schedule review' : 'Start private work', hasRecords ? 'Export dated reviews into a calendar file.' : 'Create a separate private workspace for real decisions.', hasRecords ? 'node bin/decision-lab.js ics ${escapeJs(root)} --out outputs/calendar.ics' : 'node bin/decision-lab.js private-workspace ../my-private-decisions')
        + step(4, 'Check privacy', 'Run the public-repo leak check before pushing.', 'npm run privacy:check');
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
        + '<table><thead><tr><th>Decision</th><th>Type</th><th>Status</th><th>Recommendation</th><th>Priority</th><th>Score</th><th>Review</th><th></th></tr></thead><tbody>'
        + rows.map((row) => '<tr>'
          + '<td><div class="title">' + escapeHtml(row.title) + '</div><div class="small">' + escapeHtml(row.question) + '</div><div class="small">' + escapeHtml(row.file) + '</div></td>'
          + '<td><span class="pill">' + escapeHtml(row.type) + '</span></td>'
          + '<td><span class="pill">' + escapeHtml(row.status) + '</span></td>'
          + '<td>' + escapeHtml(row.decision) + '<div class="small">' + escapeHtml(row.owner || "") + '</div></td>'
          + '<td><span class="pill ' + (row.priority >= 50 ? "bad" : row.priority >= 25 ? "warn" : "good") + '">' + escapeHtml(row.priority) + '</span></td>'
          + '<td><span class="pill ' + scoreClass(row) + '">' + escapeHtml(row.score + "/" + row.max_score + " " + row.grade) + '</span></td>'
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
      const response = await fetch('/api/report/' + encodeURIComponent(id));
      view.innerHTML = '<div class="report"><pre>' + escapeHtml(await response.text()) + '</pre></div>';
    }

    async function openDecision(file) {
      state.activeReport = "";
      state.activeFile = file;
      renderReportButtons();
      const response = await fetch('/api/decision?file=' + encodeURIComponent(file));
      const payload = await response.json();
      if (!response.ok || payload.error) {
        view.innerHTML = '<div class="report bad">' + escapeHtml(payload.error || "Could not load decision") + '</div>';
        return;
      }
      view.innerHTML = '<div class="actions">'
        + '<button id="save" class="inline">Save</button>'
        + '<button id="memo" class="inline secondary">Memo</button>'
        + '<span class="small">' + escapeHtml(file) + '</span>'
        + '</div>'
        + '<textarea id="editor" spellcheck="false">' + escapeHtml(JSON.stringify(payload.decision, null, 2)) + '</textarea>';
      document.querySelector("#save").addEventListener("click", saveDecision);
      document.querySelector("#memo").addEventListener("click", () => {
        view.innerHTML = '<div class="actions"><button id="back" class="inline secondary">Back</button><span class="small">' + escapeHtml(file) + '</span></div>'
          + '<div class="report"><pre>' + escapeHtml(payload.memo) + '</pre></div>';
        document.querySelector("#back").addEventListener("click", () => openDecision(file));
      });
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
      const response = await fetch('/api/decision?file=' + encodeURIComponent(state.activeFile), {
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
      await openDecision(state.activeFile);
    }

    async function createDecision() {
      const question = newQuestion.value.trim();
      if (!question) return;
      const response = await fetch('/api/decisions', {
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
      const decisionResponse = await fetch('/api/decisions');
      const payload = await decisionResponse.json();
      state.rows = payload.rows;
      renderStats(payload);
      renderOnboarding(payload);
      status.textContent = payload.count + ' records';
    }

    async function boot() {
      const [decisionResponse, reportResponse] = await Promise.all([
        fetch('/api/decisions'),
        fetch('/api/reports')
      ]);
      const payload = await decisionResponse.json();
      state.rows = payload.rows;
      state.reports = await reportResponse.json();
      renderStats(payload);
      renderOnboarding(payload);
      renderReportButtons();
      renderTable();
      status.textContent = payload.count + ' records';
    }

    search.addEventListener("input", renderTable);
    type.addEventListener("change", renderTable);
    decisionStatus.addEventListener("change", renderTable);
    createButton.addEventListener("click", createDecision);
    boot().catch((error) => {
      status.textContent = 'Error';
      view.innerHTML = '<div class="report">' + escapeHtml(error.message) + '</div>';
    });
  </script>
</body>
</html>`;
}

function summarizeRows(rows) {
  const total = rows.length;
  return {
    total,
    operational: rows.filter((row) => row.maturity === "operational").length,
    reviewed: rows.filter((row) => row.status === "reviewed").length,
    dueReviews: rows.filter((row) => row.due_review).length,
    averageScore: total ? Math.round(avg(rows.map((row) => row.score / row.max_score)) * 100) : 0
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

function avg(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
