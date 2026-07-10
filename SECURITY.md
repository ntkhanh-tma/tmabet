# Security notes

This is a client-only Angular app (GitHub Pages) that reads a Google Sheet via
the Sheets REST API and writes through a Google Apps Script web app. There is no
server we control, so a few security properties depend on configuration that
lives **outside this repository**. This file is the runbook for that config.

## 1. Google Sheets API key (action required)

The app ships a Google API key in its JavaScript bundle — this is unavoidable for
a browser-only app that calls the Sheets REST API directly. The key is therefore
**public by design**; the protection comes from *restricting* it, not hiding it.

A previous production build committed the real key to git history
(`docs/main-3VL2O62L.js`). Because git history is permanent, that key must be
treated as compromised.

**Do this in the Google Cloud Console:**

1. **Rotate**: delete/regenerate the leaked key (`AIzaSy…Z57M`) and create a new one.
2. **Restrict the new key** (APIs & Services → Credentials → the key):
   - *Application restriction* → **HTTP referrers**, allowlisting only:
     - `https://<your-username>.github.io/*` (the Pages site)
     - `http://localhost:4200/*` (local dev, optional)
   - *API restriction* → **Restrict key** → allow **Google Sheets API only**.
3. Update the `GOOGLE_SHEETS_API_KEY` GitHub Actions secret with the new key.
4. Keep the Sheet's own sharing set to what you actually intend to expose — the
   key grants read access to whatever the key's project can see, so anything in
   the spreadsheet is readable by anyone who has the (public) key + referrer.

Referrer restrictions are trivially spoofable by a non-browser client, so they
stop casual abuse, not a determined attacker. Do not put anything genuinely
sensitive in this spreadsheet.

## 2. Apps Script web app (write endpoint)

`scripts/apps-script/Code.gs` is deployed as a web app with "Anyone" access and
no authentication, so any client can submit bets/orders and impersonate any
player name. This matches the app's threat model (a casual office pool with no
real accounts). Hardening already in the script:

- **Formula-injection neutralisation** — user input starting with `= + - @` is
  prefixed with `'` so Google Sheets stores it as text instead of executing it
  (blocks `=IMPORTXML(...)`-style data-exfil formulas).
- **Input length caps** and **batch-size caps** to limit abuse.
- **Generic error responses** (internal errors are logged, not returned).

**After editing `Code.gs` you must redeploy**: Apps Script editor → Deploy →
Manage deployments → edit the active deployment → **New version** → Deploy.

If you ever need real integrity (prevent impersonation / tampering), the app
would need genuine authentication — a shared client secret does not help because
it would ship in the public bundle.

## 3. Frontend

- A **Content-Security-Policy** is delivered via `<meta>` in `src/index.html`
  (GitHub Pages can't set real HTTP headers). It restricts scripts to same-origin
  and limits `connect-src` to the Sheets API and Apps Script. Keep `connect-src`
  in sync if you add backends.
- The "login" is just a display name in `localStorage` — it is **not**
  authentication and provides no access control.

## 4. Dependencies

Runtime dependencies are kept patched (`npm audit --omit=dev` should report 0).
Remaining `npm audit` findings are dev/build-only tooling (esbuild/vite dev
server, etc.) that never ships to users.
