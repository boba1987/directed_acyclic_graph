import {describe, it, expect} from '@jest/globals';
import {runTasks} from '..';

describe('runTasks()', () => {
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
