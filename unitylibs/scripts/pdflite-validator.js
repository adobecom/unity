/* eslint-disable class-methods-use-this */

let pdfliteInstance = null;

async function loadPdflite() {
  if (pdfliteInstance) return pdfliteInstance;
  try {
    const moduleUrl = new URL('../libs/pdflite/dc-pdflite.js', import.meta.url).href;
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
  if (!hasPdfFiles) return { passed: files, failed: [], totalPageCount: 0 };
  let pdflite;
  try {
    pdflite = await loadPdflite();
  } catch (error) {
    return { passed: files, failed: [], totalPageCount: 0 };
  }
  if (!pdflite) return { passed: files, failed: [], totalPageCount: 0 };
  const checks = files.map((file) => {
    if (file.type !== 'application/pdf') return Promise.resolve({ file, ok: true, pageCount: null });
    return (async () => {
      const details = await pdflite.fileDetails(file);
      const pageCount = details?.NUM_PAGES ?? null;
      if (pageCount === null) return { file, ok: true, pageCount: null };
      const overMaxPageCount = limits.pageLimit?.maxNumPages && pageCount > limits.pageLimit.maxNumPages;
      const underMinPageCount = limits.pageLimit?.minNumPages && pageCount < limits.pageLimit.minNumPages;
      let error = null;
      if (overMaxPageCount) {
        error = new Error(`PDF exceeds maximum page count: ${pageCount} > ${limits.pageLimit.maxNumPages}`);
        error.errorType = 'OVER_MAX_PAGE_COUNT';
      }
      if (underMinPageCount) {
        error = new Error(`PDF below minimum page count: ${pageCount} < ${limits.pageLimit.minNumPages}`);
        error.errorType = 'UNDER_MIN_PAGE_COUNT';
      }
      if (error) {
        error.pageCount = pageCount;
        throw error;
      }
      return { file, ok: true, pageCount };
    })().catch((error) => {
      const isPageCountError = error.errorType === 'OVER_MAX_PAGE_COUNT' || error.errorType === 'UNDER_MIN_PAGE_COUNT';
      if (isPageCountError) return { file, ok: false, error, errorType: error.errorType, pageCount: error.pageCount ?? null };
      return { file, ok: true, pageCount: null };
    });
  });
  const results = await Promise.all(checks);
  const passed = results.filter((r) => r.ok).map((r) => r.file);
  const failed = results.filter((r) => !r.ok);
  const totalPageCount = results.filter((r) => r.ok).reduce((sum, r) => sum + (r.pageCount || 0), 0);
  return { passed, failed, results, totalPageCount };
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
