# /backend/app/main.py
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
from fastapi import Request
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# FastAPI app initialization
app = FastAPI(title="Student Marksheet Management System")

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB connection
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
client = AsyncIOMotorClient(MONGODB_URL)
db = client.student_marksheet_db

# Security configurations
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-here")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Models
class User(BaseModel):
    username: str
    email: str
    full_name: str
    role: str
    disabled: Optional[bool] = None

class UserInDB(User):
    hashed_password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

class Student(BaseModel):
    name: str
    roll_number: str
    class_name: str
    section: str
    subjects: dict

class Marks(BaseModel):
    student_id: str
    subject: str
    marks: float
    max_marks: float
    exam_date: datetime

# Security functions
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

async def get_user(username: str):
    user_dict = await db.users.find_one({"username": username})
    if user_dict:
        return UserInDB(**user_dict)
    return None

async def authenticate_user(username: str, password: str):
    user = await get_user(username)
    if not user:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = TokenData(username=username)
    except JWTError:
        raise credentials_exception
    user = await get_user(username=token_data.username)
    if user is None:
        raise credentials_exception
    return user

# Routes
@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    user = await authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/users/{username}", response_model=User)
async def get_user_details(username: str, current_user: User = Depends(get_current_user)):
    if current_user.username != username and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to view this user")
    user = await get_user(username)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@app.get("/marks/by-roll/{roll_number}")
async def get_student_marks_by_roll(roll_number: str, current_user: User = Depends(get_current_user)):
    if current_user.role == "student" and current_user.username != roll_number:
        raise HTTPException(status_code=403, detail="Not authorized to view these marks")
    
    marks = await db.marks.find({"student_id": roll_number}).to_list(length=None)
    # Convert ObjectId to string for each mark
    for mark in marks:
        mark["_id"] = str(mark["_id"])
    return marks

