// Focus Friction — Popup Script

// ---------------------------------------------------------------------------
// Site-list storage helpers
// ---------------------------------------------------------------------------

async function getList() {
  const { frictionList = [] } = await chrome.storage.sync.get("frictionList");
  return frictionList;
}

async function saveList(list) {
  await chrome.storage.sync.set({ frictionList: list });
}

// ---------------------------------------------------------------------------
// Input normalisation
// Strip protocol, www, trailing slashes, and paths — store bare hostnames.
// e.g. "https://www.reddit.com/r/all" → "reddit.com"
// ---------------------------------------------------------------------------

function normalizeSite(raw) {
  let s = raw.trim().toLowerCase();
  // Strip protocol
  s = s.replace(/^https?:\/\//, "");
  // Strip www.
  s = s.replace(/^www\./, "");
  // Keep only the host part
  s = s.split("/")[0].split("?")[0].split("#")[0];
  return s;
}

function isValidHostname(s) {
  // Basic sanity check: at least one dot, no spaces, not empty
  return s.length > 0 && s.includes(".") && !/\s/.test(s);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

async function render() {
  const list = await getList();
  const container = document.getElementById("site-list");

  if (list.length === 0) {
    container.innerHTML =
      '<p class="empty-state">No sites added yet.<br>Type a domain above to get started.</p>';
    return;
  }

  container.innerHTML = list
    .map(
      (site, i) => `
      <div class="site-row">
        <span class="site-name">${escapeHtml(site)}</span>
        <button class="remove-btn" data-index="${i}" title="Remove">✕</button>
      </div>
    `
    )
    .join("");

  container.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const idx = Number(btn.dataset.index);
      const list = await getList();
      list.splice(idx, 1);
      await saveList(list);
      render();
    });
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function showError(msg) {
  const el = document.getElementById("error-msg");
  el.textContent = msg;
  setTimeout(() => (el.textContent = ""), 2500);
}

// ---------------------------------------------------------------------------
// Add site
// ---------------------------------------------------------------------------

async function addSite() {
  const input = document.getElementById("new-site");
  const site = normalizeSite(input.value);

  if (!isValidHostname(site)) {
    showError("Enter a valid domain, e.g. reddit.com");
    return;
  }

  const list = await getList();

  if (list.includes(site)) {
    showError(`${site} is already in the list.`);
    input.value = "";
    return;
  }

  list.push(site);
  await saveList(list);
  input.value = "";
  render();
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

document.getElementById("add-btn").addEventListener("click", addSite);

document.getElementById("new-site").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addSite();
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

render();
