"""Phase: Official License Document Management feature tests.

Covers:
  - public metadata endpoint (no file_data_url leak, graceful empty-state)
  - public document streaming endpoint (PDF + image MIME)
  - admin upload (PDF, PNG, JPG)
  - rejection: non-admin upload, unauthenticated upload
  - rejection: unsupported MIME (HTML, SVG), invalid base64, oversize
  - DELETE soft-deactivates the active document
  - uploading a new doc deactivates the previous one
  - public document endpoint reflects active-only state

Cleanup: every `license_documents` row inserted during the test session is
removed at teardown, leaving only the 5 baseline users untouched.
"""
import base64
import os
import sys
import pytest
import requests

sys.path.insert(0, os.path.dirname(__file__))
from conftest import _db, TEST_ACCOUNTS, login_or_mint  # noqa: E402

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

# A tiny but VALID PDF file (1.4 spec minimum) — ~250 bytes
_TINY_PDF = (
    b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    b"2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n"
    b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 100 100]>>endobj\n"
    b"xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n"
    b"0000000053 00000 n \n0000000100 00000 n \n"
    b"trailer<</Size 4/Root 1 0 R>>\nstartxref\n160\n%%EOF\n"
)

# A 1×1 PNG (smallest valid PNG)
_TINY_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000a49444154789c6300010000000500010d0a2db40000000049454e44ae42"
    "6082"
)

# A 1×1 JPEG
_TINY_JPG = bytes.fromhex(
    "ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707"
    "07090908"
    + "0a" * 100
    + "ffd9"
)


def _data_url(mime: str, raw: bytes) -> str:
    return f"data:{mime};base64,{base64.b64encode(raw).decode('ascii')}"


def _admin_headers():
    tok = login_or_mint(TEST_ACCOUNTS["admin"])
    return {"X-Session-Token": tok, "Content-Type": "application/json"}


def _student_headers():
    tok = login_or_mint(TEST_ACCOUNTS["student_a"])
    return {"X-Session-Token": tok, "Content-Type": "application/json"}


def _teacher_headers():
    tok = login_or_mint(TEST_ACCOUNTS["teacher"])
    return {"X-Session-Token": tok, "Content-Type": "application/json"}


def _payload(mime: str, raw: bytes, license_number: str = "TEST_999", file_name: str = "test.bin") -> dict:
    return {
        "license_number": license_number,
        "issuer": "Test Issuer",
        "status_label": "Test Status",
        "issue_date": "2024-01-15",
        "expiry_date": "2027-01-15",
        "file_data_url": _data_url(mime, raw),
        "file_name": file_name,
    }


@pytest.fixture(autouse=True)
def _wipe_license_docs_around():
    """Each test starts and ends with an empty license_documents collection.

    Only documents created by THIS test module are wiped (license_number
    starting with TEST_), so we never disturb any real data.
    """
    _db.license_documents.delete_many({"license_number": {"$regex": "^TEST_"}})
    yield
    _db.license_documents.delete_many({"license_number": {"$regex": "^TEST_"}})


def test_admin_can_upload_pdf():
    r = requests.post(f"{API}/admin/license",
                      json=_payload("application/pdf", _TINY_PDF, "TEST_001", "license.pdf"),
                      headers=_admin_headers())
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["license"]["license_number"] == "TEST_001"
    assert body["license"]["file_mime"] == "application/pdf"
    assert body["license"]["has_document"] is True
    # Must NOT echo back the raw file_data_url
    assert "file_data_url" not in body["license"]


def test_admin_can_upload_png():
    r = requests.post(f"{API}/admin/license",
                      json=_payload("image/png", _TINY_PNG, "TEST_002", "license.png"),
                      headers=_admin_headers())
    assert r.status_code == 200, r.text
    assert r.json()["license"]["file_mime"] == "image/png"


def test_admin_can_upload_jpg():
    r = requests.post(f"{API}/admin/license",
                      json=_payload("image/jpeg", _TINY_JPG, "TEST_003", "license.jpg"),
                      headers=_admin_headers())
    assert r.status_code == 200, r.text
    assert r.json()["license"]["file_mime"] == "image/jpeg"


def test_student_cannot_upload():
    r = requests.post(f"{API}/admin/license",
                      json=_payload("application/pdf", _TINY_PDF, "TEST_S01"),
                      headers=_student_headers())
    assert r.status_code == 403


def test_teacher_non_admin_cannot_upload():
    r = requests.post(f"{API}/admin/license",
                      json=_payload("application/pdf", _TINY_PDF, "TEST_T01"),
                      headers=_teacher_headers())
    assert r.status_code == 403


