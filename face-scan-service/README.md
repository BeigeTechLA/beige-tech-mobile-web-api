# Local Face Scan Service

This service powers `FACE_SCAN_SERVICE_URL=http://localhost:8000` for your BEIEGE backend.

## 1) Create and activate virtualenv

```bash
cd /home/pc/Development/BEIEGE/face-scan-service
python3 -m venv .venv
source .venv/bin/activate
```

## 2) Install dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

## 3) Run service

```bash
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

Health check:

```bash
curl http://localhost:8000/health
```

Expected sample response:

```json
{"ok":true,"model":"Facenet512","detector":"retinaface"}
```

## 4) Backend env

In `/home/pc/Development/BEIEGE/beige-tech-mobile-web-api/.env`:

```env
FACE_SCAN_SERVICE_URL=http://localhost:8000
```

Then restart backend.

## Notes

- First run can be slow because DeepFace downloads model weights.
- Keep this service running while testing face scan from frontend.
