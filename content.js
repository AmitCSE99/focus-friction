// Focus Friction — Content Script
//
// Per-page-load flow:
//   1. Check if this site is on the friction list
//   2. Show a time-picker overlay — user sets a start + end time
//   3. Poll until current time ≥ end time
//   4. Show warning popup — wait for dismissal
//   5. After 1 min  → greyscale + blur (blur grows 1 px/min)
//   6. After 3 min total (1 min + 2 min) → jitter scroll begins
//
// Refreshing the page resets everything — the picker appears again.

// ---------------------------------------------------------------------------
// Friction list check
// Content scripts can read chrome.storage directly — no background ping needed.
// ---------------------------------------------------------------------------

function hostnameOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return null; }
}

async function isCurrentSiteFriction() {
  const host = hostnameOf(location.href);
  if (!host) return false;
  const { frictionList = [] } = await chrome.storage.sync.get("frictionList");
  return frictionList.some(
    (site) => host === site || host.endsWith("." + site)
  );
}

// ---------------------------------------------------------------------------
// Shadow DOM helper
// Mounting UI inside a shadow root prevents the page's own CSS from
// bleeding in and breaking the overlay styles.
// ---------------------------------------------------------------------------

function mountShadow(id) {
  const host = document.createElement("div");
  host.id = id;
  const shadow = host.attachShadow({ mode: "open" });
  (document.body ?? document.documentElement).appendChild(host);
  return shadow;
}

// ---------------------------------------------------------------------------
// Time-picker overlay
// ---------------------------------------------------------------------------

function showTimePicker() {
  return new Promise((resolve) => {
    const shadow = mountShadow("ff-picker");

    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const defaultStart = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const end1h = new Date(now.getTime() + 60 * 60 * 1000);
    const defaultEnd = `${pad(end1h.getHours())}:${pad(end1h.getMinutes())}`;

    shadow.innerHTML = `
      <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .backdrop {
          position: fixed; inset: 0; z-index: 2147483647;
          background: rgba(0, 0, 0, 0.55);
          display: flex; align-items: center; justify-content: center;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .card {
          background: #fff; border-radius: 16px;
          padding: 32px; width: 340px;
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.3);
          animation: pop 0.2s ease;
        }
        @keyframes pop {
          from { transform: scale(0.92); opacity: 0; }
          to   { transform: scale(1);    opacity: 1; }
        }
        h2 { font-size: 18px; font-weight: 700; color: #111; margin-bottom: 4px; }
        .sub { font-size: 13px; color: #6b7280; margin-bottom: 24px; }
        .field { margin-bottom: 16px; }
        label {
          display: block; font-size: 11px; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.05em;
          color: #9ca3af; margin-bottom: 6px;
        }
        input[type="time"] {
          width: 100%; padding: 10px 12px;
          border: 1.5px solid #e5e7eb; border-radius: 8px;
          font-size: 16px; color: #111; background: #fafafa;
          outline: none; transition: border-color 0.15s;
        }
        input[type="time"]:focus { border-color: #6366f1; background: #fff; }
        .error { font-size: 12px; color: #dc2626; min-height: 18px; margin-bottom: 12px; }
        .btn {
          width: 100%; padding: 12px;
          background: #6366f1; color: #fff;
          border: none; border-radius: 10px;
          font-size: 14px; font-weight: 600;
          cursor: pointer; transition: background 0.15s;
        }
        .btn:hover { background: #4f46e5; }
      </style>
      <div class="backdrop">
        <div class="card">
          <h2>Focus Session</h2>
          <p class="sub">Set your planned window for this visit.</p>
          <div class="field">
            <label>Start time</label>
            <input type="time" id="start" value="${defaultStart}" />
          </div>
          <div class="field">
            <label>End time</label>
            <input type="time" id="end" value="${defaultEnd}" />
          </div>
          <div class="error" id="err"></div>
          <button class="btn" id="go">Start Session</button>
        </div>
      </div>
    `;

    shadow.getElementById("go").addEventListener("click", () => {
      const startVal = shadow.getElementById("start").value;
      const endVal   = shadow.getElementById("end").value;

      if (!startVal || !endVal) {
        shadow.getElementById("err").textContent = "Please enter both times.";
        return;
      }
      if (endVal <= startVal) {
        shadow.getElementById("err").textContent = "End time must be after start time.";
        return;
      }

      document.getElementById("ff-picker").remove();
      resolve({ startTime: startVal, endTime: endVal });
    });
  });
}

