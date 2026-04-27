/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { getExperimentData, getDecisionScopesForVerb } from '../../unitylibs/utils/experiment-provider.js';

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
      await getExperimentData(['acom_unity_acrobat_add-comment_us']);
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

  it('should reject when no decision scopes provided', async () => {
    try {
      await getExperimentData([]);
      expect.fail('Should have rejected');
    } catch (error) {
      expect(error.message).to.equal('No decision scopes provided for experiment data fetch');
    }
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

    const result = await getExperimentData(['ACOM_UNITY_ACROBAT_EDITPDF_POC']);
    expect(result).to.deep.equal(mockTargetData);
  });

  it('should resolve with null when target returns empty decisions', async () => {
    setupMock(createMockResult(null, []));
    const result = await getExperimentData(['acom_unity_acrobat_add-comment_us']);
    expect(result).to.equal(null);
  });

  it('should resolve with null when target returns empty items', async () => {
    setupMock({ decisions: [{ items: [] }] });
    const result = await getExperimentData(['acom_unity_acrobat_add-comment_us']);
    expect(result).to.equal(null);
  });

  it('should resolve with null when target returns invalid structure', async () => {
    setupMock({ invalid: 'structure' });
    const result = await getExperimentData(['acom_unity_acrobat_add-comment_us']);
    expect(result).to.equal(null);
  });

  it('should reject when satellite track throws exception', async () => {
    await testErrorScenario(
      'Exception during Target proposition fetch: Satellite error',
      () => setupMockWithException(new Error('Satellite error')),
    );
  });

  it('should resolve with null when target result is null', async () => {
    setupMock(null);
    const result = await getExperimentData(['acom_unity_acrobat_add-comment_us']);
    expect(result).to.equal(null);
  });

  it('should resolve with null when target result is undefined', async () => {
    setupMock(undefined);
    const result = await getExperimentData(['acom_unity_acrobat_add-comment_us']);
    expect(result).to.equal(null);
  });
});

describe('getDecisionScopesForVerb', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = window.fetch;
    window.fetch = async () => ({ ok: true, json: async () => ({ country: 'US' }) });
  });

  afterEach(() => {
    window.fetch = originalFetch;
  });

  it('should return decision scopes for known verb', async () => {
    const result = await getDecisionScopesForVerb('add-comment');
    expect(result).to.deep.equal(['acom_unity_acrobat_add-comment_us', 'acom_unity_acrobat_add-comment']);
  });

  it('should return decision scopes for unknown verb using region', async () => {
    const result = await getDecisionScopesForVerb('unknown-verb');
    expect(result).to.deep.equal(['acom_unity_acrobat_unknown-verb_us', 'acom_unity_acrobat_unknown-verb']);
  });
});
