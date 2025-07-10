import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';

describe('UploadHandler', () => {
  let UploadHandler;
  let uploadHandler;
  let mockActionBinder;
  let mockServiceHandler;
  let mockTransitionScreen;

  before(async () => {
    const originalImport = window.import;

    window.unityConfig = {
      surfaceId: 'test-surface',
      apiEndPoint: 'https://test-api.adobe.com',
    };

    window.getUnityLibs = () => '/Users/rosahu/Documents/unity/unitylibs';

    window.import = function mockImport(specifier) {
      if (specifier && typeof specifier === 'string' && specifier.includes('transition-screen.js')) {
        return Promise.resolve({
          default: function TransitionScreen() {
            this.showSplashScreen = () => Promise.resolve();
            this.updateProgressBar = () => Promise.resolve();
            return this;
          },
        });
      }
      if (originalImport) {
        return originalImport(specifier);
      }
      return Promise.resolve({ default: () => {} });
    };

    const module = await import('../../../../unitylibs/core/workflow/workflow-acrobat/upload-handler.js');
    UploadHandler = module.default;
  });

  beforeEach(() => {
    window.getUnityLibs = sinon.stub().returns('/Users/rosahu/Documents/unity/unitylibs');
    window.unityConfig = {
      surfaceId: 'test-surface',
      apiEndPoint: 'https://test-api.adobe.com',
    };

    mockTransitionScreen = {
      showSplashScreen: sinon.stub().resolves(),
      updateProgressBar: sinon.stub(),
    };

    mockActionBinder = {
      workflowCfg: {
        productName: 'test-product',
        enabledFeatures: ['test-feature'],
        langRegion: 'us',
        langCode: 'en',
        targetCfg: {
          nonpdfSfuProductScreen: [],
          nonpdfMfuFeedbackScreenTypeNonpdf: [],
          mfuUploadAllowed: [],
          mfuUploadOnlyPdfAllowed: [],
        },
      },
      acrobatApiConfig: {
        acrobatEndpoint: {
          createAsset: '/api/create-asset',
          finalizeAsset: '/api/finalize-asset',
          getMetadata: '/api/metadata',
        },
      },
      MULTI_FILE: false,
      LOADER_LIMIT: 95,
      limits: {
        pageLimit: {
          maxNumPages: 100,
          minNumPages: 1,
        },
      },
      operations: [],
      transitionScreen: { splashScreenEl: document.createElement('div') },
      initActionListeners: sinon.stub(),
      dispatchAnalyticsEvent: sinon.stub(),
      dispatchErrorToast: sinon.stub().resolves(),
      getAbortSignal: sinon.stub().returns({ aborted: false }),
      setAssetId: sinon.stub(),
      handleRedirect: sinon.stub().resolves(true),
      delay: sinon.stub().resolves(),
      setIsUploading: sinon.stub(),
      dispatchGenericError: sinon.stub().resolves(),
    };

    mockServiceHandler = {
      postCallToService: sinon.stub(),
      postCallToServiceWithRetry: sinon.stub(),
      getCallToService: sinon.stub(),
      deleteCallToService: sinon.stub(),
    };

    uploadHandler = new UploadHandler(mockActionBinder, mockServiceHandler);
    uploadHandler.transitionScreen = mockTransitionScreen;
    sinon.stub(uploadHandler, 'showSplashScreen').resolves();
    sinon.stub(uploadHandler, 'initSplashScreen').resolves();
  });

  afterEach(() => {
    sinon.restore();
  });

  after(() => {
    delete window.unityConfig;
    delete window.getUnityLibs;
    delete window.import;
  });

  describe('Constructor', () => {
    it('should use correct upload limits', () => {
      expect(UploadHandler.UPLOAD_LIMITS.HIGH_END).to.deep.equal({ files: 3, chunks: 10 });
      expect(UploadHandler.UPLOAD_LIMITS.MID_RANGE).to.deep.equal({ files: 3, chunks: 10 });
      expect(UploadHandler.UPLOAD_LIMITS.LOW_END).to.deep.equal({ files: 2, chunks: 6 });
    });
  });

  describe('Utility Functions', () => {
    it('should generate guest connection payload', () => {
      const payload = uploadHandler.getGuestConnPayload('nonpdf');
      expect(payload.payload.feedback).to.equal('nonpdf');
      expect(payload.targetProduct).to.equal('test-product');
    });

    it('should identify PDF files correctly', () => {
      expect(uploadHandler.isPdf({ type: 'application/pdf' })).to.be.true;
      expect(uploadHandler.isPdf({ type: 'image/jpeg' })).to.be.false;
    });
  });

  describe('checkPageNumCount', () => {
    it('should validate normal page count', async () => {
      const assetData = { id: 'asset-123' };
      mockServiceHandler.getCallToService.resolves({ numPages: 50 });
      const result = await uploadHandler.checkPageNumCount(assetData, false);
      expect(result).to.be.false;
    });

    it('should handle error in checkPageNumCount', async () => {
      const clock = sinon.useFakeTimers();
      uploadHandler.serviceHandler.getCallToService = sinon.stub().rejects(new Error('fail'));
      const assetData = { id: 'asset-123' };
      const promise = uploadHandler.checkPageNumCount(assetData, false);
      clock.tick(5000); // Fast-forward timers to trigger setTimeout/setInterval
      const result = await promise;
      expect(result).to.be.false;
      clock.restore();
    });

    it('should handle max page count exceeded', async () => {
      const assetData = { id: 'asset-123' };
      uploadHandler.serviceHandler.getCallToService = sinon.stub().resolves({ numPages: 101 });
      uploadHandler.actionBinder.limits = { pageLimit: { maxNumPages: 100, minNumPages: 1 } };
      const result = await uploadHandler.checkPageNumCount(assetData, false);
      expect(result).to.be.true;
      expect(uploadHandler.showSplashScreen.called).to.be.true;
      expect(mockActionBinder.dispatchErrorToast.calledWith('upload_validation_error_max_page_count')).to.be.true;
    });

    it('should handle min page count not met', async () => {
      const assetData = { id: 'asset-123' };
      uploadHandler.serviceHandler.getCallToService = sinon.stub().resolves({ numPages: 0 });
      uploadHandler.actionBinder.limits = { pageLimit: { maxNumPages: 100, minNumPages: 1 } };
      const result = await uploadHandler.checkPageNumCount(assetData, false);
      expect(result).to.be.true;
      expect(uploadHandler.showSplashScreen.called).to.be.true;
      expect(mockActionBinder.dispatchErrorToast.calledWith('upload_validation_error_min_page_count')).to.be.true;
    });

    it('should handle max page count exceeded for multi-file', async () => {
      const assetData = { id: 'asset-123' };
      uploadHandler.serviceHandler.getCallToService = sinon.stub().resolves({ numPages: 101 });
      uploadHandler.actionBinder.limits = { pageLimit: { maxNumPages: 100, minNumPages: 1 } };
      const result = await uploadHandler.checkPageNumCount(assetData, true);
      expect(result).to.be.true;
      expect(uploadHandler.showSplashScreen.called).to.be.false;
    });

    it('should handle min page count not met for multi-file', async () => {
      const assetData = { id: 'asset-123' };
      uploadHandler.serviceHandler.getCallToService = sinon.stub().resolves({ numPages: 0 });
      uploadHandler.actionBinder.limits = { pageLimit: { maxNumPages: 100, minNumPages: 1 } };
      const result = await uploadHandler.checkPageNumCount(assetData, true);
      expect(result).to.be.true;
    });
  });

  describe('PDF Chunking', () => {
    it('should chunk and upload PDF successfully', async () => {
      const assetDataArray = [{
        id: 'asset-123',
        blocksize: 50,
        uploadUrls: [
          { href: 'https://test.com/chunk1?partNumber=1' },
          { href: 'https://test.com/chunk2?partNumber=2' },
        ],
      }];
      const blobDataArray = [new Blob(['x'.repeat(75)])];
      const filetypeArray = ['application/pdf'];

      uploadHandler.uploadFileToUnityWithRetry = sinon.stub().resolves({ attempt: 1 });

      const result = await uploadHandler.chunkPdf(assetDataArray, blobDataArray, filetypeArray, 2, null);

      expect(result.failedFiles.size).to.equal(0);
      expect(result.attemptMap.get(0)).to.equal(1);
    });

    it('should handle chunk upload failures', async () => {
      const assetDataArray = [{
        id: 'asset-123',
        blocksize: 50,
        uploadUrls: [{ href: 'https://test.com/chunk1?partNumber=1' }],
      }];
      const blobDataArray = [new Blob(['x'.repeat(25)])];
      const filetypeArray = ['application/pdf'];

      uploadHandler.uploadFileToUnityWithRetry = sinon.stub().rejects(new Error('Upload failed'));

      const result = await uploadHandler.chunkPdf(assetDataArray, blobDataArray, filetypeArray, 2, null);

      expect(result.failedFiles.size).to.equal(1);
      const failedFile = Array.from(result.failedFiles)[0];
      expect(failedFile.fileIndex).to.equal(0);
    });
  });

  describe('Content Verification', () => {
    it('should verify content successfully', async () => {
      const assetData = { id: 'asset-123' };
      mockServiceHandler.postCallToServiceWithRetry.resolves({});

      const result = await uploadHandler.verifyContent(assetData, null);
      expect(result).to.be.true;
    });

    it('should handle unexpected response', async () => {
      mockServiceHandler.postCallToServiceWithRetry.resolves({ foo: 'bar' });
      const assetData = { id: 'asset-123' };
      mockActionBinder.MULTI_FILE = false;
      const result = await uploadHandler.verifyContent(assetData, null);
      expect(result).to.be.false;
    });

    it('should handle error and abort', async () => {
      const error = new Error('Aborted');
      error.name = 'AbortError';
      mockServiceHandler.postCallToServiceWithRetry.rejects(error);
      const assetData = { id: 'asset-123' };
      const result = await uploadHandler.verifyContent(assetData, null);
      expect(result).to.be.false;
    });

    it('should handle error and multi-file', async () => {
      const error = new Error('Failed');
      error.status = 500;
      mockServiceHandler.postCallToServiceWithRetry.rejects(error);
      const assetData = { id: 'asset-123' };
      mockActionBinder.MULTI_FILE = true;
      const result = await uploadHandler.verifyContent(assetData, null);
      expect(result).to.be.false;
    });
  });

  describe('Asset Creation', () => {
    it('should create asset successfully', async () => {
      const file = { name: 'test.pdf', size: 1000, type: 'application/pdf' };
      mockServiceHandler.postCallToService.resolves({ id: 'asset-123' });

      const result = await uploadHandler.createAsset(file, true, 'workflow-123');

      expect(result.id).to.equal('asset-123');
      expect(mockServiceHandler.postCallToService.calledOnce).to.be.true;
    });
  });

  describe('Error Handling', () => {
    it('should handle duplicate asset error (409)', async () => {
      const error = new Error('Duplicate asset');
      error.status = 409;

      await uploadHandler.handleUploadError(error);

      expect(mockActionBinder.dispatchErrorToast.calledOnce).to.be.true;
      const [errorCode, status] = mockActionBinder.dispatchErrorToast.getCall(0).args;
      expect(errorCode).to.equal('upload_validation_error_duplicate_asset');
      expect(status).to.equal(409);
    });

    it('should handle quota exceeded error (403)', async () => {
      const error = new Error('quotaexceeded');
      error.status = 403;
      error.message = 'quotaexceeded';

      await uploadHandler.handleUploadError(error);

      expect(mockActionBinder.dispatchErrorToast.calledOnce).to.be.true;
      const [errorCode] = mockActionBinder.dispatchErrorToast.getCall(0).args;
      expect(errorCode).to.equal('upload_error_max_quota_exceeded');
    });

    it('should handle 401 notentitled error', async () => {
      const error = new Error('notentitled');
      error.status = 401;
      error.message = 'notentitled';
      await uploadHandler.handleUploadError(error);
      expect(mockActionBinder.dispatchErrorToast.calledWith(
        'upload_error_no_storage_provision',
        401,
        'notentitled',
        false,
        error.showError,
        sinon.match.has('subCode', 'upload_error_no_storage_provision'),
      )).to.be.true;
    });

    it('should handle 401 generic error', async () => {
      const error = new Error('some other 401');
      error.status = 401;
      error.message = 'some other 401';
      await uploadHandler.handleUploadError(error);
      expect(mockActionBinder.dispatchErrorToast.calledWith(
        'error_generic',
        401,
        'some other 401',
        false,
        error.showError,
        sinon.match.has('subCode', 401),
      )).to.be.true;
    });
  });

  describe('General Validations', () => {
    it('should pass all validations', async () => {
      const assetData = { id: 'asset-123' };
      uploadHandler.checkPageNumCount = sinon.stub().resolves(false);

      const result = await uploadHandler.handleValidations(assetData, false);

      expect(result).to.be.true;
    });

    it('should fail validations on error', async () => {
      const assetData = { id: 'asset-123' };
      uploadHandler.checkPageNumCount = sinon.stub().resolves(true);

      const result = await uploadHandler.handleValidations(assetData, false);

      expect(result).to.be.false;
    });
  });

  describe('getBlobData', () => {
    let file;
    let originalCreateObjectURL;
    let originalRevokeObjectURL;
    let fetchStub;

    beforeEach(() => {
      // Create a mock file
      file = new File(['test content'], 'test.txt', { type: 'text/plain' });

      // Stub URL.createObjectURL and URL.revokeObjectURL
      originalCreateObjectURL = URL.createObjectURL;
      originalRevokeObjectURL = URL.revokeObjectURL;
      URL.createObjectURL = sinon.stub().returns('blob:mock-url');
      URL.revokeObjectURL = sinon.stub();

      // Stub fetch
      fetchStub = sinon.stub(window, 'fetch');
    });

    afterEach(() => {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      fetchStub.restore();
    });

    it('should return a blob for a valid file', async () => {
      const mockBlob = new Blob(['test content'], { type: 'text/plain' });
      fetchStub.resolves({
        ok: true,
        blob: sinon.stub().resolves(mockBlob),
      });

      const result = await uploadHandler.getBlobData(file);
      expect(result).to.be.instanceOf(Blob);
      expect(URL.createObjectURL.calledOnce).to.be.true;
      expect(URL.revokeObjectURL.calledOnceWith('blob:mock-url')).to.be.true;
    });

    it('should throw an error if fetch response is not ok', async () => {
      fetchStub.resolves({
        ok: false,
        status: 404,
      });

      try {
        await uploadHandler.getBlobData(file);
        throw new Error('Should have thrown');
      } catch (err) {
        expect(err).to.be.instanceOf(Error);
        expect(err.status).to.equal(404);
      }
    });
  });

  describe('uploadFileToUnity', () => {
    let fetchStub;
    let fileBlob;
    const url = 'https://upload-url';
    const fileType = 'application/pdf';
    const assetId = 'asset-123';
    const signal = null;
    const chunkNumber = 1;

    beforeEach(() => {
      fileBlob = new Blob(['test'], { type: fileType });
      fetchStub = sinon.stub(window, 'fetch');
    });

    afterEach(() => {
      fetchStub.restore();
    });

    it('should resolve with response if upload is successful', async () => {
      const mockResponse = { ok: true };
      fetchStub.resolves(mockResponse);

      const result = await uploadHandler.uploadFileToUnity(url, fileBlob, fileType, assetId, signal, chunkNumber);
      expect(result).to.equal(mockResponse);
      expect(fetchStub.calledOnce).to.be.true;
    });

    it('should handle network errors and call dispatchErrorToast', async () => {
      const networkError = new TypeError('Network error');
      fetchStub.rejects(networkError);

      try {
        await uploadHandler.uploadFileToUnity(url, fileBlob, fileType, assetId, signal, chunkNumber);
        throw new Error('Should have thrown');
      } catch (err) {
        expect(err).to.equal(networkError);
        expect(mockActionBinder.dispatchErrorToast.calledOnce).to.be.true;
      }
    });

    it('should handle non-ok response', async () => {
      fetchStub.resolves({ ok: false, status: 500, statusText: 'fail' });
      try {
        await uploadHandler.uploadFileToUnity('url', new Blob(['test']), 'application/pdf', 'id', null, 1);
      } catch (e) {
        expect(mockActionBinder.dispatchErrorToast.calledWith('upload_warn_chunk_upload')).to.be.true;
      }
    });

    it('should handle network error', async () => {
      fetchStub.rejects(new TypeError('Network error'));
      try {
        await uploadHandler.uploadFileToUnity('url', new Blob(['test']), 'application/pdf', 'id', null, 1);
      } catch (e) {
        expect(mockActionBinder.dispatchErrorToast.calledWith('upload_warn_chunk_upload')).to.be.true;
      }
    });

    it('should handle timeout error', async () => {
      const error = new Error('Timeout');
      error.name = 'Timeout';
      fetchStub.rejects(error);
      try {
        await uploadHandler.uploadFileToUnity('url', new Blob(['test']), 'application/pdf', 'id', null, 1);
      } catch (e) {
        expect(mockActionBinder.dispatchErrorToast.calledWith('upload_warn_chunk_upload')).to.be.true;
      }
    });
  });

  describe('uploadFileToUnityWithRetry', () => {
    let uploadStub;
    const url = 'https://upload-url';
    const fileBlob = new Blob(['test'], { type: 'application/pdf' });
    const fileType = 'application/pdf';
    const assetId = 'asset-123';
    const signal = null;
    const chunkNumber = 1;

    beforeEach(() => {
      uploadStub = sinon.stub(uploadHandler, 'uploadFileToUnity');
    });

    afterEach(() => {
      uploadStub.restore();
    });

    it('should resolve if upload succeeds on first try', async () => {
      uploadStub.resolves({ ok: true });

      const result = await uploadHandler.uploadFileToUnityWithRetry(url, fileBlob, fileType, assetId, signal, chunkNumber);
      expect(result.response.ok).to.be.true;
      expect(result.attempt).to.equal(1);
      expect(uploadStub.calledOnce).to.be.true;
    });

    it('should throw immediately on AbortError', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      uploadStub.onFirstCall().rejects(abortError);

      try {
        await uploadHandler.uploadFileToUnityWithRetry(url, fileBlob, fileType, assetId, signal, chunkNumber);
        throw new Error('Should have thrown');
      } catch (err) {
        expect(err).to.equal(abortError);
        expect(uploadStub.calledOnce).to.be.true;
      }
    });
  });

  describe('getDeviceType', () => {
    let hardwareConcurrencyDescriptor;

    beforeEach(() => {
      hardwareConcurrencyDescriptor = Object.getOwnPropertyDescriptor(navigator, 'hardwareConcurrency');
    });

    afterEach(() => {
      // Restore the original property
      if (hardwareConcurrencyDescriptor) {
        Object.defineProperty(navigator, 'hardwareConcurrency', hardwareConcurrencyDescriptor);
      }
    });

    function setHardwareConcurrency(value) {
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        configurable: true,
        get: () => value,
      });
    }

    it('should return HIGH_END for 8 cores', () => {
      setHardwareConcurrency(8);
      expect(uploadHandler.getDeviceType()).to.equal('HIGH_END');
    });

    it('should return MID_RANGE for 4 cores', () => {
      setHardwareConcurrency(4);
      expect(uploadHandler.getDeviceType()).to.equal('MID_RANGE');
    });

    it('should return LOW_END for 2 cores', () => {
      setHardwareConcurrency(2);
      expect(uploadHandler.getDeviceType()).to.equal('LOW_END');
    });

    it('should return MID_RANGE if hardwareConcurrency is undefined', () => {
      setHardwareConcurrency(undefined);
      expect(uploadHandler.getDeviceType()).to.equal('MID_RANGE');
    });

    it('should return MID_RANGE if hardwareConcurrency is null', () => {
      setHardwareConcurrency(null);
      expect(uploadHandler.getDeviceType()).to.equal('MID_RANGE');
    });
  });

  describe('uploadSingleFile', () => {
    let file;
    let fileData;
    let blobData;
    let assetData;

    beforeEach(() => {
      file = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
      fileData = { type: 'application/pdf', size: 1000, count: 1, uploadType: 'sfu' };
      blobData = new Blob(['test content'], { type: 'application/pdf' });
      assetData = { id: 'asset-123', blocksize: 50, uploadUrls: [{ href: 'https://test.com/chunk1?partNumber=1' }] };

      uploadHandler.getBlobData = sinon.stub().resolves(blobData);
      uploadHandler.createAsset = sinon.stub().resolves(assetData);
      uploadHandler.chunkPdf = sinon.stub().resolves({ failedFiles: new Set(), attemptMap: new Map([[0, 1]]) });
      uploadHandler.verifyContent = sinon.stub().resolves(true);
      uploadHandler.handleValidations = sinon.stub().resolves(true);
    });

    it('should successfully upload a single file', async () => {
      await uploadHandler.uploadSingleFile(file, fileData);

      expect(uploadHandler.getBlobData.calledOnce).to.be.true;
      expect(uploadHandler.createAsset.calledOnce).to.be.true;
      expect(uploadHandler.chunkPdf.calledOnce).to.be.true;
      expect(uploadHandler.verifyContent.calledOnce).to.be.true;
      expect(uploadHandler.handleValidations.calledOnce).to.be.true;
      expect(mockActionBinder.setAssetId.calledWith(assetData.id)).to.be.true;
      expect(mockActionBinder.handleRedirect.calledOnce).to.be.true;
      expect(mockActionBinder.setIsUploading.calledWith(true)).to.be.true;
    });

    it('should handle asset creation error', async () => {
      uploadHandler.createAsset = sinon.stub().rejects(new Error('fail'));

      await uploadHandler.uploadSingleFile(file, fileData);

      expect(mockActionBinder.dispatchErrorToast.calledOnce).to.be.true;
      expect(mockActionBinder.handleRedirect.called).to.be.false;
    });

    it('should handle chunkPdf error', async () => {
      uploadHandler.getBlobData = sinon.stub().resolves(new Blob(['test']));
      uploadHandler.createAsset = sinon.stub().resolves({ id: 'asset-123', blocksize: 50, uploadUrls: [{ href: 'url' }] });
      uploadHandler.chunkPdf = sinon.stub().throws(new Error('fail'));
      await uploadHandler.uploadSingleFile(new File(['test'], 'test.pdf', { type: 'application/pdf' }), {});
      expect(mockActionBinder.dispatchErrorToast.calledWith('upload_error_chunk_upload')).to.be.true;
    });

    it('should handle failedFiles.size === 1', async () => {
      uploadHandler.getBlobData = sinon.stub().resolves(new Blob(['test']));
      uploadHandler.createAsset = sinon.stub().resolves({ id: 'asset-123', blocksize: 50, uploadUrls: [{ href: 'url' }] });
      uploadHandler.chunkPdf = sinon.stub().resolves({ failedFiles: new Set([{}]), attemptMap: new Map() });
      uploadHandler.showSplashScreen = sinon.stub().resolves();
      await uploadHandler.uploadSingleFile(new File(['test'], 'test.pdf', { type: 'application/pdf' }), {});
      expect(uploadHandler.showSplashScreen.called).to.be.true;
      expect(mockActionBinder.dispatchErrorToast.calledWith('upload_error_chunk_upload')).to.be.true;
    });
  });

  describe('uploadMultiFile', () => {
    let files;
    let filesData;

    beforeEach(() => {
      files = [
        new File(['test content'], 'test1.pdf', { type: 'application/pdf' }),
        new File(['test content'], 'test2.pdf', { type: 'application/pdf' }),
      ];
      filesData = { type: 'application/pdf', size: 2000, count: 2, uploadType: 'mfu' };

      uploadHandler.createInitialAssets = sinon.stub().resolves({
        blobDataArray: [new Blob(['test']), new Blob(['test'])],
        assetDataArray: [{ id: 'asset1' }, { id: 'asset2' }],
        fileTypeArray: ['application/pdf', 'application/pdf'],
      });
      uploadHandler.chunkPdf = sinon.stub().resolves({ failedFiles: new Set(), attemptMap: new Map() });
      uploadHandler.processUploadedAssets = sinon.stub().resolves({
        verifiedAssets: [{ id: 'asset1' }, { id: 'asset2' }],
        assetsToDelete: [],
      });
      uploadHandler.deleteFailedAssets = sinon.stub();
      uploadHandler.transitionScreen = mockTransitionScreen;
      uploadHandler.initSplashScreen = sinon.stub().resolves();
    });

    it('should successfully upload multiple files', async () => {
      await uploadHandler.uploadMultiFile(files, filesData);

      expect(uploadHandler.createInitialAssets.calledOnce).to.be.true;
      expect(uploadHandler.chunkPdf.calledOnce).to.be.true;
      expect(uploadHandler.processUploadedAssets.calledOnce).to.be.true;
      expect(uploadHandler.deleteFailedAssets.calledOnce).to.be.true;
      expect(mockActionBinder.handleRedirect.calledOnce).to.be.true;
    });

    it('should handle asset creation failure', async () => {
      uploadHandler.createInitialAssets.resolves({
        blobDataArray: [],
        assetDataArray: [],
        fileTypeArray: [],
      });

      await uploadHandler.uploadMultiFile(files, filesData);

      expect(mockActionBinder.dispatchErrorToast.calledOnce).to.be.true;
      expect(mockActionBinder.handleRedirect.called).to.be.false;
    });

    it('should handle all files failing chunk upload', async () => {
      uploadHandler.createInitialAssets = sinon.stub().resolves({
        blobDataArray: [new Blob(['test'])],
        assetDataArray: [{ id: 'asset1' }],
        fileTypeArray: ['application/pdf'],
      });
      uploadHandler.chunkPdf = sinon.stub().resolves({ failedFiles: new Set([0]), attemptMap: new Map() });
      const failingFiles = [new File(['test'], 'test.pdf', { type: 'application/pdf' })];
      await uploadHandler.uploadMultiFile(failingFiles, {});
      expect(mockActionBinder.dispatchErrorToast.calledWith('upload_error_chunk_upload')).to.be.true;
    });

    it('should handle verifiedAssets.length === 0', async () => {
      uploadHandler.createInitialAssets = sinon.stub().resolves({
        blobDataArray: [new Blob(['test'])],
        assetDataArray: [{ id: 'asset1' }],
        fileTypeArray: ['application/pdf'],
      });
      uploadHandler.chunkPdf = sinon.stub().resolves({ failedFiles: new Set(), attemptMap: new Map() });
      uploadHandler.processUploadedAssets = sinon.stub().resolves({
        verifiedAssets: [],
        assetsToDelete: [],
      });
      uploadHandler.deleteFailedAssets = sinon.stub().resolves();
      uploadHandler.transitionScreen = { showSplashScreen: sinon.stub().resolves(), updateProgressBar: sinon.stub() };
      const noVerifiedFiles = [new File(['test'], 'test.pdf', { type: 'application/pdf' })];
      await uploadHandler.uploadMultiFile(noVerifiedFiles, {});
      expect(uploadHandler.transitionScreen.showSplashScreen.called).to.be.true;
      expect(mockActionBinder.dispatchErrorToast.calledWith('upload_validation_error_max_page_count_multi')).to.be.true;
    });
  });

  describe('createInitialAssets', () => {
    let files;
    let workflowId;

    beforeEach(() => {
      files = [
        new File(['test content'], 'test1.pdf', { type: 'application/pdf' }),
        new File(['test content'], 'test2.pdf', { type: 'application/pdf' }),
      ];
      workflowId = 'workflow-123';

      uploadHandler.getBlobData = sinon.stub().resolves(new Blob(['test']));
      uploadHandler.createAsset = sinon.stub().resolves({ id: 'asset-123' });
    });

    it('should create assets for all files', async () => {
      const result = await uploadHandler.createInitialAssets(files, workflowId, 2);

      expect(result.blobDataArray.length).to.equal(2);
      expect(result.assetDataArray.length).to.equal(2);
      expect(result.fileTypeArray.length).to.equal(2);
      expect(uploadHandler.getBlobData.calledTwice).to.be.true;
      expect(uploadHandler.createAsset.calledTwice).to.be.true;
    });

    it('should handle file processing error', async () => {
      uploadHandler.getBlobData.rejects(new Error('Blob creation failed'));

      const result = await uploadHandler.createInitialAssets(files, workflowId, 2);

      expect(result.blobDataArray.length).to.equal(0);
      expect(result.assetDataArray.length).to.equal(0);
      expect(result.fileTypeArray.length).to.equal(0);
      expect(mockActionBinder.dispatchErrorToast.called).to.be.true;
    });
  });

  describe('processUploadedAssets', () => {
    let uploadedAssets;

    beforeEach(() => {
      uploadedAssets = [
        { id: 'asset1' },
        { id: 'asset2' },
      ];

      uploadHandler.verifyContent = sinon.stub().resolves(true);
      uploadHandler.handleValidations = sinon.stub().resolves(true);
    });

    it('should process all assets successfully', async () => {
      const result = await uploadHandler.processUploadedAssets(uploadedAssets);

      expect(result.verifiedAssets.length).to.equal(2);
      expect(result.assetsToDelete.length).to.equal(0);
      expect(uploadHandler.verifyContent.calledTwice).to.be.true;
      expect(uploadHandler.handleValidations.calledTwice).to.be.true;
    });

    it('should handle failed validations', async () => {
      uploadHandler.handleValidations.resolves(false);
      const result = await uploadHandler.processUploadedAssets(uploadedAssets);
      expect(result.verifiedAssets.length).to.equal(0);
      expect(result.assetsToDelete.length).to.equal(2);
    });

    it('should handle failed content verification', async () => {
      uploadHandler.verifyContent.resolves(false);
      const result = await uploadHandler.processUploadedAssets(uploadedAssets);
      expect(result.verifiedAssets.length).to.equal(0);
      expect(result.assetsToDelete.length).to.equal(2);
    });
  });

  describe('deleteFailedAssets', () => {
    let assetsToDelete;
    let accessToken;

    beforeEach(() => {
      assetsToDelete = [
        { id: 'asset1' },
        { id: 'asset2' },
      ];
      accessToken = 'test-token';
      window.getGuestAccessToken = sinon.stub().resolves(accessToken);
      mockServiceHandler.deleteCallToService = sinon.stub().resolves();
    });

    it('should handle deletion error', async () => {
      mockServiceHandler.deleteCallToService.rejects(new Error('Deletion failed'));
      await uploadHandler.deleteFailedAssets(assetsToDelete);
      expect(mockActionBinder.dispatchErrorToast.calledOnce).to.be.true;
    });

    it('should not attempt deletion for empty array', async () => {
      await uploadHandler.deleteFailedAssets([]);
      expect(mockServiceHandler.deleteCallToService.called).to.be.false;
    });
  });

  describe('dispatchGenericError', () => {
    it('should call showSplashScreen and dispatchErrorToast', async () => {
      await uploadHandler.dispatchGenericError('info', true);
      expect(uploadHandler.showSplashScreen.called).to.be.true;
      expect(mockActionBinder.dispatchErrorToast.called).to.be.true;
    });
  });

  describe('singleFileGuestUpload', () => {
    it('should upload PDF file', async () => {
      sinon.stub(uploadHandler, 'isPdf').returns(true);
      sinon.stub(uploadHandler, 'uploadSingleFile').resolves();
      const file = { type: 'application/pdf' };
      await uploadHandler.singleFileGuestUpload(file, {});
      expect(uploadHandler.uploadSingleFile.called).to.be.true;
    });
    it('should handle non-PDF file', async () => {
      sinon.stub(uploadHandler, 'isPdf').returns(false);
      mockActionBinder.handleRedirect.resetBehavior();
      mockActionBinder.handleRedirect.resolves(true);
      const file = { type: 'text/plain' };
      await uploadHandler.singleFileGuestUpload(file, {});
      expect(mockActionBinder.handleRedirect.called).to.be.true;
    });
    it('should handle error', async () => {
      sinon.stub(uploadHandler, 'uploadSingleFile').rejects(new Error('fail'));
      sinon.stub(uploadHandler, 'isPdf').returns(true);
      const file = { type: 'application/pdf' };
      await uploadHandler.singleFileGuestUpload(file, {});
      expect(uploadHandler.showSplashScreen.called).to.be.true;
    });
  });

  describe('singleFileUserUpload', () => {
    it('should upload PDF file', async () => {
      sinon.stub(uploadHandler, 'isPdf').returns(true);
      sinon.stub(uploadHandler, 'uploadSingleFile').resolves();
      const file = { type: 'application/pdf' };
      await uploadHandler.singleFileUserUpload(file, {});
      expect(uploadHandler.uploadSingleFile.called).to.be.true;
    });
    it('should handle error', async () => {
      sinon.stub(uploadHandler, 'uploadSingleFile').rejects(new Error('fail'));
      sinon.stub(uploadHandler, 'isPdf').returns(true);
      const file = { type: 'application/pdf' };
      await uploadHandler.singleFileUserUpload(file, {});
      expect(uploadHandler.showSplashScreen.called).to.be.true;
    });
  });

  describe('uploadFileChunks', () => {
    it('should call chunkPdf and return filtered assets', async () => {
      const assetDataArray = [{ id: 'a1' }, { id: 'a2' }];
      const blobDataArray = [new Blob(['a']), new Blob(['b'])];
      const fileTypeArray = ['application/pdf', 'application/pdf'];
      sinon.stub(uploadHandler, 'chunkPdf').resolves(new Set([1]));
      const result = await uploadHandler.uploadFileChunks(assetDataArray, blobDataArray, fileTypeArray, 2);
      expect(uploadHandler.chunkPdf.calledOnce).to.be.true;
      expect(result).to.deep.equal([assetDataArray[0]]);
    });
  });

  describe('showSplashScreen', () => {
    it('should call initSplashScreen and transitionScreen.showSplashScreen', async () => {
      uploadHandler.showSplashScreen.restore();
      uploadHandler.initSplashScreen.restore();
      const showStub = sinon.stub().resolves();
      sinon.stub(uploadHandler, 'initSplashScreen').callsFake(() => {
        uploadHandler.transitionScreen = { showSplashScreen: showStub };
      });
      await uploadHandler.showSplashScreen(true);
      expect(uploadHandler.initSplashScreen.calledOnce).to.be.true;
      expect(showStub.calledWith(true)).to.be.true;
    });
  });

  describe('multiFileGuestUpload', () => {
    beforeEach(() => {
      sinon.restore();
      if (uploadHandler.showSplashScreen.restore) uploadHandler.showSplashScreen.restore();
      sinon.stub(uploadHandler, 'showSplashScreen').resolves();
      sinon.stub(uploadHandler, 'uploadMultiFile').resolves();
      sinon.stub(uploadHandler, 'dispatchGenericError').resolves();
    });
    afterEach(() => {
      sinon.restore();
    });
    it('should redirect if all files are non-PDF', async () => {
      sinon.stub(uploadHandler, 'isPdf').returns(false);
      mockActionBinder.workflowCfg.targetCfg.nonpdfMfuFeedbackScreenTypeNonpdf = ['test-feature'];
      const files = [{ type: 'text/plain' }];
      await uploadHandler.multiFileGuestUpload(files, {});
      expect(mockActionBinder.handleRedirect.called).to.be.true;
    });
    it('should call uploadMultiFile if mfuUploadAllowed', async () => {
      mockActionBinder.workflowCfg.targetCfg.mfuUploadAllowed = ['test-feature'];
      const files = [{ type: 'application/pdf' }];
      await uploadHandler.multiFileGuestUpload(files, {});
      expect(uploadHandler.uploadMultiFile.called).to.be.true;
    });
    it('should call uploadMultiFile with only PDFs if mfuUploadOnlyPdfAllowed', async () => {
      mockActionBinder.workflowCfg.targetCfg.mfuUploadAllowed = ['test-feature'];
      mockActionBinder.workflowCfg.targetCfg.mfuUploadOnlyPdfAllowed = ['test-feature'];
      sinon.stub(uploadHandler, 'isPdf').returns(true);
      const files = [{ type: 'application/pdf' }, { type: 'application/pdf' }];
      await uploadHandler.multiFileGuestUpload(files, {});
      expect(uploadHandler.uploadMultiFile.called).to.be.true;
    });
    it('should handle fallback (delay, update progress, redirect)', async () => {
      mockActionBinder.workflowCfg.targetCfg.mfuUploadAllowed = [];
      const files = [{ type: 'application/pdf' }];
      await uploadHandler.multiFileGuestUpload(files, {});
      expect(mockActionBinder.delay.called).to.be.true;
      expect(uploadHandler.transitionScreen.updateProgressBar.called).to.be.true;
      expect(mockActionBinder.handleRedirect.called).to.be.true;
    });
    it('should handle error', async () => {
      uploadHandler.uploadMultiFile.restore();
      sinon.stub(uploadHandler, 'uploadMultiFile').throws(new Error('fail'));
      mockActionBinder.workflowCfg.targetCfg.mfuUploadAllowed = ['test-feature'];
      const files = [{ type: 'application/pdf' }];
      await uploadHandler.multiFileGuestUpload(files, {});
      expect(uploadHandler.dispatchGenericError.called).to.be.true;
    });
  });

  describe('multiFileUserUpload', () => {
    beforeEach(() => {
      if (uploadHandler.showSplashScreen.restore) uploadHandler.showSplashScreen.restore();
      sinon.stub(uploadHandler, 'showSplashScreen').resolves();
      sinon.stub(uploadHandler, 'uploadMultiFile').resolves();
      sinon.stub(uploadHandler, 'dispatchGenericError').resolves();
      if (mockActionBinder.dispatchAnalyticsEvent.resetHistory) {
        mockActionBinder.dispatchAnalyticsEvent.resetHistory();
      }
    });
    afterEach(() => {
      sinon.restore();
    });
    it('should call showSplashScreen, uploadMultiFile, and analytics', async () => {
      const files = [{ type: 'application/pdf' }];
      await uploadHandler.multiFileUserUpload(files, {});
      expect(uploadHandler.showSplashScreen.called).to.be.true;
      expect(uploadHandler.uploadMultiFile.called).to.be.true;
      expect(mockActionBinder.dispatchAnalyticsEvent.calledWith('uploaded')).to.be.true;
    });
    it('should handle error', async () => {
      uploadHandler.uploadMultiFile.restore();
      sinon.stub(uploadHandler, 'uploadMultiFile').throws(new Error('fail'));
      const files = [{ type: 'application/pdf' }];
      await uploadHandler.multiFileUserUpload(files, {});
      expect(uploadHandler.dispatchGenericError.called).to.be.true;
    });
  });

  describe('getConcurrentLimits', () => {
    it('should return correct concurrent limits for multi-file', () => {
      uploadHandler.actionBinder.MULTI_FILE = true;
      const limits = uploadHandler.getConcurrentLimits();
      expect(limits).to.have.property('maxConcurrentFiles');
      expect(limits).to.have.property('maxConcurrentChunks');
    });
  });

  describe('verifyContent', () => {
    it('should handle unexpected response in verifyContent', async () => {
      mockServiceHandler.postCallToServiceWithRetry.resolves({ foo: 'bar' });
      const assetData = { id: 'asset-123' };
      uploadHandler.actionBinder.MULTI_FILE = true;
      const result = await uploadHandler.verifyContent(assetData, null);
      expect(result).to.be.false;
      expect(mockActionBinder.dispatchErrorToast.calledWith(
        'upload_error_finalize_asset',
      )).to.be.true;
    });
  });
});
