import {describe, it, expect} from '@jest/globals';
import {runTasks} from '..';

jest.setTimeout(210 * 1000);
describe('runTasks()', () => {
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
