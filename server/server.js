const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const ROLES = ["employee", "it", "admin"];
const CATEGORIES = ["Hardware", "Software", "Network", "Email", "Access / Login", "Printer", "Security", "Other"];
const PRIORITIES = ["Low", "Medium", "High"];
const STATUSES = ["Open", "In Progress", "Resolved", "Closed"];

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ROLES, default: "employee" },
  active: { type: Boolean, default: true }
}, { timestamps: true });

const commentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  userEmail: { type: String, default: "" },
  role: { type: String, default: "employee" },
  text: { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const ticketSchema = new mongoose.Schema({
  ticketId: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  userEmail: { type: String, default: "" },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  assignedToEmail: { type: String, default: "" },
  subject: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  category: { type: String, enum: CATEGORIES, default: "Other" },
  priority: { type: String, enum: PRIORITIES, default: "Low" },
  status: { type: String, enum: STATUSES, default: "Open" },
  slaDeadline: { type: Date, default: null },
  resolutionNotes: { type: String, default: "" },
  resolvedAt: { type: Date, default: null },
  closedAt: { type: Date, default: null },
  reopenedAt: { type: Date, default: null },
  comments: { type: [commentSchema], default: [] }
}, { timestamps: true });

const User = mongoose.model("User", userSchema);
const Ticket = mongoose.model("Ticket", ticketSchema);

app.get("/", (req, res) => res.json({ message: "IT Ticket Management System API is running" }));

async function getUserFromRequest(req) {
  const userId = req.headers["x-user-id"];
  if (!userId) return null;
  try { return await User.findById(userId); } catch { return null; }
}

async function requireLogin(req, res, next) {
  const user = await getUserFromRequest(req);
  if (!user || !user.active) return res.status(401).json({ message: "Authentication required" });
  req.user = user;
  next();
}

function requireIT(req, res, next) {
  if (!["it", "admin"].includes(req.user.role)) return res.status(403).json({ message: "IT or Admin access required" });
  next();
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Admin access required" });
  next();
}

function calculateSlaDeadline(priority) {
  const hours = priority === "High" ? 4 : priority === "Medium" ? 12 : 24;
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

async function generateTicketId() {
  const last = await Ticket.findOne().sort({ createdAt: -1 }).select("ticketId");
  let next = 1;
  if (last?.ticketId) {
    const n = parseInt(last.ticketId.replace("TKT-", ""), 10);
    if (!Number.isNaN(n)) next = n + 1;
  }
  return `TKT-${String(next).padStart(4, "0")}`;
}

function canViewTicket(user, ticket) {
  if (user.role === "admin") return true;
  if (user.role === "employee") return String(ticket.userId) === String(user._id);
  return !ticket.assignedTo || String(ticket.assignedTo) === String(user._id);
}

/* AUTH */
app.post("/api/auth/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim();
    const password = String(req.body.password || "");
    if (!email || !password) return res.status(400).json({ message: "Email and password are required" });
    const user = await User.findOne({ email });
    if (!user || !user.active || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    res.json({ message: "Login successful", user: { id: user._id, email: user.email, role: user.role } });
  } catch (error) {
    res.status(500).json({ message: "Login failed", error: error.message });
  }
});

async function createDemoUsers() {
  const demo = [
    ["admin@demo.com", "123456", "admin"],
    ["it@demo.com", "123456", "it"],
    ["employee@demo.com", "123456", "employee"]
  ];
  for (const [email, password, role] of demo) {
    const hash = await bcrypt.hash(password, 10);
    await User.findOneAndUpdate({ email }, { email, password: hash, role, active: true }, { upsert: true, new: true, setDefaultsOnInsert: true });
  }
  console.log("Demo users ready");
  console.log("ADMIN: admin@demo.com / 123456");
  console.log("IT: it@demo.com / 123456");
  console.log("EMPLOYEE: employee@demo.com / 123456");
}

/* TICKETS */
app.post("/api/tickets", requireLogin, async (req, res) => {
  try {
    const subject = String(req.body.subject || "").trim();
    const description = String(req.body.description || "").trim();
    const category = CATEGORIES.includes(req.body.category) ? req.body.category : "Other";
    const priority = PRIORITIES.includes(req.body.priority) ? req.body.priority : "Low";
    if (!subject || !description) return res.status(400).json({ message: "Subject and description are required" });
    const ticket = await Ticket.create({
      ticketId: await generateTicketId(), userId: req.user._id, userEmail: req.user.email,
      subject, description, category, priority, status: "Open", slaDeadline: calculateSlaDeadline(priority),
      comments: [{ userId: req.user._id, userEmail: req.user.email, role: req.user.role, text: "Ticket created" }]
    });
    res.status(201).json(ticket);
  } catch (error) { res.status(500).json({ message: "Failed to create ticket", error: error.message }); }
});

app.get("/api/tickets", requireLogin, async (req, res) => {
  try {
    let filter = {};
    if (req.user.role === "employee") filter = { userId: req.user._id };
    if (req.user.role === "it") filter = { $or: [{ assignedTo: req.user._id }, { assignedTo: null }] };
    const tickets = await Ticket.find(filter).sort({ createdAt: -1 });
    res.json(tickets);
  } catch (error) { res.status(500).json({ message: "Failed to fetch tickets", error: error.message }); }
});

app.get("/api/tickets/:id", requireLogin, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    if (!canViewTicket(req.user, ticket)) return res.status(403).json({ message: "You do not have access to this ticket" });
    res.json(ticket);
  } catch (error) { res.status(500).json({ message: "Failed to fetch ticket", error: error.message }); }
});

