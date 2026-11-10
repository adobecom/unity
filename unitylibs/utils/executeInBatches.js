/* eslint-disable no-await-in-loop */

export default async function executeInBatches(items, maxConcurrent, processFn) {
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
    throw new RangeError('Concurrency must be a positive integer');
  }
  const executing = new Set();
  let failed = false;
  let firstError;
  const run = async (item) => {
    try {
      await processFn(item);
    } catch (error) {
      if (!failed) {
        failed = true;
        firstError = error;
      }
    }
  };
  for (let index = 0; index < items.length; index += 1) {
    if (failed) break;
    const promise = run(items[index]);
    executing.add(promise);
    promise.then(() => { executing.delete(promise); });
    if (executing.size >= maxConcurrent) await Promise.race(executing);
  }
  await Promise.all(executing);
  if (failed) throw firstError;
}
