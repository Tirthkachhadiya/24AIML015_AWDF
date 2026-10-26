# Tirth Kachhadiya — React Portfolio (CHARUSAT AIML)

A multi-practical full-stack portfolio application built progressively through Practicals 1–11 of the IBM Web Development with React curriculum at CHARUSAT.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, React Router v7, Vite 8 |
| Backend | Node.js, Express 5, Mongoose 9 |
| Database | MongoDB (local) |
| Auth | bcryptjs, jsonwebtoken (JWT) |
| Styling | Vanilla CSS (glassmorphism, CSS variables) |

---

## Practical 8 — Performance Optimization & Lazy Loading

### Objective
Implement route-based code splitting using `React.lazy()` and `Suspense` to reduce initial bundle size and improve perceived load performance.

---

### Before Optimization (Practical 7 — Static Imports)

All route components were imported statically at the top of `App.jsx`:

```js
import Home        from './components/Home';
import Projects    from './components/Projects';
import TaskManager from './components/TaskManager';
import Contact     from './components/Contact';
import AuthPage    from './components/AuthPage';
import NotFound    from './components/NotFound';
```

**Build output (single monolithic bundle):**

```
dist/assets/index-B180noEl.js   298.27 kB │ gzip: 91.94 kB
```

| Metric | Value |
|---|---|
| Bundle files | **1** |
| Total JS size | **298.27 kB** |
| Gzip size | **91.94 kB** |
| Routes loaded upfront | **All 6** (even if user only visits `/`) |

---

### After Optimization (Practical 8 — React.lazy + Suspense)

Each route component was converted to a dynamic import with `React.lazy()`:

```js
import { lazy, Suspense } from 'react';

const Home        = lazy(() => import('./components/Home'));
const Projects    = lazy(() => import('./components/Projects'));
const TaskManager = lazy(() => import('./components/TaskManager'));
const Contact     = lazy(() => import('./components/Contact'));
const AuthPage    = lazy(() => import('./components/AuthPage'));
const NotFound    = lazy(() => import('./components/NotFound'));
```

Each route is wrapped in its own `<Suspense>` with a `<LazyFallback>` component:

```jsx
<Suspense fallback={<LazyFallback pageName="Projects" minDelay={300} />}>
  <Projects projectsData={projectsData} />
</Suspense>
```

**Build output (10 separate chunks):**

```
dist/assets/NotFound-zy1qrL-s.js        0.61 kB │ gzip:  0.34 kB
dist/assets/ErrorMessage-Je3NA0G0.js    0.75 kB │ gzip:  0.39 kB
dist/assets/api-PhbJuKmz.js             1.60 kB │ gzip:  0.62 kB
dist/assets/Projects--dw4tPXw.js        3.38 kB │ gzip:  1.38 kB
dist/assets/Contact-B_KBI699.js         3.48 kB │ gzip:  1.22 kB
dist/assets/AuthPage-By4O--WN.js        4.82 kB │ gzip:  1.74 kB
dist/assets/Home-CTj6zyLe.js            9.64 kB │ gzip:  2.72 kB
dist/assets/TaskManager-BJWtNBJs.js    16.06 kB │ gzip:  4.42 kB
dist/assets/index-C01HljTm.js         268.33 kB │ gzip: 85.17 kB
```

| Metric | Before | After | Change |
|---|---|---|---|
| Main bundle | **298.27 kB** | **268.33 kB** | −10% |
| Gzip size | **91.94 kB** | **85.17 kB** | −7.4% |
| Bundle files | **1** | **10** | +9 chunks |
| Routes lazy | **0** | **6** | ✅ |
| Initial load (user on `/`) | **298 kB** | **~278 kB** (main + Home chunk) | **−7%** |
| User on `/` only — never loads | — | Projects, Tasks, Contact, Auth, NotFound | **Saved ~38 kB** |

> **Key insight:** The main bundle reduction alone understates the benefit. A user who only visits the Home page now downloads **268 kB + 9.6 kB (Home chunk) = ~278 kB** instead of the full **298 kB** which included all route code regardless of visit.

---

### Code Architecture (After)

```
main.js (268 kB)
  ├── NavBar       → always loaded (every page needs it)
  ├── Footer       → always loaded
  ├── LazyFallback → always loaded (needed before chunks arrive)
  └── Toast        → always loaded

Route Chunks (on-demand):
  ├── /           → Home.chunk.js       (9.6 kB)
  ├── /projects   → Projects.chunk.js   (3.4 kB)
  ├── /tasks      → TaskManager.chunk.js (16 kB)
  ├── /contact    → Contact.chunk.js    (3.5 kB)
  ├── /auth       → AuthPage.chunk.js   (4.8 kB)
  └── *           → NotFound.chunk.js   (0.6 kB)

Shared (auto-split by Vite):
  ├── api.chunk.js          (1.6 kB)
  └── ErrorMessage.chunk.js (0.75 kB)
```

---

### Supplementary Problems Completed

