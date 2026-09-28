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
const chartHeadingEl = document.getElementById("chart-heading-text");
const metricButtons = document.querySelectorAll(".metric-btn");
const studentFilterEl = document.getElementById("student-filter");

// Each view picks what goes on the X and Y axis. accuracy_gain_per_million_params
// is already computed server-side (accuracy_gain / (trainable_parameters / 1e6)).
const CHART_VIEWS = {
  trainable_parameters: {
    x: "trainable_parameters",
    y: "gsm8k_accuracy",
    xLabel: "trainable parameters",
    yLabel: "GSM8K accuracy",
  },
  adapter_bytes: {
    x: "adapter_bytes",
    y: "gsm8k_accuracy",
    xLabel: "adapter bytes",
    yLabel: "GSM8K accuracy",
  },
  efficiency: {
    x: "trainable_parameters",
    y: "accuracy_gain_per_million_params",
    xLabel: "trainable parameters",
    yLabel: "accuracy gain % per million trained params",
  },
  rank: {
    x: "lora_rank",
    y: "gsm8k_accuracy",
    xLabel: "LoRA rank",
    yLabel: "GSM8K accuracy",
    xType: "linear",
  },
};

const PERCENT_FIELDS = new Set(["gsm8k_accuracy", "accuracy_gain", "baseline_accuracy"]);

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
  lines.push(`gsm8k_accuracy: ${formatPercent(r.gsm8k_accuracy)}`);
  lines.push(`baseline_accuracy: ${formatPercent(r.baseline_accuracy)}`);
  lines.push(`accuracy_gain: ${formatPercent(r.accuracy_gain)}`);
  lines.push(`accuracy_gain_per_million_params: ${r.accuracy_gain_per_million_params.toFixed(4)}`);
  if (r.git_commit != null) lines.push(`git_commit: ${r.git_commit}`);
  return lines.join("<br>");
}

// Cached after the first successful load, so toggling the metric or the
// student filter just re-renders the chart instead of re-fetching.
let cachedSubmissions = null;
let cachedColorMap = null;
let currentViewKey = "trainable_parameters";
let currentStudentFilter = "all";

const PALETTE = {
  bg: "#0d0d0d",
  purple: "#8c7ef2",
  coral: "#f2795c",
  yellow: "#f0cb3c",
  green: "#3ea56e",
  ink: "#0b0b0b",
  inkOnDark: "#d8d6cd",
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
const STUDENT_COLOR_OTHER = "rgba(216, 214, 205, 0.4)";

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
    <td>${rank}</td>
    <td><span class="student-dot" style="background:${dotColor}"></span>${submission.student}</td>
    <td>${submission.run_name}</td>
    <td>${submission.method}</td>
    <td>${submission.lora_rank ?? "—"}</td>
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
    .forEach((submission, i) => tbodyEl.appendChild(renderRow(submission, colorMap, i + 1)));
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

function renderChart(submissions, colorMap, viewKey = "trainable_parameters", studentFilter = "all") {
  const view = CHART_VIEWS[viewKey];
  const isAccuracyView = view.y === "gsm8k_accuracy";
  const isLogX = view.xType !== "linear";

  // trainable_parameters == 0 means "no fine-tuning" (the base model). It has
  // no meaningful position on a log-scale axis (log(0) is undefined, so
  // Plotly would just silently drop the point) — it belongs on the chart as
  // a reference line instead, not as a scatter point, only for log-x views.
  // Rows missing the selected metric (e.g. lora_rank on a full-FT submission,
  // or adapter_bytes on an older one) are likewise left out of that view
  // rather than plotted at 0/null.
  // The baseline reference line always reflects everyone, regardless of the
  // student filter — it's a fixed reference point, not one student's data.
  const filtered =
    studentFilter === "all" ? submissions : submissions.filter((s) => s.student === studentFilter);
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
      title: view.xLabel,
      type: isLogX ? "log" : "linear",
      dtick: isLogX ? undefined : 1,
      gridcolor: "rgba(216, 214, 205, 0.15)",
      linecolor: PALETTE.inkOnDark,
      tickcolor: PALETTE.inkOnDark,
      color: PALETTE.mutedOnDark,
    },
    yaxis: {
      title: view.yLabel,
      tickformat: isAccuracyView ? ".0%" : undefined,
      rangemode: isAccuracyView ? "tozero" : "normal",
      gridcolor: "rgba(216, 214, 205, 0.15)",
      linecolor: PALETTE.inkOnDark,
      tickcolor: PALETTE.inkOnDark,
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

    Array.from(new Set(submissions.map((s) => s.student)))
      .sort()
      .forEach((student) => {
        const option = document.createElement("option");
        option.value = student;
        option.textContent = student;
        studentFilterEl.appendChild(option);
      });

    renderStats(submissions);
    renderChart(submissions, cachedColorMap, currentViewKey, currentStudentFilter);
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
    currentViewKey = button.dataset.metric;
    const view = CHART_VIEWS[currentViewKey];
    chartHeadingEl.textContent = `${view.yLabel} vs. ${view.xLabel}`;
    renderChart(cachedSubmissions, cachedColorMap, currentViewKey, currentStudentFilter);
  });
});

studentFilterEl.addEventListener("change", () => {
  if (!cachedSubmissions) return;
  currentStudentFilter = studentFilterEl.value;
  renderChart(cachedSubmissions, cachedColorMap, currentViewKey, currentStudentFilter);
});

loadSubmissions();
