// Fine-Tuning Arena — leaderboard frontend.
//
// Static site (GitHub Pages). Talks to the Render/FastAPI backend over
// fetch() only — it never touches the database directly, and no secrets
// belong here.

const API_BASE_URL = "https://finetuning-arena.onrender.com";

const statusEl = document.getElementById("status");
const statsEl = document.getElementById("stats");
const tableEl = document.getElementById("leaderboard");
const tbodyEl = tableEl.querySelector("tbody");
const chartEl = document.getElementById("chart");

const PALETTE = {
  purple: "#8c7ef2",
  coral: "#f2795c",
  yellow: "#f0cb3c",
  green: "#3ea56e",
  cardDark: "#171717",
  ink: "#0b0b0b",
  inkOnDark: "#f5f5f0",
  mutedOnDark: "#9c9a92",
};

// Method identity is carried by marker SYMBOL, not color: a scatter shows
// every pair of series at once, and with 4 methods there is no CVD-safe
// all-pairs categorical ordering — so all points share one flat hue
// and only the symbol changes.
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

function renderStats(submissions) {
  const best = submissions.reduce((a, b) => (b.gsm8k_accuracy > a.gsm8k_accuracy ? b : a));
  const avgGain =
    submissions.reduce((sum, s) => sum + s.accuracy_gain, 0) / submissions.length;
  const methodCount = new Set(submissions.map((s) => s.method)).size;

  document.getElementById("stat-count").textContent = submissions.length;
  document.getElementById("stat-best").textContent = formatPercent(best.gsm8k_accuracy);
  document.getElementById("stat-gain").textContent = formatPercent(avgGain);
  document.getElementById("stat-methods").textContent = methodCount;

  statsEl.hidden = false;
}

function renderChart(submissions) {
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
      color: PALETTE.coral,
      line: { color: PALETTE.cardDark, width: 1 },
    },
  }));

  const layout = {
    paper_bgcolor: PALETTE.cardDark,
    plot_bgcolor: PALETTE.cardDark,
    font: { color: PALETTE.mutedOnDark, family: "Space Grotesk, system-ui, sans-serif" },
    margin: { l: 60, r: 20, t: 10, b: 50 },
    xaxis: {
      title: "Trainable parameters",
      type: "log",
      gridcolor: "#2c2c2a",
      linecolor: "#3a3a37",
      tickcolor: "#3a3a37",
      color: PALETTE.mutedOnDark,
    },
    yaxis: {
      title: "GSM8K accuracy",
      tickformat: ".0%",
      rangemode: "tozero",
      gridcolor: "#2c2c2a",
      linecolor: "#3a3a37",
      tickcolor: "#3a3a37",
      color: PALETTE.mutedOnDark,
    },
    legend: { font: { color: PALETTE.mutedOnDark } },
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

    renderStats(submissions);
    renderChart(submissions);
    renderTable(submissions);
    statusEl.hidden = true;
  } catch (error) {
    statusEl.textContent = `Could not load submissions: ${error.message}`;
  }
}

loadSubmissions();
