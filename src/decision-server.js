import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { loadDecisionFile, renderDecisionMemo } from "./decision-core.js";
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

export function createDecisionServer({ root = "decisions", asOf = new Date().toISOString().slice(0, 10) } = {}) {
  return http.createServer((request, response) => {
    try {
      const url = new URL(request.url || "/", "http://localhost");
      if (url.pathname === "/") return sendHtml(response, renderApp({ root, asOf }));
      if (url.pathname === "/healthz") return sendJson(response, { ok: true, root, asOf });
      if (url.pathname === "/api/decisions") return sendJson(response, decisionPayload(root));
      if (url.pathname === "/api/reports") return sendJson(response, reportCatalog());
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
  const server = createDecisionServer(options);
  const port = Number(options.port || 8787);
  const host = options.host || "127.0.0.1";
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

function renderApp({ root, asOf }) {
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
    button.active { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
    .field { margin-bottom: 12px; }
    .nav { display: grid; gap: 6px; margin-top: 16px; }
    .nav button { text-align: left; }
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
    @media (max-width: 900px) {
      main { grid-template-columns: 1fr; }
      aside { border-right: 0; border-bottom: 1px solid var(--line); }
      .stats { grid-template-columns: repeat(2, minmax(130px, 1fr)); }
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
      <div class="nav" id="reports"></div>
    </aside>
    <section class="content">
      <div class="stats" id="stats"></div>
      <div class="panel" id="view"></div>
    </section>
  </main>
  <script>
    const state = { rows: [], reports: [], activeReport: "" };
    const search = document.querySelector("#search");
    const type = document.querySelector("#type");
    const decisionStatus = document.querySelector("#decision-status");
    const view = document.querySelector("#view");
    const stats = document.querySelector("#stats");
    const status = document.querySelector("#status");
    const reports = document.querySelector("#reports");

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
      renderReportButtons();
      const rows = filteredRows();
      if (!rows.length) {
        view.innerHTML = '<div class="report small">No matching decisions.</div>';
        return;
      }
      view.innerHTML = '<table><thead><tr><th>Decision</th><th>Type</th><th>Status</th><th>Recommendation</th><th>Priority</th><th>Score</th><th>Review</th></tr></thead><tbody>'
        + rows.map((row) => '<tr>'
          + '<td><div class="title">' + escapeHtml(row.title) + '</div><div class="small">' + escapeHtml(row.question) + '</div><div class="small">' + escapeHtml(row.file) + '</div></td>'
          + '<td><span class="pill">' + escapeHtml(row.type) + '</span></td>'
          + '<td><span class="pill">' + escapeHtml(row.status) + '</span></td>'
          + '<td>' + escapeHtml(row.decision) + '<div class="small">' + escapeHtml(row.owner || "") + '</div></td>'
          + '<td><span class="pill ' + (row.priority >= 50 ? "bad" : row.priority >= 25 ? "warn" : "good") + '">' + escapeHtml(row.priority) + '</span></td>'
          + '<td><span class="pill ' + scoreClass(row) + '">' + escapeHtml(row.score + "/" + row.max_score + " " + row.grade) + '</span></td>'
          + '<td>' + escapeHtml(row.review_date || "") + (row.due_review ? '<div class="small">due</div>' : "") + '</td>'
          + '</tr>').join("")
        + '</tbody></table>';
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
      renderReportButtons();
      const response = await fetch('/api/report/' + encodeURIComponent(id));
      view.innerHTML = '<div class="report"><pre>' + escapeHtml(await response.text()) + '</pre></div>';
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
      renderReportButtons();
      renderTable();
      status.textContent = payload.count + ' records';
    }

    search.addEventListener("input", renderTable);
    type.addEventListener("change", renderTable);
    decisionStatus.addEventListener("change", renderTable);
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

function avg(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