app.put("/api/tickets/:id/status", requireLogin, requireIT, async (req, res) => {
  try {
    const { status } = req.body;
    if (!STATUSES.includes(status)) return res.status(400).json({ message: "Invalid status" });
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    if (req.user.role === "it" && ticket.assignedTo && String(ticket.assignedTo) !== String(req.user._id)) return res.status(403).json({ message: "This ticket is assigned to another IT staff member" });
    ticket.status = status;
    if (status === "Resolved") { ticket.resolvedAt = new Date(); ticket.closedAt = null; }
    if (status === "Closed") ticket.closedAt = new Date();
    if (status === "In Progress" || status === "Open") { ticket.resolvedAt = null; ticket.closedAt = null; }
    await ticket.save();
    res.json(ticket);
  } catch (error) { res.status(500).json({ message: "Failed to update status", error: error.message }); }
});

app.put("/api/tickets/:id/priority", requireLogin, requireIT, async (req, res) => {
  try {
    const { priority } = req.body;
    if (!PRIORITIES.includes(priority)) return res.status(400).json({ message: "Invalid priority" });
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    ticket.priority = priority;
    if (!["Resolved", "Closed"].includes(ticket.status)) ticket.slaDeadline = calculateSlaDeadline(priority);
    await ticket.save();
    res.json(ticket);
  } catch (error) { res.status(500).json({ message: "Failed to update priority", error: error.message }); }
});

app.post("/api/tickets/:id/comments", requireLogin, async (req, res) => {
  try {
    const text = String(req.body.text || "").trim();
    if (!text) return res.status(400).json({ message: "Comment cannot be empty" });
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    if (!canViewTicket(req.user, ticket)) return res.status(403).json({ message: "You do not have access to this ticket" });
    ticket.comments.push({ userId: req.user._id, userEmail: req.user.email, role: req.user.role, text });
    await ticket.save();
    res.json(ticket);
  } catch (error) { res.status(500).json({ message: "Failed to add comment", error: error.message }); }
});

app.put("/api/tickets/:id/resolution", requireLogin, requireIT, async (req, res) => {
  try {
    const notes = String(req.body.resolutionNotes || "").trim();
    if (!notes) return res.status(400).json({ message: "Resolution notes are required" });
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    if (req.user.role === "it" && ticket.assignedTo && String(ticket.assignedTo) !== String(req.user._id)) return res.status(403).json({ message: "This ticket is assigned to another IT staff member" });
    ticket.resolutionNotes = notes;
    ticket.status = "Resolved";
    ticket.resolvedAt = new Date();
    ticket.closedAt = null;
    ticket.comments.push({ userId: req.user._id, userEmail: req.user.email, role: req.user.role, text: `Resolution added: ${notes}` });
    await ticket.save();
    res.json(ticket);
  } catch (error) { res.status(500).json({ message: "Failed to save resolution", error: error.message }); }
});

app.put("/api/tickets/:id/reopen", requireLogin, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    if (req.user.role !== "admin" && String(ticket.userId) !== String(req.user._id)) return res.status(403).json({ message: "Only the ticket owner or admin can reopen this ticket" });
    if (!["Resolved", "Closed"].includes(ticket.status)) return res.status(400).json({ message: "Only resolved or closed tickets can be reopened" });
    ticket.status = "Open";
    ticket.reopenedAt = new Date();
    ticket.resolvedAt = null;
    ticket.closedAt = null;
    ticket.slaDeadline = calculateSlaDeadline(ticket.priority);
    ticket.comments.push({ userId: req.user._id, userEmail: req.user.email, role: req.user.role, text: "Ticket reopened" });
    await ticket.save();
    res.json(ticket);
  } catch (error) { res.status(500).json({ message: "Failed to reopen ticket", error: error.message }); }
});

