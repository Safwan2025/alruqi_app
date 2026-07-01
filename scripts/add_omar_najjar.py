import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone
import uuid
import os
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

async def add_omar_najjar():
    """إضافة المعلم عمر النجار مع مواعيده"""
    
    mongo_url = os.environ['MONGO_URL']
    db_name = os.environ['DB_NAME']
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    # بيانات المعلم
    teacher_email = "omarnasernajjar09@gmail.com"
    teacher_name = "عمر النجار"
    teacher_picture = "https://customer-assets.emergentagent.com/job_quranlearn-10/artifacts/r6vasl72_IMG_6068.png"
    
    print("🔍 التحقق من وجود المعلم...")
    
    existing_user = await db.users.find_one({"email": teacher_email}, {"_id": 0})
    
    if existing_user:
        user_id = existing_user['user_id']
        print(f"✅ المعلم موجود مسبقاً: {existing_user['name']}")
        # تحديث الدور والصورة
        await db.users.update_one(
            {"email": teacher_email},
            {"$set": {
                "role": "teacher",
                "name": teacher_name,
                "picture": teacher_picture
            }}
        )
        print("✅ تم تحديث بيانات المعلم")
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user_data = {
            "user_id": user_id,
            "email": teacher_email,
            "name": teacher_name,
            "picture": teacher_picture,
            "role": "teacher",
            "bio": "",
            "specialization": "",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(user_data)
        print(f"✅ تم إنشاء المعلم: {teacher_name}")
    
    print(f"📧 الإيميل: {teacher_email}")
    print(f"🆔 user_id: {user_id}")
    print()
    
    # حذف المواعيد القديمة إن وجدت
    deleted = await db.available_slots.delete_many({"teacher_id": user_id})
    print(f"🗑️ تم حذف {deleted.deleted_count} موعد قديم")
    print()
    
    print("🔄 إنشاء المواعيد الجديدة...")
    print("⏰ الوقت: من 10:00 PM إلى 10:54 PM (كل 6 دقائق)")
    print()
    
    # المواعيد المحددة (يناير وفبراير 2026)
    # الوقت: 10:00 مساءً (hour=22)
    dates = [
        datetime(2026, 1, 13, 22, 0, 0, tzinfo=timezone.utc),  # Tuesday, January 13
        datetime(2026, 1, 15, 22, 0, 0, tzinfo=timezone.utc),  # Thursday, January 15
        datetime(2026, 1, 24, 22, 0, 0, tzinfo=timezone.utc),  # Saturday, January 24
        datetime(2026, 1, 27, 22, 0, 0, tzinfo=timezone.utc),  # Tuesday, January 27
        datetime(2026, 1, 29, 22, 0, 0, tzinfo=timezone.utc),  # Thursday, January 29
        datetime(2026, 2, 7, 22, 0, 0, tzinfo=timezone.utc),   # Saturday, February 7
        datetime(2026, 2, 10, 22, 0, 0, tzinfo=timezone.utc),  # Tuesday, February 10
        datetime(2026, 2, 12, 22, 0, 0, tzinfo=timezone.utc),  # Thursday, February 12
    ]
    
    slots_created = 0
    
    for date in dates:
        day_name = date.strftime('%A')
        date_str = date.strftime('%B %d, %Y')
        
        print(f"📅 {day_name}, {date_str}: 10 slots")
        
        # إنشاء 10 مواعيد (كل 6 دقائق من 10:00 PM إلى 10:54 PM)
        for slot_num in range(10):
            minutes = slot_num * 6
            slot_time = date.replace(minute=minutes)
            
            available_slot = {
                "slot_id": f"slot_{uuid.uuid4().hex[:12]}",
                "teacher_id": user_id,
                "teacher_name": teacher_name,
                "scheduled_time": slot_time.isoformat(),
                "duration": 6,
                "is_available": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            await db.available_slots.insert_one(available_slot)
            slots_created += 1
        
        print(f"   ✅ 10 slots created")
    
    print()
    print(f"✅ Total: {slots_created} slots created")
    print()
    
    # عرض عينة
    print("📅 Sample slots:")
    sample_slots = await db.available_slots.find(
        {"teacher_id": user_id},
        {"_id": 0}
    ).limit(5).to_list(length=5)
    
    for i, slot in enumerate(sample_slots, 1):
        slot_dt = datetime.fromisoformat(slot['scheduled_time'])
        time_str = slot_dt.strftime('%I:%M %p')
        date_str = slot_dt.strftime('%B %d, %Y')
        print(f"   {i}. {date_str} - {time_str}")
    
    client.close()
    print()
    print("✅ Done!")

if __name__ == "__main__":
    asyncio.run(add_omar_najjar())
