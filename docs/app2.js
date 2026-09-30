// Fine-Tuning Arena — Monoidal identity variant.
//
// Same data, same API, same logic as app.js — only the presentation layer
// (colors, chart chrome, table markup) is reskinned for the white/black
// "scientific notebook" identity in style2.css.

const API_BASE_URL = "https://finetuning-arena.onrender.com";

const statusEl = document.getElementById("status");
const statsEl = document.getElementById("stats");
const tableEl = document.getElementById("leaderboard");
const tbodyEl = tableEl.querySelector("tbody");
const chartEl = document.getElementById("chart");
const chartHeadingEl = document.getElementById("chart-heading-text");
const tabButtons = document.querySelectorAll(".tab");
const studentFilterEl = document.getElementById("student-filter");
const modelFilterEl = document.getElementById("model-filter");
const taskFilterEl = document.getElementById("task-filter");

const CHART_VIEWS = {
  trainable_parameters: {
    x: "trainable_parameters",
    y: "accuracy",
    xLabel: "TRAINABLE PARAMETERS",
    yLabel: "ACCURACY",
  },
  adapter_bytes: {
    x: "adapter_bytes",
    y: "accuracy",
    xLabel: "ADAPTER BYTES",
    yLabel: "ACCURACY",
  },
  efficiency: {
    x: "trainable_parameters",
    y: "accuracy_gain_per_million_params",
    xLabel: "TRAINABLE PARAMETERS",
    yLabel: "ACCURACY GAIN / M PARAMS",
  },
  rank: {
    x: "lora_rank",
    y: "accuracy",
    xLabel: "LORA RANK",
    yLabel: "ACCURACY",
    xType: "linear",
  },
};

const PERCENT_FIELDS = new Set(["accuracy", "accuracy_gain", "baseline_accuracy"]);

function formatMetricValue(field, value) {
  if (PERCENT_FIELDS.has(field)) return formatPercent(value);
  if (field === "accuracy_gain_per_million_params") return value.toFixed(4);
  return value.toLocaleString();
}

function hoverText(r) {
  const lines = [`${r.student} — ${r.run_name}`, `method: ${r.method}`];
  if (r.lora_rank != null) lines.push(`lora_rank: ${r.lora_rank}`);
  if (r.target_modules != null) lines.push(`target_modules: ${r.target_modules.join(", ")}`);
  lines.push(`trainable_parameters: ${r.trainable_parameters.toLocaleString()}`);
  lines.push(`total_parameters: ${r.total_parameters.toLocaleString()}`);
  lines.push(`trainable_percentage: ${r.trainable_percentage.toFixed(3)}%`);
  if (r.training_examples != null) lines.push(`training_examples: ${r.training_examples.toLocaleString()}`);
  if (r.training_time_seconds != null)
    lines.push(`training_time_seconds: ${r.training_time_seconds.toLocaleString()}`);
  if (r.peak_vram_mb != null) lines.push(`peak_vram_mb: ${r.peak_vram_mb.toLocaleString()}`);
  if (r.adapter_bytes != null) lines.push(`adapter_bytes: ${r.adapter_bytes.toLocaleString()}`);
  lines.push(`accuracy: ${formatPercent(r.accuracy)}`);
  lines.push(`baseline_accuracy: ${formatPercent(r.baseline_accuracy)}`);
  lines.push(`accuracy_gain: ${formatPercent(r.accuracy_gain)}`);
  lines.push(`accuracy_gain_per_million_params: ${r.accuracy_gain_per_million_params.toFixed(4)}`);
  if (r.git_commit != null) lines.push(`git_commit: ${r.git_commit}`);
  return lines.join("<br>");
}

let cachedSubmissions = null;
let cachedColorMap = null;
let currentViewKey = "trainable_parameters";
let currentStudentFilter = "all";
let currentModelFilter = "all";

const PALETTE = {
  paper: "#f0eee9",
  ink: "#2c2b28",
  muted: "#767470",
  hairline: "#dad7cf",
};

// Color is notation, not decoration: a small, direct, six-hue vocabulary
// (never a generated tint/shade ramp) carries student identity. Ordered so
// no two adjacent slots are an easily-confused pair. A 7th+ student folds
// into neutral gray rather than inventing a new hue.
const STUDENT_COLORS = [
  "#2851e3", // blue
  "#e8720c", // orange
  "#1c8a4b", // green
  "#6b3fa0", // violet
  "#d4362f", // red
  "#c99a00", // yellow
];
const STUDENT_COLOR_OTHER = "rgba(107, 107, 107, 0.5)";

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

function renderRow(submission, colorMap, rank) {
  const row = document.createElement("tr");
  const dotColor = colorMap.get(submission.student);
  row.innerHTML = `
    <td class="num">${rank}</td>
    <td><span class="student-dot" style="background:${dotColor}"></span>${submission.student}</td>
    <td>${submission.run_name}</td>
    <td>${submission.method}</td>
    <td class="num">${submission.lora_rank ?? "—"}</td>
    <td class="num">${formatPercent(submission.accuracy)}</td>
    <td class="num">${formatPercent(submission.accuracy_gain)}</td>
    <td class="num">${submission.trainable_percentage.toFixed(3)}%</td>
  `;
  return row;
}

function renderTable(submissions, colorMap) {
  submissions
    .slice()
    .sort((a, b) => b.accuracy - a.accuracy)
    .forEach((submission, i) => tbodyEl.appendChild(renderRow(submission, colorMap, i + 1)));
  tableEl.hidden = false;
}

