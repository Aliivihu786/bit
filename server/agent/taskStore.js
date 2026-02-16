import { randomUUID } from 'crypto';

class TaskStore {
  constructor() {
    this.tasks = new Map();
  }

  create(metadata = {}) {
    const id = randomUUID();
    const task = {
      id,
      status: 'pending',
      messages: [],
      checkpoints: [],
      nextCheckpointId: 0,
      pendingDmail: null,
      currentStep: 0,
      result: null,
      error: null,
      createdAt: Date.now(),
      ...metadata,
    };
    this.tasks.set(id, task);
    return task;
  }

  get(id) {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Task not found: ${id}`);
    return task;
  }

  list() {
    return Array.from(this.tasks.values())
      .map(t => ({
        id: t.id,
        status: t.status,
        currentStep: t.currentStep,
        createdAt: t.createdAt,
      }));
  }
}

export const taskStore = new TaskStore();
