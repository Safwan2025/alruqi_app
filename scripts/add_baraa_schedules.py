import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone
import uuid
import os
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

async def fix_baraa_schedules():
    """تصحيح مواعيد البراء السيدا - من 10:00 مساءً إلى 10:54 مساءً"""
    
    mongo_url = os.environ['MONGO_URL']
    db_name = os.environ['DB_NAME']
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    print("🔍 البحث عن المعلم البراء السيدا...")
    
    teacher = await db.users.find_one(
        {"email": "aalsiiada@gmail.com"},
        {"_id": 0}
    )
    
    if not teacher:
        print("❌ لم يتم العثور على المعلم!")
        return
    
    print(f"✅ المعلم: {teacher['name']}")
    print()
    
    # حذف المواعيد القديمة
    deleted = await db.available_slots.delete_many({"teacher_id": teacher['user_id']})
    print(f"🗑️ تم حذف {deleted.deleted_count} موعد قديم")
    print()
    
    print("🔄 إنشاء المواعيد الجديدة...")
    print("⏰ الوقت: من 10:00 PM إلى 10:54 PM (كل 6 دقائق)")
    print()
    
    # الأيام المحددة (يناير وفبراير 2026)
    # الوقت: 10:00 مساءً (hour=22)
    dates = [
        datetime(2026, 1, 17, 22, 0, 0, tzinfo=timezone.utc),  # Saturday, January 17
        datetime(2026, 1, 20, 22, 0, 0, tzinfo=timezone.utc),  # Tuesday, January 20
        datetime(2026, 1, 22, 22, 0, 0, tzinfo=timezone.utc),  # Thursday, January 22
        datetime(2026, 1, 31, 22, 0, 0, tzinfo=timezone.utc),  # Saturday, January 31
        datetime(2026, 2, 3, 22, 0, 0, tzinfo=timezone.utc),   # Tuesday, February 3
        datetime(2026, 2, 6, 22, 0, 0, tzinfo=timezone.utc),   # Friday, February 6
    ]
    
    slots_created = 0
    
    for date in dates:
        day_name = date.strftime('%A')  # اسم اليوم بالإنجليزي
        date_str = date.strftime('%B %d, %Y')  # التاريخ بالإنجليزي
        
        print(f"📅 {day_name}, {date_str}: 10 slots")
        
        # إنشاء 10 مواعيد (كل 6 دقائق من 10:00 AM إلى 10:54 AM)
        for slot_num in range(10):
            minutes = slot_num * 6
            slot_time = date.replace(minute=minutes)
            
            available_slot = {
                "slot_id": f"slot_{uuid.uuid4().hex[:12]}",
                "teacher_id": teacher['user_id'],
                "teacher_name": teacher['name'],
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
        {"teacher_id": teacher['user_id']},
        {"_id": 0}
    ).limit(10).to_list(length=10)
    
    for i, slot in enumerate(sample_slots, 1):
        slot_dt = datetime.fromisoformat(slot['scheduled_time'])
        time_str = slot_dt.strftime('%I:%M %p')  # 10:00 PM, 10:06 PM, etc.
        print(f"   {i}. {time_str} - Duration: 6 minutes")
    
    client.close()
    print()
    print("✅ Done!")

if __name__ == "__main__":
    asyncio.run(fix_baraa_schedules())
