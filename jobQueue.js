/**
 * jobQueue.js — Practical 10: Async Job Queue (Background Processing)
 *
 * Implements a simple in-memory async job queue that simulates background
 * processing tasks triggered by task lifecycle events.
 *
 * Job Types:
 *   'email_notification' — simulate sending an email when a task is created
 *   'audit_log_write'    — simulate writing to an external audit store
 *   'webhook_dispatch'   — simulate calling an external webhook URL
 *   'completion_report'  — simulate generating a PDF report on task completion
 *
 * How it works (Event-Driven Processing):
 *   1. An API route (POST /tasks) saves to MongoDB and emits 'task:created'
 *   2. eventBus.on('task:created') pushes a job into the queue
 *   3. The queue worker picks it up, waits a simulated async delay,
 *      and marks it as 'done' or 'failed'
 *   4. GET /jobs returns the current queue state for monitoring
 *
 * This demonstrates the Reactor Pattern — handlers react to events
 * asynchronously without blocking the HTTP response cycle.
 *
 * Known limitation: This is an in-memory queue. Production systems use
 * durable queues (Bull/BullMQ with Redis, RabbitMQ, SQS) so jobs survive
 * server restarts and can scale across multiple workers.
 */
const eventBus = require('./eventBus');

// Job states
const JOB_STATUS = {
  QUEUED:     'queued',
  PROCESSING: 'processing',
  DONE:       'done',
  FAILED:     'failed'
};

// In-memory job queue (circular buffer — max 100 entries)
const MAX_JOBS = 100;
const jobs = [];
let jobCounter = 0;

/**
 * createJob — creates and registers a new background job
 */
function createJob(type, payload) {
  const job = {
    id:        ++jobCounter,
    type,
    payload,
    status:    JOB_STATUS.QUEUED,
    createdAt: new Date().toISOString(),
    startedAt: null,
    doneAt:    null,
    result:    null,
    error:     null
  };

  // Keep queue bounded
  if (jobs.length >= MAX_JOBS) jobs.shift();
  jobs.push(job);

  // Emit job:queued event (other listeners can observe the queue)
  eventBus.emit('job:queued', job);
  console.log(`[JOB] 📥 Queued  #${job.id} [${job.type}]`);

  // Process asynchronously — does NOT block the caller
  processJob(job);

  return job;
}

/**
 * processJob — simulates async background work with a delay
 * In a real system this would call an email API, write to a DB, etc.
 */
async function processJob(job) {
  // Simulate network/IO delay (200ms – 1200ms depending on job type)
  const delays = {
    email_notification: 800,
    audit_log_write:    300,
    webhook_dispatch:   1200,
    completion_report:  600
  };
  const delay = delays[job.type] || 500;

  // Short tick delay so the HTTP response returns BEFORE the job starts
  await new Promise(resolve => setImmediate(resolve));

  job.status    = JOB_STATUS.PROCESSING;
  job.startedAt = new Date().toISOString();
  console.log(`[JOB] ⚙️  Processing #${job.id} [${job.type}] (${delay}ms)`);

  await new Promise(resolve => setTimeout(resolve, delay));

  // Simulate 5% failure rate to demonstrate error handling
  const shouldFail = Math.random() < 0.05;

  if (shouldFail) {
    job.status = JOB_STATUS.FAILED;
    job.error  = 'Simulated transient failure (retry recommended)';
    job.doneAt = new Date().toISOString();
    console.log(`[JOB] ❌ Failed  #${job.id} [${job.type}]`);
    eventBus.emit('job:failed', job);
  } else {
    job.status = JOB_STATUS.DONE;
    job.result = getJobResult(job.type, job.payload);
    job.doneAt = new Date().toISOString();
    console.log(`[JOB] ✅ Done    #${job.id} [${job.type}]`);
    eventBus.emit('job:done', job);
  }
}

/**
 * getJobResult — returns a descriptive result string for each job type
 */
function getJobResult(type, payload) {
  switch (type) {
    case 'email_notification':
      return `Email sent to user — "Task '${payload.title}' was ${payload.action}"`;
    case 'audit_log_write':
      return `Audit entry written — ${payload.action} on task ${payload.taskId} at ${new Date().toISOString()}`;
    case 'webhook_dispatch':
      return `Webhook POST → https://hooks.example.com/tasks — 200 OK`;
    case 'completion_report':
      return `PDF report generated — task_${payload.taskId}_completion.pdf`;
    default:
      return 'Job completed';
  }
}

/**
 * getJobs — returns job queue state for the /jobs endpoint
 */
function getJobs() {
  const all   = [...jobs].reverse(); // newest first
  const stats = {
    total:      jobs.length,
    queued:     jobs.filter(j => j.status === JOB_STATUS.QUEUED).length,
    processing: jobs.filter(j => j.status === JOB_STATUS.PROCESSING).length,
    done:       jobs.filter(j => j.status === JOB_STATUS.DONE).length,
    failed:     jobs.filter(j => j.status === JOB_STATUS.FAILED).length
  };
  return { stats, jobs: all };
}

/**
 * clearJobs — flush the queue (for testing/reset endpoint)
 */
function clearJobs() {
  jobs.length = 0;
  jobCounter  = 0;
}

module.exports = { createJob, getJobs, clearJobs, JOB_STATUS };
