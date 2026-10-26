/**
 * server.js — Task Manager API
 *
 * Practical History:
 *   P6  — Express CRUD + MongoDB + Mongoose
 *   P7  — JWT Authentication + bcrypt + Auth Middleware Pipeline
 *   P9  — In-Memory Caching with node-cache + Cache Invalidation
 *   P10 — Asynchronous Processing with Event-Driven Architecture
 *
 * Practical 10 — Key Implementation Detail (spec requirement):
 *
 *   Inside each write route (POST/PUT/DELETE), the order is:
 *     1. Save/update/delete in MongoDB
 *     2. console.log('[API] Response sent at ...') — timestamp BEFORE emit
 *     3. res.status(201).json(...)                 — HTTP response to client
 *     4. taskEvents.emit('task-created', task)      — emit AFTER response
 *
 *   Why emit AFTER res.json()?
 *     Pedagogically: it makes the "response before handler" ordering unmistakable
 *     in the console. Even though emit() is synchronous (calls listeners inline),
 *     the listeners use setTimeout(2000ms) to defer their console.log — so the
 *     [API] timestamp always appears before the [Notification] timestamp.
 *
 *   Console Evidence:
 *     [API] ✅ Response sent at 2026-10-26T11:21:28.685Z   ← line 1
 *     ... (2 seconds pass) ...
 *     [Notification] Task "My Task" created at 2026-10-26T11:21:30.687Z ← line 2
 */

require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const mongoose  = require('mongoose');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');

const Task           = require('./models/Task');
const User           = require('./models/User');
const authMiddleware = require('./middleware/auth');

// [P9] Caching
const { cache, cacheStats } = require('./cache');

// [P10] Events module (spec-prescribed: events.js + listeners.js)
const taskEvents = require('./events');

// [P10] CRITICAL: Register all listeners BEFORE any route can emit.
// listeners.js calls taskEvents.on(...) — if not required, events silently do nothing.
require('./listeners');

// [P10] Advanced: SSE broadcast + job queue (supplementary — from eventBus)
// These extend the basic EventEmitter pattern with SSE real-time streaming.
const { createJob, getJobs, clearJobs } = require('./jobQueue');
const { getLog, clearLog } = require('./eventLog');
require('./eventLog'); // register eventLog observers

// Forward events from taskEvents → eventLog / SSE (bridge between basic + advanced)
const { EventEmitter } = require('events');

const app          = express();
const PORT         = process.env.PORT || 5000;
const MONGO_URI    = process.env.MONGO_URI    || 'mongodb://127.0.0.1:27017/taskmanager';
const JWT_SECRET   = process.env.JWT_SECRET   || 'supersecretjwtkey_2026_aiml';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';

// ── Global Middleware ─────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());

// Request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Content-Type validator for POST & PUT
app.use((req, res, next) => {
  if (['POST', 'PUT'].includes(req.method)) {
    if (req.url.startsWith('/events') || req.url.startsWith('/jobs') || req.url.startsWith('/cache')) return next();
    const ct = req.headers['content-type'];
    if (!ct || !ct.includes('application/json')) {
      return res.status(400).json({ error: 'Bad Request', message: 'Content-Type header must be application/json' });
    }
  }
  next();
});

// ── MongoDB Connection ────────────────────────────────────────────────────────

let isDbConnected = false;

mongoose.connect(MONGO_URI)
  .then(() => { isDbConnected = true; console.log('✅ MongoDB connected successfully via Mongoose'); })
  .catch((err) => {
    console.warn('⚠️ MongoDB Connection Notice:', err.message);
    console.warn('⚠️ Server will operate with in-memory fallback.');
  });

