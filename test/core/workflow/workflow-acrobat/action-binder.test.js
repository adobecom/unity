import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import ActionBinder from '../../../../unitylibs/core/workflow/workflow-acrobat/action-binder.js';

describe('ActionBinder', () => {
  let actionBinder;
  let mockWorkflowCfg;
  let mockUnityEl;
  let mockWfblock;
  let mockCanvasArea;

  beforeEach(() => {
    mockWorkflowCfg = {
      productName: 'test-product',
      enabledFeatures: ['test-feature'],
      targetCfg: {
        sendSplunkAnalytics: true,
      },
    };

    // Mock DOM elements
    mockUnityEl = {
      classList: { contains: sinon.stub().returns(false) },
    };

    mockWfblock = {
      classList: { contains: sinon.stub().returns(false) },
      dispatchEvent: sinon.stub(),
    };

    mockCanvasArea = {};

    // Mock global config and functions
    window.unityConfig = {
      surfaceId: 'test-surface',
      apiEndPoint: 'https://test-api.adobe.com',
      errorToastEvent: 'unity:error-toast',
      trackAnalyticsEvent: 'unity:track-analytics',
    };

    // Mock isGuestUser function
    window.isGuestUser = sinon.stub().resolves({ isGuest: false });

    actionBinder = new ActionBinder(mockUnityEl, mockWorkflowCfg, mockWfblock, mockCanvasArea);
  });

  afterEach(() => {
    sinon.restore();
    delete window.isGuestUser;
  });

  describe('Constructor', () => {
    it('should initialize with config', () => {
      expect(actionBinder).to.be.instanceOf(ActionBinder);
      expect(actionBinder.workflowCfg).to.equal(mockWorkflowCfg);
    });

    it('should have required properties', () => {
      expect(actionBinder).to.have.property('workflowCfg');
      expect(actionBinder).to.have.property('unityEl');
      expect(actionBinder).to.have.property('block');
      expect(actionBinder).to.have.property('canvasArea');
      expect(actionBinder).to.have.property('serviceHandler');
    });
  });

  describe('Configuration', () => {
    it('should have product name from config', () => {
      expect(actionBinder.workflowCfg.productName).to.equal('test-product');
    });

    it('should have enabled features from config', () => {
      expect(actionBinder.workflowCfg.enabledFeatures).to.include('test-feature');
    });
  });

  describe('Methods', () => {
    it('should have dispatchAnalyticsEvent method', () => {
      expect(actionBinder.dispatchAnalyticsEvent).to.be.a('function');
    });

    it('should have dispatchErrorToast method', () => {
      expect(actionBinder.dispatchErrorToast).to.be.a('function');
    });

    it('should have getAbortSignal method', () => {
      expect(actionBinder.getAbortSignal).to.be.a('function');
    });

    it('should have handleRedirect method', () => {
      expect(actionBinder.handleRedirect).to.be.a('function');
    });
  });
}); 