@app.get("/students/", response_model=list[Student])
async def list_students(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to view all students")
    students = await db.students.find().to_list(length=None)
    for student in students:
        student["_id"] = str(student["_id"])
    return students

@app.post("/students/", response_model=Student)
async def create_student(student: Student, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to create students")
    
    # Create student record
    student_dict = student.dict()
    result = await db.students.insert_one(student_dict)
    student_dict["_id"] = str(result.inserted_id)
    
    # Create user account for the student
    student_user = {
        "username": student.roll_number,  # Use roll number as username
        "email": f"{student.roll_number}@example.com",
        "full_name": student.name,
        "role": "student",
        "disabled": False,
        "hashed_password": pwd_context.hash(student.roll_number)  # Use roll number as initial password
    }
    
    # Check if user already exists
    existing_user = await db.users.find_one({"username": student.roll_number})
    if not existing_user:
        await db.users.insert_one(student_user)
    
    return student_dict

@app.get("/students/{student_id}", response_model=Student)
async def get_student(student_id: str, current_user: User = Depends(get_current_user)):
    if not student_id or student_id == "undefined":
        raise HTTPException(status_code=400, detail="Student ID is required")
        
    try:
        student = None
        # First try to find by MongoDB ID
        if len(student_id) == 24:  # Length of MongoDB ObjectId
            try:
                student = await db.students.find_one({"_id": ObjectId(student_id)})
            except:
                pass
                
        # If not found by ObjectId, try by roll number
        if student is None:
            student = await db.students.find_one({"roll_number": student_id})
            
        if student is None:
            raise HTTPException(status_code=404, detail="Student not found")
            
        # Convert ObjectId to string
        student["_id"] = str(student["_id"])
        return student
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Student not found: {str(e)}")
    
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")

    # For students, only allow access to their own record
    if current_user.role == "student" and current_user.username != student["roll_number"]:
        raise HTTPException(status_code=403, detail="Not authorized to view this student")

    student["_id"] = str(student["_id"])
    return student

@app.get("/test-db")
async def test_db():
    result = await db["some_collection"].find_one({})
    return {"db_connected": result is not None}

@app.put("/students/by-roll/{roll_number}", response_model=Student)
async def update_student_by_roll(roll_number: str, student: Student, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to update students")
    
    try:
        # Verify the student exists first
        existing_student = await db.students.find_one({"roll_number": roll_number})
        if not existing_student:
            raise HTTPException(status_code=404, detail="Student not found")
        
        # Update the student data
        result = await db.students.update_one(
            {"roll_number": roll_number},
            {"$set": student.dict()}
        )
        
        if result.modified_count == 0:
            raise HTTPException(status_code=400, detail="No changes were made")
        
        # Return updated student data
        updated_student = {**student.dict(), "_id": str(existing_student["_id"])}
        return updated_student
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to update student: {str(e)}")

@app.delete("/students/by-roll/{roll_number}")
async def delete_student_by_roll(roll_number: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to delete students")
    
    # Find the student first to get their ID
    student = await db.students.find_one({"roll_number": roll_number})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    student_id = str(student["_id"])
    
    # Delete student's marks first
    await db.marks.delete_many({"student_id": student_id})
    
    # Then delete the student
    result = await db.students.delete_one({"roll_number": roll_number})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Student not found")
    
    return {"message": "Student and related marks deleted successfully"}

@app.put("/students/{student_id}", response_model=Student)
async def update_student(student_id: str, student: Student, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to update students")
    
    try:
        # Verify the student exists first
        existing_student = await db.students.find_one({"_id": ObjectId(student_id)})
        if not existing_student:
            raise HTTPException(status_code=404, detail="Student not found")
        
        # Update the student data
        result = await db.students.update_one(
            {"_id": ObjectId(student_id)},
            {"$set": student.dict()}
        )
        
        if result.modified_count == 0:
            raise HTTPException(status_code=400, detail="No changes were made")
        
        # Return updated student data
        updated_student = {**student.dict(), "_id": student_id}
        return updated_student
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to update student: {str(e)}")

@app.delete("/students/{student_id}")
async def delete_student(student_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to delete students")
    
    # Delete student's marks first
    await db.marks.delete_many({"student_id": student_id})
    
    # Then delete the student
    result = await db.students.delete_one({"_id": ObjectId(student_id)})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Student not found")
    
    return {"message": "Student and related marks deleted successfully"}

@app.post("/marks/", response_model=Marks)
async def add_marks(marks: Marks, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to add marks")
    
    # Verify the student exists
    student = await db.students.find_one({"roll_number": marks.student_id})
    if not student:
        raise HTTPException(status_code=404, detail=f"Student with roll number {marks.student_id} not found")
    
    marks_dict = marks.dict()
    result = await db.marks.insert_one(marks_dict)
    marks_dict["_id"] = str(result.inserted_id)
    return marks_dict

@app.put("/marks/{marks_id}")
async def update_marks(marks_id: str, marks: Marks, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to update marks")
    
    result = await db.marks.update_one(
        {"_id": ObjectId(marks_id)},
        {"$set": marks.dict()}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Marks record not found")
    
    return {"message": "Marks updated successfully"}

@app.delete("/marks/{marks_id}")
async def delete_marks(marks_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to delete marks")
    
    result = await db.marks.delete_one({"_id": ObjectId(marks_id)})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Marks record not found")
    
    return {"message": "Marks deleted successfully"}

@app.get("/marks/{student_id}")
async def get_student_marks(student_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role == "student" and current_user.username != student_id:
        raise HTTPException(status_code=403, detail="Not authorized to view these marks")
    marks = await db.marks.find({"student_id": student_id}).to_list(length=None)
    # Convert ObjectId to string for each mark
    for mark in marks:
        mark["_id"] = str(mark["_id"])
    return marks

@app.get("/marks/")
async def list_marks(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to view all marks")
    
    pipeline = [
        {
            "$lookup": {
                "from": "students",
                "localField": "student_id",
                "foreignField": "roll_number",  # Use roll_number instead of _id
                "as": "student_info"
            }
        },
        {
            "$unwind": {
                "path": "$student_info",
                "preserveNullAndEmptyArrays": True  # Keep marks even if student not found
            }
        },
        {
            "$project": {
                "_id": 1,
                "student_id": 1,
                "subject": 1,
                "marks": 1,
                "max_marks": 1,
                "exam_date": 1,
                "student_name": {"$ifNull": ["$student_info.name", "Unknown Student"]}
            }
        }
    ]
    
    marks = await db.marks.aggregate(pipeline).to_list(None)
    # Convert ObjectId to string
    for mark in marks:
        mark["_id"] = str(mark["_id"])
    return marks

@app.get("/marks/id/{marks_id}")
async def get_marks_by_id(marks_id: str, current_user: User = Depends(get_current_user)):
    try:
        # Convert string ID to ObjectId
        marks_obj_id = ObjectId(marks_id)
        marks = await db.marks.find_one({"_id": marks_obj_id})
        
        if not marks:
            raise HTTPException(status_code=404, detail="Marks not found")
        
        # Convert ObjectId to string
        marks["_id"] = str(marks["_id"])
        
        # If current user is a student, check authorization
        if current_user.role == "student":
            # Get the student record to check if these are the student's marks
            student = await db.students.find_one({"roll_number": current_user.username})
            if student and marks["student_id"] != student.roll_number:
                raise HTTPException(status_code=403, detail="Not authorized to view these marks")
        
        return marks
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error retrieving marks: {str(e)}")

@app.get("/reports/class-performance")
async def get_class_performance(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to view reports")
    
    try:
        # First get all students grouped by class
        pipeline = [
            {
                "$group": {
                    "_id": "$class_name",
                    "total_students": {"$sum": 1},
                    "students": {"$push": {"roll_number": "$roll_number", "name": "$name"}}
                }
            }
        ]
        
        classes = await db.students.aggregate(pipeline).to_list(None)
        
        # Then for each class, get the marks data
        result = []
        for class_group in classes:
            class_name = class_group["_id"]
            total_students = class_group["total_students"]
            
            # Get student roll numbers for this class
            student_roll_numbers = [s["roll_number"] for s in class_group["students"]]
            
            # Calculate average score for these students
            marks_pipeline = [
                {
                    "$match": {
                        "student_id": {"$in": student_roll_numbers}
                    }
                },
                {
                    "$group": {
                        "_id": None,
                        "average_score": {"$avg": "$marks"},
                        "pass_count": {
                            "$sum": {
                                "$cond": [{"$gte": ["$marks", 40]}, 1, 0]
                            }
                        },
                        "total_entries": {"$sum": 1}
                    }
                }
            ]
            
            marks_stats = await db.marks.aggregate(marks_pipeline).to_list(None)
            
            # Create result entry
            class_data = {
                "_id": class_name,
                "total_students": total_students,
                "average_score": 0,
                "pass_rate": 0
            }
            
            if marks_stats and len(marks_stats) > 0:
                class_data["average_score"] = marks_stats[0].get("average_score", 0)
                total_entries = marks_stats[0].get("total_entries", 0)
                if total_entries > 0:
                    class_data["pass_rate"] = marks_stats[0].get("pass_count", 0) / total_entries
            
            result.append(class_data)
            
        return result
    except Exception as e:
        print(f"Error in class performance query: {str(e)}")
        return []

@app.get("/reports/subject-performance")
async def get_subject_performance(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to view reports")
    
    pipeline = [
        {
            "$group": {
                "_id": "$subject",
                "average_score": {"$avg": "$marks"},
                "highest_score": {"$max": "$marks"},
                "lowest_score": {"$min": "$marks"},
                "total_students": {"$sum": 1},
                "pass_rate": {
                    "$avg": {
                        "$cond": [{"$gte": ["$marks", 40]}, 1, 0]
                    }
                }
            }
        }
    ]
    
    subject_performance = await db.marks.aggregate(pipeline).to_list(None)
    return subject_performance

@app.get("/reports/top-performers")
async def get_top_performers(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to view reports")
    
    pipeline = [
        {
            "$lookup": {
                "from": "students",
                "localField": "student_id",  # This is roll_number in the marks collection
                "foreignField": "roll_number",  # Join with roll_number in students collection
                "as": "student_info"
            }
        },
        {
            "$unwind": {
                "path": "$student_info",
                "preserveNullAndEmptyArrays": False  # Skip entries without matching students
            }
        },
        {
            "$group": {
                "_id": "$student_id",
                "student_name": {"$first": "$student_info.name"},
                "class_name": {"$first": "$student_info.class_name"},
                "average_score": {"$avg": "$marks"},
                "total_marks": {"$sum": "$marks"},
                "subjects_count": {"$sum": 1}
            }
        },
        {
            "$match": {
                "subjects_count": {"$gt": 0}  # Ensure we have at least one subject
            }
        },
        {
            "$sort": {"average_score": -1}
        },
        {
            "$limit": 10
        }
    ]
    
    try:
        top_performers = await db.marks.aggregate(pipeline).to_list(None)
        print("Top performers query result:", top_performers)  # Debug output
        return top_performers
    except Exception as e:
        print(f"Error in top performers query: {str(e)}")
        return []


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)