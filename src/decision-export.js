import { auditDecision } from "./decision-core.js";

export function buildDecisionRows(records) {
  return records.map(({ filePath, decision }) => {
    const audit = auditDecision(decision);
    return {
      file: filePath,
      status: decision.status || "draft",
      type: decision.decision_type || "unknown",
      title: decision.title || "",
      question: decision.question || "",
      decision: decision.recommendation?.decision || "undecided",
      selected_option: decision.recommendation?.selected_option || "",
      confidence: decision.recommendation?.confidence ?? null,
      maturity: audit.maturity,
      score: audit.score.score,
      max_score: audit.score.max_score,
      grade: audit.score.grade,
      strongest_option: audit.strongest_option?.name || "",
      review_date: decision.recommendation?.review_date || "",
      owner: decision.owner || "",
      warnings: audit.warnings.join("; "),
      next_actions: audit.next_actions.join("; ")
    };
  });
}

export function renderExport(records, format = "json") {
  const rows = buildDecisionRows(records);
  if (format === "json") return `${JSON.stringify(rows, null, 2)}\n`;
  if (format === "csv") return renderCsv(rows);
  throw new Error("Export format must be json or csv");
}

export function renderDashboard(records) {
  const rows = buildDecisionRows(records);
  const stats = summarizeRows(rows);
  const payload = JSON.stringify(rows).replaceAll("</", "<\\/");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Decision Lab Dashboard</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8fa;
      --panel: #ffffff;
      --text: #1d232a;
      --muted: #667085;
      --line: #d6dbe1;
      --accent: #1f7a5c;
      --warn: #a15c07;
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
      border-bottom: 1px solid var(--line);
      background: var(--panel);
      padding: 18px 24px;
    }
    main { padding: 20px 24px 32px; }
    h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0;
    }
    .subhead { margin-top: 4px; color: var(--muted); }
    .summary {
      display: grid;
      grid-template-columns: repeat(5, minmax(120px, 1fr));
      gap: 12px;
      margin-bottom: 18px;
    }
    .metric {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      min-height: 72px;
    }
    .metric span {
      display: block;
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 6px;
    }
    .metric strong {
      font-size: 24px;
      line-height: 1;
    }
    .toolbar {
      display: flex;
      gap: 10px;
      align-items: center;
      margin-bottom: 12px;
    }
    input, select {
      height: 36px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: var(--panel);
      color: var(--text);
      padding: 0 10px;
      font: inherit;
    }
    input { flex: 1; min-width: 180px; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
    }
    th, td {
      text-align: left;
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
    }
    th {
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      background: #eef1f4;
    }
    tr:last-child td { border-bottom: 0; }
    .title { font-weight: 700; }
    .question { color: var(--muted); font-size: 12px; margin-top: 2px; }
    .pill {
      display: inline-flex;
      align-items: center;
      min-height: 22px;
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 12px;
      background: #eef1f4;
      color: var(--text);
      white-space: nowrap;
    }
    .pill.good { color: var(--good); background: #dcfae6; }
    .pill.warn { color: var(--warn); background: #fef0c7; }
    .pill.bad { color: var(--bad); background: #fee4e2; }
    .empty {
      padding: 24px;
      text-align: center;
      color: var(--muted);
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
    }
    @media (max-width: 900px) {
      .summary { grid-template-columns: repeat(2, minmax(120px, 1fr)); }
      .toolbar { align-items: stretch; flex-direction: column; }
      table { display: block; overflow-x: auto; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Decision Lab Dashboard</h1>
    <div class="subhead">Local decision ledger generated from JSON records.</div>
  </header>
  <main>
    <section class="summary" aria-label="Decision summary">
      <div class="metric"><span>Total</span><strong>${stats.total}</strong></div>
      <div class="metric"><span>Operational</span><strong>${stats.operational}</strong></div>
      <div class="metric"><span>Reviewed</span><strong>${stats.reviewed}</strong></div>
      <div class="metric"><span>Average Score</span><strong>${stats.averageScore}%</strong></div>
      <div class="metric"><span>Average Confidence</span><strong>${stats.averageConfidence}%</strong></div>
    </section>
    <section class="toolbar" aria-label="Filters">
      <input id="search" type="search" placeholder="Search title, question, owner, or decision">
      <select id="type">
        <option value="">All types</option>
        <option value="investment">Investment</option>
        <option value="business">Business</option>
        <option value="finance">Finance</option>
        <option value="general">General</option>
      </select>
      <select id="status">
        <option value="">All statuses</option>
        <option value="draft">Draft</option>
        <option value="researching">Researching</option>
        <option value="decided">Decided</option>
        <option value="reviewed">Reviewed</option>
      </select>
    </section>
    <div id="table"></div>
  </main>
  <script>
    const rows = ${payload};
    const search = document.querySelector("#search");
    const type = document.querySelector("#type");
    const status = document.querySelector("#status");
    const mount = document.querySelector("#table");

    function escapeHtml(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    function maturityClass(value) {
      if (value === "operational") return "good";
      if (value === "decision-ready") return "good";
      if (value === "research-needed") return "warn";
      return "bad";
    }

    function render() {
      const query = search.value.trim().toLowerCase();
      const selectedType = type.value;
      const selectedStatus = status.value;
      const filtered = rows.filter((row) => {
        const haystack = [row.title, row.question, row.owner, row.decision, row.file].join(" ").toLowerCase();
        return (!query || haystack.includes(query))
          && (!selectedType || row.type === selectedType)
          && (!selectedStatus || row.status === selectedStatus);
      });

      if (!filtered.length) {
        mount.innerHTML = '<div class="empty">No decisions match the current filters.</div>';
        return;
      }

      mount.innerHTML = \`
        <table>
          <thead>
            <tr>
              <th>Decision</th>
              <th>Type</th>
              <th>Status</th>
              <th>Recommendation</th>
              <th>Confidence</th>
              <th>Score</th>
              <th>Review</th>
            </tr>
          </thead>
          <tbody>
            \${filtered.map((row) => \`
              <tr>
                <td>
                  <div class="title">\${escapeHtml(row.title)}</div>
                  <div class="question">\${escapeHtml(row.question)}</div>
                  <div class="question">\${escapeHtml(row.file)}</div>
                </td>
                <td><span class="pill">\${escapeHtml(row.type)}</span></td>
                <td><span class="pill">\${escapeHtml(row.status)}</span></td>
                <td>
                  <div>\${escapeHtml(row.decision)}</div>
                  <div class="question">Best: \${escapeHtml(row.strongest_option || "N/A")}</div>
                </td>
                <td>\${row.confidence === null ? "N/A" : Math.round(row.confidence * 100) + "%"}</td>
                <td><span class="pill \${maturityClass(row.maturity)}">\${escapeHtml(row.score + "/" + row.max_score + " " + row.grade)}</span></td>
                <td>\${escapeHtml(row.review_date || "")}</td>
              </tr>
            \`).join("")}
          </tbody>
        </table>
      \`;
    }

    search.addEventListener("input", render);
    type.addEventListener("change", render);
    status.addEventListener("change", render);
    render();
  </script>
</body>
</html>
`;
}

function renderCsv(rows) {
  if (!rows.length) return "\n";
  const headers = Object.keys(rows[0]);
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))
  ].join("\n") + "\n";
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function summarizeRows(rows) {
  const total = rows.length;
  return {
    total,
    operational: rows.filter((row) => row.maturity === "operational").length,
    reviewed: rows.filter((row) => row.status === "reviewed").length,
    averageScore: total ? Math.round(avg(rows.map((row) => row.score / row.max_score)) * 100) : 0,
    averageConfidence: total ? Math.round(avg(rows.map((row) => row.confidence).filter((value) => value !== null)) * 100) : 0
  };
}

function avg(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
