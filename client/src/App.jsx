import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import "./App.css";

const API = "http://localhost:5000/api";
const CATEGORIES = ["Hardware", "Software", "Network", "Email", "Access / Login", "Printer", "Security", "Other"];
const PRIORITIES = ["Low", "Medium", "High"];
const STATUSES = ["Open", "In Progress", "Resolved", "Closed"];

function apiConfig(user) {
  return { headers: { "x-user-id": user.id } };
}

function App() {
  const [page, setPage] = useState("dashboard");
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("user")) || null; } catch { return null; }
  });

  const login = (u) => { localStorage.setItem("user", JSON.stringify(u)); setUser(u); setPage("dashboard"); };
  const logout = () => { localStorage.removeItem("user"); setUser(null); setPage("login"); };

  if (!user) return (
    <div className="app">
      <nav className="navbar"><h2>IT Ticket System</h2><div className="nav-links"><button onClick={() => setPage("login")}>Login</button></div></nav>
      <Login onLogin={login} />
    </div>
  );

  return (
    <div className="app">
      <nav className="navbar">
        <h2>IT Ticket System</h2>
        <div className="nav-links">
          <button onClick={() => setPage("dashboard")}>Dashboard</button>
          {user.role === "employee" && <><button onClick={() => setPage("tickets")}>My Tickets</button><button onClick={() => setPage("create")}>Create Ticket</button></>}
          {user.role === "it" && <button onClick={() => setPage("tickets")}>IT Tickets</button>}
          {user.role === "admin" && <><button onClick={() => setPage("tickets")}>All Tickets</button><button onClick={() => setPage("admin")}>Admin</button><button onClick={() => setPage("users")}>Users</button></>}
          <span className="user-email">{user.email} ({user.role.toUpperCase()})</span>
          <button onClick={logout}>Logout</button>
        </div>
      </nav>

      {page === "dashboard" && <Dashboard user={user} go={setPage} />}
      {page === "tickets" && <TicketList user={user} />}
      {page === "create" && user.role === "employee" && <CreateTicket user={user} onCreated={() => setPage("tickets")} />}
      {page === "admin" && user.role === "admin" && <AdminDashboard user={user} />}
      {page === "users" && user.role === "admin" && <UsersPage user={user} />}
    </div>
  );
}

function Dashboard({ user, go }) {
  const [tickets, setTickets] = useState([]);
  const [stats, setStats] = useState(null);
  useEffect(() => {
    axios.get(`${API}/tickets`, apiConfig(user)).then(r => setTickets(r.data)).catch(() => {});
    if (user.role === "admin") axios.get(`${API}/admin/stats`, apiConfig(user)).then(r => setStats(r.data)).catch(() => {});
  }, [user]);
  const counts = stats || {
    total: tickets.length,
    open: tickets.filter(t => t.status === "Open").length,
    inProgress: tickets.filter(t => t.status === "In Progress").length,
    resolved: tickets.filter(t => t.status === "Resolved").length,
    closed: tickets.filter(t => t.status === "Closed").length,
    overdue: tickets.filter(t => t.slaDeadline && !["Resolved", "Closed"].includes(t.status) && new Date(t.slaDeadline) < new Date()).length
  };
  return <main className="main-content">
    <div className="hero"><div><span className="eyebrow">IT SERVICE DESK</span><h1>{user.role === "admin" ? "Admin Control Center" : user.role === "it" ? "IT Support Workspace" : "Employee Support Portal"}</h1><p>{user.role === "admin" ? "Monitor tickets, people, assignments and SLA performance." : user.role === "it" ? "Handle support requests, priorities and resolutions." : "Raise issues and follow every support request from creation to closure."}</p></div><div className="role-badge">{user.role.toUpperCase()}</div></div>
    <div className="cards">
      <Stat title={user.role === "employee" ? "My Tickets" : "Total Tickets"} value={counts.total} />
      <Stat title="Open" value={counts.open} />
      <Stat title="In Progress" value={counts.inProgress} />
      <Stat title="Resolved" value={counts.resolved} />
      <Stat title="Closed" value={counts.closed} />
      {(user.role !== "employee") && <Stat title="SLA Overdue" value={counts.overdue} danger />}
    </div>
    <div className="quick-grid">
      <div className="panel"><h3>Quick Actions</h3><div className="quick-actions">
        {user.role === "employee" && <button className="primary-btn" onClick={() => go("create")}>＋ Create Ticket</button>}
        <button onClick={() => go("tickets")}>View {user.role === "employee" ? "My Tickets" : "Tickets"}</button>
        {user.role === "admin" && <button onClick={() => go("users")}>Manage Users</button>}
      </div></div>
      <div className="panel"><h3>Priority SLA</h3><div className="sla-guide"><span><b className="dot high-dot"/>High — 4 hours</span><span><b className="dot medium-dot"/>Medium — 12 hours</span><span><b className="dot low-dot"/>Low — 24 hours</span></div></div>
    </div>
  </main>;
}

