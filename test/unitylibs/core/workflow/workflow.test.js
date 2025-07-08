import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';

describe('workflow.js', () => {
  let workflowModule;
  let mockElement;

  before(async () => {
    // Mock window.location and other globals
    window.location = {
      search: '',
      origin: 'https://www.adobe.com',
    };

    // Mock getConfig function
    window.getConfig = () => ({
      imsClientId: 'test-client-id',
      locale: { prefix: '/us' },
    });

    // Mock utility functions
    window.createTag = (tag, attrs, content) => {
      const element = document.createElement(tag);
      if (attrs) {
        Object.entries(attrs).forEach(([key, value]) => {
          element.setAttribute(key, value);
        });
      }
      if (content) {
        if (typeof content === 'string') {
          element.textContent = content;
        } else {
          element.appendChild(content);
        }
      }
      return element;
    };

    window.loadStyle = sinon.stub().resolves();
    window.setUnityLibs = sinon.stub();
    window.getUnityLibs = () => '/test/unitylibs';
    window.defineDeviceByScreenSize = () => 'DESKTOP';
    window.priorityLoad = sinon.stub().resolves([]);

    // Mock DOM elements
    mockElement = document.createElement('div');
    mockElement.classList.add('workflow-acrobat');

    // Import the module
    workflowModule = await import('../../../../unitylibs/core/workflow/workflow.js');
  });

  after(() => {
    delete window.getConfig;
    delete window.createTag;
    delete window.loadStyle;
    delete window.setUnityLibs;
    delete window.getUnityLibs;
    delete window.defineDeviceByScreenSize;
    delete window.priorityLoad;
  });

  describe('module structure', () => {
    it('should export default function', () => {
      expect(workflowModule).to.have.property('default');
      expect(workflowModule.default).to.be.a('function');
    });

    it('should export getImgSrc function', () => {
      expect(workflowModule).to.have.property('getImgSrc');
      expect(workflowModule.getImgSrc).to.be.a('function');
    });

    it('should not export internal functions', () => {
      // These functions are internal and not exported
      expect(workflowModule).to.not.have.property('checkRenderStatus');
      expect(workflowModule).to.not.have.property('intEnbReendered');
      expect(workflowModule).to.not.have.property('createInteractiveArea');
      expect(workflowModule).to.not.have.property('getTargetArea');
      expect(workflowModule).to.not.have.property('getEnabledFeatures');
      expect(workflowModule).to.not.have.property('getWorkFlowInformation');
      expect(workflowModule).to.not.have.property('initWorkflow');
      expect(workflowModule).to.not.have.property('WfInitiator');
    });
  });
});
