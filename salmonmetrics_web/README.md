# SalmonMetrics Web

Mobile-first web/PWA version of the Tkinter SalmonMetrics desktop tool.

The public OCR/VLM route uses Google Gemini from a Cloudflare Pages Function. The browser never receives the Gemini API key.

## Run on the PC

```powershell
cd D:\gitProjects\magiclantern_simplified-1\salmonmetrics_web
python server.py
```

Open `http://127.0.0.1:8765` on the PC.

For iPhone on the same Wi-Fi, open the `LAN` URL printed by the server, for example `http://192.168.1.25:8765`.

## Optional settings

The server defaults to the Google Apps Script URL from `サーバー.py`. Override it without editing code:

```powershell
$env:SALMONMETRICS_SHEET_URL = "https://script.google.com/macros/s/your-id/exec"
python server.py
```

If this will be exposed outside your home network, set a simple access key:

```powershell
$env:SALMONMETRICS_ACCESS_TOKEN = "choose-a-private-key"
python server.py
```

The web app will ask for that key once and store it in the browser.

## Local Cloudflare/Gemini test

Use this when testing the same Pages Function code that runs in production:

```powershell
cd D:\gitProjects\magiclantern_simplified-1\salmonmetrics_web
npm install
copy .dev.vars.example .dev.vars
notepad .dev.vars
npm run dev
```

Set `GEMINI_API_KEY` in `.dev.vars` to an AI Studio key. The default model is configured as:

```text
GEMINI_MODEL=gemini-3.5-flash
GEMINI_FALLBACK_MODELS=gemini-3-flash-preview,gemini-2.5-flash,gemini-3.1-flash-lite,gemini-2.5-flash-lite
```

The app tries Gemini 3.5 Flash first using the API model code `gemini-3.5-flash`. If Google returns a quota/rate-limit or model-availability error, it automatically retries in this order: Gemini 3 Flash, Gemini 2.5 Flash, Gemini 3.1 Flash Lite, then Gemini 2.5 Flash Lite. You can later switch the same app to a paid model such as `gemini-3.1-pro-preview` by changing only the model variables.

## iPhone install

In Safari, open the LAN or hosted URL, then use Share -> Add to Home Screen. It will launch like a lightweight app.

## Deploy later

For access outside the same Wi-Fi, the included Cloudflare Pages version is the best free option.

```powershell
cd D:\gitProjects\magiclantern_simplified-1\salmonmetrics_web
npm install
npx wrangler login
npx wrangler pages secret put GEMINI_API_KEY --project-name salmonmetrics
npx wrangler pages deploy static --project-name salmonmetrics
```

Manual weapon corrections are posted to `/api/weapon-feedback` and stored in Cloudflare KV. The production namespace is bound in `wrangler.toml` as:

```toml
[[kv_namespaces]]
binding = "WEAPON_FEEDBACK"
id = "2920b4dffe964827b886c8204c4494cb"
```

Set an export token if you want the detector training workflow to pull feedback records:

```powershell
npx wrangler pages secret put WEAPON_FEEDBACK_EXPORT_TOKEN --project-name salmonmetrics
```

Use the same value as the GitHub repository secret `WEAPON_FEEDBACK_EXPORT_TOKEN` for the scheduled retraining workflow.

Corrections have two effects:

- The same submitted screenshot/weapon-strip is remembered by image hash and reused immediately on future OCR as `weaponSource: "feedback"`.
- The correction record remains queued for the detector training workflow, which imports corrected crops and promotes a new classifier only after the regression suite passes.

Cloudflare will give you a free URL like `https://salmonmetrics.pages.dev`. If that project name is taken, use a more specific name:

```powershell
npx wrangler pages deploy static --project-name salmonmetrics-splatoon
```

The Cloudflare deployment uses the same `/api/*` routes as the local app through Pages Functions. Set `SALMONMETRICS_SHEET_URL` in the Cloudflare Pages project variables if you want to keep the sheet URL out of code, and set `SALMONMETRICS_ACCESS_TOKEN` if you want a shared access key.

Required production secret:

- `GEMINI_API_KEY`: your Google AI Studio Gemini API key.
- `WEAPON_FEEDBACK_EXPORT_TOKEN`: token for exporting correction feedback into detector training.

Optional production variables:

- `GEMINI_MODEL`: defaults to `gemini-3.5-flash`.
- `GEMINI_FALLBACK_MODELS`: comma-separated fallback list, defaults to `gemini-3-flash-preview,gemini-2.5-flash,gemini-3.1-flash-lite,gemini-2.5-flash-lite`.
- `SALMONMETRICS_SHEET_URL`: Google Apps Script `/exec` URL.
- `SALMONMETRICS_ACCESS_TOKEN`: shared access key for the app.

## Icon assets

Weapon icons are bundled locally from `@hacceuee/s3-pixel-icons` under CC-BY-NC-4.0. Japanese Salmon Run weapon names and lookup keys are generated from the stat.ink Salmon Run weapon API. The site manifest lives at `static/assets/weapons/manifest.json`.
