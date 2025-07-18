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

  it('should return default data when target fetch fails', async () => {
    window._satellite.track = (event, options) => {
      setTimeout(() => {
        if (typeof options.done === 'function') options.done(null, new Error('Test error'));
      }, 0);
    };

    const result = await getExperimentData();
    expect(result).to.deep.equal({ variationId: 'variant1' });
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

  it('should return default data when target returns empty decisions', async () => {
    window._satellite.track = (event, options) => {
      const mockResult = { decisions: [] };
      setTimeout(() => {
        if (typeof options.done === 'function') options.done(mockResult, null);
      }, 0);
    };

    const result = await getExperimentData();
    expect(result).to.deep.equal({ variationId: 'variant1' });
  });

  it('should return default data when target returns empty items', async () => {
    window._satellite.track = (event, options) => {
      const mockResult = { decisions: [{ items: [] }] };
      setTimeout(() => {
        if (typeof options.done === 'function') options.done(mockResult, null);
      }, 0);
    };

    const result = await getExperimentData();
    expect(result).to.deep.equal({ variationId: 'variant1' });
  });

  it('should return default data when target returns invalid structure', async () => {
    window._satellite.track = (event, options) => {
      const mockResult = { invalid: 'structure' };
      setTimeout(() => {
        if (typeof options.done === 'function') options.done(mockResult, null);
      }, 0);
    };

    const result = await getExperimentData();
    expect(result).to.deep.equal({ variationId: 'variant1' });
  });

  it('should handle satellite track exceptions', async () => {
    window._satellite.track = () => {
      throw new Error('Satellite error');
    };

    const result = await getExperimentData();
    expect(result).to.deep.equal({ variationId: 'variant1' });
  });

  it('should handle null target result', async () => {
    window._satellite.track = (event, options) => {
      setTimeout(() => {
        if (typeof options.done === 'function') options.done(null, null);
      }, 0);
    };

    const result = await getExperimentData();
    expect(result).to.deep.equal({ variationId: 'variant1' });
  });

  it('should handle undefined target result', async () => {
    window._satellite.track = (event, options) => {
      setTimeout(() => {
        if (typeof options.done === 'function') options.done(undefined, null);
      }, 0);
    };

    const result = await getExperimentData();
    expect(result).to.deep.equal({ variationId: 'variant1' });
  });
});
