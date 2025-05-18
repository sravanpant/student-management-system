# Student Marksheet Management System

A web-based application for managing student marksheets, built with FastAPI, MongoDB, and modern web technologies.

## Features

- User authentication (Admin and Student roles)
- Student management (add, update, delete)
- Marks management
- Marksheet generation
- Performance reports
- Secure data handling

## Prerequisites

- Python 3.7+
- MongoDB
- pip (Python package manager)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd student-marksheet-system
```

2. Create and activate a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Create a `.env` file in the root directory with the following content:
```
MONGODB_URL=mongodb://localhost:27017
SECRET_KEY=your-secret-key-here
```

## Running the Application

1. Start MongoDB:
```bash
mongod
```

2. Start the FastAPI server:
```bash
uvicorn app.main:app --reload
```

3. Open your web browser and navigate to:
```
http://localhost:8000
```

## API Documentation

Once the application is running, you can access the API documentation at:
```
http://localhost:8000/docs
```

## Default Admin Account

To create an admin account, you can use the MongoDB shell:

```javascript
use student_marksheet_db
db.users.insertOne({
    username: "admin",
    email: "admin@example.com",
    full_name: "Admin User",
    role: "admin",
    hashed_password: "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewKyNiAYMyzJ/IeG" // password: admin123
})
```

## Security Features

- JWT-based authentication
- Password hashing using bcrypt
- Role-based access control
- Secure session management

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 