function Stat({ title, value, danger }) { return <div className={`card ${danger ? "danger-card" : ""}`}><h3>{title}</h3><p>{value}</p></div>; }

function CreateTicket({ user, onCreated }) {
  const [form, setForm] = useState({ subject: "", description: "", category: "Hardware", priority: "Low" });
  const [loading, setLoading] = useState(false);
  const submit = async e => {
    e.preventDefault();
    if (!form.subject.trim() || !form.description.trim()) return alert("Enter subject and description.");
    setLoading(true);
    try {
      const r = await axios.post(`${API}/tickets`, form, apiConfig(user));
      alert(`Ticket created successfully!\n\nTicket ID: ${r.data.ticketId}`);
      setForm({ subject: "", description: "", category: "Hardware", priority: "Low" });
      onCreated();
    } catch (e) { alert(e.response?.data?.message || "Failed to create ticket."); }
    finally { setLoading(false); }
  };
  return <main className="main-content"><div className="form-card"><div className="section-head"><div><span className="eyebrow">NEW REQUEST</span><h1>Create Ticket</h1></div><span className="small-badge">SLA auto-calculated</span></div><form onSubmit={submit} className="form-grid">
    <label>Subject<input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Laptop is not connecting to Wi-Fi" /></label>
    <label>Category<select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map(x => <option key={x}>{x}</option>)}</select></label>
    <label className="full">Description<textarea rows="6" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Describe the issue, error message, device details, etc." /></label>
    <label>Priority<select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>{PRIORITIES.map(x => <option key={x}>{x}</option>)}</select></label>
    <div className="submit-wrap"><button className="primary-btn" disabled={loading}>{loading ? "Creating..." : "Submit Ticket"}</button></div>
  </form></div></main>;
}

function TicketList({ user }) {
  const [tickets, setTickets] = useState([]); const [loading, setLoading] = useState(true); const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState(""); const [status, setStatus] = useState("All"); const [priority, setPriority] = useState("All"); const [category, setCategory] = useState("All");
  const load = () => { setLoading(true); axios.get(`${API}/tickets`, apiConfig(user)).then(r => setTickets(r.data)).catch(e => alert(e.response?.data?.message || "Failed to load tickets.")).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, [user]);
  const filtered = useMemo(() => tickets.filter(t => {
    const q = search.toLowerCase().trim();
    return (!q || t.ticketId?.toLowerCase().includes(q) || t.subject?.toLowerCase().includes(q) || t.userEmail?.toLowerCase().includes(q)) && (status === "All" || t.status === status) && (priority === "All" || t.priority === priority) && (category === "All" || t.category === category);
  }), [tickets, search, status, priority, category]);
  return <main className="main-content"><div className="section-head"><div><span className="eyebrow">{user.role === "employee" ? "MY REQUESTS" : user.role === "it" ? "SUPPORT QUEUE" : "SYSTEM TICKETS"}</span><h1>{user.role === "employee" ? "My Tickets" : user.role === "it" ? "IT Support Tickets" : "All Tickets"}</h1></div><span className="count-pill">{filtered.length} shown</span></div>
    <div className="filters"><input placeholder="Search ID, subject or employee..." value={search} onChange={e => setSearch(e.target.value)} /><select value={status} onChange={e => setStatus(e.target.value)}><option>All</option>{STATUSES.map(x => <option key={x}>{x}</option>)}</select><select value={priority} onChange={e => setPriority(e.target.value)}><option>All</option>{PRIORITIES.map(x => <option key={x}>{x}</option>)}</select><select value={category} onChange={e => setCategory(e.target.value)}><option>All</option>{CATEGORIES.map(x => <option key={x}>{x}</option>)}</select><button onClick={() => {setSearch("");setStatus("All");setPriority("All");setCategory("All")}}>Clear</button></div>
    {loading ? <div className="empty-message">Loading tickets...</div> : filtered.length === 0 ? <div className="empty-message">No tickets found.</div> : <div className="tickets-list">{filtered.map(t => <TicketCard key={t._id} ticket={t} user={user} onOpen={() => setSelected(t)} onRefresh={load} />)}</div>}
    {selected && <TicketModal ticketId={selected._id} user={user} onClose={() => setSelected(null)} onRefresh={load} />}
  </main>;
}