// Fallback stores
let inMemoryUsers = [];
let inMemoryTasks = [
  { _id: '650000000000000000000001', title: 'Setup React Portfolio',    description: 'Vite portfolio',                 completed: true,  status: 'completed', priority: 'high',   createdAt: new Date() },
  { _id: '650000000000000000000002', title: 'Implement React Router',   description: 'Multi-page SPA routing',         completed: true,  status: 'completed', priority: 'medium', createdAt: new Date() },
  { _id: '650000000000000000000003', title: 'Fetch REST API Data',      description: 'GitHub API fetching',            completed: true,  status: 'completed', priority: 'medium', createdAt: new Date() },
  { _id: '650000000000000000000004', title: 'Practical 7 JWT Auth',     description: 'JWT auth & bcrypt pipeline',     completed: true,  status: 'completed', priority: 'high',   createdAt: new Date() },
  { _id: '650000000000000000000005', title: 'Practical 8 Lazy Loading', description: 'React.lazy() code splitting',   completed: true,  status: 'completed', priority: 'high',   createdAt: new Date() },
  { _id: '650000000000000000000006', title: 'Practical 9 Caching',      description: 'node-cache in-memory caching',  completed: true,  status: 'completed', priority: 'high',   createdAt: new Date() },
  { _id: '650000000000000000000007', title: 'Practical 10 Event Bus',   description: 'EventEmitter async job queue',  completed: false, status: 'ongoing',   priority: 'high',   createdAt: new Date() }
];

const handleAsyncError = (err, res, next) => {
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: 'Validation Error', messages: Object.values(err.errors).map(e => e.message) });
  }
  if (err.name === 'CastError') {
    return res.status(404).json({ error: 'Not Found', message: `Invalid ID format: ${err.value}` });
  }
  next(err);
};

// ── [P9] Cache Keys ───────────────────────────────────────────────────────────

const CACHE_KEY_ALL_TASKS = 'all_tasks';
const taskCacheKey = (id) => `task_${id}`;

const invalidateTaskCaches = (taskId = null) => {
  cache.del(CACHE_KEY_ALL_TASKS);
  if (taskId) cache.del(taskCacheKey(taskId));
  cacheStats.recordInvalidation();
  console.log(`[CACHE] 🗑️  Invalidated: all_tasks${taskId ? ` + task_${taskId}` : ''}`);
};

// ── [P10] SSE Clients ─────────────────────────────────────────────────────────

const sseClients = new Set();

function broadcastSSE(eventName, data) {
  const payload = `event: ${eventName}\ndata: ${JSON.stringify({ event: eventName, timestamp: new Date().toISOString(), data })}\n\n`;
  sseClients.forEach(client => {
    try { client.write(payload); } catch { sseClients.delete(client); }
  });
}

// Bridge taskEvents → SSE broadcast for frontend real-time updates
['task-created', 'task-deleted', 'task-updated'].forEach(ev => {
  taskEvents.on(ev, (payload) => broadcastSSE(ev, payload));
});

// ── [P10] SSE Stream Endpoint ─────────────────────────────────────────────────

app.get('/events/stream', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  sseClients.add(res);
  console.log(`[SSE] 🔌 Client connected. Total: ${sseClients.size}`);
  res.write(`event: connected\ndata: ${JSON.stringify({ message: 'SSE stream connected', clients: sseClients.size })}\n\n`);

  const heartbeat = setInterval(() => {
    try { res.write(':heartbeat\n\n'); } catch { clearInterval(heartbeat); }
  }, 15000);

  req.on('close', () => {
    sseClients.delete(res);
    clearInterval(heartbeat);
    console.log(`[SSE] 🔌 Client disconnected. Total: ${sseClients.size}`);
  });
});

// ── [P10] Event Log & Job Queue Endpoints ─────────────────────────────────────

app.get('/events', (req, res) => {
  const limit  = parseInt(req.query.limit)  || 50;
  const filter = req.query.filter           || null;
  res.status(200).json({ status: 'success', message: 'Practical 10 — Event audit log', ...getLog(limit, filter) });
});

app.post('/events/reset', (req, res) => {
  clearLog();
  res.status(200).json({ status: 'success', message: 'Event log cleared' });
});

app.get('/jobs', (req, res) => {
  res.status(200).json({ status: 'success', message: 'Practical 10 — Async job queue', ...getJobs() });
});

app.post('/jobs/reset', (req, res) => {
  clearJobs();
  res.status(200).json({ status: 'success', message: 'Job queue cleared' });
});

// ── AUTHENTICATION (P7) ───────────────────────────────────────────────────────

const validateAuthInput = (req, res, next) => {
  const { email, password } = req.body;
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Bad Request', message: 'A valid email address is required' });
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Bad Request', message: 'Password is required and must be at least 6 characters long' });
  }
  next();
};

