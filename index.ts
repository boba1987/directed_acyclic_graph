export interface Callback<T> {
  (key: string, value: T | undefined): void;
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
    let v = vertices.add(key);
    v.task = task;
    if (before) {
      if (typeof before === "string") {
        vertices.addEdge(v, vertices.add(before));
      } else {
        for (let i = 0; i < before.length; i++) {
          vertices.addEdge(v, vertices.add(before[i]));
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
  }

  public getResult(callback: Callback<T>) {
    this._vertices.walk(callback);
  }
}

class Vertices<T> {
  [index: number]: Vertex<T>;
  length = 0;

  private stack: IntStack = new IntStack();
  private path: IntStack = new IntStack();
  public result: IntStack = new IntStack();

  public add(key: string): Vertex<T> {
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
      length: 0
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

  public walk(cb: Callback<T>): void {
    this.reset();
    for (let i = 0; i < this.length; i++) {
      let vertex = this[i];
      if (vertex.out) continue;
      this.visit(vertex, "");
    }
    this.each(this.result, cb);
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
      this.each(this.path, key => {
        msg += " <- " + key;
      });
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

  private each(indices: IntStack, cb: Callback<T>): void {
    for (let i = 0, l = indices.length; i < l; i++) {
      let vertex = this[indices[i]];
      cb(vertex.key, vertex.task);
    }
  }
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

    try {
      notDependantTasks[task].value = await notDependantTasks[task].task();
      notDependantTasks[task].status = 'success';
    } catch (error) {
      notDependantTasks[task].reason = error;
      notDependantTasks[task].status = 'failed';
    }
  }

  return {
    ...notDependantTasks,
    ...tasksSorted.withDeps,
  }
};

export const runTasks = async (tasks: TaskDict): Promise<any> => {
  const graph = new DAG();
  const taskNames = Object.keys(tasks);
  const tasksOrdered = await setBeforeOrder(tasks);
  console.log('tasksOrdered', tasksOrdered);
  for (let i = 0; i < taskNames.length; i++) {
    let name = taskNames[i];
    graph.add(name, tasksOrdered[name].task, tasksOrdered[name].before, tasksOrdered[name].dependencies)
  }

  graph.getResult((key, val) => console.log(`${key}: ${val}`));


  return {};
};

(async () => {
  const taskResults = await runTasks({
    a: {
      dependencies: ['d'],
      task: () => Promise.resolve(4),
    },
    b: {
      dependencies: ['a', 'c'],
      task: async (a, c) => Math.sqrt(c * c - a * a)
    },
    c: {
      dependencies: [],
      task: () => Promise.resolve('hi c'),
    },
    d: {
      dependencies: [],
      task: () => Promise.reject('hi d'),
    },
    e: {
      dependencies: ['d', 'a', 'f'],
      task: () => 'hi e'
    },
    f: {
      dependencies: ['a'],
      task: () => console.log('Should never run - "f" depends on itself.')
    }
  });
  
  console.log('taskResults', taskResults);
})()