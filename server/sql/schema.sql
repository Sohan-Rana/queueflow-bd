CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','staff')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  ticket_number INTEGER NOT NULL,
  customer_name TEXT NOT NULL,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting','called','completed','skipped','cancelled')),
  queue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  called_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE(service_id, queue_date, ticket_number)
);

CREATE INDEX IF NOT EXISTS idx_tickets_queue
ON tickets(service_id, queue_date, status, ticket_number);

INSERT INTO organizations (name, slug)
VALUES ('QueueFlow Demo', 'queueflow-demo')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO services (organization_id, name, description)
SELECT id, 'General Consultation', 'Demo service for testing QueueFlow'
FROM organizations WHERE slug = 'queueflow-demo'
AND NOT EXISTS (
  SELECT 1 FROM services s
  WHERE s.organization_id = organizations.id AND s.name = 'General Consultation'
);
