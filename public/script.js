let lastResults = [];
let pendingWrite = null; // { sql, type } when a write is awaiting confirmation

const HISTORY_KEY = "sqlAgentQuestionHistory";
const HISTORY_LIMIT = 10;

function fillExample(text) {
  document.getElementById("question").value = text;
  document.getElementById("question").focus();
}

function setAsking(isAsking) {
  const btn = document.getElementById("ask-btn");
  const label = document.getElementById("ask-label");
  btn.disabled = isAsking;
  label.textContent = isAsking ? "Thinking..." : "Ask";
}

function renderSql(sql) {
  document.getElementById("sql").textContent = sql;
}

function clearConfirmUI() {
  const existing = document.getElementById("confirm-row");
  if (existing) existing.remove();
  pendingWrite = null;
}

function showConfirmUI(sql, type) {
  clearConfirmUI();
  pendingWrite = { sql, type };

  const sqlBlock = document.getElementById("sql").parentElement;
  const row = document.createElement("div");
  row.id = "confirm-row";
  row.style.marginTop = "10px";
  row.style.display = "flex";
  row.style.gap = "8px";
  row.style.alignItems = "center";
  row.style.flexWrap = "wrap";

  const warning = document.createElement("span");
  warning.textContent = `This ${type} will modify data. Review the query above before running it.`;
  warning.style.fontSize = "13px";
  warning.style.opacity = "0.8";

  const confirmBtn = document.createElement("button");
  confirmBtn.className = "download-btn";
  confirmBtn.innerHTML = '<i class="ti ti-check"></i>Confirm & Run';
  confirmBtn.onclick = confirmWrite;

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "download-btn";
  cancelBtn.innerHTML = '<i class="ti ti-x"></i>Cancel';
  cancelBtn.onclick = () => {
    clearConfirmUI();
    document.getElementById("result").innerHTML =
      '<p class="empty-note">Write cancelled — nothing was changed.</p>';
  };

  row.appendChild(confirmBtn);
  row.appendChild(cancelBtn);
  row.appendChild(warning);
  sqlBlock.appendChild(row);
}

function renderResults(rows) {
  lastResults = rows || [];
  const resultDiv = document.getElementById("result");
  const downloadBtn = document.getElementById("download-btn");
  const countSpan = document.getElementById("result-count");

  if (!lastResults.length) {
    resultDiv.innerHTML = '<p class="empty-note">No rows returned.</p>';
    downloadBtn.style.display = "none";
    if (countSpan) countSpan.textContent = "";
    return;
  }

  if (countSpan) {
    countSpan.textContent = ` — ${lastResults.length} row${lastResults.length === 1 ? "" : "s"} returned`;
  }

  const columns = Object.keys(lastResults[0]);
  let html = '<div class="table-wrap"><table><thead><tr>';
  columns.forEach((col) => (html += `<th>${col}</th>`));
  html += "</tr></thead><tbody>";
  lastResults.forEach((row) => {
    html += "<tr>";
    columns.forEach((col) => (html += `<td>${row[col] === null ? "" : row[col]}</td>`));
    html += "</tr>";
  });
  html += "</tbody></table></div>";

  resultDiv.innerHTML = html;
  downloadBtn.style.display = lastResults.length ? "inline-flex" : "none";
}

function renderWriteSuccess(data) {
  const resultDiv = document.getElementById("result");
  document.getElementById("download-btn").style.display = "none";
  const countSpan = document.getElementById("result-count");
  if (countSpan) countSpan.textContent = "";
  const rowsWord = data.affectedRows === 1 ? "row" : "rows";
  let msg = `<p class="empty-note"><i class="ti ti-circle-check"></i> ${data.type} succeeded — ${data.affectedRows} ${rowsWord} affected.`;
  if (data.insertId) msg += ` New ID: ${data.insertId}.`;
  msg += "</p>";
  resultDiv.innerHTML = msg;
}

function dotClassForType(type) {
  if (type === "SELECT") return "dot-blue";
  if (type === "INSERT") return "dot-teal";
  if (type === "UPDATE") return "dot-amber";
  if (type === "DELETE") return "dot-coral";
  return "dot-gray";
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    return [];
  }
}

function saveHistory(entries) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch (err) {
    // storage unavailable (e.g. private browsing) — fail silently
  }
}

