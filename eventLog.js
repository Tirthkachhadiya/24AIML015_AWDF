/**
 * eventLog.js — Practical 10: In-Memory Audit Event Log
 *
 * Listens to the eventBus for all task and job lifecycle events and
 * records them in a circular in-memory log.
 *
 * This module demonstrates the Observer Pattern:
 *   - eventBus is the Subject (publisher)
 *   - eventLog is one of many possible Observers (subscribers)
 *   - They are decoupled — the route handlers that emit events have no
 *     knowledge of the eventLog module; they just call eventBus.emit()
 *
 * The log is exposed via GET /events for monitoring.
 *
 * In production: events would be written to a time-series database
 * (e.g., InfluxDB, Elasticsearch) or streamed to a log aggregation
 * platform (e.g., Datadog, Splunk). This lab uses in-memory storage
 * to keep the setup self-contained.
 */
const eventBus = require('./eventBus');

const MAX_LOG_ENTRIES = 200;
const log = [];
let entryCounter = 0;

/**
 * addEntry — appends a new event to the circular log
 */
function addEntry(eventName, data = {}) {
  const entry = {
    id:        ++entryCounter,
    event:     eventName,
    timestamp: new Date().toISOString(),
    data
  };

  if (log.length >= MAX_LOG_ENTRIES) log.shift(); // evict oldest
  log.push(entry);
  return entry;
}

// ── Subscribe to all task lifecycle events ────────────────────────────────────

eventBus.on('task:created', (task) => {
  addEntry('task:created', {
    taskId:    task._id || task.id,
    title:     task.title,
    priority:  task.priority,
    source:    'POST /tasks'
  });
});

eventBus.on('task:updated', (task) => {
  addEntry('task:updated', {
    taskId: task._id || task.id,
    title:  task.title,
    status: task.status,
    source: 'PUT /tasks/:id'
  });
});

eventBus.on('task:deleted', (task) => {
  addEntry('task:deleted', {
    taskId: task._id || task.id,
    title:  task.title,
    source: 'DELETE /tasks/:id'
  });
});

eventBus.on('task:completed', (task) => {
  addEntry('task:completed', {
    taskId:      task._id || task.id,
    title:       task.title,
    completedAt: new Date().toISOString(),
    source:      'PUT /tasks/:id → status:completed'
  });
});

// ── Subscribe to job queue events ─────────────────────────────────────────────

eventBus.on('job:queued', (job) => {
  addEntry('job:queued', { jobId: job.id, type: job.type });
});

eventBus.on('job:done', (job) => {
  addEntry('job:done', { jobId: job.id, type: job.type, result: job.result });
});

eventBus.on('job:failed', (job) => {
  addEntry('job:failed', { jobId: job.id, type: job.type, error: job.error });
});

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * getLog — returns the event log (newest first), optionally filtered
 * @param {number} limit  - max entries to return (default: 50)
 * @param {string} filter - filter by event name prefix (e.g. 'task', 'job')
 */
function getLog(limit = 50, filter = null) {
  let entries = [...log].reverse();
  if (filter) entries = entries.filter(e => e.event.startsWith(filter));
  return {
    total:   log.length,
    showing: Math.min(limit, entries.length),
    entries: entries.slice(0, limit)
  };
}

/**
 * clearLog — flush all entries (for testing)
 */
function clearLog() {
  log.length  = 0;
  entryCounter = 0;
}

module.exports = { getLog, clearLog, addEntry };
