# InnoLance / OwnWork — Freelancing Platform

A full-stack freelancing app: clients post work, freelancers bid, admins manage **enterprise RFPs** (email intake, AI micro-job suggestions, assembly Kanban). Money uses an **internal wallet**; **fixed-price hires** put funds in **escrow** until the client approves delivery (no Stripe required for that flow).

## Tech stack

| Layer | Stack |
|--------|--------|
| Frontend | React (Vite), React Router, Socket.io client, Axios |
| Backend | Node.js, Express, MongoDB (Mongoose), JWT, Socket.io |
| Optional | Stripe (milestone card flows), Google Gemini (micro-job suggestions), IMAP (RFP email intake) |

## Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)

## Quick start

```bash
# Backend
cd backend
npm install
# Copy and edit .env — at minimum MONGODB_URI, JWT_SECRET, PORT
npm run dev

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Default dev URLs are usually **frontend** `http://localhost:5173` and **API** `http://localhost:5000` (or whatever you set in `PORT`).

## Environment (backend)

Typical variables (names may vary; check `backend/.env.example` if present):

- `MONGODB_URI` — Mongo connection string  
- `JWT_SECRET` — signing secret for auth tokens  
- `PORT` — API port (frontend proxy should match)  
- `CLIENT_URL` — e.g. `http://localhost:5173` (CORS / Socket.io)  
- `GEMINI_API_KEY` — optional, for admin “suggest micro-jobs”  
- `IMAP_USER` / `IMAP_PASSWORD` — optional; starts Gmail listener for RFP emails  
- `RFP_INTAKE_BASE_URL` — optional; base URL for the listener to POST intake (defaults to `http://127.0.0.1:$PORT`)  
- `RFP_INTAKE_WEBHOOK_SECRET` — optional; required on `/api/enterprise-rfp/intake` when set  
- `ESCROW_AUTO_RELEASE_INTERVAL_MS` — optional; if ≥ `60000`, runs in-process auto-release check on that interval  
- `ESCROW_AUTO_RELEASE_DAYS` — days in review before auto-release (default `7`; used by cron script below)

## Useful scripts

| Command | Purpose |
|---------|---------|
| `cd backend && npm run dev` | Run API with watch |
| `cd frontend && npm run dev` | Run Vite dev server |
| `node backend/src/scripts/escrowAutoRelease.js` | Cron-friendly job: auto-release escrow for stale `in_review` projects |

## Main features (short)

- **Roles:** admin, client, freelancer (JWT).  
- **Projects & proposals:** posting, proposals, accept. **Fixed-price:** funds move to client **escrow**; freelancer is paid after **approve delivery** (or auto-release after the configured review window). **Hourly:** wallet rules differ (time entries).  
- **Enterprise RFP:** email → intake webhook → enterprise project; admin **project builder**, **assembly** Kanban, bulk publish micro-jobs to marketplace projects.  
- **Assessments:** optional per-project quizzes before proposals.  
- **Wallet:** demo top-up / withdraw; transaction history.  
- **Real-time:** Socket.io for notifications/messages (connect dev Socket to API port if not using Vite proxy).

## Repo layout

```
backend/src/   — Express app, routes, models, services (e.g. escrow), scripts
frontend/src/  — React pages, components, contexts
```

