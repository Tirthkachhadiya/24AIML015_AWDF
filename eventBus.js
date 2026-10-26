/**
 * eventBus.js — Practical 10: Event-Driven Architecture
 *
 * A singleton Node.js EventEmitter used as the application-wide event bus.
 *
 * Emitted Events:
 *   'task:created'   — fired after a new task is saved to the database
 *   'task:updated'   — fired after a task is modified (PUT)
 *   'task:deleted'   — fired after a task is removed (DELETE)
 *   'task:completed' — fired when a task's status transitions to 'completed'
 *   'job:queued'     — fired when a background job is pushed to the async queue
 *   'job:done'       — fired when a background job finishes processing
 *   'job:failed'     — fired when a background job encounters an error
 *
 * Why a separate module?
 *   Using a singleton module ensures that every part of the application
 *   (routes, middleware, background workers) shares the same EventEmitter
 *   instance. If each file created its own instance, listeners in one file
 *   would never receive events emitted in another file.
 *
 * Limitations (documented for lab journal):
 *   - EventEmitter is process-local (same Node.js process only).
 *   - Events are not persisted; a server restart resets the event log.
 *   - In a distributed/multi-process architecture, a message broker
 *     (e.g., RabbitMQ, Apache Kafka) would replace this pattern.
 */
const { EventEmitter } = require('events');

class TaskEventBus extends EventEmitter {}

const eventBus = new TaskEventBus();

// Increase max listeners to avoid Node.js warnings (we attach multiple)
eventBus.setMaxListeners(20);

module.exports = eventBus;
