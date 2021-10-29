import {describe, it, expect} from '@jest/globals';
import {runTasks} from '..';

describe('runTasks()', () => {
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