#### 1. Minimum-Delay Fallback (300ms anti-flicker)
`LazyFallback.jsx` uses `useEffect` + `setTimeout(300)` to prevent a flash of the loading state on fast connections:
```js
useEffect(() => {
  const timer = setTimeout(() => setShow(true), minDelay); // minDelay = 300ms
  return () => clearTimeout(timer);
}, [minDelay]);
```

#### 2. Performance Panel (in-app before/after evidence)
`PerformancePanel.jsx` on the Home page shows:
- Static before/after bundle size cards
- Live chunk download table (via `performance.getEntriesByType('resource')`)
- Navigation Timing API metrics (DOMContentLoaded, Load event)
- Real-time `PerformanceObserver` that updates as the user navigates to new routes

#### 3. React DevTools Profiler — Unnecessary Re-render Identified
**Location:** `TaskManager.jsx` — the `renderTaskCard` function is recreated on every render because it is defined inline inside the component body.
**Fix applied (post-lab):** This could be memoized with `useCallback` for a production app. For this lab, the issue was identified and documented.

---

### Key Questions — Analysis

**Q: What is the difference between the initial bundle and a lazy-loaded chunk?**
The initial bundle (`index.js`) is downloaded immediately when the browser parses `index.html`. A lazy chunk (`Projects.chunk.js`) is downloaded only when the user first navigates to `/projects`. Both are cached by the browser after first download.

**Q: Why does lazy loading improve perceived performance even though total code is the same?**
Because the browser and user only wait for what they immediately need. A user who opens the home page does not need to parse `TaskManager.js` (16 kB). By deferring that download, the browser starts rendering sooner — the Time To Interactive (TTI) improves even though the total code downloaded across a full session stays the same.

**Q: When would lazy loading NOT be worth it?**
For very small apps (< 50 kB total), the network overhead of multiple chunk requests can exceed the savings from splitting. The added complexity of Suspense + fallback UI also increases code surface area with minimal gain.

---

## Running the Project

```bash
# Start backend (task-manager-api)
cd task-manager-api
npm start
# → http://localhost:5000

# Start frontend (Myportfolio)
cd Myportfolio
npm run dev
# → http://localhost:5173
```

---

## Practicals Implemented

| Practical | Topic | Status |
|---|---|---|
| P1–P4 | React Router, useState, useEffect, Controlled Forms | ✅ |
| P5 | GitHub REST API fetching with useEffect | ✅ |
| P6 | Full-Stack Task Manager (Express + MongoDB CRUD) | ✅ |
| P7 | JWT Authentication + bcrypt + Auth Middleware Pipeline | ✅ |
| P8 | React.lazy(), Suspense, Code Splitting, Bundle Optimization | ✅ |
| P9 | In-Memory Caching (node-cache), Cache Invalidation, /cache/stats | ✅ |
| P10 | Async Processing, EventEmitter, Job Queue, SSE Stream, Event Log | ✅ |
| P11 | Docker, Dockerfile (multi-stage), docker-compose.yml, Named Volume | ✅ |

---

## Practical 10 — Asynchronous Processing with Event-Driven Architecture

### Objective
Implement server-side event-driven processing using Node.js `EventEmitter`, an async job queue with background workers, Server-Sent Events (SSE) for real-time frontend updates, and an in-memory audit event log.

---

### Architecture

```
HTTP Request (POST/PUT/DELETE /tasks)
    │
    ▼
Route Handler ──► MongoDB write
    │
    ▼
eventBus.emit('task:created')  ← non-blocking
    │
    ├──► eventLog.js (Observer 1) → records to in-memory audit log → GET /events
    ├──► jobQueue.js (Observer 2) → queues 2-3 async background jobs
    │         │
    │         └──► email_notification  (~800ms delay) → job:done
    │         └──► audit_log_write     (~300ms delay) → job:done
    │         └──► webhook_dispatch    (~1200ms delay) → job:done
    └──► SSE Broadcast (Observer 3) → pushes named event to all EventSource clients
```

### New Files

| File | Purpose |
|---|---|
| `eventBus.js` | Singleton `EventEmitter` — application-wide event bus |
| `jobQueue.js` | In-memory async job queue with 4 job types and 5% simulated failure |
| `eventLog.js` | Observer — listens to all events, records to circular audit log |

### New API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/events/stream` | GET | SSE stream (persistent connection, named events) |
| `/events` | GET | Audit log REST endpoint |
| `/events/reset` | POST | Flush event log |
| `/jobs` | GET | Job queue status |
| `/jobs/reset` | POST | Flush job queue |

### Event Flow (Live Test Output)

