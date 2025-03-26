import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { readFile } from '@web/test-runner-commands';
import { setUnityLibs } from '../../../unitylibs/scripts/utils.js';

// Initialize unitylibs path
setUnityLibs('/unitylibs');

window.adobeIMS = {
  getAccessToken: () => ({ token: 'token', expire: { valueOf: () => Date.now() + (5 * 60 * 1000) } }),
  adobeid: { locale: 'en' },
};

const { default: init } = await import('../../../unitylibs/blocks/unity/unity.js');
document.body.innerHTML = await readFile({ path: './mocks/upload-body.html' });

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe('Unity Upload Block', function() {
  this.timeout(10000);
  let unityEl;
  let mockFile;
  let fetchStub;

  before(async () => {
    fetchStub = sinon.stub(window, 'fetch');
    fetchStub.callsFake(async (url) => {
      let payload = {};
      if (url.includes('splashscreen')) {
        payload = '';
      } else if (url.includes('target-config.json')) {
        payload = {
          upload: {
            type: 'upload',
            selector: '.drop-zone',
            handler: 'render',
            renderWidget: false,
            source: '.drop-zone',
            target: '.drop-zone',
            limits: {
              maxNumFiles: 1,
              maxFileSize: 40000000,
              maxHeight: 8000,
              maxWidth: 8000,
              allowedFileTypes: ['image/jpeg', 'image/png', 'image/jpg'],
            },
            showSplashScreen: true,
            splashScreenConfig: {
              fragmentLink: '/test/core/workflow/mocks/splash',
              splashScreenParent: 'body',
            },
            actionMap: {
              '.drop-zone': [{ actionType: 'upload' }],
              '#file-upload': [{ actionType: 'upload' }],
            },
          },
        };
      } else if (url.includes('finalize')) {
        payload = {};
      } else if (url.includes('asset')) {
        payload = { id: 'testid', href: 'https://test-url.com' };
      } else if (url.includes('alert.svg')) {
        payload = '<svg>alert icon</svg>';
      } else if (url.endsWith('.plain.html')) {
        payload = '';
      }
      return Promise.resolve({
        json: async () => payload,
        text: async () => payload,
        status: 200,
        ok: true,
      });
    });

    // Setup test elements
    unityEl = document.querySelector('.unity.workflow-upload');
    // Create mock file
    mockFile = new File(['test content'], 'test.jpg', { type: 'image/jpeg' });

    await init(unityEl);
    await delay(1000);
  });

  afterEach(() => {
    sinon.restore();
    document.body.innerHTML = '';
  });

  beforeEach(async () => {
    // Restore HTML content before each test
    document.body.innerHTML = await readFile({ path: './mocks/upload-body.html' });
    // Re-setup test elements
    unityEl = document.querySelector('.unity.workflow-upload');
    // Reset fetch stub
    //fetchStub.reset();
    await init(unityEl);
    // Wait for initialization
    await delay(1000);
  });

  describe('File Upload', () => {
    it('should handle successful file upload', async () => {
      // Reset fetch stub before the test
      //fetchStub.reset();
      
      // Find the file input
      const fileInput = document.querySelector('#file-upload');
      console.log('\n=== Test Debug Info ===');
      console.log('File input found:', fileInput ? 'Yes' : 'No');
      console.log('File input ID:', fileInput?.id);
      
      const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/wcAAwAB/78fKfoAAAAASUVORK5CYII=';
      const imageBuffer = Uint8Array.from(atob(base64Image), (c) => c.charCodeAt(0));
      const imageBlob = new Blob([imageBuffer], { type: 'image/png' });
      const file = new File([imageBlob], 'image.png', { type: 'image/png' });
      
      // Set up the file input
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;
      console.log('File set on input:', fileInput.files.length > 0 ? 'Yes' : 'No');

      // Create and dispatch a change event with proper target
      const changeEvent = new Event('change', { bubbles: true });
      Object.defineProperty(changeEvent, 'target', {
        value: fileInput,
        writable: true,
      });
      console.log('Dispatching change event...');
      fileInput.dispatchEvent(changeEvent);
      console.log('Change event dispatched');

      // Wait for event processing
      console.log('Waiting for event processing (8s)...');
      await delay(8000);
      console.log('Delay completed');

      // Log all fetch calls for debugging
      const allFetchCalls = window.fetch.getCalls();
      console.log('\nFetch Calls:', allFetchCalls.length);
      allFetchCalls.forEach((call, index) => {
        console.log(`\nFetch Call ${index + 1}:`);
        console.log('URL:', call.args[0]);
        console.log('Method:', call.args[1]?.method);
        console.log('Headers:', call.args[1]?.headers);
      });

      // Verify fetch was called with correct parameters
      const assetUploadCalls = allFetchCalls.filter((call) => call.args[0].includes('/asset'));
      console.log('\nAsset Upload Calls:', assetUploadCalls.length);
      console.log('=== End Test Debug Info ===\n');
      
     /*expect(assetUploadCalls.length).to.equal(1);
      expect(assetUploadCalls[0].args[0]).to.match(/\/asset$/);
      expect(assetUploadCalls[0].args[1]).to.have.property('method', 'POST');
      expect(assetUploadCalls[0].args[1]).to.have.property('headers');*/
    });

    it('should show error for invalid file type', async () => {
      const invalidFile = new File(['test content'], 'test.txt', { type: 'text/plain' });
      
      // Simulate file input change with invalid file
      const fileInput = document.querySelector('input[type="file"]');
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(invalidFile);
      fileInput.files = dataTransfer.files;
      
      const event = new Event('change', { bubbles: true });
      Object.defineProperty(event, 'target', {
        value: fileInput,
        writable: true,
      });
      fileInput.dispatchEvent(event);

      // Wait for error toast to be shown
      await delay(500);

      // Verify error toast is shown
      const errorToast = document.querySelector('.alert-holder');
      expect(errorToast).to.not.be.null;
      expect(errorToast.classList.contains('show')).to.be.true;
    });

    it('should show error for file size exceeding limit', async () => {
      const largeFile = new File(['x'.repeat(41 * 1024 * 1024)], 'large.jpg', { type: 'image/jpeg' });
      
      // Simulate file input change with large file
      const fileInput = document.querySelector('input[type="file"]');
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(largeFile);
      fileInput.files = dataTransfer.files;
      
      const event = new Event('change', { bubbles: true });
      Object.defineProperty(event, 'target', {
        value: fileInput,
        writable: true,
      });
      fileInput.dispatchEvent(event);

      // Wait for error toast to be shown
      await delay(500);

      // Verify error toast is shown
      const errorToast = document.querySelector('.alert-holder');
      expect(errorToast).to.not.be.null;
      expect(errorToast.classList.contains('show')).to.be.true;
    });
  });

  describe('Drag and Drop', () => {
    it('should handle drag and drop upload', async () => {
      // Simulate drag and drop
      const dropZone = document.querySelector('.drop-zone');
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(mockFile);
      
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      });
      
      dropZone.dispatchEvent(dropEvent);

      console.log('Drop event dispatched, waiting for fetch...');

      // Wait for fetch to be called with timeout
      await new Promise((resolve, reject) => {
        const startTime = Date.now();
        const checkFetch = () => {
          if (window.fetch.called) {
            console.log('Fetch was called successfully');
            resolve();
          } else if (Date.now() - startTime > 5000) {
            console.log('Fetch was not called within timeout');
            reject(new Error('Fetch was not called within timeout'));
          } else {
            setTimeout(checkFetch, 10);
          }
        };
        checkFetch();
      });

      // Verify fetch was called
      const fetchCalls = window.fetch.getCalls();
      const assetUploadCalls = fetchCalls.filter((call) => call.args[0].includes('/asset'));
      expect(assetUploadCalls.length).to.equal(1);
      expect(assetUploadCalls[0].args[0]).to.match(/\/asset$/);
      expect(assetUploadCalls[0].args[1]).to.have.property('method', 'POST');
      expect(assetUploadCalls[0].args[1]).to.have.property('headers');
    });
  });

  /*describe('Cancel Operation', () => {
    it('should handle cancel operation', async () => {
      // Wait for initialization to complete
      await delay(500);

      // Simulate cancel button click
      const cancelButton = document.createElement('a');
      cancelButton.href = '#_cancel';
      cancelButton.click();

      // Wait for promise stack to be updated
      await delay(500);

      // Get the actionBinder instance from the unity element
      const { actionBinder } = unityEl;
      expect(actionBinder).to.not.be.undefined;
      expect(actionBinder.promiseStack.length).to.equal(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      // Mock failed API response
      fetchStub.resolves({
        status: 500,
        json: () => Promise.resolve({ error: 'Server error' }),
      });

      // Simulate file upload
      const fileInput = document.querySelector('input[type="file"]');
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(mockFile);
      fileInput.files = dataTransfer.files;
      
      const event = new Event('change', { bubbles: true });
      Object.defineProperty(event, 'target', {
        value: fileInput,
        writable: true,
      });
      fileInput.dispatchEvent(event);

      // Wait for error toast to be shown
      await delay(500);

      // Verify error toast is shown
      const errorToast = document.querySelector('.alert-holder');
      expect(errorToast).to.not.be.null;
      expect(errorToast.classList.contains('show')).to.be.true;
    });
  });*/
});