app.post('/register', validateAuthInput, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (isDbConnected && mongoose.connection.readyState === 1) {
      const existing = await User.findOne({ email: email.toLowerCase().trim() });
      if (existing) return res.status(400).json({ error: 'Bad Request', message: 'An account with this email already exists' });
      const hash = await bcrypt.hash(password, 10);
      const user = await User.create({ email: email.toLowerCase().trim(), password: hash });
      return res.status(201).json({ status: 'success', message: 'User registered successfully', data: { id: user._id, email: user.email } });
    }
    const ex2 = inMemoryUsers.find(u => u.email === email.toLowerCase().trim());
    if (ex2) return res.status(400).json({ error: 'Bad Request', message: 'An account with this email already exists' });
    const hash2 = await bcrypt.hash(password, 10);
    const u2    = { _id: new mongoose.Types.ObjectId().toString(), email: email.toLowerCase().trim(), password: hash2, createdAt: new Date() };
    inMemoryUsers.push(u2);
    res.status(201).json({ status: 'success', message: 'User registered successfully', data: { id: u2._id, email: u2.email } });
  } catch (err) { handleAsyncError(err, res, next); }
});

app.post('/login', validateAuthInput, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const userObj = isDbConnected && mongoose.connection.readyState === 1
      ? await User.findOne({ email: email.toLowerCase().trim() })
      : inMemoryUsers.find(u => u.email === email.toLowerCase().trim());
    if (!userObj) return res.status(401).json({ error: 'Unauthorized', message: 'Invalid email or password' });
    const ok = await bcrypt.compare(password, userObj.password);
    if (!ok) return res.status(401).json({ error: 'Unauthorized', message: 'Invalid email or password' });
    const token = jwt.sign({ id: userObj._id, email: userObj.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.status(200).json({ status: 'success', message: 'Authentication successful', token, user: { id: userObj._id, email: userObj.email } });
  } catch (err) { handleAsyncError(err, res, next); }
});

app.get('/me', authMiddleware, (req, res) => {
  res.status(200).json({ status: 'success', user: req.user });
});

// [P9] Cache debug
app.get('/cache/stats', (req, res) => {
  res.status(200).json({
    status: 'success', message: 'Practical 9 — Cache statistics',
    cache: cacheStats.getStats(),
    node_cache_info: { keys: cache.keys(), stats: cache.getStats() }
  });
});

app.post('/cache/reset', (req, res) => {
  cacheStats.reset();
  cache.flushAll();
  res.status(200).json({ status: 'success', message: 'Cache flushed and counters reset' });
});

// ── Middleware ────────────────────────────────────────────────────────────────

const validateTaskInput = (req, res, next) => {
  if (req.method === 'POST') {
    const { title } = req.body;
    if (!title || typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({ error: 'Bad Request', message: 'Task title is required and cannot be empty' });
    }
  }
  next();
};

const flexibleAuthMiddleware = (req, res, next) => {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return authMiddleware(req, res, next);
  if (req.method === 'GET') return next();
  return authMiddleware(req, res, next);
};

// ── TASK CRUD ENDPOINTS ───────────────────────────────────────────────────────

// GET /tasks — [P9] cache, no event
app.get('/tasks', flexibleAuthMiddleware, async (req, res, next) => {
  try {
    const cached = cache.get(CACHE_KEY_ALL_TASKS);
    if (cached) {
      cacheStats.recordHit();
      console.log('[CACHE] ✅ HIT  → all_tasks');
      return res.status(200).json({
        status: 'success', count: cached.length, source: 'Cache', cached: true,
        cache_ttl_remaining: cache.getTtl(CACHE_KEY_ALL_TASKS)
          ? Math.round((cache.getTtl(CACHE_KEY_ALL_TASKS) - Date.now()) / 1000) + 's'
          : 'unknown',
        data: cached
      });
    }
    cacheStats.recordMiss();
    console.log('[CACHE] ❌ MISS → all_tasks');
    if (isDbConnected && mongoose.connection.readyState === 1) {
      const tasks = await Task.find().sort({ createdAt: -1 });
      cache.set(CACHE_KEY_ALL_TASKS, tasks);
      return res.status(200).json({ status: 'success', count: tasks.length, source: 'MongoDB', cached: false, data: tasks });
    }
    cache.set(CACHE_KEY_ALL_TASKS, inMemoryTasks);
    res.status(200).json({ status: 'success', count: inMemoryTasks.length, source: 'InMemoryFallback', cached: false, data: inMemoryTasks });
  } catch (err) { handleAsyncError(err, res, next); }
});

