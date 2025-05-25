# /backend/app/create_student_user.py

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

async def create_student_user():
    # Student user data
    student_user = {
        "username": "vandu",
        "email": "vandu@example.com",
        "full_name": "Vandu Student",
        "role": "student",
        "disabled": False,
        "hashed_password": pwd_context.hash("vandu123")  # Password: vandu123
    }
    
    # Check if student user already exists
    existing_student = await db.users.find_one({"username": "vandu"})
    if existing_student:
        print("Student user already exists")
        return
    
    # Insert student user
    result = await db.users.insert_one(student_user)
    print(f"Student user created with ID: {result.inserted_id}")

if __name__ == "__main__":
    asyncio.run(create_student_user()) 