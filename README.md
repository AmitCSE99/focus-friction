# Focus Friction

A Chrome Extension (Manifest V3) that adds progressive friction to distracting websites. Instead of outright blocking sites, it lets you set a planned session window and then gradually makes the page more uncomfortable to use once you exceed it.

---

## How it works

### 1. Add sites to the friction list

Click the extension icon to open the popup. Type a domain (e.g. `reddit.com`) and click **Add**. The extension stores bare hostnames and matches both the root domain and any subdomain — adding `reddit.com` also covers `old.reddit.com`.

To remove a site, click the **✕** button next to it.

### 2. Set a session window on every visit

When you navigate to a tracked site, a **Focus Session** overlay appears before the page becomes usable. Enter a start time and end time for your planned visit, then click **Start Session**.

- Start time defaults to the current time
- End time defaults to one hour from now
- End time must be after start time

The overlay is injected inside a Shadow DOM so the host page's CSS cannot interfere with it.

### 3. Warning popup at end time

The extension polls every 5 seconds. When the current time reaches or passes the end time you set, a **Time's up!** warning popup appears over the page, telling you that friction effects will begin in 1 minute.

Click **Dismiss** to acknowledge and start the countdown.

### 4. Progressive friction effects

After you dismiss the warning, effects kick in on a fixed schedule:

| Time after dismissal | Effect |
|---|---|
| 1 min | Greyscale filter applied to the entire page |
| 1 min | Blur starts at 0 px, grows by +1 px every minute |
| 3 min | Jitter scroll begins — the page jolts ±4 px every 250 ms |

All effects are cumulative. The blur keeps increasing indefinitely the longer you stay.

### 5. Refresh to reset

Refreshing the page fully resets the session. The Focus Session overlay appears again and you must set new start/end times. This is intentional — it removes the "I'll just scroll for a minute" habit loop.

---

## File structure

```
focus-friction/
├── manifest.json    Extension manifest (MV3)
├── background.js    Service worker stub (required by MV3)
├── content.js       All session logic and friction effects
├── popup.html       Extension popup UI
└── popup.js         Popup logic — manages the friction site list
```

### content.js

Handles the entire per-page flow end-to-end:

- Reads `frictionList` from `chrome.storage.sync` directly (no background ping needed)
- Renders the time-picker and warning overlays using Shadow DOM for CSS isolation
- Polls with `setInterval` every 5 s to detect end-time breach
- Applies `filter: grayscale(100%) blur(Xpx)` via an injected `<style>` tag that is updated in place each minute
- Runs `window.scrollBy` on a 250 ms interval to create the jitter effect

All state is in-memory. A page refresh reinitialises everything from scratch.

### popup.html / popup.js

A minimal popup for managing the friction site list:

- **Add**: type a domain and press Enter or click Add. URLs are normalised — protocol, `www.`, paths, and query strings are stripped automatically.
- **Remove**: click the ✕ button next to any site.
- The list is stored in `chrome.storage.sync` so it syncs across Chrome profiles.

### background.js

Empty service worker. All logic runs in `content.js`. The file exists to satisfy the MV3 `service_worker` manifest requirement.

### manifest.json

| Field | Value |
|---|---|
| Manifest version | 3 |
| Permissions | `storage`, `tabs`, `alarms` |
| Host permissions | `<all_urls>` |
| Content script run time | `document_idle` |

---

## Installation (developer mode)

1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the `focus-friction/` folder.
5. The extension icon will appear in the toolbar.

---

## Usage walkthrough

1. Click the extension icon → add `reddit.com`
2. Navigate to `reddit.com`
3. The **Focus Session** overlay appears → set start to now, end to +30 min → click **Start Session**
4. Use the site normally until your end time
5. The **Time's up!** popup appears → click **Dismiss**
6. After 1 minute: the page turns greyscale and starts blurring
7. After 3 minutes: the page begins jolting while you scroll
8. Refresh the page to start a new session

---

## Technical notes

**Shadow DOM isolation** — both overlays (time picker and warning) are mounted inside `attachShadow({ mode: "open" })` roots. This prevents any page-level CSS reset or theme from breaking the overlay styles.

**Subdomain matching** — a site entry of `reddit.com` matches any tab whose hostname ends with `.reddit.com` or equals `reddit.com` exactly. Subdomains like `old.reddit.com` are caught automatically.

**No background state** — the extension carries no runtime state between page loads. Each visit is fully independent, which keeps the codebase simple and makes the "refresh resets" behaviour a natural consequence of the architecture rather than something that needs explicit cleanup.

**CSS filter composition** — greyscale and blur are written as a single `filter` value (`grayscale(100%) blur(Xpx)`) on the `html` element with `!important`, so they override any `filter` the page itself applies. The `transition: filter 2s ease` makes the initial greyscale fade in smoothly.

---

## Release process

Pushing to `main` automatically packages and publishes the extension via GitHub Actions (`.github/workflows/publish.yml`).

### Before every push to `main`

**Increment `version` in `manifest.json`** — the Chrome Web Store API rejects uploads whose version matches the currently published one (returns `409 Conflict`, failing the job).

| Change type | Example |
|---|---|
| Bug fix | `1.0.0` → `1.0.1` |
| New feature | `1.0.0` → `1.1.0` |
| Breaking change | `1.0.0` → `2.0.0` |

If you forget, the CI job will fail at the publish step. Fix: bump the version and push again.

### Pipeline steps

1. Push to `main` triggers the workflow
2. `manifest.json`, `background.js`, `content.js`, `popup.html`, `popup.js` are zipped into `focus-friction.zip`
3. `chrome-webstore-upload-cli` uploads the ZIP and submits for immediate publishing
4. The extension enters Chrome's automated review queue (typically minutes to a few hours)

### Required GitHub secrets

Go to **Settings → Secrets and variables → Actions** in the repo and add four secrets:

| Secret | What it is |
|---|---|
| `EXTENSION_ID` | 32-char ID from the Chrome Web Store developer dashboard URL |
| `CLIENT_ID` | OAuth2 client ID (Desktop app) from Google Cloud Console |
| `CLIENT_SECRET` | OAuth2 client secret from Google Cloud Console |
| `REFRESH_TOKEN` | Long-lived OAuth2 refresh token from the OAuth 2.0 Playground |

### One-time credential setup

**Step 1 — Extension ID**

1. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Create (or open) your extension listing
3. The 32-character extension ID appears in the dashboard URL and at the top of the listing page

**Step 2 — Google Cloud OAuth credentials**

1. Go to [Google Cloud Console](https://console.cloud.google.com) and create a project
2. **APIs & Services → Library** → search for and enable **Chrome Web Store API**
3. **APIs & Services → OAuth consent screen** → choose External → fill in app name and your email → add your Google account as a Test User
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID** → application type: **Desktop app**
5. Copy the **Client ID** and **Client Secret** shown in the confirmation dialog

**Step 3 — Refresh token**

1. Go to [OAuth 2.0 Playground](https://developers.google.com/oauthplayground)
2. Click the ⚙️ gear icon → check **Use your own OAuth credentials** → paste your Client ID and Client Secret
3. In the Step 1 scope box, enter: `https://www.googleapis.com/auth/chromewebstore` → click **Authorize APIs**
4. Sign in with the Google account that owns the Chrome Web Store developer account
5. Click **Exchange authorization code for tokens** → copy the `refresh_token` value from the JSON response
