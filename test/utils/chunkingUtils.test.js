import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import {
  createFileChunks,
  validateChunkUrls,
  extractChunkNumber,
  createChunkUploadTasks,
  batchChunkUpload,
  calculateChunkProgress,
  createChunkUploadErrorMessage,
  createChunkAnalyticsData,
  DEFAULT_CHUNK_CONFIG,
  ChunkingUtils,
} from '../../unitylibs/utils/chunkingUtils.js';

describe('Chunking Utils', () => {
  describe('createFileChunks', () => {
    it('should create correct number of chunks for small file', () => {
      const file = new File(['test data'], 'test.txt', { type: 'text/plain' });
      const chunks = createFileChunks(file, 1024);
      expect(chunks).to.have.length(1);
      expect(chunks[0].size).to.equal(9); // 'test data' length
    });

    it('should create multiple chunks for large file', () => {
      const largeData = 'x'.repeat(2048); // 2KB
      const file = new File([largeData], 'large.txt', { type: 'text/plain' });
      const chunks = createFileChunks(file, 1024); // 1KB chunks
      expect(chunks).to.have.length(2);
      expect(chunks[0].size).to.equal(1024);
      expect(chunks[1].size).to.equal(1024);
    });

    it('should handle edge case where file size equals block size', () => {
      const data = 'x'.repeat(1024);
      const file = new File([data], 'exact.txt', { type: 'text/plain' });
      const chunks = createFileChunks(file, 1024);
      expect(chunks).to.have.length(1);
      expect(chunks[0].size).to.equal(1024);
    });
  });

  describe('validateChunkUrls', () => {
    it('should not throw error for matching URLs and chunks', () => {
      const uploadUrls = ['url1', 'url2', 'url3'];
      expect(() => validateChunkUrls(uploadUrls, 3)).to.not.throw();
    });

    it('should throw error for mismatched URLs and chunks', () => {
      const uploadUrls = ['url1', 'url2'];
      expect(() => validateChunkUrls(uploadUrls, 3)).to.throw('Mismatch between number of chunks (3) and upload URLs (2)');
    });
  });

  describe('extractChunkNumber', () => {
    it('should extract chunk number from URL with partNumber param', () => {
      const url = 'https://example.com/upload?partNumber=5';
      const chunkNumber = extractChunkNumber(url, 0);
      expect(chunkNumber).to.equal(5);
    });

    it('should use fallback index when partNumber not found', () => {
      const url = 'https://example.com/upload';
      const chunkNumber = extractChunkNumber(url, 3);
      expect(chunkNumber).to.equal(3);
    });

    it('should handle URL object', () => {
      const url = new URL('https://example.com/upload?partNumber=7');
      const chunkNumber = extractChunkNumber(url, 0);
      expect(chunkNumber).to.equal(7);
    });
  });

  describe('createChunkUploadTasks', () => {
    let mockUploadFunction;
    let mockFile;
    let mockSignal;

    beforeEach(() => {
      mockUploadFunction = sinon.stub();
      mockFile = new File(['test data'], 'test.txt', { type: 'text/plain' });
      mockSignal = { aborted: false };
    });

    it('should create upload tasks for single chunk', async () => {
      const uploadUrls = ['https://example.com/upload'];
      mockUploadFunction.resolves({ response: 'success', attempt: 1 });
      const result = await createChunkUploadTasks(
        uploadUrls,
        mockFile,
        1024,
        mockUploadFunction,
        mockSignal,
        { assetId: 'test-asset' },
      );
      expect(result.failedChunks.size).to.equal(0);
      expect(result.attemptMap.size).to.equal(1);
      expect(mockUploadFunction.calledOnce).to.be.true;
    });

    it('should handle multiple chunks', async () => {
      const largeData = 'x'.repeat(2048);
      const largeFile = new File([largeData], 'large.txt', { type: 'text/plain' });
      const uploadUrls = ['https://example.com/upload1', 'https://example.com/upload2'];
      mockUploadFunction.resolves({ response: 'success', attempt: 1 });
      const result = await createChunkUploadTasks(
        uploadUrls,
        largeFile,
        1024,
        mockUploadFunction,
        mockSignal,
        { assetId: 'test-asset' },
      );
      expect(result.failedChunks.size).to.equal(0);
      expect(result.attemptMap.size).to.equal(2);
      expect(mockUploadFunction.calledTwice).to.be.true;
    });

    it('should handle upload failures', async () => {
      const uploadUrls = ['https://example.com/upload'];
      const uploadError = new Error('Upload failed');
      mockUploadFunction.rejects(uploadError);
      const result = await createChunkUploadTasks(
        uploadUrls,
        mockFile,
        1024,
        mockUploadFunction,
        mockSignal,
        { assetId: 'test-asset' },
      );
      expect(result.failedChunks.size).to.equal(1);
      expect(result.attemptMap.size).to.equal(0);
    });

    it('should handle aborted signal', async () => {
      const uploadUrls = ['https://example.com/upload'];
      mockSignal.aborted = true;
      const result = await createChunkUploadTasks(
        uploadUrls,
        mockFile,
        1024,
        mockUploadFunction,
        mockSignal,
        { assetId: 'test-asset' },
      );
      expect(result.failedChunks.size).to.equal(0);
      expect(result.attemptMap.size).to.equal(0);
      expect(mockUploadFunction.called).to.be.false;
    });
  });

  describe('batchChunkUpload', () => {
    let mockUploadFunction;
    let mockSignal;

    beforeEach(() => {
      mockUploadFunction = sinon.stub();
      mockSignal = { aborted: false };
    });

    it('should handle batch upload with multiple files', async () => {
      const fileData = [
        { assetId: 'asset1', blocksize: 1024, uploadUrls: ['https://upload.com/chunk1?partNumber=1', 'https://upload.com/chunk2?partNumber=2'] },
        { assetId: 'asset2', blocksize: 1024, uploadUrls: ['https://upload.com/chunk3?partNumber=1', 'https://upload.com/chunk4?partNumber=2'] },
      ];
      const blobDataArray = [
        new File(['x'.repeat(2048)], 'file1.txt'),
        new File(['y'.repeat(2048)], 'file2.txt'),
      ];
      const filetypeArray = ['text/plain', 'text/plain'];
      mockUploadFunction.resolves({ response: 'success', attempt: 1 });
      const result = await batchChunkUpload(
        fileData,
        blobDataArray,
        filetypeArray,
        2,
        mockUploadFunction,
        mockSignal,
        {},
      );
      expect(result.failedFiles.size).to.equal(0);
      expect(mockUploadFunction.callCount).to.equal(4); // Should be called 4 times
      expect(result.attemptMap.size).to.equal(4); // 2 files * 2 chunks each
    });

    it('should handle file upload failures', async () => {
      const fileData = [{ assetId: 'asset1', blocksize: 1024, uploadUrls: ['https://upload.com/chunk1?partNumber=1'] }];
      const blobDataArray = [new File(['test'], 'file.txt')];
      const filetypeArray = ['text/plain'];
      const uploadError = new Error('Upload failed');
      mockUploadFunction.rejects(uploadError);
      const result = await batchChunkUpload(
        fileData,
        blobDataArray,
        filetypeArray,
        1,
        mockUploadFunction,
        mockSignal,
        {},
      );
      expect(result.failedFiles.size).to.equal(1);
      expect(mockUploadFunction.callCount).to.equal(1); // Should be called once before failing
    });
  });

  describe('calculateChunkProgress', () => {
    it('should calculate progress correctly', () => {
      const progress = calculateChunkProgress(5, 10, 20);
      expect(progress).to.equal(60); // 20 + (5/10) * 80 = 20 + 40 = 60
    });

    it('should not exceed 100%', () => {
      const progress = calculateChunkProgress(10, 10, 90);
      expect(progress).to.equal(100);
    });

    it('should handle zero completed chunks', () => {
      const progress = calculateChunkProgress(0, 10, 0);
      expect(progress).to.equal(0);
    });
  });

  describe('createChunkUploadErrorMessage', () => {
    it('should create proper error message', () => {
      const message = createChunkUploadErrorMessage('asset123', 1024, 'text/plain', 2);
      expect(message).to.equal('One or more chunks failed to upload for asset: asset123, 1024 bytes, text/plain. Failed chunks: 2');
    });
  });

  describe('createChunkAnalyticsData', () => {
    it('should create analytics data with timestamp', () => {
      const data = createChunkAnalyticsData('Test Event', { assetId: 'test' });
      expect(data.event).to.equal('Test Event');
      expect(data.assetId).to.equal('test');
      expect(data.timestamp).to.be.a('string');
    });
  });

  describe('ChunkingUtils class', () => {
    let chunkingUtils;

    beforeEach(() => {
      chunkingUtils = new ChunkingUtils();
    });

    it('should use default config', () => {
      expect(chunkingUtils.config.blockSize).to.equal(DEFAULT_CHUNK_CONFIG.blockSize);
      expect(chunkingUtils.config.maxRetries).to.equal(DEFAULT_CHUNK_CONFIG.maxRetries);
    });

    it('should allow custom config', () => {
      const customConfig = { blockSize: 2048, maxRetries: 5 };
      const customUtils = new ChunkingUtils(customConfig);
      expect(customUtils.config.blockSize).to.equal(2048);
      expect(customUtils.config.maxRetries).to.equal(5);
    });

    it('should upload file with chunking', async () => {
      const mockUploadFunction = sinon.stub().resolves({ response: 'success', attempt: 1 });
      const mockFile = new File(['test'], 'test.txt');
      const uploadUrls = ['https://example.com/upload'];
      const result = await chunkingUtils.uploadFile({
        uploadUrls,
        file: mockFile,
        blockSize: 1024,
        uploadFunction: mockUploadFunction,
        signal: { aborted: false },
      });
      expect(result.failedChunks.size).to.equal(0);
      expect(mockUploadFunction.calledOnce).to.be.true;
    });
  });
});
