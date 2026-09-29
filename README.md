<![CDATA[# 🛡️ MCMS Backend — Node.js API Server

> REST API backend for the **Multilingual Crisis Management System (MCMS)**.  
> Receives citizen-submitted crisis reports, proxies them through an AI/NLP micro-service, computes a multi-source credibility score, and feeds a real-time operations dashboard.

![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-5.2-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose_9-47A248?logo=mongodb&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/License-ISC-blue)

---

## 📖 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Endpoints](#api-endpoints)
- [Project Structure](#project-structure)
- [Credibility Engine](#credibility-engine)
- [External Intelligence](#external-intelligence)
- [Related Repositories](#related-repositories)
- [License](#license)

---

## Overview

This server acts as the **central orchestration layer** of the MCMS platform. It:

1. Accepts multilingual crisis reports from the public via the frontend.
2. Forwards each report to the [Python AI micro-service](../mcms-backend-py) for NLP classification (crisis type, message type, urgency) and named-entity extraction.
3. Geocodes extracted location names into map-ready coordinates.
4. Computes a **credibility score** by cross-referencing GDACS alerts, NewsAPI headlines, and similar reports already in the database.
5. Persists the enriched report to MongoDB and exposes it through RESTful endpoints consumed by the Next.js dashboard.

---

## Architecture

```
┌──────────────┐       ┌────────────────────┐       ┌──────────────────┐
│  Next.js     │──────▶│  Express API       │──────▶│  Python AI       │
│  Frontend    │  REST │  (this repo)       │  HTTP │  Micro-service   │
└──────────────┘       └────────┬───────────┘       └──────────────────┘
                                │
                   ┌────────────┼────────────┐
                   ▼            ▼            ▼
              MongoDB       GDACS API    NewsAPI
              (Reports)     (Alerts)     (Headlines)
```

---

## Key Features

| Feature | Description |
|---|---|
| **Report Ingestion** | Accepts free-text crisis messages with optional location; proxies to the AI service for classification & translation |
| **Credibility Scoring** | Multi-source scoring engine combining GDACS alerts, NewsAPI headlines, similar-report counts, AI confidence, and location presence |
| **GDACS Integration** | Real-time polling of the Global Disaster Alerting Coordination System (GDACS) GeoJSON feed with in-memory caching (5 min TTL) |
| **NewsAPI Integration** | Queries NewsAPI for corroborating disaster headlines; supports mock mode for offline development |
| **Geocoding** | Resolves extracted place names to latitude/longitude coordinates for interactive map rendering |
| **Responder Management** | CRUD endpoints for tracking emergency responder assignments per report |
| **Admin Authentication** | JWT-based admin login with protected routes for report management and status updates |
| **Health Check** | `GET /api/health` returns service and database connection status |
| **Graceful Shutdown** | Handles `SIGINT`/`SIGTERM` signals to cleanly close connections |
| **Request Logging** | Per-request HTTP logging with method, path, status code, and duration |
| **Input Validation** | Zod-based schema validation for all incoming request bodies |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ |
| Language | TypeScript 6.0 |
| Framework | Express 5.2 |
| Database | MongoDB via Mongoose 9 |
| Validation | Zod 4 |
| Auth | JSON Web Tokens (jsonwebtoken) |
| Linting | Biome |
| Dev Server | Nodemon + tsx |

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 20
- **MongoDB** running locally or a remote connection URI
- The [Python AI micro-service](../mcms-backend-py) running on port `8000` (default)

### Installation

```bash
# Clone the repository
git clone https://github.com/SandaruDulneth/mcms-backend-ts.git
cd mcms-backend-ts

# Install dependencies
npm install

# Copy the environment template and configure it
cp .env.example .env
# Edit .env with your values (see section below)

# Start in development mode (hot-reload via Nodemon)
npm run dev

# — OR — build and start for production
npm run build
npm start
```

The server starts on **`http://localhost:5000`** by default.

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | No | `development` | `development` or `production` |
| `PORT` | No | `5000` | Port the Express server listens on |
| `MONGODB_URI` | **Yes** | `mongodb://127.0.0.1:27017/mcms` | MongoDB connection string |
| `CLIENT_ORIGIN` | No | `http://localhost:3000` | Allowed CORS origin (the Next.js frontend) |
| `AI_SERVICE_URL` | **Yes** | `http://127.0.0.1:8000` | URL of the Python AI micro-service |
| `NEWS_API_KEY` | No | — | API key for [NewsAPI.org](https://newsapi.org) (enables credibility news check) |
| `EXTERNAL_INTEL_MOCK` | No | `false` | `true` to use mock GDACS + NewsAPI data for offline development |
| `EXTERNAL_INTEL_COUNTRY_NAME` | No | `Sri Lanka` | Target country for external intelligence |
| `EXTERNAL_INTEL_COUNTRY_ISO3` | No | `LKA` | ISO 3166-1 alpha-3 code for the target country |
| `ADMIN_USERNAME` | **Yes** | — | Admin panel login username |
| `ADMIN_PASSWORD` | **Yes** | — | Admin panel login password |
| `JWT_SECRET` | **Yes** | — | Secret key for signing JWT tokens |
| `LOG_STACKS` | No | `false` | `true` to include full error stack traces in development logs |

---

## API Endpoints

### Reports

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/reports` | List all reports (supports query filters) |
| `POST` | `/api/reports` | Submit a new crisis report |
| `GET` | `/api/reports/:id` | Get a single report by ID |

### Responders

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/reports/:reportId/responders` | List responders assigned to a report |
| `POST` | `/api/reports/:reportId/responders` | Assign a responder to a report |
| `DELETE` | `/api/reports/:reportId/responders/:id` | Remove a responder |

### Admin

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/admin/login` | Authenticate and receive a JWT |
| `PATCH` | `/api/admin/reports/:id/status` | Update a report's status (requires JWT) |
| `DELETE` | `/api/admin/reports/:id` | Delete a report (requires JWT) |

### External Intelligence

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/external-disasters` | Aggregated GDACS + NewsAPI disaster feed |

### System

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Service and database health check |

---

## Project Structure

```
mcms-backend-ts/
├── src/
│   ├── app.ts                  # Express app setup, middleware, route registration
│   ├── server.ts               # Server bootstrap, DB connection, graceful shutdown
│   ├── config/
│   │   ├── db.ts               # MongoDB connection via Mongoose
│   │   ├── env.ts              # Typed environment variable loader
│   │   └── logger.ts           # Structured logger
│   ├── controllers/
│   │   ├── adminController.ts  # Admin auth & report management
│   │   ├── reportController.ts # Report CRUD
│   │   ├── responderController.ts
│   │   └── externalDisasterController.ts
│   ├── errors/
│   │   ├── error-handler.ts    # Global error handler middleware
│   │   └── not-found.ts        # 404 catch-all
│   ├── middleware/              # Auth guards, validators
│   ├── models/
│   │   ├── userReportModel.ts  # Mongoose schema for crisis reports
│   │   └── responderModel.ts   # Mongoose schema for responders
│   ├── routes/
│   │   ├── adminRoutes.ts
│   │   ├── reportRoutes.ts
│   │   ├── responderRoutes.ts
│   │   └── externalDisasterRoutes.ts
│   ├── services/
│   │   ├── aiService.ts        # Proxy calls to the Python AI micro-service
│   │   ├── credibilityService.ts   # Multi-source credibility scoring engine
│   │   ├── externalDisasterService.ts  # Aggregated GDACS + NewsAPI feed
│   │   ├── gdacsService.ts     # GDACS GeoJSON API client with caching
│   │   ├── geocodingService.ts # Location name → lat/lng resolution
│   │   ├── reportService.ts    # Report business logic
│   │   └── responderService.ts
│   └── validations/            # Zod schemas for request validation
├── .env.example
├── nodemon.json
├── package.json
└── tsconfig.json
```

---

## Credibility Engine

The credibility service computes a score (0–100) for each report by combining:

| Signal | Max Points | Logic |
|---|---|---|
| **NewsAPI corroboration** | 30 | Matching headline found for the crisis type |
| **GDACS alert match** | 25 | Active GDACS event matches crisis type and location |
| **Similar reports** | 20 | ≥ 2 reports with same crisis type and location in last 48 h |
| **AI confidence** | 15 | Based on the AI model's classification confidence |
| **Location presence** | 10 | At least one location was extracted from the report |

**Score Labels:** `High` (≥ 75) · `Medium` (≥ 50) · `Low` (< 50)

---

## External Intelligence

### GDACS (Global Disaster Alerting Coordination System)

- Polls the live GDACS GeoJSON feed for earthquake, cyclone, flood, wildfire, volcano, and drought events.
- Filters events by the configured target country (default: Sri Lanka).
- Results are cached in memory for 5 minutes to reduce API load.
- Supports a mock mode (`EXTERNAL_INTEL_MOCK=true`) for offline development.

### NewsAPI

- Queries `newsapi.org/v2/everything` for recent disaster headlines matching the target country.
- Filters articles by disaster-related keywords (flood, earthquake, cyclone, etc.).
- Also used as a signal in the credibility scoring engine.

---

## Related Repositories

| Repository | Description |
|---|---|
| [mcms-frontend-ts](../mcms-frontend-ts) | Next.js 16 dashboard, crisis map, analytics, and public report submission |
| [mcms-backend-py](../mcms-backend-py) | FastAPI AI micro-service — 3-model NLP pipeline with multilingual translation |

---

## License

This project is licensed under the **ISC License**.
]]>
