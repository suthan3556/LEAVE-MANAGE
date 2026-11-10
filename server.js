require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  rollNumber: { type: String, required: true, unique: true, trim: true },
  casualLeave: { type: Number, required: true, min: 0, default: 0 },
  medicalLeave: { type: Number, required: true, min: 0, default: 0 }
}, { timestamps: true });

const leaveSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  leaveType: { type: String, enum: ["Casual", "Medical"], required: true },
  days: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ["Applied", "Approved", "Rejected"], default: "Applied" },
  appliedAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);
const Leave = mongoose.model("Leave", leaveSchema);

app.post("/api/users/register", async (req, res) => {
  try {
    const { username, email, rollNumber, casualLeave, medicalLeave } = req.body;
    if (!username || !email || !rollNumber) {
      return res.status(400).json({ message: "Please fill in all required fields." });
    }
    const casual = Number(casualLeave);
    const medical = Number(medicalLeave);
    if (!Number.isInteger(casual) || casual < 0 || !Number.isInteger(medical) || medical < 0) {
      return res.status(400).json({ message: "Leave balances must be whole numbers greater than or equal to zero." });
    }
    const user = await User.create({
      username, email, rollNumber, casualLeave: casual, medicalLeave: medical
    });
    res.status(201).json({ message: "Registration successful. You can now log in.", user });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "Email or roll number is already registered." });
    res.status(500).json({ message: "Could not register user." });
  }
});

app.post("/api/users/login", async (req, res) => {
  try {
    const { email, rollNumber } = req.body;
    if (!email || !rollNumber) return res.status(400).json({ message: "Enter email and roll number." });
    const user = await User.findOne({ email: email.toLowerCase().trim(), rollNumber: String(rollNumber).trim() });
    if (!user) return res.status(401).json({ message: "User not found. Check your email and roll number." });
    res.json({ message: "Login successful.", user });
  } catch {
    res.status(500).json({ message: "Could not log in." });
  }
});

app.get("/api/users/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found." });
    res.json({ user });
  } catch {
    res.status(400).json({ message: "Invalid user ID." });
  }
});

app.post("/api/leaves", async (req, res) => {
  try {
    const { userId, leaveType, days } = req.body;
    const numberOfDays = Number(days);
    if (!userId || !["Casual", "Medical"].includes(leaveType) ||
        !Number.isInteger(numberOfDays) || numberOfDays < 1) {
      return res.status(400).json({ message: "Choose a leave type and enter a valid number of days." });
    }
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found. Please log in again." });

    const field = leaveType === "Casual" ? "casualLeave" : "medicalLeave";
    if (user[field] < numberOfDays) {
      return res.status(400).json({ message: `Not enough ${leaveType.toLowerCase()} leave balance.` });
    }

    user[field] -= numberOfDays;
    await user.save();
    const leave = await Leave.create({ userId, leaveType, days: numberOfDays });
    res.status(201).json({ message: "Leave application submitted.", user, leave });
  } catch {
    res.status(500).json({ message: "Could not apply for leave." });
  }
});

app.get("/api/leaves/:userId", async (req, res) => {
  try {
    const leaves = await Leave.find({ userId: req.params.userId }).sort({ appliedAt: -1 });
    res.json({ leaves });
  } catch {
    res.status(400).json({ message: "Could not load leave history." });
  }
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/leave_management")
  .then(() => {
    console.log("MongoDB connected");
    app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error("MongoDB connection failed:", err.message);
    console.error("Start MongoDB and check your .env MONGODB_URI value.");
    process.exit(1);
  });
