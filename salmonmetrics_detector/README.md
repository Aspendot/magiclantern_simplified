# SalmonMetrics OpenCV Detector

FastAPI service for detecting the four Salmon Run shift weapon icons from a screenshot. It is designed to run on Google Cloud Run.

This service is intentionally separate from the Cloudflare Pages app. Cloudflare can call this service first for deterministic weapon detection, then fall back to Gemini only when this service returns `uncertain` or `not_visible`.

## Endpoints

- `GET /health`
- `POST /detect`
  - multipart form field: `file`
  - accepts image files
  - returns detected weapons, confidence, and review status

## Local Run

```powershell
cd D:\gitProjects\magiclantern_simplified-1\salmonmetrics_detector
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8080
```

Health check:

```powershell
Invoke-WebRequest -Uri http://127.0.0.1:8080/health -UseBasicParsing
```

Image test:

```powershell
curl.exe -X POST http://127.0.0.1:8080/detect -F "file=@C:\Users\Amir\Downloads\1.png"
```

## Cloud Run Deploy From This Folder

Recommended Cloud Run settings:

- Region: `us-central1` for the usual lowest-cost/free-tier-friendly setup, or `asia-northeast1`/`asia-northeast2` if latency from Japan matters more.
- CPU: `1`
- Memory: `512Mi` first; use `1Gi` if OpenCV runs out of memory.
- Min instances: `0`
- Max instances: `1`
- Authentication: allow unauthenticated invocations, then protect access later with a shared token if needed.

Deploy with gcloud:

```powershell
cd D:\gitProjects\magiclantern_simplified-1\salmonmetrics_detector
gcloud run deploy salmonmetrics-detector `
  --source . `
  --region us-central1 `
  --allow-unauthenticated `
  --min-instances 0 `
  --max-instances 1 `
  --cpu 1 `
  --memory 512Mi `
  --timeout 60
```

If using the Cloud Run console with a monorepo, select the GitHub repo and set the source directory/build context to:

```text
salmonmetrics_detector
```

If the console does not offer a source-directory field, create a new GitHub repo named `salmonmetrics-detector` and use this folder as the repo root.

## Current Detection Strategy

1. Normalize screenshot size.
2. Dynamically search for green result anchors near the top result UI.
3. Build candidate regions around those anchors plus upper-screen fallbacks.
4. Detect random weapon rotations by green question-mark clusters.
5. Multi-scale match weapon icon templates with OpenCV.
6. Return `fixed_weapons`, `random_weapons`, `uncertain`, or `not_visible`.

This is the first deployable detector. Accuracy tuning should happen with real uploaded screenshots and debug outputs.

## Assets

Weapon icons are copied from the existing SalmonMetrics web app assets.

Source attribution from the manifest:

```text
@hacceuee/s3-pixel-icons 3.1.2 (CC-BY-NC-4.0) + stat.ink Salmon Run weapon API names
```
