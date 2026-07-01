import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone, timedelta
import uuid
import os
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

async def add_teachers_and_schedules():
    """إضافة المعلمين والمواعيد"""
    
    mongo_url = os.environ['MONGO_URL']
    db_name = os.environ['DB_NAME']
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    # تعريف المعلمين
    teachers = [
        {
            "user_id": f"teacher_{uuid.uuid4().hex[:12]}",
            "email": "omar.alnajjar@maqraa.com",
            "name": "عمر النجار",
            "role": "teacher",
            "bio": "معلم قرآن متخصص في التحفيظ والتجويد، خبرة طويلة في تعليم القرآن الكريم للطلاب من جميع الأعمار",
            "specialization": "تحفيظ القرآن الكريم والتجويد",
            "rating": 4.9,
            "picture": "https://images.unsplash.com/photo-1659100598135-66eb6e3b4d17?w=200",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "weekly_slots": 18  # 18 موعد أسبوعياً
        },
        {
            "user_id": f"teacher_{uuid.uuid4().hex[:12]}",
            "email": "baraa.alseeda@maqraa.com",
            "name": "براء السيدا",
            "role": "teacher",
            "bio": "حافظ للقرآن الكريم، متخصص في تعليم التلاوة الصحيحة وأحكام التجويد بطريقة ميسرة",
            "specialization": "التلاوة الصحيحة وأحكام التجويد",
            "rating": 4.8,
            "picture": "https://images.unsplash.com/photo-1659100598135-66eb6e3b4d17?w=200",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "weekly_slots": 18  # 18 موعد أسبوعياً
        },
        {
            "user_id": f"teacher_{uuid.uuid4().hex[:12]}",
            "email": "mohammed.alansari@maqraa.com",
            "name": "محمد حامد الأنصاري",
            "role": "teacher",
            "bio": "مؤسس مقرأة الرُّقي، خبرة تزيد عن 15 عاماً في تعليم القرآن الكريم، علّم أكثر من 14,000 طالب وطالبة حول العالم",
            "specialization": "تحفيظ القرآن الكريم وبناء الشخصية القرآنية",
            "rating": 5.0,
            "picture": "https://images.unsplash.com/photo-1659100598135-66eb6e3b4d17?w=200",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "weekly_slots": 3  # 3 مواعيد أسبوعياً
        }
    ]
    
    print("🔄 جاري إضافة المعلمين...")
    
    for teacher in teachers:
        # التحقق من وجود المعلم
        existing = await db.users.find_one({"email": teacher["email"]})
        if existing:
            print(f"✅ المعلم {teacher['name']} موجود بالفعل")
            teacher["user_id"] = existing["user_id"]
        else:
            await db.users.insert_one(teacher)
            print(f"✅ تمت إضافة المعلم: {teacher['name']}")
    
    print("\n🔄 جاري إنشاء المواعيد المتاحة...")
    
    # إنشاء المواعيد لمدة شهرين (8 أسابيع)
    start_date = datetime.now(timezone.utc) + timedelta(days=1)  # نبدأ من الغد
    
    for teacher in teachers:
        slots_created = 0
        
        for week in range(8):  # 8 أسابيع (شهرين)
            week_start = start_date + timedelta(weeks=week)
            
            # توزيع المواعيد على أيام الأسبوع
            slots_per_week = teacher["weekly_slots"]
            
            if slots_per_week == 18:
                # توزيع 18 موعد: 3 مواعيد يومياً لـ 6 أيام
                days_to_schedule = 6
                slots_per_day = 3
                # الأوقات: 8 صباحاً، 2 ظهراً، 7 مساءً
                time_slots = [
                    {"hour": 8, "minute": 0},
                    {"hour": 14, "minute": 0},
                    {"hour": 19, "minute": 0}
                ]
            else:  # 3 مواعيد أسبوعياً
                days_to_schedule = 3
                slots_per_day = 1
                # الأوقات: 8 صباحاً
                time_slots = [{"hour": 8, "minute": 0}]
            
            for day in range(days_to_schedule):
                day_date = week_start + timedelta(days=day)
                
                for time_slot in time_slots[:slots_per_day]:
                    slot_time = day_date.replace(
                        hour=time_slot["hour"],
                        minute=time_slot["minute"],
                        second=0,
                        microsecond=0
                    )
                    
                    # إنشاء موعد متاح
                    available_slot = {
                        "slot_id": f"slot_{uuid.uuid4().hex[:12]}",
                        "teacher_id": teacher["user_id"],
                        "teacher_name": teacher["name"],
                        "scheduled_time": slot_time.isoformat(),
                        "duration": 60,
                        "is_available": True,
                        "created_at": datetime.now(timezone.utc).isoformat()
                    }
                    
                    await db.available_slots.insert_one(available_slot)
                    slots_created += 1
        
        print(f"✅ تم إنشاء {slots_created} موعد متاح للمعلم {teacher['name']}")
    
    print("\n✅ تم الانتهاء من إضافة المعلمين والمواعيد بنجاح!")
    
    # عرض إحصائيات
    total_teachers = await db.users.count_documents({"role": "teacher"})
    total_slots = await db.available_slots.count_documents({})
    
    print(f"\n📊 الإحصائيات:")
    print(f"   - عدد المعلمين: {total_teachers}")
    print(f"   - عدد المواعيد المتاحة: {total_slots}")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(add_teachers_and_schedules())