function renderStats(submissions) {
  const best = submissions.reduce((a, b) => (b.accuracy > a.accuracy ? b : a));
  const avgGain = submissions.reduce((sum, s) => sum + s.accuracy_gain, 0) / submissions.length;
  const methodCount = new Set(submissions.map((s) => s.method)).size;

  document.getElementById("stat-count").textContent = submissions.length;
  document.getElementById("stat-best").textContent = formatPercent(best.accuracy);
  document.getElementById("stat-gain").textContent = formatPercent(avgGain);
  document.getElementById("stat-methods").textContent = methodCount;

  statsEl.hidden = false;
}

function renderChart(
  submissions,
  colorMap,
  viewKey = "trainable_parameters",
  studentFilter = "all",
  modelFilter = "all"
) {
  const view = CHART_VIEWS[viewKey];
  const isAccuracyView = view.y === "accuracy";
  const isLogX = view.xType !== "linear";

  const filtered = submissions
    .filter((s) => studentFilter === "all" || s.student === studentFilter)
    .filter((s) => modelFilter === "all" || s.base_model === modelFilter);
  const plottable = filtered.filter(
    (s) => s[view.x] != null && (!isLogX || (s.trainable_parameters > 0 && s[view.x] > 0))
  );
  const baselineRows =
    isAccuracyView && isLogX ? submissions.filter((s) => s.trainable_parameters <= 0) : [];

  const byStudent = new Map();
  for (const submission of plottable) {
    if (!byStudent.has(submission.student)) byStudent.set(submission.student, []);
    byStudent.get(submission.student).push(submission);
  }

  const traces = Array.from(byStudent.entries()).map(([student, rows]) => ({
    name: student,
    x: rows.map((r) => r[view.x]),
    y: rows.map((r) => r[view.y]),
    text: rows.map(hoverText),
    hoverinfo: "text",
    mode: "markers",
    type: "scatter",
    marker: {
      symbol: "circle",
      size: 9,
      color: colorMap.get(student),
      line: { color: PALETTE.paper, width: 1 },
    },
  }));

  const layout = {
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
    font: { color: PALETTE.ink, family: "Geist Mono, ui-monospace, monospace", size: 11 },
    margin: { l: 55, r: 10, t: 15, b: 45 },
    xaxis: {
      title: view.xLabel,
      type: isLogX ? "log" : "linear",
      dtick: isLogX ? undefined : 1,
      gridcolor: PALETTE.hairline,
      linecolor: PALETTE.ink,
      tickcolor: PALETTE.ink,
      color: PALETTE.ink,
      zeroline: false,
    },
    yaxis: {
      title: view.yLabel,
      tickformat: isAccuracyView ? ".0%" : undefined,
      rangemode: isAccuracyView ? "tozero" : "normal",
      gridcolor: PALETTE.hairline,
      linecolor: PALETTE.ink,
      tickcolor: PALETTE.ink,
      color: PALETTE.ink,
      zeroline: false,
    },
    legend: { font: { color: PALETTE.ink, size: 11 } },
  };

  if (baselineRows.length > 0) {
    const baselineAccuracy = baselineRows[0].accuracy;
    layout.shapes = [
      {
        type: "line",
        xref: "paper",
        x0: 0,
        x1: 1,
        yref: "y",
        y0: baselineAccuracy,
        y1: baselineAccuracy,
        line: { color: PALETTE.ink, width: 1, dash: "dot" },
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
        text: "BASE (NO FINE-TUNE)",
        showarrow: false,
        font: { color: PALETTE.ink, size: 10 },
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

    Array.from(new Set(submissions.map((s) => s.student)))
      .sort()
      .forEach((student) => {
        const option = document.createElement("option");
        option.value = student;
        option.textContent = student;
        studentFilterEl.appendChild(option);
      });

    Array.from(new Set(submissions.map((s) => s.base_model)))
      .sort()
      .forEach((model) => {
        const option = document.createElement("option");
        option.value = model;
        option.textContent = model;
        modelFilterEl.appendChild(option);
      });

    renderStats(submissions);
    renderChart(submissions, cachedColorMap, currentViewKey, currentStudentFilter, currentModelFilter);
    renderTable(submissions, cachedColorMap);
    statusEl.hidden = true;
  } catch (error) {
    statusEl.textContent = `Could not load submissions: ${error.message}`;
  }
}

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (!cachedSubmissions) return;
    tabButtons.forEach((b) => b.classList.remove("active"));
    button.classList.add("active");
    currentViewKey = button.dataset.metric;
    const view = CHART_VIEWS[currentViewKey];
    chartHeadingEl.textContent = view.xLabel;
    renderChart(cachedSubmissions, cachedColorMap, currentViewKey, currentStudentFilter, currentModelFilter);
  });
});

studentFilterEl.addEventListener("change", () => {
  if (!cachedSubmissions) return;
  currentStudentFilter = studentFilterEl.value;
  renderChart(cachedSubmissions, cachedColorMap, currentViewKey, currentStudentFilter, currentModelFilter);
});

modelFilterEl.addEventListener("change", () => {
  if (!cachedSubmissions) return;
  currentModelFilter = modelFilterEl.value;
  renderChart(cachedSubmissions, cachedColorMap, currentViewKey, currentStudentFilter, currentModelFilter);
});

// No `task` field on submissions yet — the select only ever shows
// "All tasks" until that column exists.

loadSubmissions();
