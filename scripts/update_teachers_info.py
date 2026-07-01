import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

async def update_teachers_info():
    """تحديث معلومات المعلمين"""
    
    mongo_url = os.environ['MONGO_URL']
    db_name = os.environ['DB_NAME']
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    print("🔄 جاري تحديث معلومات المعلمين...")
    
    # إزالة النبذة والصور والتقييم لعمر النجار وبراء السيدا
    await db.users.update_one(
        {"name": "عمر النجار"},
        {"$unset": {"bio": "", "picture": "", "rating": "", "specialization": ""}}
    )
    print("✅ تم إزالة معلومات عمر النجار")
    
    await db.users.update_one(
        {"name": "براء السيدا"},
        {"$unset": {"bio": "", "picture": "", "rating": "", "specialization": ""}}
    )
    print("✅ تم إزالة معلومات براء السيدا")
    
    # تحديث صورة محمد حامد الأنصاري
    await db.users.update_one(
        {"name": "محمد حامد الأنصاري"},
        {"$set": {
            "picture": "https://customer-assets.emergentagent.com/job_ruqya-learning/artifacts/umgel36e_IMG_6037.jpeg"
        }}
    )
    print("✅ تم تحديث صورة محمد حامد الأنصاري")
    
    print("\n📊 المعلمون بعد التحديث:")
    teachers = await db.users.find({"role": "teacher"}, {"_id": 0}).to_list(length=10)
    for t in teachers:
        print(f"\n{t['name']}:")
        print(f"  - البريد: {t['email']}")
        print(f"  - النبذة: {t.get('bio', 'غير موجود')}")
        print(f"  - التخصص: {t.get('specialization', 'غير موجود')}")
        print(f"  - التقييم: {t.get('rating', 'غير موجود')}")
        print(f"  - الصورة: {t.get('picture', 'غير موجود')[:50] if t.get('picture') else 'غير موجود'}...")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(update_teachers_info())
