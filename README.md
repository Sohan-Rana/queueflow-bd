# QueueFlow BD

A real-time appointment and queue management MVP for clinics, diagnostic centres, banks and service desks.

## Stack
- Frontend: React + Vite
- Backend: Node.js + Express
- Realtime: Socket.IO
- Database: PostgreSQL
- Authentication: JWT + bcrypt

## MVP features
- Public service list and appointment/token creation
- Live queue board
- Staff login and queue controls (call next, complete, skip)
- Admin-ready data model (organizations, services, users, tickets)
- Queue events broadcast in real time

## Requirements
- Node.js 20+
- PostgreSQL 14+

## Setup

### 1. Database
Create a PostgreSQL database named `queueflow`.
Run the schema:

```bash
psql -d queueflow -f server/sql/schema.sql
```

### 2. Backend
```bash
cd server
cp .env.example .env
npm install
npm run dev
```

Set `DATABASE_URL`, `JWT_SECRET`, and `CLIENT_ORIGIN` in `.env`.

### 3. Frontend
In another terminal:
```bash
cd client
npm install
npm run dev
```

Open the Vite URL shown in the terminal (usually http://localhost:5173).

## Demo flow
1. Open the public page and create a token.
2. Open `/board` to see the live queue.
3. Sign in at `/staff` using a user you create in the database.
4. Staff can call the next waiting token, mark the current token complete, or skip it.

## Create a staff account
Generate a bcrypt hash using:
```bash
cd server
node -e "const b=require('bcryptjs'); console.log(b.hashSync('ChangeMe123!', 12))"
```
Then insert a user (replace the hash):
```sql
INSERT INTO users (name, email, password_hash, role)
VALUES ('Demo Staff', 'staff@queueflow.local', '<BCRYPT_HASH>', 'staff');
```

## API
- `GET /api/services` — list active services
- `POST /api/tickets` — create a queue ticket
- `GET /api/queue/:serviceId` — get today's queue
- `POST /api/auth/login` — staff login
- `POST /api/staff/next` — call next waiting ticket
- `POST /api/staff/:ticketId/status` — update ticket status

## Notes
- This is an MVP starter, not a production-ready healthcare system.
- Add rate limiting, email/SMS provider integration, audit logs, backups, role/tenant authorization, CSRF strategy where applicable, and privacy/security review before public deployment.
- Queue numbering is scoped by service and local date.