```
POST /tasks → status: created, events_emitted: [task:created], jobs_queued: 3

 Event Log (2s later):
  id  event         timestamp
   1  task:created  2026-10-26T11:21:28.685Z
   2  job:queued    2026-10-26T11:21:28.685Z
   3  job:queued    2026-10-26T11:21:28.686Z
   4  job:queued    2026-10-26T11:21:28.686Z
   5  job:done      2026-10-26T11:21:28.993Z  ← audit_log_write (300ms)
   6  job:done      2026-10-26T11:21:29.487Z  ← email_notification (800ms)
   7  job:done      2026-10-26T11:21:29.892Z  ← webhook_dispatch (1200ms)

 Job Queue Stats: { total: 3, done: 3, failed: 0 }
```

### Key Analysis Q&A

**Q: Why is the HTTP response returned before the jobs finish?**  
A: `createJob()` calls `processJob()` without `await`. Inside `processJob`, `setImmediate` yields back to the event loop, allowing the HTTP response to be sent first. The job then processes on subsequent event loop ticks.

**Q: What is the Observer Pattern here?**  
A: `eventBus` is the Subject. Route handlers emit events without knowing who listens. `eventLog`, `jobQueue`, and the SSE broadcast are three independent Observers — fully decoupled from the route handler.

**Q: Why use SSE instead of WebSocket?**  
A: SSE is one-directional (server → client), simpler to implement, works over HTTP/2, and automatically reconnects. WebSocket is bidirectional (needed for chat apps). For read-only event streams, SSE is the correct choice.

**Q: Why is EventEmitter NOT suitable for multi-server deployment?**  
A: `EventEmitter` is process-local — it only delivers events within the same Node.js process. In a horizontally-scaled system (multiple server instances), events emitted on server A are invisible to server B. Production systems use a shared message broker (RabbitMQ, Apache Kafka, BullMQ + Redis) for cross-process event delivery.

---

## Practical 11 — Containerization with Docker and Docker Compose

### 🚀 Run the Entire Stack (One Command)

```bash
# From d:\AWDF (project root where docker-compose.yml lives)
docker-compose up --build
```

| URL | Service |
|---|---|
| http://localhost:5173 | React Frontend (Vite preview) |
| http://localhost:5000 | Node/Express Backend API |
| localhost:27017 | MongoDB (connect via Compass) |

### Other Useful Commands

```bash
# Start in detached (background) mode
docker-compose up --build -d

# View running containers
docker ps

# View logs for a specific service
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f mongodb

# Stop all services (keeps named volume)
docker-compose down

# Stop AND delete the named mongo-data volume (WARNING: deletes all task data)
docker-compose down -v

# Rebuild a single service
docker-compose up --build backend
```

### Architecture

```
docker-compose.yml (d:\AWDF\)
  ├── mongodb   ── mongo:7 image ── port 27017 ── volume: mongo-data
  ├── backend   ── node:18-alpine ─ port 5000  ── MONGO_URI: mongodb://mongodb:27017/taskmanager
  └── frontend  ── node:18-alpine ─ port 5173  ── multi-stage build (builder → runner)

Network: app-network (bridge)
  frontend ►► (browser calls) localhost:5000 ►► backend ►► mongodb (service name)
```

### New Files

| File | Location | Purpose |
|---|---|---|
| `Dockerfile` | `task-manager-api/` | Backend container — node:18-alpine, cache-ordered layers |
| `.dockerignore` | `task-manager-api/` | Excludes node_modules, .env, .git |
| `Dockerfile` | `Myportfolio/` | Frontend — multi-stage: builder → runner |
| `.dockerignore` | `Myportfolio/` | Excludes node_modules, dist, .env |
| `docker-compose.yml` | `d:\AWDF/` | Orchestrates all 3 services |

### Key Analysis Q&A

**Q: Why does the backend use `mongodb://mongodb:27017` not `localhost`?**  
A: Inside a container, `localhost` refers to that container’s own loopback interface. MongoDB is in a separate container. Docker’s internal DNS on `app-network` resolves the service name `mongodb` to the correct container IP. Using `localhost` would fail with a connection refused error.

**Q: What is the difference between `EXPOSE` in a Dockerfile and `ports` in docker-compose.yml?**  
A: `EXPOSE` is documentation only — it records which port the container *intends* to listen on but does not publish it to the host. The `ports` mapping in docker-compose.yml (`"5000:5000"`) actually binds host port 5000 to container port 5000, making it reachable from the browser.

**Q: Why is copying `node_modules` from the host into the image bad practice?**  
A: `node_modules` may contain platform-specific native binaries (compiled for Windows/macOS). These will not run inside a Linux container. Additionally, the host’s node_modules can be enormous (~300 MB) and slow the build context upload. Always run `npm install` inside the container (handled automatically by excluding node_modules via `.dockerignore`).

### Supplementary Features Implemented

- ✅ `.dockerignore` for both backend and frontend
- ✅ Multi-stage build for the React frontend (builder → runner stages)
- ✅ Named volume `mongo-data` for MongoDB data persistence across restarts
- ✅ MongoDB healthcheck with `depends_on: condition: service_healthy`

---

*Student: Tirth Kachhadiya | 24aiml015@charusat.edu.in | CHARUSAT 2026*
