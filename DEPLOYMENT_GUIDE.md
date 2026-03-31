# 📦 Deployment Guide: eRDCP Platform (Microservices)

This document provides a comprehensive step-by-step guide to deploying the eRDCP platform from a local development environment into a production-ready cloud architecture.

---

## 1. Prerequisites (Cloud Managed Services)
Before deploying the code, you must set up the following "Infrastructure-as-a-Service" (IaaS) components:

### 🗄️ Databases
1. **MongoDB Atlas (NoSQL)**: 
   - Create a free cluster (Cluster 0).
   - Create a database user (e.g., `erdcp_admin`).
   - Get the connection string (`MONGODB_URI`).
2. **Neon/Supabase (SQL/Prisma)**:
   - Instantiate a PostgreSQL database for the Auth and Incident services.
   - Get the `DATABASE_URL`.

### 📩 Message Broker & Caching
1. **CloudAMQP (RabbitMQ)**:
   - Create a free instance (Lemur).
   - Get the `RABBITMQ_URL`.
2. **Upstash/Redis Labs (Caching & Circuit Breaker)**:
   - Create a Redis instance.
   - Get the `REDIS_URL`.

---

## 2. Backend Deployment (Render.com)

### Step 1: GitHub Connection
1. Push your code to a GitHub repository.
2. In **Render.com**, click `New` → `Web Service`.
3. Connect your repository.

### Step 2: Individual Service Setup
You must create **6 separate Web Services** on Render:

| Service Name | Root Directory | Build Command | Start Command |
|---|---|---|---|
| API Gateway | `/api-gateway` | `npm install && npm run build` | `npm start` |
| Auth Service | `/services/auth-service` | `npm install && npm run build` | `npm run prisma:generate && npm start` |
| Incident Service| `/services/incident-service` | `npm install && npm run build` | `npm run prisma:generate && npm start` |
| Dispatch Service| `/services/dispatch-service` | `npm install && npm run build` | `npm start` |
| Analytics Service| `/services/analytics-service` | `npm install && npm run build` | `npm start` |
| AI Agent Service| `/services/ai-agent-service` | `npm install && npm run build` | `npm start` |

### Step 3: Critical Environment Variables
All services require:
- `NODE_ENV=production`
- `INTERNAL_SERVICE_SECRET=a8d5...` (Must be identical across all services)
- `JWT_ACCESS_SECRET` (Must be identical between Auth and Gateway)

---

## 3. Frontend Deployment (Vercel)

### Step 1: Connect to GitHub
- In Vercel, import the repository.
- Set the **Root Directory** to `/erdcp-frontend`.

### Step 2: Environment Variables
Map the following in the Vercel dashboard:
- `NEXT_PUBLIC_API_URL`: **The public URL of your Render API Gateway** (e.g., `https://erdcp-gateway.onrender.com`).
- `NEXT_PUBLIC_SOCKET_URL`: **The public URL of your Dispatch Service** (e.g., `https://erdcp-dispatch.onrender.com`).

### Step 3: Verify Domain
The frontend is already configured to live at: [https://e-rdcp.vercel.app/](https://e-rdcp.vercel.app/)

---

## 4. Verification Checklist (Post-Deployment)
1. **Auth Check**: Can you register a user? (Verification that Auth Service + Prisma + Postgres are talking).
2. **Socket Check**: Open the Dispatch map. Do you see "Searching for signal"? (Verification that Socket.io is connected).
3. **AI Check**: Upload an audio file. Does a 503 error appear? (Wait for Gateway circuit reset if the AI boot was slow).
4. **RabbitMQ Check**: Does an incident created in the `incident-service` appear in the `analytics-service`? (Verification of the asynchronous message bus).
