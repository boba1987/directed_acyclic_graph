export interface Callback<T> {
  (key: string, value: T | undefined, status: string | undefined): void;
}

export type MaybeStringOrArray = string | string[] | undefined;

export default class DAG<T> {
  private _vertices = new Vertices<T>();

  public add(
    key: string,
    task: T | undefined,
    before?: MaybeStringOrArray,
    after?: MaybeStringOrArray
  ) {
    if (!key) throw new Error("argument `key` is required");
    let vertices = this._vertices;
    let v = vertices.add(key, after);
    v.task = task;
    v.dependencies = after;
    try {
      if (before) {
        if (typeof before === "string") {
          vertices.addEdge(v, vertices.add(before, after));
        } else {
          for (let i = 0; i < before.length; i++) {
            vertices.addEdge(v, vertices.add(before[i], after));
          }
        }
      }
      if (after) {
        if (typeof after === "string") {
          vertices.addEdge(vertices.add(after), v);
        } else {
          for (let i = 0; i < after.length; i++) {
            vertices.addEdge(vertices.add(after[i]), v);
          }
        }
      }
    } catch (e: any) {
      if (e?.message.includes('cycle detected')) {
        faliures[key] = {
          status: 'skipped',
          unresolvedDependencies: [key]
        }
      }
    }
  }

  public async getResult(): Promise<any> {
    return await this._vertices.walk();
  }
}

class Vertices<T> {
  [index: number]: Vertex<T>;
  length = 0;

  private stack: IntStack = new IntStack();
  private path: IntStack = new IntStack();
  public result: IntStack = new IntStack();

  public add(key: string, dependencies?: any): Vertex<T> {
    if (!key) throw new Error("missing key");
    let l = this.length | 0;
    let vertex: Vertex<T>;
    for (let i = 0; i < l; i++) {
      vertex = this[i];
      if (vertex.key === key) return vertex;
    }
    this.length = l + 1;
    return (this[l] = {
      idx: l,
      key: key,
      task: undefined,
      out: false,
      flag: false,
      length: 0,
      dependencies
    });
  }

  public addEdge(v: Vertex<T>, w: Vertex<T>): void {
    this.check(v, w.key);
    let l = w.length | 0;
    for (let i = 0; i < l; i++) {
      if (w[i] === v.idx) return;
    }
    w.length = l + 1;
    w[l] = v.idx;
    v.out = true;
  }

  public async walk(): Promise<any> {
    this.reset();
    for (let i = 0; i < this.length; i++) {
      let vertex = this[i];
      if (vertex.out || faliures[vertex.key]) continue;
      this.visit(vertex, "");
    }
    return this.each(this.result);
  }

  private check(v: Vertex<T>, w: string): void {
    if (v.key === w) {
      throw new Error("cycle detected: " + w + " <- " + w);
    }
    // quick check
    if (v.length === 0) return;
    // shallow check
    for (let i = 0; i < v.length; i++) {
      let key = this[v[i]].key;
      if (key === w) {
        throw new Error("cycle detected: " + w + " <- " + v.key + " <- " + w);
      }
    }
    // deep check
    this.reset();
    this.visit(v, w);
    if (this.path.length > 0) {
      let msg = "cycle detected: " + w;
      msg += this.each(this.path);
      throw new Error(msg);
    }
  }

  private reset(): void {
    this.stack.length = 0;
    this.path.length = 0;
    this.result.length = 0;
    for (let i = 0, l = this.length; i < l; i++) {
      this[i].flag = false;
    }
  }

  private visit(start: Vertex<T>, search: string): void {
    let { stack, path, result } = this;
    stack.push(start.idx);
    while (stack.length) {
      let index = stack.pop() | 0;
      if (index >= 0) {
        // enter
        let vertex = this[index];
        if (vertex.flag) continue;
        vertex.flag = true;
        path.push(index);
        if (search === vertex.key) break;
        // push exit
        stack.push(~index);
        this.pushIncoming(vertex);
      } else {
        // exit
        path.pop();
        result.push(~index);
      }
    }
  }

  private pushIncoming(incomming: ArrayLike<number>): void {
    let { stack } = this;
    for (let i = incomming.length - 1; i >= 0; i--) {
      let index = incomming[i];
      if (!this[index].flag) {
        stack.push(index);
      }
    }
  }

