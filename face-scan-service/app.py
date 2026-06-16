import base64
import gc
import os
import tempfile
import threading
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import requests
from deepface import DeepFace
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


app = FastAPI(title="Face Scan Service", version="1.0.0")

FACE_MODEL = os.getenv("FACE_MODEL", "Facenet512")
FACE_DETECTOR = os.getenv("FACE_DETECTOR", "retinaface")
REQUEST_TIMEOUT = float(os.getenv("FACE_HTTP_TIMEOUT", "12"))
MAX_CONCURRENT_REQUESTS = max(1, int(os.getenv("FACE_MAX_CONCURRENT_REQUESTS", "1")))
MAX_IMAGE_BYTES = max(1_000_000, int(os.getenv("FACE_MAX_IMAGE_BYTES", str(15 * 1024 * 1024))))
PROCESSING_SEMAPHORE = threading.BoundedSemaphore(MAX_CONCURRENT_REQUESTS)


class Candidate(BaseModel):
    path: str
    url: Optional[str] = None
    name: Optional[str] = None
    phase: Optional[str] = None
    folder: Optional[str] = None


class SearchRequest(BaseModel):
    externalId: str
    scanMode: str = Field(default="full_face_scan")
    scanImageBase64: Optional[str] = None
    scanImageUrl: Optional[str] = None
    candidates: List[Candidate] = Field(default_factory=list)
    threshold: float = 0.7
    maxResults: int = 200


class EmbedRequest(BaseModel):
    scanImageBase64: Optional[str] = None
    scanImageUrl: Optional[str] = None


