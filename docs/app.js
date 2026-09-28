// Fine-Tuning Arena — leaderboard frontend.
//
// Static site (GitHub Pages). Talks to the Render/FastAPI backend over
// fetch() only — it never touches the database directly, and no secrets
// belong here.

// Set this to the deployed Render service once it exists, e.g.
// "https://finetuning-arena-api.onrender.com".
const API_BASE_URL = "https://finetuning-arena.onrender.com";

const statusEl = document.getElementById("status");
const tableEl = document.getElementById("leaderboard");
const tbodyEl = tableEl.querySelector("tbody");
const chartEl = document.getElementById("chart");

// Method identity is carried by marker SYMBOL, not color: a scatter shows
// every pair of series at once, and with 4 methods there is no CVD-safe
// all-pairs categorical ordering — so all points share one validated hue
// (categorical slot 1) and only the symbol changes.
const METHOD_SYMBOLS = {
  full_ft: "circle",
  partial_ft: "square",
  lora: "diamond",
  qlora: "triangle-up",
};

function formatPercent(fraction) {
  return `${(fraction * 100).toFixed(1)}%`;
}

function renderRow(submission) {
  const row = document.createElement("tr");
  row.innerHTML = `
    <td>${submission.student}</td>
    <td>${submission.run_name}</td>
    <td>${submission.method}</td>
    <td>${formatPercent(submission.gsm8k_accuracy)}</td>
    <td>${formatPercent(submission.accuracy_gain)}</td>
    <td>${submission.trainable_percentage.toFixed(3)}%</td>
  `;
  return row;
}

function renderTable(submissions) {
  submissions
    .slice()
    .sort((a, b) => b.gsm8k_accuracy - a.gsm8k_accuracy)
    .forEach((submission) => tbodyEl.appendChild(renderRow(submission)));
  tableEl.hidden = false;
}

function chartColors() {
  const styles = getComputedStyle(document.querySelector(".viz-root"));
  const read = (name) => styles.getPropertyValue(name).trim();
  return {
    surface: read("--chart-surface"),
    textPrimary: read("--text-primary"),
    textSecondary: read("--text-secondary"),
    textMuted: read("--text-muted"),
    gridline: read("--gridline"),
    baseline: read("--baseline"),
    series1: read("--series-1"),
  };
}

function renderChart(submissions) {
  const colors = chartColors();
  const byMethod = new Map();
  for (const submission of submissions) {
    if (!byMethod.has(submission.method)) byMethod.set(submission.method, []);
    byMethod.get(submission.method).push(submission);
  }

  const traces = Array.from(byMethod.entries()).map(([method, rows]) => ({
    name: method,
    x: rows.map((r) => r.trainable_parameters),
    y: rows.map((r) => r.gsm8k_accuracy),
    text: rows.map(
      (r) =>
        `${r.student} — ${r.run_name}<br>method: ${r.method}<br>` +
        `trainable params: ${r.trainable_parameters.toLocaleString()}<br>` +
        `GSM8K accuracy: ${formatPercent(r.gsm8k_accuracy)}`
    ),
    hoverinfo: "text",
    mode: "markers",
    type: "scatter",
    marker: {
      symbol: METHOD_SYMBOLS[method] || "circle",
      size: 11,
      color: colors.series1,
      line: { color: colors.surface, width: 1 },
    },
  }));

  const layout = {
    paper_bgcolor: colors.surface,
    plot_bgcolor: colors.surface,
    font: { color: colors.textSecondary, family: "system-ui, -apple-system, sans-serif" },
    margin: { l: 60, r: 20, t: 10, b: 50 },
    xaxis: {
      title: "Trainable parameters",
      type: "log",
      gridcolor: colors.gridline,
      linecolor: colors.baseline,
      tickcolor: colors.baseline,
      color: colors.textMuted,
    },
    yaxis: {
      title: "GSM8K accuracy",
      tickformat: ".0%",
      rangemode: "tozero",
      gridcolor: colors.gridline,
      linecolor: colors.baseline,
      tickcolor: colors.baseline,
      color: colors.textMuted,
    },
    legend: { font: { color: colors.textSecondary } },
  };

  Plotly.newPlot(chartEl, traces, layout, { responsive: true, displaylogo: false });
}

async function loadSubmissions() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/submissions`);
    if (!response.ok) {
      throw new Error(`API responded with ${response.status}`);
    }
    const submissions = await response.json();

    if (submissions.length === 0) {
      statusEl.textContent = "No submissions yet.";
      return;
    }

    renderChart(submissions);
    renderTable(submissions);
    statusEl.hidden = true;
  } catch (error) {
    statusEl.textContent = `Could not load submissions: ${error.message}`;
  }
}

loadSubmissions();