app.put("/api/tickets/:id/close", requireLogin, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    if (req.user.role !== "admin" && String(ticket.userId) !== String(req.user._id)) return res.status(403).json({ message: "Only the ticket owner or admin can close this ticket" });
    if (ticket.status !== "Resolved") return res.status(400).json({ message: "Only resolved tickets can be closed" });
    ticket.status = "Closed";
    ticket.closedAt = new Date();
    ticket.comments.push({ userId: req.user._id, userEmail: req.user.email, role: req.user.role, text: "Ticket closed" });
    await ticket.save();
    res.json(ticket);
  } catch (error) { res.status(500).json({ message: "Failed to close ticket", error: error.message }); }
});

/* ADMIN */
app.get("/api/admin/tickets", requireLogin, requireAdmin, async (req, res) => {
  try { res.json(await Ticket.find().sort({ createdAt: -1 })); }
  catch (error) { res.status(500).json({ message: "Failed to fetch admin tickets", error: error.message }); }
});

app.get("/api/admin/stats", requireLogin, requireAdmin, async (req, res) => {
  try {
    const tickets = await Ticket.find();
    const stats = {
      total: tickets.length,
      open: tickets.filter(t => t.status === "Open").length,
      inProgress: tickets.filter(t => t.status === "In Progress").length,
      resolved: tickets.filter(t => t.status === "Resolved").length,
      closed: tickets.filter(t => t.status === "Closed").length,
      overdue: tickets.filter(t => t.slaDeadline && !["Resolved", "Closed"].includes(t.status) && new Date(t.slaDeadline) < new Date()).length,
      high: tickets.filter(t => t.priority === "High").length,
      medium: tickets.filter(t => t.priority === "Medium").length,
      low: tickets.filter(t => t.priority === "Low").length
    };
    res.json(stats);
  } catch (error) { res.status(500).json({ message: "Failed to load statistics", error: error.message }); }
});

app.get("/api/admin/users", requireLogin, requireAdmin, async (req, res) => {
  try { res.json(await User.find().select("-password").sort({ createdAt: -1 })); }
  catch (error) { res.status(500).json({ message: "Failed to fetch users", error: error.message }); }
});

app.get("/api/admin/it-users", requireLogin, requireAdmin, async (req, res) => {
  try { res.json(await User.find({ role: "it", active: true }).select("-password").sort({ email: 1 })); }
  catch (error) { res.status(500).json({ message: "Failed to fetch IT users", error: error.message }); }
});

app.post("/api/admin/users", requireLogin, requireAdmin, async (req, res) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim();
    const password = String(req.body.password || "");
    const role = ROLES.includes(req.body.role) ? req.body.role : "employee";
    if (!email || !password) return res.status(400).json({ message: "Email and password are required" });
    if (await User.findOne({ email })) return res.status(409).json({ message: "User already exists" });
    const user = await User.create({ email, password: await bcrypt.hash(password, 10), role, active: true });
    res.status(201).json({ _id: user._id, email: user.email, role: user.role, active: user.active });
  } catch (error) { res.status(500).json({ message: "Failed to create user", error: error.message }); }
});

app.put("/api/admin/users/:id", requireLogin, requireAdmin, async (req, res) => {
  try {
    const updates = {};
    if (ROLES.includes(req.body.role)) updates.role = req.body.role;
    if (typeof req.body.active === "boolean") updates.active = req.body.active;
    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (error) { res.status(500).json({ message: "Failed to update user", error: error.message }); }
});

app.put("/api/admin/tickets/:id/assign", requireLogin, requireAdmin, async (req, res) => {
  try {
    const itUser = await User.findOne({ _id: req.body.itUserId, role: "it", active: true });
    if (!itUser) return res.status(404).json({ message: "Active IT user not found" });
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    ticket.assignedTo = itUser._id;
    ticket.assignedToEmail = itUser.email;
    if (ticket.status === "Open") ticket.status = "In Progress";
    ticket.comments.push({ userId: req.user._id, userEmail: req.user.email, role: req.user.role, text: `Ticket assigned to ${itUser.email}` });
    await ticket.save();
    res.json(ticket);
  } catch (error) { res.status(500).json({ message: "Failed to assign ticket", error: error.message }); }
});

app.delete("/api/tickets/:id", requireLogin, requireAdmin, async (req, res) => {
  try {
    const ticket = await Ticket.findByIdAndDelete(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    res.json({ message: "Ticket deleted successfully" });
  } catch (error) { res.status(500).json({ message: "Failed to delete ticket", error: error.message }); }
});

const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("MongoDB connected successfully");
    try { await createDemoUsers(); } catch (error) { console.error("Demo user setup error:", error.message); }
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  })
  .catch(error => console.error("MongoDB connection failed:", error.message));
