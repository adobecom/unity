/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import getExperimentData from '../../unitylibs/utils/experiment-provider.js';

describe('getExperimentData', () => {
  beforeEach(() => {
    // Mock window._satellite
    window._satellite = { track: () => {} };
  });

  afterEach(() => {
    delete window._satellite;
  });

  it('should reject when target fetch fails', async () => {
    window._satellite.track = (event, options) => {
      setTimeout(() => {
        if (typeof options.done === 'function') options.done(null, new Error('Test error'));
      }, 0);
    };

    try {
      await getExperimentData();
      expect.fail('Should have rejected');
    } catch (error) {
      expect(error.message).to.equal('Target proposition fetch failed: Test error');
    }
  });

  it('should fetch target data when target returns valid data', async () => {
    const mockTargetData = {
      experience: 'test-experience',
      verb: 'add-comment',
    };

    window._satellite.track = (event, options) => {
      const mockResult = {
        decisions: [{ items: [{ data: { content: mockTargetData } }] }],
        propositions: ['test-proposition'],
      };
      setTimeout(() => {
        if (typeof options.done === 'function') options.done(mockResult, null);
      }, 0);
    };

    const result = await getExperimentData();
    expect(result).to.deep.equal(mockTargetData);
  });

  it('should reject when target returns empty decisions', async () => {
    window._satellite.track = (event, options) => {
      const mockResult = { decisions: [] };
      setTimeout(() => {
        if (typeof options.done === 'function') options.done(mockResult, null);
      }, 0);
    };

    try {
      await getExperimentData();
      expect.fail('Should have rejected');
    } catch (error) {
      expect(error.message).to.equal('Target proposition returned but no valid data found in response structure');
    }
  });

  it('should reject when target returns empty items', async () => {
    window._satellite.track = (event, options) => {
      const mockResult = { decisions: [{ items: [] }] };
      setTimeout(() => {
        if (typeof options.done === 'function') options.done(mockResult, null);
      }, 0);
    };

    try {
      await getExperimentData();
      expect.fail('Should have rejected');
    } catch (error) {
      expect(error.message).to.equal('Target proposition returned but no valid data found in response structure');
    }
  });

  it('should reject when target returns invalid structure', async () => {
    window._satellite.track = (event, options) => {
      const mockResult = { invalid: 'structure' };
      setTimeout(() => {
        if (typeof options.done === 'function') options.done(mockResult, null);
      }, 0);
    };

    try {
      await getExperimentData();
      expect.fail('Should have rejected');
    } catch (error) {
      expect(error.message).to.equal('Target proposition returned but no valid data found in response structure');
    }
  });

  it('should reject when satellite track throws exception', async () => {
    window._satellite.track = () => {
      throw new Error('Satellite error');
    };

    try {
      await getExperimentData();
      expect.fail('Should have rejected');
    } catch (error) {
      expect(error.message).to.equal('Exception during Target proposition fetch: Satellite error');
    }
  });

  it('should reject when target result is null', async () => {
    window._satellite.track = (event, options) => {
      setTimeout(() => {
        if (typeof options.done === 'function') options.done(null, null);
      }, 0);
    };

    try {
      await getExperimentData();
      expect.fail('Should have rejected');
    } catch (error) {
      expect(error.message).to.equal('Target proposition returned but no valid data found in response structure');
    }
  });

  it('should reject when target result is undefined', async () => {
    window._satellite.track = (event, options) => {
      setTimeout(() => {
        if (typeof options.done === 'function') options.done(undefined, null);
      }, 0);
    };

    try {
      await getExperimentData();
      expect.fail('Should have rejected');
    } catch (error) {
      expect(error.message).to.equal('Target proposition returned but no valid data found in response structure');
    }
  });
});
