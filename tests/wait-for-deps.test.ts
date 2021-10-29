import {describe, it, expect} from '@jest/globals';
import {runTasks} from '..';

describe('runTasks()', () => {
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
