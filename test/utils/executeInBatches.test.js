import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import executeInBatches from '../../unitylibs/utils/executeInBatches.js';

describe('executeInBatches', () => {
  let clock;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should refill individual slots without exceeding concurrency', async () => {
    const started = [];
    const finished = [];
    let active = 0;
    let peak = 0;
    const operation = executeInBatches([0, 1, 2, 3], 2, async (item) => {
      started.push(item);
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => { setTimeout(resolve, item === 0 ? 100 : 10); });
      active -= 1;
      finished.push(item);
    });
    expect(started).to.deep.equal([0, 1]);
    await clock.tickAsync(10);
    expect(started).to.deep.equal([0, 1, 2]);
    expect(finished).to.deep.equal([1]);
    await clock.tickAsync(90);
    await operation;
    expect(peak).to.equal(2);
    expect(active).to.equal(0);
    expect(finished).to.deep.equal([1, 2, 3, 0]);
  });

  it('should stop scheduling after failure and drain active tasks before rejecting', async () => {
    const started = [];
    const failure = new Error('task failed');
    let settled = false;
    const operation = executeInBatches([0, 1, 2, 3], 2, async (item) => {
      started.push(item);
      await new Promise((resolve) => { setTimeout(resolve, item === 0 ? 10 : 50); });
      if (item === 0) throw failure;
    }).catch((error) => {
      settled = true;
      return error;
    });
    await clock.tickAsync(10);
    expect(started).to.deep.equal([0, 1]);
    expect(settled).to.be.false;
    await clock.tickAsync(40);
    expect(await operation).to.equal(failure);
    expect(started).to.deep.equal([0, 1]);
  });

  it('should propagate synchronous failures without scheduling more tasks', async () => {
    const failure = new Error('synchronous failure');
    const processFn = sinon.stub().throws(failure);
    const error = await executeInBatches([1, 2, 3], 2, processFn).catch((caught) => caught);
    expect(error).to.equal(failure);
    expect(processFn.calledOnceWithExactly(1)).to.be.true;
  });

  it('should propagate a failure while draining the last tasks', async () => {
    const failure = new Error('last task failed');
    const operation = executeInBatches([0, 1], 3, async (item) => {
      await new Promise((resolve) => { setTimeout(resolve, 10); });
      if (item === 1) throw failure;
    }).catch((error) => error);
    await clock.tickAsync(10);
    expect(await operation).to.equal(failure);
  });

  it('should handle empty work without invoking the processor', async () => {
    const processFn = sinon.spy();
    await executeInBatches([], 2, processFn);
    expect(processFn.called).to.be.false;
  });

  [0, -1, 1.5, NaN, Infinity].forEach((limit) => {
    it(`should reject invalid concurrency ${limit}`, async () => {
      const processFn = sinon.spy();
      const error = await executeInBatches([1], limit, processFn).catch((caught) => caught);
      expect(error).to.be.instanceOf(RangeError);
      expect(processFn.called).to.be.false;
    });
  });
});
