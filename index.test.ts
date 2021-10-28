import {describe, it, expect} from '@jest/globals';
import {runTasks} from '.';

describe('runTasks()', () => {
  it('should work without dependecies', async () => {
    const callCounts = {};
    const taskResults = await runTasks(spyOnTaskCalls(callCounts, {
      a: {
        dependencies: [],
        task: () => new Promise((x) => setTimeout(x, 100, 'abc'))
      },
      b: {
        dependencies: [],
        task: () => {throw null;}
      },
      c: {
        dependencies: [],
        task: () => undefined
      },
      d: {
        dependencies: [],
        task: async () => {throw undefined;}
      }
    }));

    expect(taskResults).toEqual({
      a: {status: 'resolved', value: 'abc'},
      b: {status: 'failed', reason: null},
      c: {status: 'resolved', value: undefined},
      d: {status: 'failed', reason: undefined}
    });
    expect(callCounts).toEqual({a: 1, b: 1, c: 1, d: 1});
  });

  it('should wait for dependencies', async () => {
    const callCounts = {};
    const taskResults = await runTasks(spyOnTaskCalls(callCounts, {
      a: {
        dependencies: ['e'],
        task: () => null
      },
      b: {
        dependencies: ['d', 'c'],
        task: (d, c) => {throw new Error(c + ' ' + d);}
      },
      c: {
        dependencies: ['d'],
        task: (d) => new Promise((x) => setTimeout(x, 100, 'test ' + d * 2))
      },
      d: {
        dependencies: [],
        task: () => new Promise((x) => setTimeout(x, 100, 1))
      },
      e: {
        dependencies: ['b'],
        task: () => null
      }
    }));

    expect(taskResults).toEqual({
      a: {status: 'skipped', unresolvedDependencies: ['e']},
      b: {status: 'failed', reason: new Error('test 2 1')},
      c: {status: 'resolved', value: 'test 2'},
      d: {status: 'resolved', value: 1},
      e: {status: 'skipped', unresolvedDependencies: ['b']}
    });
    expect(callCounts).toEqual({b: 1, c: 1, d: 1});
  });

  it('should work for the example from readme', async () => {
    const callCounts = {};
    const taskResults = await runTasks(spyOnTaskCalls(callCounts, {
      a: {
        dependencies: [],
        task: () => Promise.resolve(4)
      },
      b: {
        dependencies: ['a', 'c'],
        task: async (a, c) => Math.sqrt(c * c - a * a)
      },
      c: {
        dependencies: [],
        task: () => new Promise((x) => setTimeout(x, 100)).then(() => 5)
      },
      d: {
        dependencies: [],
        task: () => Promise.reject('This will fail.')
      },
      e: {
        dependencies: ['d', 'a', 'f'],
        task: console.log
      },
      f: {
        dependencies: ['f'],
        task: () => console.log('Should never run - "f" depends on itself.')
      }
    }));

    expect(taskResults).toEqual({
      a: {status: 'resolved', value: 4},
      b: {status: 'resolved', value: 3},
      c: {status: 'resolved', value: 5},
      d: {status: 'failed', reason: 'This will fail.'},
      e: {status: 'skipped', unresolvedDependencies: ['d', 'f']},
      f: {status: 'skipped', unresolvedDependencies: ['f']}
    });
    expect(callCounts).toEqual({a: 1, b: 1, c: 1, d: 1});
  });

  it('should skip circular dependencies', async () => {
    const callCounts = {};
    const taskResults = await runTasks(spyOnTaskCalls(callCounts, {
      d: {
        dependencies: ['c'],
        task: () => null
      },
      a: {
        dependencies: ['d'],
        task: () => null
      },
      b: {
        dependencies: ['a'],
        task: () => null
      },
      c: {
        dependencies: ['b'],
        task: () => null
      }
    }));

    expect(taskResults).toEqual({
      a: {status: 'skipped', unresolvedDependencies: ['d']},
      b: {status: 'skipped', unresolvedDependencies: ['a']},
      c: {status: 'skipped', unresolvedDependencies: ['b']},
      d: {status: 'skipped', unresolvedDependencies: ['c']},
    });
    expect(callCounts).toEqual({});
  });

  it('should run tasks that do not depend on each other simultaneously', async () => {
    const callCounts = {};
    const count = 1000;
    const randomIndex = Math.floor(Math.random() * count);
    const indices = Array.from(new Array(count)).map((_, index) => index);
    const tasks = indices.map((index) => ([
      index,
      index === randomIndex ? {
        dependencies: [
          ...indices.slice(0, randomIndex),
          ...indices.slice(randomIndex + 1)
        ].map(String),
        task: (...args: {value: number}[]) => (
          new Promise((x) => setTimeout(x, 200, {value: index})).then(() => (
            Promise.reject({
              sum: args.reduce((sum, {value}) => sum + value, 0)
            })
          ))
        )
      } : {
        dependencies: [],
        task: () => new Promise((x) => setTimeout(x, 200, {value: index}))
      }
    ]));

    const taskResults = await runTasks(
      spyOnTaskCalls(callCounts, Object.fromEntries(tasks))
    );

    expect(taskResults).toEqual(
      Object.fromEntries(indices.map((index) => [
        index,
        index === randomIndex ? {
          status: 'failed',
          reason: {sum: count * (count - 1) / 2 - randomIndex}
        } : {
          status: 'resolved',
          value: {value: index}
        }
      ]))
    );
    expect(callCounts).toEqual(
      Object.fromEntries(indices.map((index) => [index, 1]))
    );
  });

  it('should run tasks that do not depend on each other simultaneously - 2', async () => {
    const callCounts = {};
    const count = 1000;
    const indices = Array.from(new Array(count)).map((_, index) => index);
    const tasks = indices.map((index) => ([
      index,
      index % 3 === 0 ? {
        dependencies: [],
        task: () => new Promise((x) => setTimeout(x, 200, index))
      } : index % 3 === 1 ? {
        dependencies: [String(index - 1)],
        task: (previousIndex: number) => Promise.reject(previousIndex)
      } : {
        dependencies: [String(index - 1)],
        task: () => null
      }
    ]));

    const taskResults = await runTasks(
      spyOnTaskCalls(callCounts, Object.fromEntries(tasks))
    );

    expect(taskResults).toEqual(
      Object.fromEntries(indices.map((index) => [
        index,
        index % 3 === 0 ? {
          status: 'resolved',
          value: index
        } : index % 3 === 1 ? {
          status: 'failed',
          reason: index - 1
        } : {
          status: 'skipped',
          unresolvedDependencies: [String(index - 1)]
        }
      ]))
    );
    expect(callCounts).toEqual(
      Object.fromEntries(
        indices.filter((index) => index % 3 !== 2).map((index) => [index, 1])
      )
    );
  });
});

function spyOnTaskCalls<T extends Record<string, {task: Function}>>(
  callCounts: Record<string, number | undefined>,
  tasks: T
) {
  return Object.fromEntries(Object.entries(tasks).map(([key, value]) => [
    key,
    {
      ...value,
      task: (...args: any[]) => {
        const {[key]: count = 0} = callCounts;
        callCounts[key] = count + 1;
        return value.task(...args);
      }
    }
  ])) as unknown as T;
}
