// Global variables
// /backend/static/js/main.js
let currentUser = null;
let accessToken = null;

// DOM Elements
const loginSection = document.getElementById("login-section");
const adminDashboard = document.getElementById("admin-dashboard");
const studentDashboard = document.getElementById("student-dashboard");
const loginForm = document.getElementById("login-form");
const addStudentForm = document.getElementById("add-student-form");
const addMarksForm = document.getElementById("add-marks-form");
const studentSelect = document.getElementById("marks-student-select");
const marksheetContent = document.getElementById("marksheet-content");

// Event Listeners
document.addEventListener("DOMContentLoaded", function () {
  // Login form
  if (loginForm) {
    loginForm.addEventListener("submit", handleLogin);
  }

  // Student form
  const studentForm = document.getElementById("student-form");
  if (studentForm) {
    studentForm.addEventListener("submit", handleStudentForm);
  }

  // Marks form
  const marksForm = document.getElementById("marks-form");
  if (marksForm) {
    marksForm.addEventListener("submit", handleMarksForm);
  }

  // Reports tab
  const reportsTab = document.querySelector("#reports-tab");
  if (reportsTab) {
    reportsTab.addEventListener("click", loadReports);
  }

  // Marks tab click handler
  const marksTab = document.querySelector("#marks-tab");
  if (marksTab) {
    marksTab.addEventListener("click", () => {
      // Load students first
      loadStudents()
        .then(() => {
          // Then load marks
          loadMarks().catch((error) => {
            console.error("Error loading marks:", error);
            showError(error.message || "Failed to load marks");
          });
        })
        .catch((error) => {
          console.error("Error loading students:", error);
          showError(error.message || "Failed to load students");
        });
    });
  }
});

// Functions
async function handleLogin(event) {
  event.preventDefault();
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  try {
    const response = await fetch("/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `username=${encodeURIComponent(
        username
      )}&password=${encodeURIComponent(password)}`,
    });

    if (response.ok) {
      const data = await response.json();
      accessToken = data.access_token;
      await fetchUserDetails(username);
    } else {
      showError("Invalid username or password");
    }
  } catch (error) {
    showError("An error occurred during login");
  }
}

async function fetchUserDetails(username) {
  try {
    const response = await fetch(`/users/${username}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.ok) {
      currentUser = await response.json();
      showDashboard();
      if (currentUser.role === "student") {
        await loadStudentDetails(username);
      }
    }
  } catch (error) {
    showError("Error loading user details");
  }
}

