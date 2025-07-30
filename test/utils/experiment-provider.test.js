/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import getExperimentData from '../../unitylibs/utils/experiment-provider.js';

describe('getExperimentData', () => {
  // Helper function to setup mock with result and error
  const setupMock = (result, error = null) => {
    window._satellite.track = (event, options) => {
      setTimeout(() => {
        if (typeof options.done === 'function') options.done(result, error);
      }, 0);
    };
  };

  // Helper function to setup mock that throws an exception
  const setupMockWithException = (error) => {
    window._satellite.track = () => {
      throw error;
    };
  };

  // Helper function to create mock target result structure
  const createMockResult = (content = null, customDecisions = null) => {
    let decisions;
    if (customDecisions !== null) {
      decisions = customDecisions;
    } else if (content) {
      decisions = [{ items: [{ data: { content } }] }];
    } else {
      decisions = [];
    }
    return { decisions, propositions: ['test-proposition'] };
  };

  // Helper function to test error scenarios
  const testErrorScenario = async (expectedErrorMessage, mockSetup) => {
    mockSetup();
    try {
      await getExperimentData();
      expect.fail('Should have rejected');
    } catch (error) {
      expect(error.message).to.equal(expectedErrorMessage);
    }
  };

  beforeEach(() => {
    // Mock window._satellite
    window._satellite = { track: () => {} };
  });

  afterEach(() => {
    delete window._satellite;
  });

  it('should reject when target fetch fails', async () => {
    await testErrorScenario(
      'Target proposition fetch failed: Test error',
      () => setupMock(null, new Error('Test error')),
    );
  });

  it('should fetch target data when target returns valid data', async () => {
    const mockTargetData = {
      experience: 'test-experience',
      verb: 'add-comment',
    };

    setupMock(createMockResult(mockTargetData));

    const result = await getExperimentData();
    expect(result).to.deep.equal(mockTargetData);
  });

  it('should reject when target returns empty decisions', async () => {
    await testErrorScenario(
      'Target proposition returned but no valid data found in response structure',
      () => setupMock(createMockResult(null, [])),
    );
  });

  it('should reject when target returns empty items', async () => {
    await testErrorScenario(
      'Target proposition returned but no valid data found in response structure',
      () => setupMock({ decisions: [{ items: [] }] }),
    );
  });

  it('should reject when target returns invalid structure', async () => {
    await testErrorScenario(
      'Target proposition returned but no valid data found in response structure',
      () => setupMock({ invalid: 'structure' }),
    );
  });

  it('should reject when satellite track throws exception', async () => {
    await testErrorScenario(
      'Exception during Target proposition fetch: Satellite error',
      () => setupMockWithException(new Error('Satellite error')),
    );
  });

  it('should reject when target result is null', async () => {
    await testErrorScenario(
      'Target proposition returned but no valid data found in response structure',
      () => setupMock(null),
    );
  });

  it('should reject when target result is undefined', async () => {
    await testErrorScenario(
      'Target proposition returned but no valid data found in response structure',
      () => setupMock(undefined),
    );
  });
});
