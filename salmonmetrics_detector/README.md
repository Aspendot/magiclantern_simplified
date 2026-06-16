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

Regression check against the confirmed local screenshot set:

```powershell
python tools\verify_known_screenshots.py
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
6. Fuse grayscale shape matching with masked HSV color agreement inside the weapon pill.
7. Prefer strict four-slot geometry when it is available.
8. Also classify extracted top-bar weapon components with the trained real-crop ONNX model, so a bad strict template proposal cannot block a stronger classifier read.
9. Fall back to an evenly spaced row sequence only when strict template and classifier evidence are unavailable.
10. Return `fixed_weapons`, `random_weapons`, `uncertain`, or `not_visible`.

The detector should resolve visible top-bar icons across device sizes before returning review/uncertain. It should still refuse cases where the bar is missing, severely cropped, or too degraded to support a real visual read.

## Weapon Classifier Training

`tools/train_weapon_cnn.py` trains and exports the small ONNX weapon-icon classifier used by production. It mixes synthetic template renders with confirmed real top-bar crops stored under `assets/training/real_weapon_crops/<weapon_id>/`.

Current runtime artifacts:

```text
assets/models/weapon_icon_classifier.onnx
assets/models/weapon_icon_labels.json
```

Retrain after adding new confirmed screenshots/crops:

```bash
python tools/train_weapon_cnn.py --epochs 4 --samples 6000 --batch-size 128 --threads 4 --real-fraction 0.70
```

## Assets

Weapon icons are copied from the existing SalmonMetrics web app assets.

Source attribution from the manifest:

```text
@hacceuee/s3-pixel-icons 3.1.2 (CC-BY-NC-4.0) + stat.ink Salmon Run weapon API names
```
