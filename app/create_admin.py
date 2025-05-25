# /backend/app/create_admin.py

from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
import asyncio
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# MongoDB connection
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
client = AsyncIOMotorClient(MONGODB_URL)
db = client.student_marksheet_db

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def create_admin_user():
    # Admin user data
    admin_user = {
        "username": "admin",
        "email": "admin@example.com",
        "full_name": "Admin User",
        "role": "admin",
        "disabled": False,
        "hashed_password": pwd_context.hash("admin123")  # Default password: admin123
    }
    
    # Check if admin user already exists
    existing_admin = await db.users.find_one({"username": "admin"})
    if existing_admin:
        print("Admin user already exists")
        return
    
    # Insert admin user
    result = await db.users.insert_one(admin_user)
    print(f"Admin user created with ID: {result.inserted_id}")

if __name__ == "__main__":
    asyncio.run(create_admin_user()) 