"""Mint a pytest_ session token for admin and return it."""
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pymongo import MongoClient

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

client = MongoClient(MONGO_URL)
db = client[DB_NAME]

admin = db.users.find_one({"email": "m0m0077100@gmail.com"})
if not admin:
    print("ERR: admin user not found")
    sys.exit(1)

token = f"pytest_{uuid.uuid4().hex}"
now = datetime.now(timezone.utc)
exp = now + timedelta(hours=2)
db.user_sessions.insert_one({
    "user_id": admin["user_id"],
    "session_token": token,
    "expires_at": exp.isoformat(),
    "created_at": now.isoformat(),
})
print(token)
