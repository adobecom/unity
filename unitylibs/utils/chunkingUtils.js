/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */

export function getAssetId(assetData) {
  return assetData.id ?? assetData.assetId;
}

export function createFileChunks(file, blockSize) {
  const totalChunks = Math.ceil(file.size / blockSize);
  const chunks = [];
  for (let i = 0; i < totalChunks; i++) {
    const start = i * blockSize;
    const end = Math.min(start + blockSize, file.size);
    const chunk = file.slice(start, end);
    chunks.push(chunk);
  }
  return chunks;
}

export function validateChunkUrls(uploadUrls, totalChunks) {
  if (uploadUrls.length !== totalChunks) {
    throw new Error(`Mismatch between number of chunks (${totalChunks}) and upload URLs (${uploadUrls.length})`);
  }
}

export function extractChunkNumber(url, fallbackIndex = 0) {
  const urlString = typeof url === 'object' ? url.href : url;
  const urlObj = new URL(urlString);
  const chunkNumber = urlObj.searchParams.get('partNumber');
  return chunkNumber ? parseInt(chunkNumber, 10) : fallbackIndex;
}

export async function createChunkUploadTasks(uploadUrls, file, blockSize, uploadFunction, signal = null, options = {}) {
  const { assetId, fileType, onChunkComplete, onChunkError } = options;
  const totalChunks = Math.ceil(file.size / blockSize);
  validateChunkUrls(uploadUrls, totalChunks);
  const failedChunks = new Set();
  const attemptMap = new Map();
  const uploadPromises = [];
  for (let i = 0; i < totalChunks; i++) {
    const start = i * blockSize;
    const end = Math.min(start + blockSize, file.size);
    const chunk = file.slice(start, end);
    const url = uploadUrls[i];
    const uploadPromise = (async () => {
      if (signal?.aborted) return null;
      const urlString = typeof url === 'object' ? url.href : url;
      const chunkNumber = extractChunkNumber(url, i);
      try {
        const result = await uploadFunction(urlString, chunk, fileType || file.type, assetId, signal, chunkNumber);
        const attempt = result?.attempt || 1;
        attemptMap.set(i, attempt);
        if (onChunkComplete) onChunkComplete(i, chunkNumber, result);
        return result;
      } catch (err) {
        const chunkInfo = { chunkIndex: i, chunkNumber };
        failedChunks.add(chunkInfo);
        if (onChunkError) onChunkError(chunkInfo, err);
        throw err;
      }
    })();
    uploadPromises.push(uploadPromise);
  }
  if (signal?.aborted) return { failedChunks, attemptMap };
  try {
    await Promise.all(uploadPromises);
    return { failedChunks, attemptMap };
  } catch (error) {
    return { failedChunks, attemptMap };
  }
}

export function calculateChunkProgress(completedChunks, totalChunks, baseProgress = 0) {
  const chunkProgress = (completedChunks / totalChunks) * (100 - baseProgress);
  return Math.min(baseProgress + chunkProgress, 100);
}

export function createChunkUploadErrorMessage(assetId, fileSize, fileType, failedChunkCount) {
  return `One or more chunks failed to upload for asset: ${assetId}, ${fileSize} bytes, ${fileType}. Failed chunks: ${failedChunkCount}`;
}

export function createChunkAnalyticsData(eventName, data = {}) {
  return {
    event: eventName,
    timestamp: new Date().toISOString(),
    ...data,
  };
}

export const DEFAULT_CHUNK_CONFIG = {
  maxRetries: 3,
  retryDelay: 1000,
  batchSize: 5,
};

export async function executeInBatches(items, maxConcurrent, processFn) {
  const executing = new Set();
  for (const item of items) {
    const promise = processFn(item)
      .then(() => { executing.delete(promise); })
      .catch(() => { executing.delete(promise); });
    executing.add(promise);
    if (executing.size >= maxConcurrent) await Promise.any(executing);
  }
  if (executing.size > 0) {
    await Promise.all(executing);
  }
}

export async function batchChunkUpload(
  assetDataArray,
  blobDataArray,
  filetypeArray,
  batchSize,
  uploadFunction,
  signal = null,
  options = {},
) {
  const { onChunkSuccess, onChunkError } = options;
  const uploadTasks = [];
  const failedFiles = new Set();
  const attemptMap = new Map();

  assetDataArray.forEach((assetData, fileIndex) => {
    if (signal?.aborted) return;
    const blobData = blobDataArray[fileIndex];
    const fileType = filetypeArray[fileIndex];
    const totalChunks = Math.ceil(blobData.size / assetData.blocksize);

    if (assetData.uploadUrls.length !== totalChunks) return;

    let fileUploadFailed = false;
    let maxAttempts = 0;

    const chunkTasks = Array.from({ length: totalChunks }, (_, i) => {
      const start = i * assetData.blocksize;
      const end = Math.min(start + assetData.blocksize, blobData.size);
      const chunk = blobData.slice(start, end);
      const url = assetData.uploadUrls[i];

      return async () => {
        if (fileUploadFailed || signal?.aborted) return null;
        const urlString = typeof url === 'object' ? url.href : url;
        const chunkNumber = extractChunkNumber(url, i);
        const assetId = getAssetId(assetData);

        const chunkContext = {
          assetId,
          blobData: chunk,
          chunkNumber,
          fileType,
          fileIndex,
          chunkIndex: i,
        };

        try {
          const result = await uploadFunction(urlString, chunk, fileType, assetId, signal, chunkNumber, chunkContext);
          const attempt = result?.attempt || 1;
          if (attempt > maxAttempts) maxAttempts = attempt;
          attemptMap.set(fileIndex, maxAttempts);
          if (onChunkSuccess) onChunkSuccess(chunkContext, result);
          return result;
        } catch (err) {
          failedFiles.add({ fileIndex, chunkNumber });
          fileUploadFailed = true;
          if (onChunkError) onChunkError(chunkContext, err);
          return null;
        }
      };
    });

    uploadTasks.push(...chunkTasks);
  });

  if (signal?.aborted) return { failedFiles, attemptMap };
  await executeInBatches(uploadTasks, batchSize, async (task) => { await task(); });
  return { failedFiles, attemptMap };
}
