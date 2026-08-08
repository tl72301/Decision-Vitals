// api/_task-store.js
//
// A TaskStore backed by Redis, plus the tick that makes a long review actually
// progress on serverless.
//
// The SDK ships an InMemoryTaskStore. That cannot work here: every request is a
// fresh function instance, so an in-memory task disappears the moment the
// response is sent. Task state therefore lives in Redis under dv:task:<id>.
//
// The second problem is subtler. On serverless nothing runs between requests,
// so a task cannot make progress "in the background". Instead the work is
// resumable and advances one stage per poll: each tasks/get runs at most one
// pipeline stage, persists the result, and returns the updated status. One
// agent call fits comfortably inside a function timeout, the client sees real
// per-stage progress, and because every stage's output is in Redis the client
// can disconnect and reconnect without losing the run.

import { randomUUID } from "node:crypto";
import { kvGetJson, kvSetJson } from "./_kv.js";

const key = (taskId) => `dv:task:${taskId}`;

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const POLL_INTERVAL_MS = 1500;

/** @returns {Promise<object|null>} the full record: { task, result, pipeline } */
export async function readTaskRecord(taskId) {
  return kvGetJson(key(taskId));
}

export async function writeTaskRecord(taskId, record) {
  // Stamp here as well as in the explicit setters: the poll tick writes the
  // record directly, and a Task missing lastUpdatedAt fails SDK validation.
  const stamped = record.task
    ? { ...record, task: { ...record.task, lastUpdatedAt: new Date().toISOString() } }
    : record;
  await kvSetJson(key(taskId), stamped);
  return stamped;
}

/**
 * TaskStore over Redis.
 *
 * `onPoll` is invoked from getTask, which is the only hook serverless gives us
 * for advancing work. It receives the record and returns a possibly-updated
 * one. Keeping it an explicit callback rather than burying pipeline logic in
 * the store keeps the store a store.
 */
export class RedisTaskStore {
  constructor({ onPoll } = {}) {
    this._onPoll = onPoll;
  }

  async createTask(taskParams = {}, requestId, request) {
    const taskId = randomUUID();
    const now = new Date().toISOString();
    const task = {
      taskId,
      status: "working",
      createdAt: now,
      lastUpdatedAt: now,
      ttl: taskParams.ttl ?? DEFAULT_TTL_MS,
      pollInterval: taskParams.pollInterval ?? POLL_INTERVAL_MS,
      statusMessage: "Queued",
    };
    await writeTaskRecord(taskId, {
      task,
      request: request ?? null,
      requestId: requestId ?? null,
      result: null,
      pipeline: null,
    });
    return task;
  }

  async getTask(taskId) {
    let record = await readTaskRecord(taskId);
    if (!record) return null;

    // Advance the work by one stage, if there is work left to do.
    if (this._onPoll && !isTerminalStatus(record.task.status)) {
      record = (await this._onPoll(record)) ?? record;
    }
    return record.task;
  }

  async storeTaskResult(taskId, status, result) {
    const record = await readTaskRecord(taskId);
    if (!record) throw new Error(`No task ${taskId}`);
    record.task = { ...record.task, status, lastUpdatedAt: new Date().toISOString() };
    record.result = result;
    await writeTaskRecord(taskId, record);
  }

  async getTaskResult(taskId) {
    const record = await readTaskRecord(taskId);
    if (!record) throw new Error(`No task ${taskId}`);
    if (!isTerminalStatus(record.task.status)) {
      throw new Error(`Task ${taskId} is still ${record.task.status}.`);
    }
    if (!record.result) throw new Error(`Task ${taskId} has no stored result.`);
    return record.result;
  }

  async updateTaskStatus(taskId, status, statusMessage) {
    const record = await readTaskRecord(taskId);
    if (!record) throw new Error(`No task ${taskId}`);
    record.task = {
      ...record.task,
      status,
      lastUpdatedAt: new Date().toISOString(),
      ...(statusMessage != null ? { statusMessage } : {}),
    };
    await writeTaskRecord(taskId, record);
  }

  // Listing every task would mean scanning Redis, which Upstash's REST client
  // does not do cheaply and nothing in this product needs. Tasks are reached by
  // id, which the caller always has.
  async listTasks() {
    return { tasks: [] };
  }
}

export function isTerminalStatus(status) {
  return status === "completed" || status === "failed" || status === "cancelled";
}