function TicketCard({ ticket, user, onOpen, onRefresh }) {
  const [busy, setBusy] = useState(false);
  const update = async (url, body) => { setBusy(true); try { await axios.put(`${API}${url}`, body, apiConfig(user)); onRefresh(); } catch(e) { alert(e.response?.data?.message || "Action failed"); } finally { setBusy(false); } };
  const sla = ticket.slaDeadline && !["Resolved", "Closed"].includes(ticket.status) ? new Date(ticket.slaDeadline) < new Date() ? "Overdue" : `${Math.max(0, Math.floor((new Date(ticket.slaDeadline)-new Date())/3600000))}h remaining` : ["Resolved","Closed"].includes(ticket.status) ? "Completed" : "N/A";
  return <div className="ticket">
    <div className="ticket-top"><div><span className="ticket-id">{ticket.ticketId}</span><h2>{ticket.subject}</h2><p className="ticket-description">{ticket.description}</p></div><span className={`priority ${ticket.priority.toLowerCase()}`}>{ticket.priority}</span></div>
    <div className="meta-grid"><span><b>Category</b>{ticket.category || "Other"}</span><span><b>Status</b>{ticket.status}</span><span><b>Employee</b>{ticket.userEmail || "N/A"}</span><span><b>Assigned IT</b>{ticket.assignedToEmail || "Unassigned"}</span><span className={sla === "Overdue" ? "overdue" : "sla-text"}><b>SLA</b>{sla}</span></div>
    <div className="ticket-actions"><button onClick={onOpen}>View Details</button>{user.role !== "employee" && <><select disabled={busy} value={ticket.status} onChange={e => update(`/tickets/${ticket._id}/status`, { status: e.target.value })}>{STATUSES.map(x => <option key={x}>{x}</option>)}</select><select disabled={busy} value={ticket.priority} onChange={e => update(`/tickets/${ticket._id}/priority`, { priority: e.target.value })}>{PRIORITIES.map(x => <option key={x}>{x}</option>)}</select></>}</div>
  </div>;
}

