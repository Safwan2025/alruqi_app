"""Seed juz-30 memorization records for user_dbfc93502485 and cleanup helper."""
import os
import sys
from datetime import datetime, timezone
from pymongo import MongoClient

sys.path.insert(0, "/app/backend")
from quran_data import QURAN_SURAHS  # noqa: E402

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
STUDENT_ID = "user_dbfc93502485"

client = MongoClient(MONGO_URL)
db = client[DB_NAME]

def cleanup():
    r1 = db.memorization_progress.delete_many({"progress_id": {"$regex": "^uitest_cert_"}})
    r2 = db.certificates.delete_many({"student_id": STUDENT_ID})
    r3 = db.notifications.delete_many({"type": "certificate_issued", "user_id": STUDENT_ID})
    print(f"cleanup: progress={r1.deleted_count} certificates={r2.deleted_count} notifications={r3.deleted_count}")

def seed():
    now = datetime.now(timezone.utc).isoformat()
    docs = []
    juz30 = [s for s in QURAN_SURAHS if 78 <= s["number"] <= 114]
    for s in juz30:
        docs.append({
            "progress_id": f"uitest_cert_{s['number']}",
            "student_id": STUDENT_ID,
            "surah_name": s["name"],
            "surah_number": s["number"],
            "from_ayah": 1,
            "to_ayah": s["ayah_count"],
            "quality": "ممتاز",
            "created_at": now,
        })
    # Use upsert-like behavior via delete-then-insert to ensure clean state
    db.memorization_progress.delete_many({"progress_id": {"$regex": "^uitest_cert_"}})
    db.certificates.delete_many({"student_id": STUDENT_ID, "juz_number": 30})
    db.memorization_progress.insert_many(docs)
    print(f"seeded {len(docs)} juz-30 records for {STUDENT_ID}")

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "cleanup":
        cleanup()
    else:
        seed()
