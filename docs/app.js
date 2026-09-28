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
const chartMetricLabelEl = document.getElementById("chart-metric-label");
const metricButtons = document.querySelectorAll(".metric-btn");

const CHART_METRICS = {
  trainable_parameters: "trainable parameters",
  adapter_bytes: "adapter bytes",
};

// Cached after the first successful load, so toggling the metric just
// re-renders the chart instead of re-fetching.
let cachedSubmissions = null;
let cachedColorMap = null;

const PALETTE = {
  bg: "#0d0d0d",
  purple: "#8c7ef2",
  coral: "#f2795c",
  yellow: "#f0cb3c",
  green: "#3ea56e",
  cardDark: "#171717",
  ink: "#0b0b0b",
  inkOnDark: "#d8d6cd",
  mutedOnDark: "#9c9a92",
};

// Student identity is carried by color, from a validated 8-hue categorical
// order (dark-surface steps, since the chart card is dark). Never cycled or
// extended: a 9th+ student folds into a neutral "other" gray rather than
// inventing a new hue that hasn't been checked for colorblind safety.
const STUDENT_COLORS = [
  "#3987e5", // blue
  "#d95926", // orange
  "#199e70", // aqua
  "#c98500", // yellow
  "#d55181", // magenta
  "#008300", // green
  "#9085e9", // violet
  "#e66767", // red
];
const STUDENT_COLOR_OTHER = PALETTE.mutedOnDark;

function studentColorMap(submissions) {
  const students = Array.from(new Set(submissions.map((s) => s.student))).sort();
  const map = new Map();
  students.forEach((student, i) => {
    map.set(student, i < STUDENT_COLORS.length ? STUDENT_COLORS[i] : STUDENT_COLOR_OTHER);
  });
  return map;
}

function formatPercent(fraction) {
  return `${(fraction * 100).toFixed(1)}%`;
}

function renderRow(submission, colorMap) {
  const row = document.createElement("tr");
  const dotColor = colorMap.get(submission.student);
  row.innerHTML = `
    <td><span class="student-dot" style="background:${dotColor}"></span>${submission.student}</td>
    <td>${submission.run_name}</td>
    <td>${submission.method}</td>
    <td>${formatPercent(submission.gsm8k_accuracy)}</td>
    <td>${formatPercent(submission.accuracy_gain)}</td>
    <td>${submission.trainable_percentage.toFixed(3)}%</td>
  `;
  return row;
}

function renderTable(submissions, colorMap) {
  submissions
    .slice()
    .sort((a, b) => b.gsm8k_accuracy - a.gsm8k_accuracy)
    .forEach((submission) => tbodyEl.appendChild(renderRow(submission, colorMap)));
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

function renderChart(submissions, colorMap, metric = "trainable_parameters") {
  // trainable_parameters == 0 means "no fine-tuning" (the base model). It has
  // no meaningful position on a log-scale axis (log(0) is undefined, so
  // Plotly would just silently drop the point) — it belongs on the chart as
  // a reference line instead, not as a scatter point, in either metric view.
  // Rows missing the selected metric (e.g. adapter_bytes on an older
  // submission) are likewise left out of that view rather than plotted at 0.
  const plottable = submissions.filter((s) => s.trainable_parameters > 0 && s[metric] > 0);
  const baselineRows = submissions.filter((s) => s.trainable_parameters <= 0);

  const byStudent = new Map();
  for (const submission of plottable) {
    if (!byStudent.has(submission.student)) byStudent.set(submission.student, []);
    byStudent.get(submission.student).push(submission);
  }

  const traces = Array.from(byStudent.entries()).map(([student, rows]) => ({
    name: student,
    x: rows.map((r) => r[metric]),
    y: rows.map((r) => r.gsm8k_accuracy),
    text: rows.map(
      (r) =>
        `${r.student} — ${r.run_name}<br>method: ${r.method}<br>` +
        `${CHART_METRICS[metric]}: ${r[metric].toLocaleString()}<br>` +
        `GSM8K accuracy: ${formatPercent(r.gsm8k_accuracy)}`
    ),
    hoverinfo: "text",
    mode: "markers",
    type: "scatter",
    marker: {
      symbol: "circle",
      size: 11,
      color: colorMap.get(student),
      line: { color: PALETTE.bg, width: 1 },
    },
  }));

  const layout = {
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
    font: { color: PALETTE.mutedOnDark, family: "Space Grotesk, system-ui, sans-serif" },
    margin: { l: 60, r: 20, t: 10, b: 50 },
    xaxis: {
      title: metric === "trainable_parameters" ? "Trainable parameters" : "Adapter bytes",
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

  if (baselineRows.length > 0) {
    const baselineAccuracy = baselineRows[0].gsm8k_accuracy;
    layout.shapes = [
      {
        type: "line",
        xref: "paper",
        x0: 0,
        x1: 1,
        yref: "y",
        y0: baselineAccuracy,
        y1: baselineAccuracy,
        line: { color: PALETTE.mutedOnDark, width: 2, dash: "dot" },
      },
    ];
    layout.annotations = [
      {
        xref: "paper",
        x: 1,
        xanchor: "right",
        yref: "y",
        y: baselineAccuracy,
        yanchor: "bottom",
        text: "Base (no fine-tune)",
        showarrow: false,
        font: { color: PALETTE.mutedOnDark, size: 11 },
      },
    ];
  }

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

    cachedSubmissions = submissions;
    cachedColorMap = studentColorMap(submissions);
    renderStats(submissions);
    renderChart(submissions, cachedColorMap);
    renderTable(submissions, cachedColorMap);
    statusEl.hidden = true;
  } catch (error) {
    statusEl.textContent = `Could not load submissions: ${error.message}`;
  }
}

metricButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (!cachedSubmissions) return;
    metricButtons.forEach((b) => b.classList.remove("active"));
    button.classList.add("active");
    const metric = button.dataset.metric;
    chartMetricLabelEl.textContent = CHART_METRICS[metric];
    renderChart(cachedSubmissions, cachedColorMap, metric);
  });
});

loadSubmissions();