async function loadStudentDetails(username) {
  try {
    const response = await fetch(`/students/${username}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.ok) {
      const student = await response.json();
      // Update student information
      document.getElementById("student-name").textContent = student.name;
      document.getElementById("student-roll").textContent = student.roll_number;
      document.getElementById("student-class").textContent = student.class_name;
      document.getElementById("student-section").textContent = student.section;

      // Load marksheet
      await loadStudentMarksheet(username);
    }
  } catch (error) {
    showError("Error loading student details");
  }
}

function showDashboard() {
  if (!loginSection || !adminDashboard || !studentDashboard) {
    showError("Required DOM elements not found");
    return;
  }

  loginSection.style.display = "none";
  if (currentUser.role === "admin") {
    adminDashboard.style.display = "block";
    studentDashboard.style.display = "none";
    // Initialize admin dashboard
    setTimeout(() => {
      loadStudents();
      loadMarks();
      // Don't load reports automatically, let user click the tab
    }, 100); // Small delay to ensure DOM is ready
  } else {
    adminDashboard.style.display = "none";
    studentDashboard.style.display = "block";
    loadStudentMarksheet(currentUser.username);
  }
}

async function handleAddStudent(event) {
  event.preventDefault();
  const studentData = {
    name: document.getElementById("student-name").value,
    roll_number: document.getElementById("roll-number").value,
    class_name: document.getElementById("class-name").value,
    section: document.getElementById("section").value,
    subjects: {},
  };

  try {
    const response = await fetch("/students/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(studentData),
    });

    if (response.ok) {
      showSuccess("Student added successfully");
      addStudentForm.reset();
      loadStudents();
    } else {
      showError("Error adding student");
    }
  } catch (error) {
    showError("An error occurred while adding student");
  }
}

async function handleAddMarks(event) {
  event.preventDefault();
  const selectedOption = studentSelect.options[studentSelect.selectedIndex];
  const rollNumber = selectedOption.textContent.match(/\((.*?)\)/)[1]; // Extract roll number from text

  const marksData = {
    student_id: rollNumber, // Use roll number instead of _id
    subject: document.getElementById("subject").value,
    marks: parseFloat(document.getElementById("marks").value),
    max_marks: parseFloat(document.getElementById("max-marks").value),
    exam_date: new Date().toISOString(),
  };

  try {
    const response = await fetch("/marks/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(marksData),
    });

    if (response.ok) {
      showSuccess("Marks added successfully");
      addMarksForm.reset();
    } else {
      showError("Error adding marks");
    }
  } catch (error) {
    showError("An error occurred while adding marks");
  }
}

async function loadStudents() {
  try {
    const response = await fetch("/students/", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to load students");
    }

    let students = await response.json();
    console.log("Received students:", students);

    // Make sure students have valid _id properties
    students.forEach((student) => {
      if (!student._id) {
        console.log("Adding missing _id for student:", student.name);
        // This is just for display - will be replaced when saved
        student._id = "temp_" + student.roll_number;
      } else {
        // Ensure _id is a string
        student._id = String(student._id);
      }
    });

    updateStudentSelect(students);
    updateStudentsTable(students);
    return students;
  } catch (error) {
    console.error("Error loading students:", error);
    showError(error.message || "Failed to load students");
    throw error;
  }
}

function updateStudentsTable(students) {
  const table = document.querySelector("#students-table");
  if (!table) {
    console.error("Students table not found");
    return;
  }

  let tbody = table.querySelector("tbody");
  if (!tbody) {
    tbody = document.createElement("tbody");
    table.appendChild(tbody);
  }

  try {
    tbody.innerHTML = "";
    if (!Array.isArray(students)) {
      console.error(
        "Invalid students data, expected array but got:",
        typeof students
      );
      return;
    }

    if (students.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="text-center">No students found</td></tr>';
      return;
    }

    students.forEach((student) => {
      if (!student) {
        console.error("Invalid student object:", student);
        return;
      }

      // Use roll_number as fallback ID if _id is missing
      const studentId = student._id || student.roll_number;
      if (!studentId) {
        console.error("Student missing both _id and roll_number:", student);
        return;
      }

      const row = document.createElement("tr");

      // Create Edit button with properly scoped student ID
      const editBtn = document.createElement("button");
      editBtn.className = "btn btn-sm btn-primary me-2";
      editBtn.textContent = "Edit";
      editBtn.onclick = function () {
        editStudent(studentId);
      };

      // Create Delete button with properly scoped student ID
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn btn-sm btn-danger";
      deleteBtn.textContent = "Delete";
      deleteBtn.onclick = function () {
        deleteStudent(studentId);
      };

      // Add student data cells
      row.innerHTML = `
                <td>${student.name || "N/A"}</td>
                <td>${student.roll_number || "N/A"}</td>
                <td>${student.class_name || "N/A"}</td>
                <td>${student.section || "N/A"}</td>
                <td></td>
            `;

      // Add action buttons to the last cell
      const actionsCell = row.querySelector("td:last-child");
      actionsCell.appendChild(editBtn);
      actionsCell.appendChild(deleteBtn);

      tbody.appendChild(row);
    });
  } catch (error) {
    console.error("Error updating students table:", error);
  }
}

function updateStudentSelect(students) {
  if (!studentSelect) {
    console.error("Student select element not found");
    return;
  }

  try {
    studentSelect.innerHTML = '<option value="">Select a student</option>';
    if (!Array.isArray(students)) {
      console.error(
        "Invalid students data, expected array but got:",
        typeof students
      );
      return;
    }

    students.forEach((student) => {
      if (!student) {
        console.error("Invalid student data:", student);
        return;
      }

      // Use roll_number as fallback ID if _id is missing
      const studentId = student._id || student.roll_number;
      if (!studentId) {
        console.error("Student missing both _id and roll_number:", student);
        return;
      }

      const option = document.createElement("option");
      option.value = studentId;
      option.setAttribute("data-roll", student.roll_number || "");
      option.textContent = `${student.name || "Unknown"} (${
        student.roll_number || "N/A"
      })`;
      studentSelect.appendChild(option);
    });
  } catch (error) {
    console.error("Error updating student select:", error);
  }
}

async function loadStudentMarksheet(studentId) {
  try {
    // Try to get marks by roll number first
    const response = await fetch(`/marks/by-roll/${studentId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.ok) {
      const marks = await response.json();
      displayMarksheet(marks);
    } else {
      // If that fails, try by MongoDB ID
      const fallbackResponse = await fetch(`/marks/${studentId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (fallbackResponse.ok) {
        const marks = await fallbackResponse.json();
        displayMarksheet(marks);
      } else {
        console.error("Failed to load marks for student");
        displayMarksheet([]); // Display empty marksheet
      }
    }
  } catch (error) {
    console.error("Error loading marksheet:", error);
    showError("Error loading marksheet");
    displayMarksheet([]); // Display empty marksheet
  }
}

function displayMarksheet(marks) {
  const marksheetContent = document.getElementById("marksheet-content");
  if (!marks || marks.length === 0) {
    marksheetContent.innerHTML =
      '<p class="text-center">No marks available yet.</p>';
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

  marks.forEach((mark) => {
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
  if (percentage >= 90) return "A+";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B";
  if (percentage >= 60) return "C";
  if (percentage >= 50) return "D";
  return "F";
}

function printMarksheet() {
  const printContent = document.getElementById("marksheet-content").innerHTML;
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
  const printButton = document.querySelector(
    'button[onclick="printMarksheet()"]'
  );
  if (printButton) {
    printButton.addEventListener("click", printMarksheet);
  }
}

function showError(message) {
  const container = document.querySelector(".container");
  if (!container) {
    console.error("Error:", message);
    return;
  }

  // Remove any existing error messages
  const existingErrors = container.querySelectorAll(".error-message");
  existingErrors.forEach((error) => error.remove());

  const errorDiv = document.createElement("div");
  errorDiv.className =
    "error-message alert alert-danger position-fixed top-0 start-50 translate-middle-x mt-3";
  errorDiv.style.zIndex = "1050";
  errorDiv.textContent = message;
  container.appendChild(errorDiv);

  // Log the error to console as well
  console.error("Error:", message);

  setTimeout(() => {
    if (errorDiv && errorDiv.parentNode) {
      errorDiv.remove();
    }
  }, 8000);
}

function showSuccess(message) {
  const successDiv = document.createElement("div");
  successDiv.className = "success-message alert alert-success";
  successDiv.textContent = message;
  document.querySelector(".container").appendChild(successDiv);
  setTimeout(() => successDiv.remove(), 8000);
}

async function handleStudentForm(event) {
  event.preventDefault();
  const studentIdField = document.getElementById("student-id");
  const studentId = studentIdField ? studentIdField.value.trim() : "";
  console.log("Student ID for form:", studentId);

  // Get form data
  const studentData = {
    name: document.getElementById("student-name").value.trim(),
    roll_number: document.getElementById("roll-number").value.trim(),
    class_name: document.getElementById("class-name").value.trim(),
    section: document.getElementById("section").value.trim(),
    subjects: {},
  };

  // Validate all required fields
  if (
    !studentData.name ||
    !studentData.roll_number ||
    !studentData.class_name ||
    !studentData.section
  ) {
    showError("All fields are required");
    return;
  }

  try {
    // First, check if this is an update operation by looking for existing students with this roll number
    const students = await loadStudents();
    const existingStudent = students.find(
      (s) => s.roll_number === studentData.roll_number
    );
    const isUpdate = !!existingStudent;

    let url, method;

    if (isUpdate) {
      // Use our new endpoint that supports updating by roll number
      url = `/students/by-roll/${studentData.roll_number}`;
      method = "PUT";
      console.log(
        `Updating student with roll number: ${studentData.roll_number}`
      );
    } else {
      // This is a new student
      url = "/students/";
      method = "POST";
      console.log(
        `Creating new student with roll number: ${studentData.roll_number}`
      );
    }

    const response = await fetch(url, {
      method: method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(studentData),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("Server error:", error);
      throw new Error(error.detail || "Failed to save student");
    }

    showSuccess(`Student ${isUpdate ? "updated" : "added"} successfully`);

    // Remove the cancel button if it exists
    const cancelBtn = document.getElementById("cancel-edit");
    if (cancelBtn) cancelBtn.remove();

    resetStudentForm();
    await loadStudents(); // Reload the student list
  } catch (error) {
    showError(error.message || "An error occurred while saving student");
    console.error("Save error:", error);
  }
}

function resetStudentForm() {
  const form = document.getElementById("student-form");
  if (form) {
    form.reset();
    document.getElementById("student-id").value = "";
  }
}

async function editStudent(studentId) {
  console.log("Editing student with ID:", studentId);

  try {
    // Get all students
    const students = await loadStudents();

    // Try to find the student by ID or roll number
    let student = null;

    if (studentId.startsWith("temp_")) {
      // Extract roll number from temp ID
      const rollNumber = studentId.substring(5);
      student = students.find((s) => s.roll_number === rollNumber);
    } else {
      // Look by ID or roll number
      student = students.find(
        (s) => s._id === studentId || s.roll_number === studentId
      );
    }

    if (!student) {
      throw new Error("Student not found");
    }

    console.log("Found student to edit:", student);

    // Set form fields
    document.getElementById("student-id").value = student._id;
    document.getElementById("student-name").value = student.name || "";
    document.getElementById("roll-number").value = student.roll_number || "";
    document.getElementById("class-name").value = student.class_name || "";
    document.getElementById("section").value = student.section || "";

    // Scroll to the form
    document
      .getElementById("student-form")
      .scrollIntoView({ behavior: "smooth" });

    // Add cancel button if not already present
    const form = document.getElementById("student-form");
    if (form && !document.getElementById("cancel-edit")) {
      const cancelBtn = document.createElement("button");
      cancelBtn.id = "cancel-edit";
      cancelBtn.type = "button";
      cancelBtn.className = "btn btn-secondary mt-2";
      cancelBtn.textContent = "Cancel";
      cancelBtn.onclick = () => {
        resetStudentForm();
        cancelBtn.remove();
      };
      form.appendChild(cancelBtn);
    }
  } catch (error) {
    console.error("Error loading student:", error);
    showError(error.message || "Failed to load student details");
    resetStudentForm();
  }
}

async function deleteStudent(studentId) {
  if (!confirm("Are you sure you want to delete this student?")) return;

  try {
    // Find the student to get their roll number
    const students = await loadStudents();
    let student = null;

    if (studentId.startsWith("temp_")) {
      const rollNumber = studentId.substring(5);
      student = students.find((s) => s.roll_number === rollNumber);
    } else {
      student = students.find(
        (s) => s._id === studentId || s.roll_number === studentId
      );
    }

    if (!student) {
      throw new Error("Student not found");
    }

    // Try to delete by roll number
    const response = await fetch(`/students/by-roll/${student.roll_number}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.ok) {
      showSuccess("Student deleted successfully");
      await loadStudents();
    } else {
      const error = await response.json();
      throw new Error(error.detail || "Failed to delete student");
    }
  } catch (error) {
    showError(error.message || "An error occurred while deleting student");
  }
}

async function handleMarksForm(event) {
  event.preventDefault();
  console.log("Handling marks form submission...");

  if (!studentSelect) {
    showError("Student select element not found");
    return;
  }

  const selectedOption = studentSelect.options[studentSelect.selectedIndex];
  if (!selectedOption || !selectedOption.value) {
    showError("Please select a student");
    return;
  }
  console.log("Selected student:", selectedOption.value);

  // Get the roll number from the selected option's data attribute
  const rollNumber = selectedOption.getAttribute("data-roll");
  if (!rollNumber) {
    showError("Selected student has no roll number");
    return;
  }

  const subject = document.getElementById("subject").value;
  const marks = parseFloat(document.getElementById("marks").value);
  const maxMarks = parseFloat(document.getElementById("max-marks").value);

  if (!subject) {
    showError("Subject is required");
    return;
  }

  if (isNaN(marks) || marks < 0) {
    showError("Please enter valid marks");
    return;
  }

  if (isNaN(maxMarks) || maxMarks <= 0) {
    showError("Please enter valid maximum marks");
    return;
  }

  if (marks > maxMarks) {
    showError("Marks cannot be greater than maximum marks");
    return;
  }

  // Ensure all values are valid
  const marksData = {
    student_id: rollNumber, // Use roll number as student_id
    subject: subject.trim(),
    marks: Math.round(marks * 100) / 100, // Round to 2 decimal places
    max_marks: Math.round(maxMarks * 100) / 100,
    exam_date: new Date().toISOString(),
  };
  console.log("Marks data to submit:", marksData);

  try {
    const marksId = document.getElementById("marks-id").value;
    const url = marksId ? `/marks/${marksId}` : "/marks/";
    const method = marksId ? "PUT" : "POST";

    const response = await fetch(url, {
      method: method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(marksData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to save marks");
    }

    showSuccess(`Marks ${marksId ? "updated" : "added"} successfully`);
    resetMarksForm();
    await loadMarks(); // Reload the marks table
  } catch (error) {
    showError(error.message || "An error occurred while saving marks");
    console.error("Error:", error);
  }
}

function resetMarksForm() {
  document.getElementById("marks-form").reset();
  document.getElementById("marks-id").value = "";
}

async function loadMarks() {
  console.log("Loading marks...");
  const marksTab = document.querySelector("#marks-panel");
  if (!marksTab) {
    console.error("Marks tab not found");
    showError("Marks tab not found");
    return;
  }

  try {
    // Ensure students are loaded for the dropdown
    const students = await loadStudents();
    console.log("Students loaded, fetching marks...");

    const response = await fetch("/marks/", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("Server error:", error);
      throw new Error(error.detail || "Failed to load marks");
    }

    let marks = await response.json();
    console.log("Marks data received:", marks);

    // If no marks, create some sample marks for demonstration
    if (!Array.isArray(marks) || marks.length === 0) {
      console.log("No marks found, creating sample data...");
      await createSampleMarks(students);

      // Fetch marks again
      const refreshResponse = await fetch("/marks/", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (refreshResponse.ok) {
        marks = await refreshResponse.json();
        console.log("Refreshed marks data:", marks);
      }
    }

    if (Array.isArray(marks)) {
      updateMarksTable(marks);
    } else {
      throw new Error("Invalid marks data format");
    }
  } catch (error) {
    showError(error.message || "Failed to load marks");
    console.error("Error loading marks:", error);
  }
}

// Helper function to create sample marks
async function createSampleMarks(students) {
  // Only create sample marks if we have students
  if (!Array.isArray(students) || students.length === 0) {
    console.log("No students available to create sample marks");
    return;
  }

  const subjects = [
    "Mathematics",
    "Science",
    "English",
    "History",
    "Computer Science",
  ];
  const maxMarks = 100;

  // Create sample marks for each student
  for (const student of students) {
    // Create marks for 3 random subjects
    const randomSubjects = subjects.sort(() => 0.5 - Math.random()).slice(0, 3);

    for (const subject of randomSubjects) {
      // Generate random marks between 50 and 100
      const marks = Math.floor(Math.random() * 51) + 50;

      const marksData = {
        student_id: student.roll_number, // Use roll number as student_id
        subject: subject,
        marks: marks,
        max_marks: maxMarks,
        exam_date: new Date().toISOString(),
      };

      try {
        const response = await fetch("/marks/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(marksData),
        });

        if (response.ok) {
          console.log(`Created sample marks for ${student.name} in ${subject}`);
        } else {
          console.error(
            `Failed to create sample marks for ${student.name} in ${subject}`
          );
        }
      } catch (error) {
        console.error("Error creating sample marks:", error);
      }
    }
  }

  showSuccess("Sample marks created for demonstration");
}

function updateMarksTable(marks) {
  const marksTable = document.getElementById("marks-table");
  if (!marksTable) {
    showError("Marks table not found");
    return;
  }

  let tbody = marksTable.querySelector("tbody");
  if (!tbody) {
    tbody = document.createElement("tbody");
    marksTable.appendChild(tbody);
  }

  try {
    if (!Array.isArray(marks) || marks.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="text-center">No marks available</td></tr>';
      return;
    }

    tbody.innerHTML = "";
    marks.forEach((mark) => {
      if (!mark) return;

      const row = document.createElement("tr");

      // Create the student name cell - display student_name if available, otherwise try to find the student
      const studentName = mark.student_name || "N/A";

      // Create edit button
      const editBtn = document.createElement("button");
      editBtn.className = "btn btn-sm btn-primary me-2";
      editBtn.textContent = "Edit";
      editBtn.onclick = function () {
        editMarks(mark._id);
      };

      // Create delete button
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn btn-sm btn-danger";
      deleteBtn.textContent = "Delete";
      deleteBtn.onclick = function () {
        deleteMarks(mark._id);
      };

      // Add student data cells
      row.innerHTML = `
                <td>${studentName}</td>
                <td>${mark.subject || "N/A"}</td>
                <td>${mark.marks || 0}</td>
                <td>${mark.max_marks || 0}</td>
                <td></td>
            `;

      // Add action buttons to the last cell
      const actionsCell = row.querySelector("td:last-child");
      actionsCell.appendChild(editBtn);
      actionsCell.appendChild(deleteBtn);

      tbody.appendChild(row);
    });
  } catch (error) {
    console.error("Error updating marks table:", error);
    showError("Error displaying marks data");
  }
}

function handleMarksEdit(markId) {
  if (!markId) {
    showError("Invalid mark ID");
    return;
  }
  editMarks(markId).catch((error) => {
    showError("Failed to edit marks: " + error.message);
  });
}

async function editMarks(marksId) {
  console.log("Editing marks with ID:", marksId);
  try {
    const response = await fetch(`/marks/id/${marksId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.ok) {
      const marks = await response.json();
      console.log("Retrieved marks data:", marks);

      // Set form fields with default values if data is missing
      document.getElementById("marks-id").value = marksId || "";

      // Handle student selection
      const studentSelect = document.getElementById("marks-student-select");
      if (studentSelect) {
        // Try to find the option with the matching student_id (roll number)
        let found = false;
        for (let i = 0; i < studentSelect.options.length; i++) {
          const option = studentSelect.options[i];
          const dataRoll = option.getAttribute("data-roll");
          if (dataRoll === marks.student_id) {
            studentSelect.selectedIndex = i;
            found = true;
            break;
          }
        }

        if (!found && marks.student_id) {
          console.log(
            "Could not find student with roll number:",
            marks.student_id
          );
        }
      }

      // Handle other fields with proper null checks
      document.getElementById("subject").value = marks.subject || "";

      // For numeric fields, ensure we have valid numbers
      const marksValue = parseFloat(marks.marks);
      document.getElementById("marks").value = !isNaN(marksValue)
        ? marksValue
        : "";

      const maxMarksValue = parseFloat(marks.max_marks);
      document.getElementById("max-marks").value = !isNaN(maxMarksValue)
        ? maxMarksValue
        : "";

      // Scroll to the form
      document
        .getElementById("marks-form")
        .scrollIntoView({ behavior: "smooth" });
    } else {
      throw new Error("Failed to retrieve marks data");
    }
  } catch (error) {
    console.error("Error in editMarks:", error);
    showError("Failed to load marks details");
  }
}

async function deleteMarks(marksId) {
  if (!confirm("Are you sure you want to delete these marks?")) return;

  try {
    const response = await fetch(`/marks/${marksId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.ok) {
      showSuccess("Marks deleted successfully");
      loadMarks();
    } else {
      const error = await response.json();
      showError(error.detail || "Failed to delete marks");
    }
  } catch (error) {
    showError("An error occurred while deleting marks");
  }
}

async function loadReports() {
  // Check if report containers exist first
  const containers = {
    class: document.getElementById("class-performance"),
    subject: document.getElementById("subject-performance"),
    top: document.getElementById("top-performers"),
  };

  if (!containers.class || !containers.subject || !containers.top) {
    showError("Report containers not found in the document");
    return;
  }

  try {
    // Show loading indicators
    containers.class.innerHTML =
      '<p class="text-center">Loading class performance data...</p>';
    containers.subject.innerHTML =
      '<p class="text-center">Loading subject performance data...</p>';
    containers.top.innerHTML =
      '<p class="text-center">Loading top performers data...</p>';

    const [classResponse, subjectResponse, topResponse] = await Promise.all([
      fetch("/reports/class-performance", {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      fetch("/reports/subject-performance", {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      fetch("/reports/top-performers", {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    ]);

    const checkAndParseResponse = async (response, context) => {
      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          `Failed to load ${context}: ${error.detail || "Unknown error"}`
        );
      }
      return response.json();
    };

    const [classData, subjectData, topData] = await Promise.all([
      checkAndParseResponse(classResponse, "class performance"),
      checkAndParseResponse(subjectResponse, "subject performance"),
      checkAndParseResponse(topResponse, "top performers"),
    ]);

    console.log("Reports data received:");
    console.log("- Class data:", classData);
    console.log("- Subject data:", subjectData);
    console.log("- Top performers:", topData);

    displayClassPerformance(classData);
    displaySubjectPerformance(subjectData);
    displayTopPerformers(topData);
  } catch (error) {
    showError(error.message || "Failed to load reports");
    console.error("Error loading reports:", error);
  }
}

// Reports tab event listener is now in DOMContentLoaded

function displayClassPerformance(data) {
  const container = document.getElementById("class-performance");
  if (!container) {
    showError("Class performance container not found");
    return;
  }
  let html = `<div class="table-responsive"><table class="table table-sm">
        <thead><tr><th>Class</th><th>Average Score</th><th>Total Students</th><th>Pass Rate</th></tr></thead>
        <tbody>`;

  if (Array.isArray(data)) {
    data.forEach((item) => {
      const avgScore = item.average_score || 0;
      const passRate = item.pass_rate || 0;
      html += `<tr>
                <td>${item._id || "N/A"}</td>
                <td>${avgScore.toFixed(2)}</td>
                <td>${item.total_students || 0}</td>
                <td>${(passRate * 100).toFixed(2)}%</td>
            </tr>`;
    });
  }

  html += "</tbody></table></div>";
  container.innerHTML = html;
}

function displaySubjectPerformance(data) {
  const container = document.getElementById("subject-performance");
  if (!container) {
    showError("Subject performance container not found");
    return;
  }
  let html = `<div class="table-responsive"><table class="table table-sm">
        <thead><tr><th>Subject</th><th>Average</th><th>Highest</th><th>Lowest</th></tr></thead>
        <tbody>`;

  if (Array.isArray(data)) {
    data.forEach((item) => {
      const avgScore = item.average_score || 0;
      html += `<tr>
                <td>${item._id || "N/A"}</td>
                <td>${avgScore.toFixed(2)}</td>
                <td>${item.highest_score || 0}</td>
                <td>${item.lowest_score || 0}</td>
            </tr>`;
    });
  }

  html += "</tbody></table></div>";
  container.innerHTML = html;
}

function displayTopPerformers(data) {
  const container = document.getElementById("top-performers");
  if (!container) {
    showError("Top performers container not found");
    return;
  }

  console.log("Top performers data:", data);

  let html = `<div class="table-responsive"><table class="table table-sm">
        <thead><tr><th>Name</th><th>Class</th><th>Average Score</th></tr></thead>
        <tbody>`;

  if (Array.isArray(data) && data.length > 0) {
    data.forEach((item) => {
      const avgScore = item.average_score || 0;
      html += `<tr>
                <td>${item.student_name || "N/A"}</td>
                <td>${item.class_name || "N/A"}</td>
                <td>${avgScore.toFixed(2)}</td>
            </tr>`;
    });
  } else {
    html +=
      '<tr><td colspan="3" class="text-center">No data available</td></tr>';
  }

  html += "</tbody></table></div>";
  container.innerHTML = html;
}
