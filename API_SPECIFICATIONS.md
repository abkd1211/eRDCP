# 🚀 eRDCP Platform: API Specifications & Documentation

This document provides a comprehensive technical overview of the eRDCP (Emergency Response & Dispatch Coordination Platform) microservices architecture. It includes every endpoint, its purpose, authentication requirements, and data schemas.

## 🔗 Unified Documentation Hub
The entire platform's interactive API documentation (Swagger UI) is now consolidated at a single portal:
- **Unified Portal**: [https://erdcp-gateway.onrender.com/docs](https://erdcp-gateway.onrender.com/docs)

### How to use the Hub:
1. Open the [Unified Portal](https://erdcp-gateway.onrender.com/docs).
2. Use the **"Select a definition"** dropdown menu in the top bar to switch between services:
   - **Auth Service**: Identity, Users, and Roles.
   - **Incident Service**: Incident Lifecyle and Nearest Responder Selection.
   - **Dispatch & Tracking**: GPS Tracking (REST) and Vehicle Registry.
   - **Analytics & Monitoring**: Aggregated Dashboard and Heatmaps.
   - **AI Call Agent**: Audio-to-Incident ingestion pipeline.

---

## 🔐 1. Auth Service (:3001)
*Manages users, roles, and JWT lifecycle.*

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/auth/register` | Create a new system user | Public |
| POST | `/auth/login` | Returns `accessToken` & `refreshToken` | Public |
| POST | `/auth/refresh-token` | Rotate expired access tokens | Public |
| POST | `/auth/logout` | Revoke tokens & blacklist session | JWT |
| GET | `/auth/profile` | Retrieve own user data | JWT |
| GET | `/auth/users` | List all users (Paginated) | Admin |
| PUT | `/auth/users/:id/role`| Change a user's permissions | Admin |
| DELETE| `/auth/users/:id` | Deactivate/Delete user | Admin |

**Important Schermas**:
- **Role**: `SYSTEM_ADMIN`, `HOSPITAL_ADMIN`, `POLICE_ADMIN`, `FIRE_SERVICE_ADMIN`, `AMBULANCE_DRIVER`

---

## 🚑 2. Incident Service (:3002)
*Incident lifecycle & automatic nearest-responder selection.*

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/incidents` | Create incident & auto-dispatch | JWT |
| GET | `/incidents` | List all incidents (Filters: type, status) | JWT |
| GET | `/incidents/open` | View all active/dispatched cases | JWT |
| GET | `/incidents/:id` | View full history & timeline | JWT |
| PUT | `/incidents/:id/status`| Update: DISPATCHED → ON_SCENE → RESOLVED | JWT |
| GET | `/incidents/nearest/:lat/:lng/:type` | Query closest available unit | JWT |
| POST | `/responders` | Register a new hospital center/station | Admin |

**Logic**: Automatically calculates distance using the **Haversine Algorithm** to find which unit can reach the citizen fastest.

---

## 🛰️ 3. Dispatch & Tracking Service (:3003)
*Real-time GPS tracking and WebSocket communications.*

### Socket.io Events (Port 3003)
| Event | Direction | Description |
|---|---|---|
| `gps:ping` | Client → Server | Vehicle reports current coordinates |
| `location:update` | Server → Client | General broadcast of vehicle movement |
| `vehicle:arrived` | Server → Client | Proximity trigger when vehicle < 100m from incident |
| `route:deviation` | Server → Client | Warning if vehicle moves away from target |

### REST Endpoints
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/vehicles/register`| Register specialized vehicle & driver | Admin |
| GET | `/vehicles` | List all active vehicles & battery status | JWT |
| GET | `/vehicles/:id/location`| Get precise GPS history | JWT |
| POST | `/vehicles/:id/trip/complete`| Resolve trip & archive distance/speed data | JWT |

---

## 📊 4. Analytics & Monitoring Service (:3004)
*Aggregates data via RabbitMQ for operational insights.*

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/analytics/dashboard`| All metrics (Today/Week/Month) | JWT |
| GET | `/analytics/sla` | Response time compliance report | JWT |
| GET | `/analytics/peak-hours`| Incident volume vs. Time of day | JWT |
| GET | `/analytics/heatmap` | GPS clusters weighted by frequency | JWT |
| GET | `/analytics/top-responders`| Leaderboard (Speed, Success, Streaks) | JWT |

---

## 🤖 5. AI Agent Service (:3005)
*AI-powered call ingestion and extraction.*

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/agent/call/ingest` | Upload audio → Transcription → Extraction | Admin |
| GET | `/agent/calls` | List sessions pending AI verification | Admin |
| PUT | `/agent/calls/:id/review`| Manual correction of AI extraction | Admin |
| GET | `/agent/status` | Ingestion metrics (Confidence, Auto-Submit rate) | JWT |
| POST | `/agent/operator/online`| Mark admin as 'Live' for call takeover | Admin |
| POST | `/agent/call/simulate`| Test NLP extraction using text scripts | Admin |

**Languages Supported**: English, Twi (Akan), Ga, Hausa.
