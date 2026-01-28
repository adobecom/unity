/* eslint-disable class-methods-use-this */

let pdfliteInstance = null;

async function loadPdflite() {
  if (pdfliteInstance) return pdfliteInstance;
  try {
    const moduleUrl = new URL('../../libs/pdflite/dc-pdflite.js', import.meta.url).href;
    const { default: DcPdflite } = await import(moduleUrl);
    const pdflite = new DcPdflite();
    await pdflite.init();
    pdfliteInstance = pdflite;
    return pdfliteInstance;
  } catch (error) {
    pdfliteInstance = null;
    throw error;
  }
}

export async function validateFilesWithPdflite(files, limits) {
  const hasPdfFiles = files.some((f) => f.type === 'application/pdf');
  if (!hasPdfFiles) return { passed: files, failed: [] };
  let pdflite;
  try {
    pdflite = await loadPdflite();
  } catch (error) {
    return { passed: files, failed: [] };
  }
  if (!pdflite) return { passed: files, failed: [] };
  const checks = files.map((file) => {
    if (file.type !== 'application/pdf') return Promise.resolve({ file, ok: true });
    return (async () => {
      const details = await pdflite.fileDetails(file);
      const overMaxPageCount = limits.pageLimit?.maxNumPages && details?.NUM_PAGES > limits.pageLimit.maxNumPages;
      const underMinPageCount = limits.pageLimit?.minNumPages && details?.NUM_PAGES < limits.pageLimit.minNumPages;
      let error = null;
      if (overMaxPageCount) {
        error = new Error(`PDF exceeds maximum page count: ${details?.NUM_PAGES} > ${limits.pageLimit.maxNumPages}`);
        error.errorType = 'OVER_MAX_PAGE_COUNT';
      }
      if (underMinPageCount) {
        error = new Error(`PDF below minimum page count: ${details?.NUM_PAGES} < ${limits.pageLimit.minNumPages}`);
        error.errorType = 'UNDER_MIN_PAGE_COUNT';
      }
      if (error) throw error;
      return { file, ok: true };
    })().catch((error) => ({ file, ok: false, error, errorType: error.errorType || 'other' }));
  });
  const results = await Promise.all(checks);
  const passed = results.filter((r) => r.ok).map((r) => r.file);
  const failed = results.filter((r) => !r.ok);
  return { passed, failed, results };
}

export function getPageCountErrorCode(failed, results, isMultiFile, errorMessages) {
  if (!isMultiFile && failed.length > 0) {
    const failure = failed[0];
    const errorCode = errorMessages[failure.errorType];
    return errorCode ? { errorCode, shouldDispatch: true } : null;
  }
  if (isMultiFile && failed.length > 0) {
    const pageCountFailures = failed.filter((f) => f.errorType === 'OVER_MAX_PAGE_COUNT');
    if (pageCountFailures.length === 0) return null;
    if (pageCountFailures.length === failed.length && failed.length === results.length) {
      const errorCode = errorMessages.OVER_MAX_PAGE_COUNT;
      return errorCode ? { errorCode, shouldDispatch: true, returnEmpty: true } : null;
    }
    return { shouldDispatch: false, setValidationFailure: true };
  }
  return null;
}

export function resetPdfliteInstance() {
  pdfliteInstance = null;
}
