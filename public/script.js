// Loaded as an ES module directly by the browser (no build step / bundler
// needed). The ElevenLabs client SDK is pulled from a CDN as an ES module.
import { Conversation } from "https://cdn.jsdelivr.net/npm/@elevenlabs/client/+esm";

const micButton = document.getElementById("micButton");
const startBtn = document.getElementById("startBtn");
const endBtn = document.getElementById("endBtn");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const stateLabel = document.getElementById("stateLabel");
const errorMessage = document.getElementById("errorMessage");
const transcript = document.getElementById("transcript");

const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");
const openSidebarBtn = document.getElementById("openSidebarBtn");
const closeSidebarBtn = document.getElementById("closeSidebarBtn");
const historyList = document.getElementById("historyList");

const HISTORY_KEY = "voiceAgentHistory";
const MAX_HISTORY = 30;

let conversation = null;
let currentSession = null; // { id, title, date, messages: [{text, source}] }
let viewingHistoryId = null;

/* ---------------- History (stored locally in the browser) ---------------- */

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

function saveHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " · " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function renderHistory() {
  const history = loadHistory();
  historyList.innerHTML = "";

  if (history.length === 0) {
    historyList.innerHTML = '<p class="history-list__empty">No conversations yet.</p>';
    return;
  }

  history.forEach((session) => {
    const item = document.createElement("button");
    item.className = "history-item" + (session.id === viewingHistoryId ? " history-item--active" : "");
    item.innerHTML =
      `<span class="history-item__title">${escapeHtml(session.title)}</span>` +
      `<span class="history-item__date">${formatDate(session.date)}</span>`;
    item.addEventListener("click", () => viewHistorySession(session));
    historyList.appendChild(item);
  });
}

function viewHistorySession(session) {
  viewingHistoryId = session.id;
  transcript.innerHTML = "";
  session.messages.forEach((m) => addTranscriptLine(m.text, m.source));
  renderHistory();
  closeSidebar();
}

function saveCurrentSessionToHistory() {
  if (!currentSession || currentSession.messages.length === 0) return;
  const history = loadHistory();
  history.unshift(currentSession);
  saveHistory(history);
  renderHistory();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ---------------- Sidebar open/close (mobile) ---------------- */

function openSidebar() {
  sidebar.classList.add("sidebar--open");
  sidebarOverlay.classList.add("sidebar-overlay--visible");
}

function closeSidebar() {
  sidebar.classList.remove("sidebar--open");
  sidebarOverlay.classList.remove("sidebar-overlay--visible");
}

openSidebarBtn.addEventListener("click", openSidebar);
closeSidebarBtn.addEventListener("click", closeSidebar);
sidebarOverlay.addEventListener("click", closeSidebar);

/* ---------------- UI helpers ---------------- */

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
}

function clearError() {
  errorMessage.hidden = true;
  errorMessage.textContent = "";
}

function setStatus(status) {
  statusDot.className = "status-dot status-dot--" + status;
  statusText.textContent =
    status === "connected" ? "Connected" :
    status === "connecting" ? "Connecting..." : "Disconnected";
}

function setMode(mode) {
  micButton.classList.remove("mic-button--listening", "mic-button--speaking");
  if (mode === "speaking") {
    micButton.classList.add("mic-button--speaking");
    stateLabel.textContent = "Agent responding...";
  } else if (mode === "listening") {
    micButton.classList.add("mic-button--listening");
    stateLabel.textContent = "Listening...";
  } else {
    stateLabel.textContent = "";
  }
}

function addTranscriptLine(text, source) {
  const placeholder = transcript.querySelector(".transcript__placeholder");
  if (placeholder) placeholder.remove();

  const bubble = document.createElement("p");
  bubble.className = "bubble " + (source === "user" ? "bubble--user" : "bubble--agent");
  bubble.textContent = text;
  transcript.appendChild(bubble);
  transcript.scrollTop = transcript.scrollHeight;
}

function resetTranscriptView() {
  transcript.innerHTML = '<p class="transcript__placeholder">Your conversation will appear here.</p>';
}

/* ---------------- Conversation control ---------------- */

async function startConversation() {
  clearError();
  startBtn.disabled = true;
  viewingHistoryId = null;
  resetTranscriptView();
  renderHistory();

  currentSession = {
    id: Date.now(),
    title: "New conversation",
    date: new Date().toISOString(),
    messages: [],
  };

  try {
    // Ask for microphone permission up front so the user gets a clear prompt.
    await navigator.mediaDevices.getUserMedia({ audio: true });

    const res = await fetch("/api/get-signed-url");
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to get signed URL from server");
    }

    conversation = await Conversation.startSession({
      signedUrl: data.signed_url,
      onConnect: () => setStatus("connected"),
      onDisconnect: () => {
        setStatus("disconnected");
        setMode(null);
        endBtn.disabled = true;
        startBtn.disabled = false;
        micButton.disabled = true;
        saveCurrentSessionToHistory();
        currentSession = null;
      },
      onStatusChange: (s) => setStatus(s.status),
      onModeChange: (m) => setMode(m.mode),
      onMessage: (msg) => {
        addTranscriptLine(msg.message, msg.source);
        if (currentSession) {
          currentSession.messages.push({ text: msg.message, source: msg.source });
          if (currentSession.title === "New conversation" && msg.source === "user") {
            currentSession.title = msg.message.slice(0, 40);
          }
        }
      },
      onError: (err) => showError(typeof err === "string" ? err : "Conversation error occurred"),
    });

    micButton.disabled = false;
    endBtn.disabled = false;
    setMode("listening");
  } catch (err) {
    showError(err.message || "Could not start the conversation. Check microphone permissions.");
    startBtn.disabled = false;
    currentSession = null;
  }
}

async function endConversation() {
  if (conversation) {
    await conversation.endSession();
    conversation = null;
  }
  setStatus("disconnected");
  setMode(null);
  startBtn.disabled = false;
  endBtn.disabled = true;
  micButton.disabled = true;
}

startBtn.addEventListener("click", startConversation);
endBtn.addEventListener("click", endConversation);

renderHistory();