def _write_temp_image_bytes(img_bytes: bytes) -> str:
    if len(img_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image is too large")

    tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
    tmp.write(img_bytes)
    tmp.flush()
    tmp.close()
    return tmp.name


def _write_temp_image_from_url(image_url: str) -> str:
    tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
    total_bytes = 0

    try:
        with requests.get(image_url, timeout=REQUEST_TIMEOUT, stream=True) as response:
            response.raise_for_status()
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if not chunk:
                    continue
                total_bytes += len(chunk)
                if total_bytes > MAX_IMAGE_BYTES:
                    raise HTTPException(status_code=413, detail="Image is too large")
                tmp.write(chunk)

        tmp.flush()
        tmp.close()
        return tmp.name
    except Exception:
        tmp.close()
        try:
            os.remove(tmp.name)
        except OSError:
            pass
        raise


def _load_scan_bytes(scan_b64: Optional[str], scan_url: Optional[str]) -> bytes:
    if scan_b64:
      try:
          return base64.b64decode(scan_b64, validate=False)
      except Exception as exc:
          raise HTTPException(status_code=400, detail=f"Invalid scanImageBase64: {exc}") from exc

    if scan_url:
        response = requests.get(scan_url, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        return response.content

    raise HTTPException(status_code=400, detail="scanImageBase64 or scanImageUrl is required")


def _write_scan_to_temp_path(scan_b64: Optional[str], scan_url: Optional[str]) -> str:
    if scan_b64:
        return _write_temp_image_bytes(_load_scan_bytes(scan_b64, None))

    if scan_url:
        return _write_temp_image_from_url(scan_url)

    raise HTTPException(status_code=400, detail="scanImageBase64 or scanImageUrl is required")


def _acquire_processing_slot() -> None:
    if not PROCESSING_SEMAPHORE.acquire(blocking=False):
        raise HTTPException(
            status_code=429,
            detail="Face scan service is busy. Please retry shortly.",
        )


def _extract_embeddings(reps: Any) -> List[List[float]]:
    if isinstance(reps, dict):
        reps = [reps]
    if not isinstance(reps, list):
        return []

    embeddings: List[List[float]] = []
    for rep in reps:
        embedding = rep.get("embedding") if isinstance(rep, dict) else None
        if isinstance(embedding, list) and embedding:
            embeddings.append(embedding)
    return embeddings


def _get_embeddings_from_path(img_path: str) -> List[List[float]]:
    reps = DeepFace.represent(
        img_path=img_path,
        model_name=FACE_MODEL,
        detector_backend=FACE_DETECTOR,
        enforce_detection=True,
    )
    embeddings = _extract_embeddings(reps)
    if not embeddings:
        raise ValueError("No face embedding generated")
    return embeddings


def _cosine_similarity(v1: List[float], v2: List[float]) -> float:
    a = np.asarray(v1, dtype=np.float32)
    b = np.asarray(v2, dtype=np.float32)
    denominator = (np.linalg.norm(a) * np.linalg.norm(b)) + 1e-8
    score = float(np.dot(a, b) / denominator)
    return max(0.0, min(1.0, (score + 1.0) / 2.0))


def _best_face_pair_score(
    query_embeddings: List[List[float]],
    candidate_embeddings: List[List[float]],
) -> Tuple[float, int, int]:
    best_score = 0.0
    best_query_index = -1
    best_candidate_index = -1

    for query_index, query_embedding in enumerate(query_embeddings):
        for candidate_index, candidate_embedding in enumerate(candidate_embeddings):
            score = _cosine_similarity(query_embedding, candidate_embedding)
            if score > best_score:
                best_score = score
                best_query_index = query_index
                best_candidate_index = candidate_index

    return best_score, best_query_index, best_candidate_index


@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "ok": True,
        "model": FACE_MODEL,
        "detector": FACE_DETECTOR,
        "maxConcurrentRequests": MAX_CONCURRENT_REQUESTS,
    }


@app.post("/embed")
def embed_face(payload: EmbedRequest) -> Dict[str, Any]:
    _acquire_processing_slot()
    scan_path = None

    try:
        scan_path = _write_scan_to_temp_path(payload.scanImageBase64, payload.scanImageUrl)
        scan_embeddings = _get_embeddings_from_path(scan_path)
        return {
            "success": True,
            "data": {
                "provider": "deepface",
                "embeddings": scan_embeddings,
                "facesDetected": len(scan_embeddings),
            },
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to process image: {exc}") from exc
    finally:
        if scan_path:
            try:
                os.remove(scan_path)
            except OSError:
                pass
        PROCESSING_SEMAPHORE.release()
        gc.collect()


@app.post("/search")
def search_faces(payload: SearchRequest) -> Dict[str, Any]:
    if not payload.candidates:
        return {"success": True, "data": {"provider": "deepface", "matches": []}}

    _acquire_processing_slot()
    scan_path = None

    try:
        scan_path = _write_scan_to_temp_path(payload.scanImageBase64, payload.scanImageUrl)
        scan_embeddings = _get_embeddings_from_path(scan_path)
    except HTTPException:
        PROCESSING_SEMAPHORE.release()
        gc.collect()
        raise
    except Exception as exc:
        PROCESSING_SEMAPHORE.release()
        gc.collect()
        raise HTTPException(status_code=400, detail=f"Failed to process scan image: {exc}") from exc
    finally:
        if scan_path:
            try:
                os.remove(scan_path)
            except OSError:
                pass

    matches: List[Dict[str, Any]] = []
    threshold = max(0.0, min(1.0, float(payload.threshold)))
    try:
        for candidate in payload.candidates:
            if not candidate.url:
                continue

            try:
                candidate_path = _write_temp_image_from_url(candidate.url)
                try:
                    candidate_embeddings = _get_embeddings_from_path(candidate_path)
                finally:
                    try:
                        os.remove(candidate_path)
                    except OSError:
                        pass

                score, query_face_index, candidate_face_index = _best_face_pair_score(
                    scan_embeddings, candidate_embeddings
                )
                if score >= threshold:
                    matches.append(
                        {
                            "path": candidate.path,
                            "url": candidate.url,
                            "name": candidate.name,
                            "phase": candidate.phase,
                            "folder": candidate.folder,
                            "score": score,
                            "confidence": score,
                            "queryFaceIndex": query_face_index,
                            "candidateFaceIndex": candidate_face_index,
                            "queryFacesDetected": len(scan_embeddings),
                            "candidateFacesDetected": len(candidate_embeddings),
                        }
                    )
            except Exception:
                # Skip unreadable or un-embeddable candidates.
                continue

        matches.sort(key=lambda item: item.get("score", 0), reverse=True)
        matches = matches[: max(1, int(payload.maxResults or 200))]

        return {
            "success": True,
            "data": {
                "provider": "deepface",
                "matches": matches,
            },
        }
    finally:
        PROCESSING_SEMAPHORE.release()
        gc.collect()