// GET /tasks/:id — [P9] per-task cache
app.get('/tasks/:id', flexibleAuthMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const key    = taskCacheKey(id);
    const cached = cache.get(key);
    if (cached) {
      cacheStats.recordHit();
      return res.status(200).json({ status: 'success', source: 'Cache', cached: true, data: cached });
    }
    cacheStats.recordMiss();
    if (isDbConnected && mongoose.connection.readyState === 1) {
      const task = await Task.findById(id);
      if (!task) return res.status(404).json({ error: 'Not Found', message: `Task ${id} does not exist` });
      cache.set(key, task);
      return res.status(200).json({ status: 'success', source: 'MongoDB', cached: false, data: task });
    }
    const task = inMemoryTasks.find(t => t._id === id || String(t._id) === id);
    if (!task) return res.status(404).json({ error: 'Not Found', message: `Task ${id} does not exist` });
    cache.set(key, task);
    res.status(200).json({ status: 'success', source: 'InMemoryFallback', cached: false, data: task });
  } catch (err) { handleAsyncError(err, res, next); }
});

/**
 * POST /tasks — Create task
 *
 * [P10] Emit order (SPEC REQUIREMENT — proof of non-blocking):
 *
 *   Step 1: Save to MongoDB / fallback store
 *   Step 2: [P9] Invalidate cache
 *   Step 3: console.log('[API] Response sent at ...')  ← TIMESTAMP 1
 *   Step 4: res.status(201).json(savedTask)            ← HTTP response to client
 *   Step 5: taskEvents.emit('task-created', savedTask) ← EMIT AFTER response
 *
 *   The listener (in listeners.js) uses setTimeout(2000ms), so:
 *   TIMESTAMP 1 appears in console ~2 seconds BEFORE the [Notification] log.
 *   This is the empirical proof of non-blocking async execution.
 */
app.post('/tasks', flexibleAuthMiddleware, validateTaskInput, async (req, res, next) => {
  try {
    const { title, description, completed, priority, status } = req.body;
    let taskStatus  = status || (completed ? 'completed' : 'pending');
    let isCompleted = completed !== undefined ? Boolean(completed) : taskStatus === 'completed';

    let savedTask;
    if (isDbConnected && mongoose.connection.readyState === 1) {
      const t  = new Task({ title, description, completed: isCompleted, status: taskStatus, priority });
      savedTask = await t.save();
    } else {
      savedTask = {
        _id: new mongoose.Types.ObjectId().toString(),
        title: title.trim(),
        description: description ? String(description).trim() : '',
        completed: isCompleted, status: taskStatus,
        priority: priority || 'medium', createdAt: new Date()
      };
      inMemoryTasks.unshift(savedTask);
    }

    // [P9] Invalidate cache
    invalidateTaskCaches();

    // ─── [P10] Spec-prescribed emit ordering ───────────────────────────
    // STEP 3 — log API response timestamp BEFORE emitting
    const apiTimestamp = new Date().toISOString();
    console.log(`[API] ✅ Response sent at ${apiTimestamp} (emit will follow)`);

    // STEP 4 — Send HTTP response to client immediately
    res.status(201).json({
      status:  'created',
      message: 'Task created — event emitted after this response',
      p10_note: 'Check server console: [API] timestamp appears before [Notification] timestamp',
      data:    savedTask
    });

    // STEP 5 — Emit AFTER res.json() — client already received response
    // taskEvents.emit() is synchronous, but the listener uses setTimeout(2000ms)
    // so the [Notification] log appears 2 seconds AFTER the [API] log above.
    taskEvents.emit('task-created', savedTask);

    // [Supplementary] Also queue background jobs for extended monitoring
    createJob('email_notification', { title: savedTask.title, action: 'created', taskId: savedTask._id });
    createJob('audit_log_write',    { action: 'CREATE', taskId: savedTask._id, title: savedTask.title });
    createJob('webhook_dispatch',   { event: 'task.created', taskId: savedTask._id });

    if (isCompleted) {
      taskEvents.emit('task-updated', { ...savedTask, _completedOnCreate: true });
      createJob('completion_report', { taskId: savedTask._id, title: savedTask.title });
    }

  } catch (err) { handleAsyncError(err, res, next); }
});

