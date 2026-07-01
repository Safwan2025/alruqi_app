"""Minimal, idempotent test-user seeder for the isolated Emergent preview DB.

Phase B (test hygiene): unblocks the existing pytest suite in
`/app/backend/tests/` by ensuring the 5 accounts the tests assume exist are
present in the preview `users` collection — and nothing else.

Safety guarantees
-----------------
* Reads `MONGO_URL` and `DB_NAME` from `/app/backend/.env`.
* REFUSES to run unless `DB_NAME` starts with `alruqi_preview` or `alruqi_test`
  (cannot accidentally touch production).
* Writes to one collection only during normal seed: `users`.
* Uses `$setOnInsert` so re-running never overwrites existing user fields
  (e.g., a password the user has rotated manually).
* `--reset` deletes ONLY whitelisted accounts plus their `user_sessions` rows.
* Does NOT seed sessions, slots, memorization, certificates, peer data,
  competitions, or any production-like records.

Usage
-----
    python /app/scripts/seed_test_db.py            # idempotent seed
    python /app/scripts/seed_test_db.py --verify   # report current presence
    python /app/scripts/seed_test_db.py --reset    # delete whitelisted accounts
"""
import argparse
import os
import sys
import uuid
from datetime import datetime, timezone

from dotenv import load_dotenv
from passlib.context import CryptContext
from pymongo import MongoClient

load_dotenv("/app/backend/.env")

ALLOWED_DB_PREFIXES = ("alruqi_preview", "alruqi_test")

# 5-account whitelist — matches every email referenced by `login_or_mint` in
# /app/backend/tests/. Order is intentional: admin first, then teacher, then
# students, then teacher-creator.
TEST_ACCOUNTS = [
    {
        "email": "m0m0077100@gmail.com",
        "name": "مدير الموقع (Test Admin)",
        "role": "teacher",
        "password": "admin_test_123",
    },
    {
        "email": "aalsiiada@gmail.com",
        "name": "براء السيدا (Test Teacher)",
        "role": "teacher",
        "password": "teacher_test_123",
    },
    {
        "email": "test_dialog_user@test.com",
        "name": "Student A (Test)",
        "role": "student",
        "password": "test123456",
    },
    {
        "email": "osama38os8@gmail.com",
        "name": "Student B (Test)",
        "role": "student",
        "password": "test123456",
    },
    {
        "email": "m0m0077@hotmail.com",
        "name": "Teacher Creator (Test)",
        "role": "teacher",
        "password": "admin_test_123",
    },
]

WHITELIST_EMAILS = [a["email"] for a in TEST_ACCOUNTS]

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _connect():
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        print("✗ MONGO_URL or DB_NAME missing from /app/backend/.env", file=sys.stderr)
        sys.exit(2)
    if not db_name.startswith(ALLOWED_DB_PREFIXES):
        print(
            f"✗ refusing to run: DB_NAME='{db_name}' does not start with one of "
            f"{ALLOWED_DB_PREFIXES}. This seeder is preview-only.",
            file=sys.stderr,
        )
        sys.exit(2)
    return MongoClient(mongo_url)[db_name], db_name


def _build_user_doc(account: dict) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "user_id": f"user_{uuid.uuid4().hex[:12]}",
        "email": account["email"].lower(),
        "name": account["name"],
        "role": account["role"],
        "password_hash": pwd_context.hash(account["password"]),
        "picture": None,
        "phone": None,
        "bio": None,
        "is_frozen": False,
        "created_at": now,
        "updated_at": now,
    }


def cmd_seed(db, db_name: str) -> int:
    print(f"→ seeding test accounts into DB '{db_name}' ({len(TEST_ACCOUNTS)} accounts)")
    inserted, skipped = 0, 0
    for account in TEST_ACCOUNTS:
        email = account["email"].lower()
        doc = _build_user_doc(account)
        # `$setOnInsert` ensures we never overwrite an existing user's fields.
        result = db.users.update_one(
            {"email": email},
            {"$setOnInsert": doc},
            upsert=True,
        )
        if result.upserted_id is not None:
            print(f"  + inserted  {email:35s}  role={account['role']}")
            inserted += 1
        else:
            print(f"  · unchanged {email:35s}  (already present)")
            skipped += 1
    print(f"✓ seed complete: {inserted} inserted, {skipped} unchanged")
    return 0


def cmd_verify(db, db_name: str) -> int:
    print(f"→ verifying test accounts in DB '{db_name}'")
    missing = 0
    for account in TEST_ACCOUNTS:
        email = account["email"].lower()
        user = db.users.find_one({"email": email}, {"_id": 0, "user_id": 1, "role": 1})
        if not user:
            print(f"  ✗ MISSING   {email:35s}  expected role={account['role']}")
            missing += 1
        else:
            ok = "✓" if user.get("role") == account["role"] else "!"
            print(
                f"  {ok} present   {email:35s}  user_id={user.get('user_id')}  role={user.get('role')}"
            )
    if missing:
        print(f"✗ verify: {missing} missing account(s) — run without --verify to seed")
        return 1
    print(f"✓ verify: all {len(TEST_ACCOUNTS)} accounts present")
    return 0


def cmd_reset(db, db_name: str) -> int:
    print(f"→ resetting whitelisted test accounts in DB '{db_name}'")
    # 1. find user_ids of whitelisted emails
    users = list(
        db.users.find(
            {"email": {"$in": WHITELIST_EMAILS}},
            {"_id": 0, "user_id": 1, "email": 1},
        )
    )
    user_ids = [u["user_id"] for u in users if u.get("user_id")]
    # 2. delete their user_sessions
    sess_res = db.user_sessions.delete_many({"user_id": {"$in": user_ids}})
    # 3. delete the user rows themselves
    user_res = db.users.delete_many({"email": {"$in": WHITELIST_EMAILS}})
    print(
        f"  · removed {user_res.deleted_count} user row(s) "
        f"and {sess_res.deleted_count} user_sessions row(s)"
    )
    print("✓ reset complete (only whitelisted accounts + their sessions touched)")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Minimal, idempotent test-user seeder for the preview DB."
    )
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--verify", action="store_true", help="report current presence (read-only)")
    group.add_argument(
        "--reset",
        action="store_true",
        help="delete only the whitelisted test accounts and their sessions",
    )
    args = parser.parse_args(argv)

    db, db_name = _connect()
    if args.verify:
        return cmd_verify(db, db_name)
    if args.reset:
        return cmd_reset(db, db_name)
    return cmd_seed(db, db_name)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
