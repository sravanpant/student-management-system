// Global variables
let currentUser = null;
let accessToken = null;

// DOM Elements
const loginSection = document.getElementById('login-section');
const adminDashboard = document.getElementById('admin-dashboard');
const studentDashboard = document.getElementById('student-dashboard');
const loginForm = document.getElementById('login-form');
const addStudentForm = document.getElementById('add-student-form');
const addMarksForm = document.getElementById('add-marks-form');
const studentSelect = document.getElementById('student-select');
const marksheetContent = document.getElementById('marksheet-content');

// Event Listeners
loginForm.addEventListener('submit', handleLogin);
addStudentForm.addEventListener('submit', handleAddStudent);
addMarksForm.addEventListener('submit', handleAddMarks);

// Functions
async function handleLogin(event) {
    event.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch('/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
        });

        if (response.ok) {
            const data = await response.json();
            accessToken = data.access_token;
            await fetchUserDetails(username);
        } else {
            showError('Invalid username or password');
        }
    } catch (error) {
        showError('An error occurred during login');
    }
}

async function fetchUserDetails(username) {
    try {
        const response = await fetch(`/users/${username}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });

        if (response.ok) {
            currentUser = await response.json();
            showDashboard();
            if (currentUser.role === 'student') {
                await loadStudentDetails(username);
            }
        }
    } catch (error) {
        showError('Error loading user details');
    }
}

async function loadStudentDetails(username) {
    try {
        const response = await fetch(`/students/${username}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });

        if (response.ok) {
            const student = await response.json();
            // Update student information
            document.getElementById('student-name').textContent = student.name;
            document.getElementById('student-roll').textContent = student.roll_number;
            document.getElementById('student-class').textContent = student.class_name;
            document.getElementById('student-section').textContent = student.section;
            
            // Load marksheet
            await loadStudentMarksheet(username);
        }
    } catch (error) {
        showError('Error loading student details');
    }
}

function showDashboard() {
    loginSection.style.display = 'none';
    if (currentUser.role === 'admin') {
        adminDashboard.style.display = 'block';
        studentDashboard.style.display = 'none';
        loadStudents();
    } else {
        adminDashboard.style.display = 'none';
        studentDashboard.style.display = 'block';
        loadStudentMarksheet(currentUser.username);
    }
}

async function handleAddStudent(event) {
    event.preventDefault();
    const studentData = {
        name: document.getElementById('student-name').value,
        roll_number: document.getElementById('roll-number').value,
        class_name: document.getElementById('class-name').value,
        section: document.getElementById('section').value,
        subjects: {},
    };

    try {
        const response = await fetch('/students/', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(studentData),
        });

        if (response.ok) {
            showSuccess('Student added successfully');
            addStudentForm.reset();
            loadStudents();
        } else {
            showError('Error adding student');
        }
    } catch (error) {
        showError('An error occurred while adding student');
    }
}

async function handleAddMarks(event) {
    event.preventDefault();
    const selectedOption = studentSelect.options[studentSelect.selectedIndex];
    const rollNumber = selectedOption.textContent.match(/\((.*?)\)/)[1]; // Extract roll number from text
    
    const marksData = {
        student_id: rollNumber,  // Use roll number instead of _id
        subject: document.getElementById('subject').value,
        marks: parseFloat(document.getElementById('marks').value),
        max_marks: parseFloat(document.getElementById('max-marks').value),
        exam_date: new Date().toISOString(),
    };

    try {
        const response = await fetch('/marks/', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(marksData),
        });

        if (response.ok) {
            showSuccess('Marks added successfully');
            addMarksForm.reset();
        } else {
            showError('Error adding marks');
        }
    } catch (error) {
        showError('An error occurred while adding marks');
    }
}

async function loadStudents() {
    try {
        const response = await fetch('/students/', {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });

        if (response.ok) {
            const students = await response.json();
            updateStudentSelect(students);
        }
    } catch (error) {
        showError('Error loading students');
    }
}

function updateStudentSelect(students) {
    studentSelect.innerHTML = '<option value="">Select a student</option>';
    students.forEach(student => {
        const option = document.createElement('option');
        option.value = student._id;
        option.textContent = `${student.name} (${student.roll_number})`;
        studentSelect.appendChild(option);
    });
}

async function loadStudentMarksheet(studentId) {
    try {
        const response = await fetch(`/marks/${studentId}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });

        if (response.ok) {
            const marks = await response.json();
            displayMarksheet(marks);
        }
    } catch (error) {
        showError('Error loading marksheet');
    }
}

function displayMarksheet(marks) {
    const marksheetContent = document.getElementById('marksheet-content');
    if (!marks || marks.length === 0) {
        marksheetContent.innerHTML = '<p class="text-center">No marks available yet.</p>';
        return;
    }

    let totalMarks = 0;
    let maxTotalMarks = 0;
    let html = `
        <div class="table-responsive">
            <table class="table table-bordered">
                <thead class="table-dark">
                    <tr>
                        <th>Subject</th>
                        <th>Marks Obtained</th>
                        <th>Maximum Marks</th>
                        <th>Percentage</th>
                        <th>Grade</th>
                    </tr>
                </thead>
                <tbody>
    `;

    marks.forEach(mark => {
        const percentage = (mark.marks / mark.max_marks) * 100;
        const grade = calculateGrade(percentage);
        totalMarks += mark.marks;
        maxTotalMarks += mark.max_marks;

        html += `
            <tr>
                <td>${mark.subject}</td>
                <td>${mark.marks}</td>
                <td>${mark.max_marks}</td>
                <td>${percentage.toFixed(2)}%</td>
                <td>${grade}</td>
            </tr>
        `;
    });

    const totalPercentage = (totalMarks / maxTotalMarks) * 100;
    const overallGrade = calculateGrade(totalPercentage);

    html += `
                </tbody>
                <tfoot class="table-dark">
                    <tr>
                        <th>Total</th>
                        <th>${totalMarks}</th>
                        <th>${maxTotalMarks}</th>
                        <th>${totalPercentage.toFixed(2)}%</th>
                        <th>${overallGrade}</th>
                    </tr>
                </tfoot>
            </table>
        </div>
        <div class="text-center mt-3">
            <button class="btn btn-primary" onclick="printMarksheet()">Print Marksheet</button>
        </div>
    `;

    marksheetContent.innerHTML = html;
}

function calculateGrade(percentage) {
    if (percentage >= 90) return 'A+';
    if (percentage >= 80) return 'A';
    if (percentage >= 70) return 'B';
    if (percentage >= 60) return 'C';
    if (percentage >= 50) return 'D';
    return 'F';
}

function printMarksheet() {
    const printContent = document.getElementById('marksheet-content').innerHTML;
    const originalContent = document.body.innerHTML;
    
    document.body.innerHTML = `
        <div class="container mt-4">
            <h2 class="text-center mb-4">Student Marksheet</h2>
            ${printContent}
        </div>
    `;
    
    window.print();
    document.body.innerHTML = originalContent;
    // Reattach event listeners after printing
    attachEventListeners();
}

function attachEventListeners() {
    // Reattach any event listeners that were lost during print
    const printButton = document.querySelector('button[onclick="printMarksheet()"]');
    if (printButton) {
        printButton.addEventListener('click', printMarksheet);
    }
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    document.querySelector('.container').appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 3000);
}

function showSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.textContent = message;
    document.querySelector('.container').appendChild(successDiv);
    setTimeout(() => successDiv.remove(), 3000);
} 