def test_unauthenticated_cannot_use_admin_endpoint():
    r = requests.post(f"{API}/admin/license",
                      json=_payload("application/pdf", _TINY_PDF, "TEST_U01"))
    assert r.status_code in (401, 403)
    r2 = requests.get(f"{API}/admin/license")
    assert r2.status_code in (401, 403)


def test_public_metadata_returns_no_file_data_url():
    # Seed an active doc first
    requests.post(f"{API}/admin/license",
                  json=_payload("application/pdf", _TINY_PDF, "TEST_PUB1", "lic.pdf"),
                  headers=_admin_headers())
    r = requests.get(f"{API}/public/license")
    assert r.status_code == 200
    body = r.json()
    assert body["has_document"] is True
    assert body["license_number"] == "TEST_PUB1"
    assert body["file_mime"] == "application/pdf"
    # CRITICAL: never expose the heavy/raw file_data_url
    assert "file_data_url" not in body
    assert "uploaded_by" not in body


def test_public_document_streams_real_file():
    requests.post(f"{API}/admin/license",
                  json=_payload("application/pdf", _TINY_PDF, "TEST_DOC1", "official.pdf"),
                  headers=_admin_headers())
    r = requests.get(f"{API}/public/license/document")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/pdf")
    assert "inline" in r.headers.get("content-disposition", "")
    # Body must be the original PDF bytes
    assert r.content.startswith(b"%PDF-1.4")


def test_public_document_404_when_no_active():
    r = requests.get(f"{API}/public/license/document")
    assert r.status_code == 404


def test_public_metadata_empty_state_is_graceful():
    r = requests.get(f"{API}/public/license")
    assert r.status_code == 200
    assert r.json() == {"has_document": False}


def test_unsupported_mime_rejected_html():
    bad = _payload("application/pdf", _TINY_PDF, "TEST_BAD1")
    bad["file_data_url"] = "data:text/html;base64," + base64.b64encode(b"<script>x</script>").decode()
    r = requests.post(f"{API}/admin/license", json=bad, headers=_admin_headers())
    assert r.status_code == 400


def test_unsupported_mime_rejected_svg():
    bad = _payload("application/pdf", _TINY_PDF, "TEST_BAD2")
    bad["file_data_url"] = "data:image/svg+xml;base64," + base64.b64encode(b"<svg/>").decode()
    r = requests.post(f"{API}/admin/license", json=bad, headers=_admin_headers())
    assert r.status_code == 400


def test_invalid_base64_rejected():
    bad = _payload("application/pdf", _TINY_PDF, "TEST_BAD3")
    bad["file_data_url"] = "data:application/pdf;base64,@@@not-valid-base64@@@"
    r = requests.post(f"{API}/admin/license", json=bad, headers=_admin_headers())
    assert r.status_code == 400


def test_oversize_payload_rejected():
    # Build a payload that decodes to > 5MB
    big = b"\x00" * (5 * 1024 * 1024 + 10)
    bad = _payload("application/pdf", big, "TEST_BIG1")
    r = requests.post(f"{API}/admin/license", json=bad, headers=_admin_headers())
    assert r.status_code == 400


def test_delete_makes_inactive():
    requests.post(f"{API}/admin/license",
                  json=_payload("application/pdf", _TINY_PDF, "TEST_DEL1"),
                  headers=_admin_headers())
    r = requests.delete(f"{API}/admin/license", headers=_admin_headers())
    assert r.status_code == 200
    r2 = requests.get(f"{API}/public/license")
    assert r2.json() == {"has_document": False}
    r3 = requests.get(f"{API}/public/license/document")
    assert r3.status_code == 404


def test_second_upload_deactivates_first():
    requests.post(f"{API}/admin/license",
                  json=_payload("application/pdf", _TINY_PDF, "TEST_SEQ1", "first.pdf"),
                  headers=_admin_headers())
    requests.post(f"{API}/admin/license",
                  json=_payload("image/png", _TINY_PNG, "TEST_SEQ2", "second.png"),
                  headers=_admin_headers())
    # Exactly one active row, and it's the second one
    active = list(_db.license_documents.find(
        {"license_number": {"$regex": "^TEST_SEQ"}, "active": True}, {"_id": 0}
    ))
    assert len(active) == 1
    assert active[0]["license_number"] == "TEST_SEQ2"
    # Public reflects the new doc
    r = requests.get(f"{API}/public/license")
    assert r.json()["license_number"] == "TEST_SEQ2"
    assert r.json()["file_mime"] == "image/png"


def test_delete_when_no_active_returns_404():
    r = requests.delete(f"{API}/admin/license", headers=_admin_headers())
    assert r.status_code == 404
