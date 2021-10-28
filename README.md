### Task

You have to execute a number of tasks. A task is just any function (usually async).

Some tasks can depend on each other. So they must wait until the tasks they depend on complete first.

You have to wait until all the tasks are completed and return their results.

### Input

An object with task ids as keys and objects describing the tasks as values:

```typescript
interface TaskDict {
  [taskId: string]: {
    dependencies: string[]; // an array of task ids.
    task: (...dependencyResults: any[]) => any;
  }
}
```

### Output

A promise that resolves with an object with task ids as keys and task results as values:

```typescript
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
```

Note that a task should not be executed if any of its dependencies were not resolved (e.g. failed or were skipped in their turn).
In this case the status will be `skipped`.

The same `skipped` status should be if a dependency is circular. Yes, there can be this mistake in the input. Apart from this the input will always be valid (no need to write validation).

### Example

```typescript
const {deepStrictEqual} = require('assert');

const runTasks = (tasks: TaskDict): Promise<TaskResultDict> => {
  // TODO
};

const taskResults = await runTasks({
  a: {
    dependencies: [],
    task: () => Promise.resolve(4)
  },
  b: {
    dependencies: ['a', 'c'],
    task: async (a, c) => Math.sqrt(c * c - a * a)
  },
  c: {
    dependencies: ['d'],
    task: () => new Promise((x) => setTimeout(x, 100)).then(() => 5)
  },
  d: {
    dependencies: [],
    task: () => Promise.reject('This will fail.')
  },
  e: {
    dependencies: ['d', 'a', 'f', 'c'],
    task: console.log
  },
  f: {
    dependencies: ['f'],
    task: () => console.log('Should never run - "f" depends on itself.')
  }
});

deepStrictEqual(taskResults, {
  a: {status: 'resolved', value: 4},
  b: {status: 'resolved', value: 3},
  c: {status: 'resolved', value: 5},
  d: {status: 'failed', reason: 'This will fail.'},
  e: {status: 'skipped', unresolvedDependencies: ['d', 'f']},
  f: {status: 'skipped', unresolvedDependencies: ['f']}
});
```

### Installation

`yarn` or `npm install`

### Run Tests

`yarn test` or `yarn test --watch` (or `npm run test` or `npm run test -- --watch`).

You can ignore TypeScript errors if you have any.

### JavaScript vs TypeScript

If you prefer JavaScript over TypeScript, just rename `intex.ts` to `index.js` and replace its content with:

```javascript
export const runTasks = (tasks) => {
  // TODO
};
```
