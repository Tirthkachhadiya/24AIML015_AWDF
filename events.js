/**
 * events.js — Practical 10: Custom EventEmitter Module
 *
 * Creates a dedicated EventEmitter class for task lifecycle events.
 * Exported as a singleton so all files share the same instance.
 *
 * Using a named class (TaskEvents extends EventEmitter) rather than
 * directly instantiating EventEmitter allows:
 *   1. Custom methods to be added later (e.g., taskEvents.notifyUser())
 *   2. Type clarity — it is obvious this emitter is task-scoped
 *   3. Easier unit testing (can be mocked/spied as a class)
 *
 * Events emitted by this bus:
 *   'task-created' — emitted after a task is saved (POST /tasks)
 *   'task-deleted' — emitted after a task is deleted (DELETE /tasks/:id)  [Supplementary]
 *   'task-updated' — emitted after a task is modified (PUT /tasks/:id)
 *
 * Key Concept:
 *   emit() is SYNCHRONOUS — it calls listener functions in registration
 *   order on the current call stack. What makes it "async" in this lab
 *   is that we call res.json() BEFORE emit(), and listeners use setTimeout
 *   to defer their heavy work to a later event loop tick.
 *   The HTTP response returns to the client before any setTimeout callback runs.
 */
const { EventEmitter } = require('events');

class TaskEvents extends EventEmitter {}

// Export a singleton — every require('./events') returns this same instance
const taskEvents = new TaskEvents();

// Increase listener limit to avoid Node.js MaxListenersExceededWarning
taskEvents.setMaxListeners(20);

module.exports = taskEvents;