function TicketModal({ ticketId, user, onClose, onRefresh }) {
  const [ticket, setTicket] = useState(null); const [comment, setComment] = useState(""); const [resolution, setResolution] = useState(""); const [busy, setBusy] = useState(false);
  const load = () => axios.get(`${API}/tickets/${ticketId}`, apiConfig(user)).then(r => { setTicket(r.data); setResolution(r.data.resolutionNotes || ""); }).catch(e => alert(e.response?.data?.message || "Failed to load ticket."));
  useEffect(() => { load(); }, [ticketId]);
  const action = async (url, body = {}, method = "put") => { setBusy(true); try { const r = method === "post" ? await axios.post(`${API}${url}`, body, apiConfig(user)) : await axios.put(`${API}${url}`, body, apiConfig(user)); setTicket(r.data); onRefresh(); return true; } catch(e) { alert(e.response?.data?.message || "Action failed"); return false; } finally { setBusy(false); } };
  if (!ticket) return <div className="modal-backdrop"><div className="modal"><p>Loading...</p></div></div>;
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}><div className="modal wide">
    <div className="modal-head"><div><span className="ticket-id">{ticket.ticketId}</span><h2>{ticket.subject}</h2></div><button className="icon-btn" onClick={onClose}>×</button></div>
    <div className="detail-grid"><div><b>Category</b><span>{ticket.category}</span></div><div><b>Priority</b><span>{ticket.priority}</span></div><div><b>Status</b><span>{ticket.status}</span></div><div><b>Employee</b><span>{ticket.userEmail}</span></div><div><b>Assigned IT</b><span>{ticket.assignedToEmail || "Unassigned"}</span></div><div><b>Created</b><span>{new Date(ticket.createdAt).toLocaleString()}</span></div></div>
    <div className="description-box"><h3>Description</h3><p>{ticket.description}</p></div>
    {ticket.resolutionNotes && <div className="resolution-box"><h3>Resolution</h3><p>{ticket.resolutionNotes}</p></div>}
    <h3>Activity & Comments</h3><div className="comments">{ticket.comments?.length ? ticket.comments.map(c => <div className={`comment ${c.role}`} key={c._id}><div><b>{c.userEmail}</b><span>{c.role}</span><small>{new Date(c.createdAt).toLocaleString()}</small></div><p>{c.text}</p></div>) : <p>No activity yet.</p>}</div>
    <div className="comment-form"><textarea rows="3" placeholder="Write a comment..." value={comment} onChange={e => setComment(e.target.value)} /><button disabled={busy || !comment.trim()} className="primary-btn" onClick={async () => { if (await action(`/tickets/${ticket._id}/comments`, { text: comment }, "post")) setComment(""); }}>Add Comment</button></div>
    {user.role !== "employee" && <div className="resolution-form"><h3>Resolution Notes</h3><textarea rows="3" value={resolution} onChange={e => setResolution(e.target.value)} placeholder="Explain how the issue was fixed..." /><button disabled={busy || !resolution.trim()} className="primary-btn" onClick={() => action(`/tickets/${ticket._id}/resolution`, { resolutionNotes: resolution })}>Resolve Ticket</button></div>}
    {user.role === "employee" && <div className="ticket-actions modal-actions">{ticket.status === "Resolved" && <button disabled={busy} onClick={() => action(`/tickets/${ticket._id}/close`)}>Confirm & Close</button>}{["Resolved", "Closed"].includes(ticket.status) && <button disabled={busy} onClick={() => action(`/tickets/${ticket._id}/reopen`)}>Reopen Ticket</button>}</div>}
  </div></div>;
}

function AdminDashboard({ user }) {
  const [tickets, setTickets] = useState([]); const [itUsers, setItUsers] = useState([]); const [stats, setStats] = useState({}); const [search, setSearch] = useState("");
  const load = async () => { try { const [t,s,u] = await Promise.all([axios.get(`${API}/admin/tickets`, apiConfig(user)), axios.get(`${API}/admin/stats`, apiConfig(user)), axios.get(`${API}/admin/it-users`, apiConfig(user))]); setTickets(t.data); setStats(s.data); setItUsers(u.data); } catch(e) { alert(e.response?.data?.message || "Failed to load admin data."); } };
  useEffect(() => { load(); }, [user]);
  const assign = async (id, itUserId) => { if (!itUserId) return; try { await axios.put(`${API}/admin/tickets/${id}/assign`, { itUserId }, apiConfig(user)); load(); } catch(e) { alert(e.response?.data?.message || "Assignment failed"); } };
  const del = async id => { if (!confirm("Delete this ticket?")) return; try { await axios.delete(`${API}/tickets/${id}`, apiConfig(user)); load(); } catch(e) { alert(e.response?.data?.message || "Delete failed"); } };
  const shown = tickets.filter(t => !search || `${t.ticketId} ${t.subject} ${t.userEmail}`.toLowerCase().includes(search.toLowerCase()));
  return <main className="main-content"><div className="hero"><div><span className="eyebrow">ADMIN</span><h1>Control Center</h1><p>Monitor service performance, assignments and SLA health.</p></div></div><div className="cards"><Stat title="Total" value={stats.total || 0}/><Stat title="Open" value={stats.open || 0}/><Stat title="In Progress" value={stats.inProgress || 0}/><Stat title="Resolved" value={stats.resolved || 0}/><Stat title="Closed" value={stats.closed || 0}/><Stat title="Overdue" value={stats.overdue || 0} danger/></div><div className="panel"><div className="section-head"><h2>Ticket Control</h2><input className="compact-search" placeholder="Search tickets..." value={search} onChange={e => setSearch(e.target.value)}/></div><div className="admin-table">{shown.length === 0 ? <div className="empty-message">No tickets.</div> : shown.map(t => <div className="admin-row" key={t._id}><div><b>{t.ticketId}</b><strong>{t.subject}</strong><small>{t.userEmail} · {t.category}</small></div><span className={`status-chip ${t.status.replaceAll(" ", "-").toLowerCase()}`}>{t.status}</span><select value={t.assignedTo || ""} onChange={e => assign(t._id, e.target.value)}><option value="">Assign IT</option>{itUsers.map(i => <option key={i._id} value={i._id}>{i.email}</option>)}</select><button className="delete-btn" onClick={() => del(t._id)}>Delete</button></div>)}</div></div></main>;
}

