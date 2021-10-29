import {describe, it, expect} from '@jest/globals';
import {runTasks} from '..';

describe('runTasks()', () => {
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
