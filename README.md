# IT Ticket Management System - MERN

## Roles
- Employee: create and track own tickets, comments, confirm close, reopen.
- IT Support: handle assigned/unassigned support tickets, update status/priority, add comments and resolution notes.
- Admin: full ticket control, assignment, SLA dashboard, user management and delete.

## Features
- Ticket ID generation
- Categories: Hardware, Software, Network, Email, Access/Login, Printer, Security, Other
- Priority and SLA: High 4h, Medium 12h, Low 24h
- Assignment to IT staff
- Ticket comments/activity timeline
- Resolution notes
- Reopen and employee confirmation close
- Search/filter
- Admin statistics and user management

## Run Backend
```bash
cd server
npm install
node server.js
```
Backend: http://localhost:5000

## Run Frontend
Open a second terminal:
```bash
cd client
npm install
npm run dev
```
Frontend: 

## Demo Accounts
Admin: admin@demo.com / 123456
IT: it@demo.com / 123456
Employee: employee@demo.com / 123456

## MongoDB
Keep your existing `server/.env` and make sure MongoDB is running. Example:
```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/it_ticket_system
JWT_SECRET=your_secret_key
```