function UsersPage({ user }) {
  const [users, setUsers] = useState([]); const [email, setEmail] = useState(""); const [password, setPassword] = useState("123456"); const [role, setRole] = useState("employee");
  const load = () => axios.get(`${API}/admin/users`, apiConfig(user)).then(r => setUsers(r.data)).catch(e => alert(e.response?.data?.message || "Failed to load users."));
  useEffect(() => { load(); }, [user]);
  const create = async e => { e.preventDefault(); try { await axios.post(`${API}/admin/users`, { email, password, role }, apiConfig(user)); setEmail(""); setPassword("123456"); load(); alert("User created successfully"); } catch(e) { alert(e.response?.data?.message || "Could not create user"); } };
  const toggle = async u => { try { await axios.put(`${API}/admin/users/${u._id}`, { active: !u.active }, apiConfig(user)); load(); } catch(e) { alert(e.response?.data?.message || "Update failed"); } };
  return <main className="main-content"><div className="section-head"><div><span className="eyebrow">ADMINISTRATION</span><h1>User Management</h1></div></div><div className="user-layout"><div className="panel"><h3>Create User</h3><form className="form-stack" onSubmit={create}><label>Email<input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="employee@company.com"/></label><label>Password<input required value={password} onChange={e => setPassword(e.target.value)}/></label><label>Role<select value={role} onChange={e => setRole(e.target.value)}><option value="employee">Employee</option><option value="it">IT Support</option><option value="admin">Admin</option></select></label><button className="primary-btn">Create User</button></form></div><div className="panel"><h3>Users</h3><div className="user-list">{users.map(u => <div className="user-row" key={u._id}><div><b>{u.email}</b><small>{u.role.toUpperCase()}</small></div><span className={u.active ? "active" : "inactive"}>{u.active ? "Active" : "Inactive"}</span>{u.email !== user.email && <button onClick={() => toggle(u)}>{u.active ? "Deactivate" : "Activate"}</button>}</div>)}</div></div></div></main>;
}

function Login({ onLogin }) {
  const [email, setEmail] = useState("employee@demo.com"); const [password, setPassword] = useState("123456"); const [loading, setLoading] = useState(false);
  const submit = async e => { e.preventDefault(); setLoading(true); try { const r = await axios.post(`${API}/auth/login`, { email, password }); onLogin(r.data.user); } catch(e) { alert(e.response?.data?.message || "Login failed"); } finally { setLoading(false); } };
  return <main className="login-page"><div className="login-card"><span className="eyebrow">IT SERVICE DESK</span><h1>Welcome back</h1><p>Sign in to manage your support requests.</p><form onSubmit={submit} className="form-stack"><label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} /></label><label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} /></label><button className="primary-btn" disabled={loading}>{loading ? "Signing in..." : "Sign In"}</button></form><div className="demo-login"><b>Demo Accounts</b><p>Admin: admin@demo.com / 123456</p><p>IT: it@demo.com / 123456</p><p>Employee: employee@demo.com / 123456</p></div></div></main>;
}

export default App;
