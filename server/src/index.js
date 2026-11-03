import express from "express";
import http from "node:http";
import cors from "cors";
import helmet from "helmet";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { z } from "zod";
import dotenv from "dotenv";
import { pool } from "./db.js";
import { requireAuth, requireStaff } from "./auth.js";

dotenv.config();
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_ORIGIN, methods: ["GET", "POST"] }
});

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN }));
app.use(express.json({ limit: "20kb" }));

const today = () => new Date().toISOString().slice(0, 10);
const emitQueue = (serviceId) => io.to(`service:${serviceId}`).emit("queue:updated", { serviceId });

io.on("connection", (socket) => {
  socket.on("queue:join", (serviceId) => {
    if (typeof serviceId === "string") socket.join(`service:${serviceId}`);
  });
  socket.on("queue:leave", (serviceId) => {
    if (typeof serviceId === "string") socket.leave(`service:${serviceId}`);
  });
});

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.get("/api/services", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, description FROM services WHERE is_active = TRUE ORDER BY name`
    );
    res.json(rows);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Could not load services" });
  }
});

app.post("/api/tickets", async (req, res) => {
  const parsed = z.object({
    serviceId: z.string().uuid(),
    customerName: z.string().trim().min(2).max(80),
    phone: z.string().trim().max(25).optional().or(z.literal(""))
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Please provide a valid service and name" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const service = await client.query("SELECT id FROM services WHERE id=$1 AND is_active=TRUE", [parsed.data.serviceId]);
    if (!service.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Service not found" });
    }
    const seq = await client.query(
      `SELECT COALESCE(MAX(ticket_number),0)+1 AS next
       FROM tickets WHERE service_id=$1 AND queue_date=CURRENT_DATE
       FOR UPDATE`,
      [parsed.data.serviceId]
    );
    const number = Number(seq.rows[0].next);
    const inserted = await client.query(
      `INSERT INTO tickets(service_id,ticket_number,customer_name,phone)
       VALUES($1,$2,$3,$4)
       RETURNING id,ticket_number,customer_name,status,created_at`,
      [parsed.data.serviceId, number, parsed.data.customerName, parsed.data.phone || null]
    );
    await client.query("COMMIT");
    emitQueue(parsed.data.serviceId);
    res.status(201).json(inserted.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err); res.status(500).json({ error: "Could not create ticket" });
  } finally { client.release(); }
});

app.get("/api/queue/:serviceId", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id,ticket_number,customer_name,status,created_at,called_at
       FROM tickets WHERE service_id=$1 AND queue_date=CURRENT_DATE
       ORDER BY ticket_number`,
      [req.params.serviceId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Could not load queue" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid email or password" });
  try {
    const { rows } = await pool.query(
      "SELECT id,name,email,password_hash,role FROM users WHERE email=$1",
      [parsed.data.email.toLowerCase()]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(parsed.data.password, user.password_hash))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Login failed" });
  }
});

app.post("/api/staff/next", requireAuth, requireStaff, async (req, res) => {
  const parsed = z.object({ serviceId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid service" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE tickets SET status='completed', completed_at=NOW()
       WHERE service_id=$1 AND queue_date=CURRENT_DATE AND status='called'`,
      [parsed.data.serviceId]
    );
    const next = await client.query(
      `SELECT id,ticket_number,customer_name FROM tickets
       WHERE service_id=$1 AND queue_date=CURRENT_DATE AND status='waiting'
       ORDER BY ticket_number FOR UPDATE SKIP LOCKED LIMIT 1`,
      [parsed.data.serviceId]
    );
    if (!next.rowCount) {
      await client.query("COMMIT");
      return res.status(404).json({ error: "No waiting tickets" });
    }
    const updated = await client.query(
      `UPDATE tickets SET status='called', called_at=NOW()
       WHERE id=$1 RETURNING id,ticket_number,customer_name,status,called_at`,
      [next.rows[0].id]
    );
    await client.query("COMMIT");
    emitQueue(parsed.data.serviceId);
    res.json(updated.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err); res.status(500).json({ error: "Could not call next ticket" });
  } finally { client.release(); }
});

app.post("/api/staff/:ticketId/status", requireAuth, requireStaff, async (req, res) => {
  const parsed = z.object({ status: z.enum(["completed","skipped","cancelled"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid status" });
  try {
    const { rows } = await pool.query(
      `UPDATE tickets SET status=$1,
       completed_at=CASE WHEN $1='completed' THEN NOW() ELSE completed_at END
       WHERE id=$2 AND queue_date=CURRENT_DATE
       RETURNING id,service_id,ticket_number,status`,
      [parsed.data.status, req.params.ticketId]
    );
    if (!rows[0]) return res.status(404).json({ error: "Ticket not found" });
    emitQueue(rows[0].service_id);
    res.json(rows[0]);
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Could not update ticket" });
  }
});

const port = Number(process.env.PORT || 4000);
server.listen(port, () => console.log(`QueueFlow API running on http://localhost:${port}`));
