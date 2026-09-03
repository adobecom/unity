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
  getAssetId,
  executeInBatches,
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

  describe('getAssetId', () => {
    it('should return id when id is present', () => {
      const assetData = { id: 'asset-123', assetId: 'asset-456' };
      expect(getAssetId(assetData)).to.equal('asset-123');
    });

    it('should return assetId when id is not present', () => {
      const assetData = { assetId: 'asset-456' };
      expect(getAssetId(assetData)).to.equal('asset-456');
    });

    it('should return undefined when neither is present', () => {
      const assetData = {};
      expect(getAssetId(assetData)).to.be.undefined;
    });
  });

  describe('executeInBatches', () => {
    it('should execute all items with concurrency limit', async () => {
      const items = [1, 2, 3, 4, 5];
      const results = [];
      const processFn = async (item) => {
        results.push(item);
      };
      await executeInBatches(items, 2, processFn);
      expect(results).to.have.length(5);
      expect(results).to.include.members([1, 2, 3, 4, 5]);
    });

    it('should handle empty items array', async () => {
      const results = [];
      await executeInBatches([], 2, async (item) => { results.push(item); });
      expect(results).to.have.length(0);
    });

    it('should handle errors gracefully', async () => {
      const items = [1, 2, 3];
      let errorCount = 0;
      const processFn = async (item) => {
        if (item === 2) throw new Error('Test error');
        errorCount += 1;
      };
      await executeInBatches(items, 2, processFn);
      expect(errorCount).to.equal(2);
    });
  });

  describe('batchChunkUpload', () => {
    let mockUploadFunction;
    let mockSignal;

    beforeEach(() => {
      mockUploadFunction = sinon.stub();
      mockSignal = { aborted: false };
    });

    it('should upload chunks for multiple files with flat batching', async () => {
      const assetDataArray = [
        { id: 'asset1', blocksize: 1024, uploadUrls: [{ href: 'https://upload.com/chunk1?partNumber=1' }] },
        { id: 'asset2', blocksize: 1024, uploadUrls: [{ href: 'https://upload.com/chunk2?partNumber=1' }] },
      ];
      const blobDataArray = [
        new File(['x'.repeat(512)], 'file1.txt'),
        new File(['y'.repeat(512)], 'file2.txt'),
      ];
      const filetypeArray = ['text/plain', 'text/plain'];
      mockUploadFunction.resolves({ attempt: 1 });
      const result = await batchChunkUpload(
        assetDataArray,
        blobDataArray,
        filetypeArray,
        2,
        mockUploadFunction,
        mockSignal,
      );
      expect(result.failedFiles.size).to.equal(0);
      expect(mockUploadFunction.callCount).to.equal(2);
      expect(result.attemptMap.size).to.equal(2);
    });

    it('should handle assetData.id (Acrobat style)', async () => {
      const assetDataArray = [
        { id: 'asset-with-id', blocksize: 1024, uploadUrls: [{ href: 'https://upload.com/chunk?partNumber=1' }] },
      ];
      const blobDataArray = [new File(['test'], 'file.txt')];
      const filetypeArray = ['text/plain'];
      mockUploadFunction.resolves({ attempt: 1 });
      await batchChunkUpload(
        assetDataArray,
        blobDataArray,
        filetypeArray,
        1,
        mockUploadFunction,
        mockSignal,
      );
      expect(mockUploadFunction.calledOnce).to.be.true;
      const callArgs = mockUploadFunction.firstCall.args;
      expect(callArgs[3]).to.equal('asset-with-id'); // assetId argument
    });

    it('should skip files with mismatched chunk count', async () => {
      const assetDataArray = [
        { id: 'asset1', blocksize: 512, uploadUrls: [{ href: 'https://upload.com/chunk1' }] }, // expects 2 chunks but only 1 URL
      ];
      const blobDataArray = [new File(['x'.repeat(1024)], 'file1.txt')]; // 1024 bytes / 512 blocksize = 2 chunks
      const filetypeArray = ['text/plain'];
      mockUploadFunction.resolves({ attempt: 1 });
      const result = await batchChunkUpload(
        assetDataArray,
        blobDataArray,
        filetypeArray,
        1,
        mockUploadFunction,
        mockSignal,
      );
      expect(mockUploadFunction.called).to.be.false;
      expect(result.failedFiles.size).to.equal(0);
    });

    it('should handle upload failures and mark file as failed', async () => {
      const assetDataArray = [
        { id: 'asset1', blocksize: 1024, uploadUrls: [{ href: 'https://upload.com/chunk1?partNumber=1' }] },
      ];
      const blobDataArray = [new File(['test'], 'file.txt')];
      const filetypeArray = ['text/plain'];
      mockUploadFunction.rejects(new Error('Upload failed'));
      const result = await batchChunkUpload(
        assetDataArray,
        blobDataArray,
        filetypeArray,
        1,
        mockUploadFunction,
        mockSignal,
      );
      expect(result.failedFiles.size).to.equal(1);
    });

    it('should stop uploading file chunks after first failure', async () => {
      const assetDataArray = [
        { id: 'asset1', blocksize: 512, uploadUrls: [{ href: 'https://upload.com/chunk1?partNumber=1' }, { href: 'https://upload.com/chunk2?partNumber=2' }] },
      ];
      const blobDataArray = [new File(['x'.repeat(1024)], 'file1.txt')]; // 2 chunks
      const filetypeArray = ['text/plain'];
      mockUploadFunction.onFirstCall().rejects(new Error('First chunk failed'));
      mockUploadFunction.onSecondCall().resolves({ attempt: 1 });
      const result = await batchChunkUpload(
        assetDataArray,
        blobDataArray,
        filetypeArray,
        1,
        mockUploadFunction,
        mockSignal,
      );
      expect(result.failedFiles.size).to.equal(1);
      // Second chunk should not be uploaded due to fileUploadFailed flag
    });

    it('should handle aborted signal', async () => {
      const assetDataArray = [
        { id: 'asset1', blocksize: 1024, uploadUrls: [{ href: 'https://upload.com/chunk1' }] },
      ];
      const blobDataArray = [new File(['test'], 'file.txt')];
      const filetypeArray = ['text/plain'];
      mockSignal.aborted = true;
      const result = await batchChunkUpload(
        assetDataArray,
        blobDataArray,
        filetypeArray,
        1,
        mockUploadFunction,
        mockSignal,
      );
      expect(mockUploadFunction.called).to.be.false;
      expect(result.failedFiles.size).to.equal(0);
    });

    it('should pass chunkContext to upload function', async () => {
      const assetDataArray = [
        { id: 'asset1', blocksize: 1024, uploadUrls: [{ href: 'https://upload.com/chunk?partNumber=5' }] },
      ];
      const blobDataArray = [new File(['test'], 'file.txt')];
      const filetypeArray = ['text/plain'];
      mockUploadFunction.resolves({ attempt: 2 });
      await batchChunkUpload(
        assetDataArray,
        blobDataArray,
        filetypeArray,
        1,
        mockUploadFunction,
        mockSignal,
      );
      const callArgs = mockUploadFunction.firstCall.args;
      const chunkContext = callArgs[6]; // 7th argument
      expect(chunkContext.assetId).to.equal('asset1');
      expect(chunkContext.chunkNumber).to.equal(5);
      expect(chunkContext.fileType).to.equal('text/plain');
      expect(chunkContext.fileIndex).to.equal(0);
      expect(chunkContext.chunkIndex).to.equal(0);
    });

    it('should call onChunkSuccess callback on successful upload', async () => {
      const assetDataArray = [
        { id: 'asset1', blocksize: 1024, uploadUrls: [{ href: 'https://upload.com/chunk' }] },
      ];
      const blobDataArray = [new File(['test'], 'file.txt')];
      const filetypeArray = ['text/plain'];
      mockUploadFunction.resolves({ attempt: 1 });
      const onChunkSuccess = sinon.stub();
      await batchChunkUpload(
        assetDataArray,
        blobDataArray,
        filetypeArray,
        1,
        mockUploadFunction,
        mockSignal,
        { onChunkSuccess },
      );
      expect(onChunkSuccess.calledOnce).to.be.true;
    });

    it('should call onChunkError callback on failed upload', async () => {
      const assetDataArray = [
        { id: 'asset1', blocksize: 1024, uploadUrls: [{ href: 'https://upload.com/chunk' }] },
      ];
      const blobDataArray = [new File(['test'], 'file.txt')];
      const filetypeArray = ['text/plain'];
      mockUploadFunction.rejects(new Error('Upload failed'));
      const onChunkError = sinon.stub();
      await batchChunkUpload(
        assetDataArray,
        blobDataArray,
        filetypeArray,
        1,
        mockUploadFunction,
        mockSignal,
        { onChunkError },
      );
      expect(onChunkError.calledOnce).to.be.true;
    });
  });
});
