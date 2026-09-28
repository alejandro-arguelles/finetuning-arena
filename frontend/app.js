// Fine-Tuning Arena — leaderboard frontend.
//
// Static site (GitHub Pages). Talks to the Render/FastAPI backend over
// fetch() only — it never touches the database directly, and no secrets
// belong here.

// Set this to the deployed Render service once it exists, e.g.
// "https://finetuning-arena-api.onrender.com".
const API_BASE_URL = "http://localhost:8000";

const statusEl = document.getElementById("status");
const tableEl = document.getElementById("leaderboard");
const tbodyEl = tableEl.querySelector("tbody");

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

    submissions
      .sort((a, b) => b.gsm8k_accuracy - a.gsm8k_accuracy)
      .forEach((submission) => tbodyEl.appendChild(renderRow(submission)));

    statusEl.hidden = true;
    tableEl.hidden = false;
  } catch (error) {
    statusEl.textContent = `Could not load submissions: ${error.message}`;
  }
}

loadSubmissions();