function addToHistory(question, type) {
  const entries = loadHistory();
  entries.unshift({ question, type: type || "SELECT", time: new Date().toISOString() });
  const trimmed = entries.slice(0, HISTORY_LIMIT);
  saveHistory(trimmed);
  renderHistoryPanel();
}

function clearHistory() {
  saveHistory([]);
  renderHistoryPanel();
}

function timeAgo(isoString) {
  const seconds = Math.floor((new Date() - new Date(isoString)) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderHistoryPanel() {
  const list = document.getElementById("history-list");
  if (!list) return;
  const entries = loadHistory();

  if (!entries.length) {
    list.innerHTML = '<p class="history-empty">Questions you ask will show up here.</p>';
    return;
  }

  list.innerHTML = entries
    .map(
      (entry, i) => `
      <div class="history-item" data-index="${i}">
        <span class="history-item-question">${escapeHtml(entry.question)}</span>
        <span class="history-item-meta">
          <span class="nav-dot ${dotClassForType(entry.type)}"></span>
          ${entry.type} &middot; ${timeAgo(entry.time)}
        </span>
      </div>`
    )
    .join("");

  list.querySelectorAll(".history-item").forEach((el) => {
    el.addEventListener("click", () => {
      const idx = Number(el.getAttribute("data-index"));
      const entry = loadHistory()[idx];
      if (!entry) return;
      const input = document.getElementById("question");
      input.value = entry.question;
      input.focus();
      closeHistoryPanel();
    });
  });
}

function toggleHistoryPanel() {
  const panel = document.getElementById("history-panel");
  const btn = document.getElementById("history-btn");
  if (!panel) return;
  const isHidden = panel.hasAttribute("hidden");
  if (isHidden) {
    renderHistoryPanel();
    panel.removeAttribute("hidden");
    btn.classList.add("active");
  } else {
    closeHistoryPanel();
  }
}

function closeHistoryPanel() {
  const panel = document.getElementById("history-panel");
  const btn = document.getElementById("history-btn");
  if (panel) panel.setAttribute("hidden", "");
  if (btn) btn.classList.remove("active");
}

document.addEventListener("click", (e) => {
  const panel = document.getElementById("history-panel");
  const btn = document.getElementById("history-btn");
  if (!panel || panel.hasAttribute("hidden")) return;
  if (panel.contains(e.target) || (btn && btn.contains(e.target))) return;
  closeHistoryPanel();
});

async function askAI() {
  const question = document.getElementById("question").value.trim();
  if (!question) return;

  clearConfirmUI();
  setAsking(true);
  renderSql("Thinking...");
  document.getElementById("result").innerHTML = '<p class="empty-note">Working on it...</p>';
  document.getElementById("download-btn").style.display = "none";

  try {
    const res = await fetch("/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const data = await res.json();

    renderSql(data.sql);
    addToHistory(question, data.type || "SELECT");

    if (data.needsConfirmation) {
      renderResults([]);
      showConfirmUI(data.sql, data.type);
      return;
    }

    renderResults(data.results);
  } catch (err) {
    renderSql("ERROR: " + err.message);
    renderResults([]);
  } finally {
    setAsking(false);
  }
}

async function confirmWrite() {
  if (!pendingWrite) return;
  const { sql } = pendingWrite;

  const confirmRow = document.getElementById("confirm-row");
  if (confirmRow) {
    confirmRow.querySelectorAll("button").forEach((b) => (b.disabled = true));
  }
  document.getElementById("result").innerHTML = '<p class="empty-note">Running...</p>';

  try {
    const res = await fetch("/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql }),
    });
    const data = await res.json();

    clearConfirmUI();

    if (data.type === "SELECT") {
      renderResults(data.results);
    } else if (data.executed) {
      renderWriteSuccess(data);
    } else {
      document.getElementById("result").innerHTML =
        `<p class="empty-note">${data.sql}</p>`;
    }
  } catch (err) {
    document.getElementById("result").innerHTML =
      `<p class="empty-note">ERROR: ${err.message}</p>`;
  }
}

function downloadExcel() {
  if (!lastResults.length) return;
  const worksheet = XLSX.utils.json_to_sheet(lastResults);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Results");
  XLSX.writeFile(workbook, "query-results.xlsx");
}

document.addEventListener("DOMContentLoaded", () => {
  const questionInput = document.getElementById("question");
  if (questionInput) {
    questionInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") askAI();
      if (e.key === "Escape") closeHistoryPanel();
    });
  }
  renderHistoryPanel();
});