// ---------------------------------------------------------------------------
// Warning popup
// ---------------------------------------------------------------------------

function showWarningPopup() {
  return new Promise((resolve) => {
    const shadow = mountShadow("ff-warning");

    shadow.innerHTML = `
      <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .backdrop {
          position: fixed; inset: 0; z-index: 2147483647;
          background: rgba(0, 0, 0, 0.65);
          display: flex; align-items: center; justify-content: center;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .card {
          background: #fff; border-radius: 16px;
          padding: 36px 32px; width: 340px; text-align: center;
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.35);
          animation: pop 0.2s ease;
        }
        @keyframes pop {
          from { transform: scale(0.92); opacity: 0; }
          to   { transform: scale(1);    opacity: 1; }
        }
        .icon { font-size: 48px; margin-bottom: 16px; }
        h2 { font-size: 20px; font-weight: 700; color: #111; margin-bottom: 10px; }
        p {
          font-size: 14px; color: #6b7280;
          line-height: 1.55; margin-bottom: 28px;
        }
        .btn {
          padding: 11px 36px;
          background: #ef4444; color: #fff;
          border: none; border-radius: 10px;
          font-size: 14px; font-weight: 600;
          cursor: pointer; transition: background 0.15s;
        }
        .btn:hover { background: #dc2626; }
      </style>
      <div class="backdrop">
        <div class="card">
          <div class="icon">⏰</div>
          <h2>Time's up!</h2>
          <p>
            You've exceeded your planned session time on this site.<br><br>
            Friction effects will kick in after 1 minute.
          </p>
          <button class="btn" id="dismiss">Dismiss</button>
        </div>
      </div>
    `;

    shadow.getElementById("dismiss").addEventListener("click", () => {
      document.getElementById("ff-warning").remove();
      resolve();
    });
  });
}

// ---------------------------------------------------------------------------
// Visual filter — greyscale + gradual blur
// ---------------------------------------------------------------------------

let blurLevel = 0;

function updateVisualFilter() {
  let el = document.getElementById("ff-visual");
  if (!el) {
    el = document.createElement("style");
    el.id = "ff-visual";
    document.head.appendChild(el);
  }
  const blurPart = blurLevel > 0 ? ` blur(${blurLevel}px)` : "";
  el.textContent = `
    html {
      filter: grayscale(100%)${blurPart} !important;
      transition: filter 2s ease !important;
    }
  `;
}

// ---------------------------------------------------------------------------
// Jitter scroll — periodic micro-jolts to interrupt smooth reading
// ---------------------------------------------------------------------------

let jitterTimer = null;

function startJitterScroll() {
  if (jitterTimer) return;
  jitterTimer = setInterval(() => {
    const jolt = (Math.random() - 0.5) * 8; // ±4 px
    window.scrollBy({ top: jolt, behavior: "instant" });
  }, 250);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseEndTime(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// Main flow
// ---------------------------------------------------------------------------

async function init() {
  if (!(await isCurrentSiteFriction())) return;

  // Step 1 — Show time picker, wait for the user to commit to a session window
  const { endTime } = await showTimePicker();
  const endDate = parseEndTime(endTime);

  // Step 2 — Poll every 5 s until we've passed the end time
  await new Promise((resolve) => {
    if (Date.now() >= endDate.getTime()) { resolve(); return; }
    const poll = setInterval(() => {
      if (Date.now() >= endDate.getTime()) {
        clearInterval(poll);
        resolve();
      }
    }, 5_000);
  });

  // Step 3 — Show warning popup, wait for the user to dismiss it
  await showWarningPopup();

  // Step 4 — Wait 1 minute, then apply greyscale + blur (blur starts at 0 px)
  await wait(60_000);
  updateVisualFilter();

  // Blur increases 1 px every minute
  setInterval(() => {
    blurLevel += 1;
    updateVisualFilter();
  }, 60_000);

  // Step 5 — 2 minutes after greyscale started, add jitter scroll
  await wait(2 * 60_000);
  startJitterScroll();
}

init();
