import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone, timedelta
import uuid
import os
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

async def add_schedules_for_mohammad():
    """إضافة مواعيد للمعلم محمد الانصاري"""
    
    mongo_url = os.environ['MONGO_URL']
    db_name = os.environ['DB_NAME']
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    print("🔍 البحث عن المعلم محمد الانصاري...")
    
    # الحصول على معلومات المعلم
    teacher = await db.users.find_one(
        {"name": "محمد الانصاري"},
        {"_id": 0}
    )
    
    if not teacher:
        print("❌ لم يتم العثور على المعلم!")
        return
    
    print(f"✅ تم العثور على المعلم:")
    print(f"   الاسم: {teacher['name']}")
    print(f"   البريد: {teacher['email']}")
    print(f"   المعرف: {teacher['user_id']}")
    print()
    
    # حذف المواعيد القديمة إن وجدت
    old_slots = await db.available_slots.count_documents({"teacher_id": teacher['user_id']})
    if old_slots > 0:
        await db.available_slots.delete_many({"teacher_id": teacher['user_id']})
        print(f"🗑️ تم حذف {old_slots} موعد قديم")
        print()
    
    print("🔄 جاري إنشاء المواعيد الجديدة...")
    print()
    
    # إنشاء المواعيد لمدة شهرين (8 أسابيع)
    start_date = datetime.now(timezone.utc) + timedelta(days=1)  # نبدأ من الغد
    slots_created = 0
    
    # 3 مواعيد أسبوعياً
    days_to_schedule = 3  # 3 أيام في الأسبوع
    slots_per_day = 1  # موعد واحد في اليوم
    time_slot = {"hour": 10, "minute": 0}  # الساعة 10 صباحاً
    
    for week in range(8):  # 8 أسابيع (شهرين)
        week_start = start_date + timedelta(weeks=week)
        
        for day in range(days_to_schedule):
            day_date = week_start + timedelta(days=day * 2)  # يوم بعد يوم
            
            slot_time = day_date.replace(
                hour=time_slot["hour"],
                minute=time_slot["minute"],
                second=0,
                microsecond=0
            )
            
            # إنشاء موعد متاح
            available_slot = {
                "slot_id": f"slot_{uuid.uuid4().hex[:12]}",
                "teacher_id": teacher['user_id'],
                "teacher_name": teacher['name'],
                "scheduled_time": slot_time.isoformat(),
                "duration": 60,
                "is_available": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            await db.available_slots.insert_one(available_slot)
            slots_created += 1
    
    print(f"✅ تم إنشاء {slots_created} موعد متاح للمعلم {teacher['name']}")
    print()
    
    # عرض إحصائيات
    total_slots = await db.available_slots.count_documents({
        "teacher_id": teacher['user_id'],
        "is_available": True
    })
    
    print(f"📊 الإحصائيات:")
    print(f"   - عدد المواعيد المتاحة: {total_slots}")
    print(f"   - التوزيع: 3 مواعيد أسبوعياً")
    print(f"   - المدة: 8 أسابيع (شهرين)")
    print(f"   - الوقت: 10:00 صباحاً")
    print()
    
    # عرض بعض المواعيد كعينة
    print("📅 عينة من المواعيد المتاحة:")
    sample_slots = await db.available_slots.find(
        {"teacher_id": teacher['user_id']},
        {"_id": 0}
    ).limit(5).to_list(length=5)
    
    for i, slot in enumerate(sample_slots, 1):
        slot_dt = datetime.fromisoformat(slot['scheduled_time'])
        print(f"   {i}. {slot_dt.strftime('%Y-%m-%d')} الساعة {slot_dt.strftime('%I:%M %p')}")
    
    client.close()
    print()
    print("✅ تم الانتهاء بنجاح!")

if __name__ == "__main__":
    asyncio.run(add_schedules_for_mohammad())
