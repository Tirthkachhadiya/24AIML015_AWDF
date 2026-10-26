/**
 * listeners.js — Practical 10: Event Listener Registration
 *
 * All taskEvents.on() listener registrations live in this file.
 * This keeps route handlers clean — they only emit events,
 * they never contain notification/side-effect logic directly.
 *
 * IMPORTANT: This file must be require()'d once at server startup (in server.js)
 * BEFORE any route can emit events. If this file is never imported, the listeners
 * are never registered, and all emitted events silently do nothing.
 *
 * Listener Design (Practical 10 spec requirements):
 *
 *   task-created  — logs title + timestamp + assigned user
 *                   uses setTimeout(2000ms) to demonstrate async non-blocking
 *                   [SUPPLEMENTARY] wraps in try/catch and re-emits 'task-error'
 *
 *   task-deleted  — [SUPPLEMENTARY] logs deletion message + timestamp
 *
 *   task-updated  — logs update confirmation
 *
 *   task-error    — [SUPPLEMENTARY] error event listener that catches handler errors
 *
 * Timestamp Evidence (the key proof of non-blocking behaviour):
 *
 *   Console output order when a task is created:
 *
 *   [API] ✅ Response sent at 2026-10-26T11:21:28.685Z    ← printed BEFORE emit
 *   ...2 seconds later...
 *   [Notification] Task "My Task" created at 2026-10-26T11:21:30.687Z
 *
 *   The API response timestamp ALWAYS appears before the notification timestamp
 *   because res.json() is called BEFORE taskEvents.emit(), and the listener body
 *   itself defers its log via setTimeout(2000ms).
 */
const taskEvents = require('./events');

// ── Listener 1: task-created (REQUIRED by spec) ───────────────────────────────
taskEvents.on('task-created', (task) => {
  // [Supplementary] Wrap in try/catch and emit 'task-error' on failure
  try {
    /**
     * [Supplementary] Simulate a slow notification handler (2-second delay).
     *
     * Why setTimeout and not a synchronous loop?
     *   - A synchronous loop (while, for) would actually BLOCK the event loop,
     *     delaying all other I/O including the HTTP response.
     *   - setTimeout schedules the callback on the timer queue — it runs AFTER
     *     the current call stack (which includes res.json()) is cleared.
     *   - This makes the 2-second delay genuinely non-blocking: the API client
     *     receives the response immediately, then 2 seconds later the notification
     *     logs to the console.
     */
    setTimeout(() => {
      const now = new Date().toISOString();
      const user = task.assignedUser || task.user?.email || 'Unassigned';

      console.log('');
      console.log('┌─────────────────────────────────────────────────────────┐');
      console.log('│  [Notification] TASK CREATED EVENT HANDLER              │');
      console.log('├─────────────────────────────────────────────────────────┤');
      console.log(`│  Title     : ${String(task.title).padEnd(43)}│`);
      console.log(`│  Timestamp : ${now.padEnd(43)}│`);
      console.log(`│  User      : ${user.padEnd(43)}│`);
      console.log(`│  Task ID   : ${String(task._id || 'N/A').padEnd(43)}│`);
      console.log(`│  Priority  : ${String(task.priority || 'medium').padEnd(43)}│`);
      console.log('│  [2s delay proves API did not wait for this handler]    │');
      console.log('└─────────────────────────────────────────────────────────┘');
      console.log('');
    }, 2000); // 2-second simulated delay (supplementary requirement)

  } catch (err) {
    // [Supplementary] Re-emit as task-error so the error listener handles it
    taskEvents.emit('task-error', { error: err.message, task });
  }
});

// ── Listener 2: task-deleted (SUPPLEMENTARY) ──────────────────────────────────
taskEvents.on('task-deleted', (task) => {
  setTimeout(() => {
    const now = new Date().toISOString();
    console.log('');
    console.log(`[Notification] 🗑️  Task DELETED: "${task.title}" | at ${now} | ID: ${task._id || task.id}`);
    console.log('');
  }, 500); // shorter delay for delete notifications
});

// ── Listener 3: task-updated ──────────────────────────────────────────────────
taskEvents.on('task-updated', (task) => {
  setTimeout(() => {
    const now = new Date().toISOString();
    console.log(`[Notification] ✏️  Task UPDATED: "${task.title}" → status:${task.status} | at ${now}`);
  }, 300);
});

// ── [Supplementary] Error listener: catches errors emitted from handlers ───────
/**
 * Node.js has a special rule: if an 'error' event is emitted on an EventEmitter
 * with NO registered listener, it throws an uncaught exception that crashes the process.
 *
 * Best practice: always register an 'error' listener.
 * Here we use our custom 'task-error' event name to avoid the reserved 'error' behaviour.
 */
taskEvents.on('task-error', ({ error, task }) => {
  console.error(`[EventError] ❌ Handler failed for task "${task?.title}": ${error}`);
});

// Also register the built-in 'error' event listener (safety net)
taskEvents.on('error', (err) => {
  console.error(`[EventEmitter] Unhandled error event: ${err.message}`);
});

console.log('[Listeners] ✅ All task event listeners registered (task-created, task-deleted, task-updated, task-error)');

module.exports = taskEvents;
