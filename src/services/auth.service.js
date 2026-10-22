// authentication service

const bcrypt = require("bcrypt");
const User = require("../models/User");
const generateToken = require("../utils/generateToken");
const { sendWelcomeEmail } = require("./email.service");

const register = async ({ name, email, password, role, adminKey }) => {
  const exists = await User.findOne({ email });
  if (exists) throw new Error("Email already registered");

  const passwordHash = await bcrypt.hash(password, 10);

  let assignedRole = "student";
  if (role === "admin") {
    if (adminKey && adminKey === process.env.ADMIN_SECRET_KEY) {
      assignedRole = "admin";
    } else {
      throw new Error("Invalid admin key for creating an admin account");
    }
  }

  const user = await User.create({
    name,
    email,
    passwordHash,
    role: assignedRole,
  });

  const token = generateToken({ id: user._id, role: user.role });

  sendWelcomeEmail(user.email, user.name).catch(err => {
    console.error('Email sending failed (non-critical):', err.message);
  });

  return {
    token,
    user: { id: user._id, name: user.name, email: user.email, role: user.role },
  };
};

const login = async ({ email, password }) => {
  const user = await User.findOne({ email });
  if (!user) throw new Error("Invalid email or password");

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) throw new Error("Invalid email or password");

  const token = generateToken({ id: user._id, role: user.role });

  return {
    token,
    user: { id: user._id, name: user.name, email: user.email, role: user.role },
  };
};

const getMe = async (userId) => {
  const user = await User.findById(userId).select("-passwordHash");
  if (!user) throw new Error("User not found");
  return user;
};

module.exports = { register, login, getMe };