  private async each(indices: IntStack): Promise<any> {
    const results: any = {};
    for (let i = 0, l = indices.length; i < l; i++) {
      let vertex = this[indices[i]];
      const taskResult = await resolveTask(vertex);
      results[vertex.key] = {
        value: taskResult?.value,
        status: taskResult?.status,
        unresolvedDependencies: taskResult?.unresolvedDependencies,
        reason: taskResult?.reason
      }
    }
    return results;
  }
}

function getTaskInput(dependencies: string[]): any {
  return dependencies.map((dependency: any) => taskResults[dependency]);
}

async function resolveTask(vertex: any): Promise<any> {
  let taskResult;
  let taskStatus;
  let failureReason;
  const unresolvedDependencies = vertex.dependencies?.length ? vertex.dependencies.filter((dependency: string) => Object.keys(faliures).includes(dependency)) : [];

  if (faliures[vertex.key]) {
    return {
      status: 'skipped',
      unresolvedDependencies
    };
  }

  if (unresolvedDependencies.length) {
    faliures[vertex.key] = {
      status: 'skipped',
      unresolvedDependencies
    }
    return {
      status: 'skipped',
      unresolvedDependencies
    };
  }

  try {
    if (vertex.dependencies?.length) {
      taskResult = await vertex.task.apply(null, getTaskInput(vertex.dependencies));
    } else {
      taskResult = await vertex.task();
    }
    taskStatus = 'success';
    taskResults[vertex.key] = taskResult;
  } catch (error) {
    faliures[vertex.key] = {
      status: 'failed',
      reason: error
    };

    taskStatus = 'failed';
    failureReason = error;
  }

  return {
    value: taskResult,
    status: taskStatus,
    reason: failureReason
  };
}

/** @private */
interface Vertex<T> {
  idx: number;
  key: string;
  task: T | undefined;
  out: boolean;
  flag: boolean;
  [index: number]: number;
  length: number;
  dependencies: any;
}

/** @private */
class IntStack {
  [index: number]: number;

  public length = 0;

  push(n: number) {
    this[this.length++] = n | 0;
  }

  pop() {
    return this[--this.length] | 0;
  }
}

interface TaskDict {
  [taskId: string]: {
    dependencies: string[]; // an array of task ids.
    task: (...dependencyResults: any[]) => any;
    before?: string;
    after?: string
  }
}
interface TaskResultDict {
  [taskId: string]: (
    {
      status: 'resolved',
      value: any
    } |
    {
      status: 'failed',
      reason: any
    } |
    {
      status: 'skipped',
      unresolvedDependencies: string[]
    }
  );
}

async function setBeforeOrder (tasks: TaskDict):  Promise<any> {
  const tasksSorted = Object.keys(tasks).reduce((acc: any, curr: any) => {
    if (tasks[curr].dependencies.length) {
      acc.withDeps[curr] = tasks[curr];
      return acc;
    }

    acc.noDeps[curr] = tasks[curr];
    return acc;
  }, {
    withDeps: {},
    noDeps: {}
  });

  const tasksWithoutDependencies = Object.keys(tasksSorted.noDeps);
  const notDependantTasks: any = {};

  for (let index=0; index < tasksWithoutDependencies.length; index++) {
    let task = tasksWithoutDependencies[index];
    notDependantTasks[task] = {
      ...tasksSorted.noDeps[task],
      before: tasksWithoutDependencies[index+1]
    };
  }

  return {
    ...notDependantTasks,
    ...tasksSorted.withDeps,
  }
};

const faliures: any = {};
const taskResults: any = {};
export const runTasks = async (tasks: TaskDict): Promise<any> => {
  const graph = new DAG();
  const taskNames = Object.keys(tasks);
  const tasksOrdered = await setBeforeOrder(tasks);
  for (let i = 0; i < taskNames.length; i++) {
    let name = taskNames[i];
    graph.add(name, tasksOrdered[name].task, tasksOrdered[name].before, tasksOrdered[name].dependencies)
  }

  return buildResponse(await graph.getResult(), Object.keys(tasks));
};

function resolveResponseType(task: any): any {
  switch (task.status) {
    case 'success':
      return {
        value: task.value,
        status: 'success'
      };
    case 'skipped':
      return {
        unresolvedDependencies: task.unresolvedDependencies,
        status: 'skipped'
      };
    case 'failed':
      return {
        status: 'failed',
        reason: task.reason
      };
    default:
      return {
        status: 'unknown'
      };
  }
}

function buildResponse(taskResults: any, tasksOriginalOrder: string[]): any {
  return tasksOriginalOrder.reduce((acc: any, curr: any)=> {
    acc[curr] = resolveResponseType(taskResults[curr]);
    return acc;
  }, {});
}
