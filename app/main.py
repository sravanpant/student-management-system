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
    if current_user.role == "student" and current_user.username != student_id:
        raise HTTPException(status_code=403, detail="Not authorized to view this student")
    student = await db.students.find_one({"roll_number": student_id})
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    student["_id"] = str(student["_id"])
    return student

@app.post("/marks/", response_model=Marks)
async def add_marks(marks: Marks, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to add marks")
    marks_dict = marks.dict()
    result = await db.marks.insert_one(marks_dict)
    marks_dict["_id"] = str(result.inserted_id)
    return marks_dict

@app.get("/marks/{student_id}")
async def get_student_marks(student_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role == "student" and current_user.username != student_id:
        raise HTTPException(status_code=403, detail="Not authorized to view these marks")
    marks = await db.marks.find({"student_id": student_id}).to_list(length=None)
    # Convert ObjectId to string for each mark
    for mark in marks:
        mark["_id"] = str(mark["_id"])
    return marks

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 