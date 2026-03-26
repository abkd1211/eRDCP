# ERDCP — National Emergency Response & Dispatch Coordination Platform
## University of Ghana CPEN 421 — Phase 4

---

## Architecture

```
api-gateway/          — Express proxy + JWT auth + rate limiting          :3000
services/
  auth-service/       — Users, login, JWT, roles                          :3001
  incident-service/   — Incidents, responders, dispatch logic             :3002
  dispatch-service/   — Vehicle GPS, simulation, Socket.io                :3003
  analytics-service/  — RabbitMQ consumer, MongoDB aggregations           :3004
  ai-agent-service/   — Groq Whisper STT, NLP extraction, geocoding       :3005
shared/               — Shared TypeScript types and constants
```

---

## Prerequisites

- Node.js 18+
- PostgreSQL (via Aiven or local)
- MongoDB (via Atlas or local)
- Redis (via Redis Cloud or local)
- RabbitMQ (via CloudAMQP or local)

---

## Setup

### 1. Install dependencies (run in each service folder)

```bash
cd api-gateway && npm install
cd services/auth-service && npm install
cd services/incident-service && npm install
cd services/dispatch-service && npm install
cd services/analytics-service && npm install
cd services/ai-agent-service && npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env` in each service and fill in your credentials:

```bash
cp api-gateway/.env.example api-gateway/.env
cp services/auth-service/.env.example services/auth-service/.env
cp services/incident-service/.env.example services/incident-service/.env
cp services/dispatch-service/.env.example services/dispatch-service/.env
cp services/analytics-service/.env.example services/analytics-service/.env
cp services/ai-agent-service/.env.example services/ai-agent-service/.env
```

**Critical:** `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` must be identical across all services that verify tokens (auth, incident, dispatch, analytics, agent).

### 3. Run Prisma migrations

```bash
# Auth service
cd services/auth-service
npx prisma migrate dev --name init
npx prisma generate

# Incident service
cd services/incident-service
npx prisma migrate dev --name init
npx prisma generate
```

### 4. Create your first admin account

The register endpoint is public — create one SYSTEM_ADMIN then lock it down:

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "System Administrator",
    "email": "admin@erdcp.gov.gh",
    "password": "Admin@1234",
    "role": "SYSTEM_ADMIN"
  }'
```

### 5. Start all services

Open 6 terminal tabs, one per service:

```bash
# Tab 1
cd api-gateway && npm run dev

# Tab 2
cd services/auth-service && npm run dev

# Tab 3
cd services/incident-service && npm run dev

# Tab 4
cd services/dispatch-service && npm run dev

# Tab 5
cd services/analytics-service && npm run dev

# Tab 6
cd services/ai-agent-service && npm run dev
```

### 6. Verify all services are up

```bash
curl http://localhost:3000/health/all
```

---

## Simulation

When an incident is created and a responder is dispatched, the GPS simulation starts **automatically**. It:

1. Calls Mapbox Directions API to get the real road route
2. Walks the vehicle along waypoints at 60 km/h base speed
3. Emits `location:update`, `eta:update` via Socket.io on every step
4. Triggers `IN_PROGRESS` at 500m, `RESOLVED` on arrival

**Control simulation speed:**
```bash
curl -X POST http://localhost:3000/simulation/speed \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"multiplier": 5}'
```

**Trigger manual route blockage:**
```bash
curl -X POST http://localhost:3000/simulation/blockage/<vehicleId> \
  -H "Authorization: Bearer <token>"
```

---

## Key environment variables

| Variable | Service | Description |
|---|---|---|
| `JWT_ACCESS_SECRET` | all | Must match across all services |
| `JWT_REFRESH_SECRET` | auth | Refresh token signing |
| `DATABASE_URL` | auth, incident | PostgreSQL connection string |
| `MONGODB_URI` | dispatch, analytics, agent | MongoDB connection string |
| `REDIS_URL` | all | Redis connection string |
| `RABBITMQ_URL` | all | CloudAMQP connection string |
| `GROQ_API_KEY` | ai-agent | For Whisper STT |
| `MAPBOX_TOKEN` | dispatch | For road-following simulation |

---

## API Endpoints Summary

### Auth (:3001 via gateway :3000)
- `POST /auth/register` — create account
- `POST /auth/login` — get tokens
- `POST /auth/logout` — invalidate token
- `GET /auth/profile` — get own profile
- `PUT /auth/profile` — update name/password
- `GET /auth/users` — list all users (SYSTEM_ADMIN)
- `PUT /auth/users/:id/role` — change role (SYSTEM_ADMIN)
- `DELETE /auth/users/:id` — deactivate (SYSTEM_ADMIN)

### Incidents (:3002 via gateway :3000)
- `POST /incidents` — create + auto-dispatch (SYSTEM_ADMIN)
- `GET /incidents` — list (role-filtered)
- `GET /incidents/open` — open only (role-filtered)
- `GET /incidents/nearby?lat&lng&radius` — proximity check
- `POST /incidents/link` — link witness report
- `PUT /incidents/:id/status` — update status
- `GET /responders` — list responders (role-filtered)
- `POST /responders` — register unit
- `PUT /responders/:id/availability` — toggle status
- `PUT /responders/:id/capacity` — update bed count (HOSPITAL_ADMIN)
- `GET /responders/hospitals` — hospital capacities

### Dispatch (:3003 via gateway :3000)
- `GET /vehicles` — list vehicles
- `GET /vehicles/:id` — single vehicle
- `PUT /vehicles/:id/location` — REST GPS ping fallback
- `GET /dispatch/:incidentId` — vehicles for incident
- `POST /simulation/speed` — set speed multiplier (SYSTEM_ADMIN)
- `POST /simulation/blockage/:vehicleId` — trigger blockage (SYSTEM_ADMIN)
- `GET /simulation/active` — list active simulations

### Socket.io (:3003 direct)
Connect with: `io('http://localhost:3003', { auth: { token: '<jwt>' } })`

Events emitted by server:
- `location:update` — vehicle GPS ping
- `eta:update` — ETA + distance remaining
- `route:deviation` — vehicle deviated from route
- `vehicle:arrived` — vehicle on scene
- `vehicle:unresponsive` — no heartbeat for 120s
- `incident:new` — new incident broadcast to admins
- `incident:status_update` — auto status change from simulation

### Analytics (:3004 via gateway :3000)
- `GET /analytics/dashboard` — summary snapshot
- `GET /analytics/sla?period` — SLA compliance
- `GET /analytics/peak-hours?period` — hourly breakdown
- `GET /analytics/incidents-by-region?period` — by Ghana region
- `GET /analytics/top-responders` — leaderboard
- `GET /analytics/response-times?period` — timing breakdown

### AI Agent (:3005 via gateway :3000)
- `GET /agent/status` — pipeline status
- `POST /agent/call/ingest` — upload audio file (multipart)
- `GET /agent/calls` — list sessions
- `GET /agent/calls/:id` — session detail
- `PUT /agent/calls/:id/review` — confirm + dispatch
- `POST /agent/calls/:id/replay` — re-run NLP extraction
