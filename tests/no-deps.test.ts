import {describe, it, expect} from '@jest/globals';
import {runTasks} from '..';

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