/**
 * PUT /tasks/:id — Update task
 * [P10] Emits 'task-updated' AFTER response
 */
app.put('/tasks/:id', flexibleAuthMiddleware, validateTaskInput, async (req, res, next) => {
  try {
    const { id } = req.params;
    let updatedTask;
    let wasCompleted = false;

    if (isDbConnected && mongoose.connection.readyState === 1) {
      const before = await Task.findById(id);
      wasCompleted  = before && before.status === 'completed';
      updatedTask   = await Task.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
      if (!updatedTask) return res.status(404).json({ error: 'Not Found', message: `Task ${id} does not exist` });
    } else {
      const idx = inMemoryTasks.findIndex(t => String(t._id) === id);
      if (idx === -1) return res.status(404).json({ error: 'Not Found', message: `Task ${id} does not exist` });
      const cur = inMemoryTasks[idx];
      wasCompleted  = cur.status === 'completed';
      const ns = req.body.status || (req.body.completed !== undefined ? (req.body.completed ? 'completed' : 'pending') : cur.status || 'pending');
      updatedTask = { ...cur, title: req.body.title ?? cur.title, description: req.body.description ?? cur.description,
        completed: req.body.completed !== undefined ? Boolean(req.body.completed) : ns === 'completed',
        status: ns, priority: req.body.priority || cur.priority };
      inMemoryTasks[idx] = updatedTask;
    }

    invalidateTaskCaches(id);

    const apiTimestamp = new Date().toISOString();
    console.log(`[API] ✅ Response sent at ${apiTimestamp}`);

    res.status(200).json({ status: 'updated', message: 'Task updated — event emitted after response', data: updatedTask });

    // Emit AFTER response
    taskEvents.emit('task-updated', updatedTask);
    createJob('email_notification', { title: updatedTask.title, action: 'updated', taskId: id });
    createJob('audit_log_write',    { action: 'UPDATE', taskId: id, title: updatedTask.title });

    const nowCompleted = updatedTask.status === 'completed' || updatedTask.completed;
    if (nowCompleted && !wasCompleted) {
      createJob('completion_report', { taskId: id, title: updatedTask.title });
    }

  } catch (err) { handleAsyncError(err, res, next); }
});

/**
 * DELETE /tasks/:id — Delete task
 * [P10] Emits 'task-deleted' AFTER response (supplementary event)
 */
app.delete('/tasks/:id', flexibleAuthMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    let deletedTask;

    if (isDbConnected && mongoose.connection.readyState === 1) {
      deletedTask = await Task.findByIdAndDelete(id);
      if (!deletedTask) return res.status(404).json({ error: 'Not Found', message: `Task ${id} does not exist` });
    } else {
      const idx = inMemoryTasks.findIndex(t => String(t._id) === id);
      if (idx === -1) return res.status(404).json({ error: 'Not Found', message: `Task ${id} does not exist` });
      deletedTask = inMemoryTasks.splice(idx, 1)[0];
    }

    invalidateTaskCaches(id);

    const apiTimestamp = new Date().toISOString();
    console.log(`[API] ✅ Response sent at ${apiTimestamp}`);

    res.status(200).json({ status: 'deleted', message: 'Task deleted — task-deleted event emitted after response', data: deletedTask });

    // [P10 Supplementary] Emit task-deleted AFTER response
    taskEvents.emit('task-deleted', deletedTask);
    createJob('audit_log_write',  { action: 'DELETE', taskId: id, title: deletedTask.title });
    createJob('webhook_dispatch', { event: 'task.deleted', taskId: id });

  } catch (err) { handleAsyncError(err, res, next); }
});

// ── Error Handlers ────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', message: `Cannot ${req.method} ${req.url}` });
});

app.use((err, req, res, next) => {
  console.error('[GLOBAL_ERROR]', err.stack);
  res.status(500).json({ error: 'Internal Server Error', message: 'An unexpected server error occurred' });
});

// ── Start Server ──────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Task Manager API  (P7 JWT + P9 Cache + P10 Events)       ');
  console.log(`  http://localhost:${PORT}                                      `);
  console.log('───────────────────────────────────────────────────────────');
  console.log('  [P9]  Cache    → GET /cache/stats                        ');
  console.log('  [P10] Events   → GET /events | GET /events/stream (SSE)  ');
  console.log('  [P10] Jobs     → GET /jobs                               ');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
});
