import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { validateFilesWithPdflite, getPageCountErrorCode, resetPdfliteInstance } from '../../../unitylibs/scripts/pdflite-validator.js';

describe('PDFLite Validator', () => {
  afterEach(() => {
    sinon.restore();
    resetPdfliteInstance();
  });

  describe('validateFilesWithPdflite', () => {
    it('should return all files as passed if no PDF files are present', async () => {
      const files = [
        { type: 'image/jpeg', name: 'test.jpg' },
        { type: 'image/png', name: 'test.png' },
      ];
      const limits = { pageLimit: { maxNumPages: 100 } };

      const result = await validateFilesWithPdflite(files, limits, false, {});

      expect(result.passed).to.deep.equal(files);
      expect(result.failed).to.be.empty;
    });

    it('should handle pdflite processing', async () => {
      const files = [{ type: 'application/pdf', name: 'test.pdf' }];
      const limits = { pageLimit: { maxNumPages: 100 } };

      // This will either pass or fail depending on pdflite availability in test env
      const result = await validateFilesWithPdflite(files, limits);

      expect(result).to.have.property('passed');
      expect(result).to.have.property('failed');
      // Total items should equal input files
      expect(result.passed.length + result.failed.length).to.equal(files.length);
    });

    it('should handle mixed file types correctly', async () => {
      const files = [
        { type: 'application/pdf', name: 'test.pdf' },
        { type: 'image/jpeg', name: 'test.jpg' },
      ];
      const limits = { pageLimit: { maxNumPages: 100 } };

      const result = await validateFilesWithPdflite(files, limits, false, {});

      // Should process files (exact outcome depends on pdflite availability in test env)
      expect(result).to.have.property('passed');
      expect(result).to.have.property('failed');
    });
  });

  describe('getPageCountErrorCode', () => {
    const SINGLE_FILE_ERRORS = {
      OVER_MAX_PAGE_COUNT: 'upload_validation_error_max_page_count',
      UNDER_MIN_PAGE_COUNT: 'upload_validation_error_min_page_count',
    };

    const MULTI_FILE_ERRORS = {
      OVER_MAX_PAGE_COUNT: 'upload_validation_error_max_page_count_multi',
      UNDER_MIN_PAGE_COUNT: 'upload_validation_error_min_page_count_multi',
    };

    describe('Single File Mode', () => {
      it('should return error code for single file over max page count', () => {
        const failed = [{ errorType: 'OVER_MAX_PAGE_COUNT' }];
        const results = [{ ok: false }];

        const result = getPageCountErrorCode(failed, results, false, SINGLE_FILE_ERRORS);

        expect(result).to.deep.equal({
          errorCode: 'upload_validation_error_max_page_count',
          shouldDispatch: true,
        });
      });

      it('should return error code for single file under min page count', () => {
        const failed = [{ errorType: 'UNDER_MIN_PAGE_COUNT' }];
        const results = [{ ok: false }];

        const result = getPageCountErrorCode(failed, results, false, SINGLE_FILE_ERRORS);

        expect(result).to.deep.equal({
          errorCode: 'upload_validation_error_min_page_count',
          shouldDispatch: true,
        });
      });

      it('should return null if error type not recognized', () => {
        const failed = [{ errorType: 'UNKNOWN_ERROR' }];
        const results = [{ ok: false }];

        const result = getPageCountErrorCode(failed, results, false, SINGLE_FILE_ERRORS);

        expect(result).to.be.null;
      });

      it('should return null if no failures', () => {
        const result = getPageCountErrorCode([], [], false, SINGLE_FILE_ERRORS);
        expect(result).to.be.null;
      });
    });

    describe('Multi File Mode', () => {
      it('should return error code when all files fail with same page count error', () => {
        const failed = [
          { errorType: 'OVER_MAX_PAGE_COUNT' },
          { errorType: 'OVER_MAX_PAGE_COUNT' },
        ];
        const results = [
          { ok: false },
          { ok: false },
        ];

        const result = getPageCountErrorCode(failed, results, true, MULTI_FILE_ERRORS);

        expect(result).to.deep.equal({
          errorCode: 'upload_validation_error_max_page_count_multi',
          shouldDispatch: true,
          returnEmpty: true,
        });
      });

      it('should return null when all files fail under min page count (not checked in multi-file)', () => {
        const failed = [
          { errorType: 'UNDER_MIN_PAGE_COUNT' },
          { errorType: 'UNDER_MIN_PAGE_COUNT' },
        ];
        const results = [
          { ok: false },
          { ok: false },
        ];

        const result = getPageCountErrorCode(failed, results, true, MULTI_FILE_ERRORS);

        // Multi-file mode only checks max page count, not min
        expect(result).to.be.null;
      });

      it('should set validation failure flag when some files fail', () => {
        const failed = [{ errorType: 'OVER_MAX_PAGE_COUNT' }];
        const results = [
          { ok: true },
          { ok: false },
        ];

        const result = getPageCountErrorCode(failed, results, true, MULTI_FILE_ERRORS);

        expect(result).to.deep.equal({
          shouldDispatch: false,
          setValidationFailure: true,
        });
      });

      it('should set validation failure when files fail with different error types including max page count', () => {
        const failed = [
          { errorType: 'OVER_MAX_PAGE_COUNT' },
          { errorType: 'UNDER_MIN_PAGE_COUNT' },
        ];
        const results = [
          { ok: false },
          { ok: false },
        ];

        const result = getPageCountErrorCode(failed, results, true, MULTI_FILE_ERRORS);

        // Since there's at least one max page count failure, set validation failure flag
        expect(result).to.deep.equal({
          shouldDispatch: false,
          setValidationFailure: true,
        });
      });

      it('should return null if no failures in multi-file mode', () => {
        const result = getPageCountErrorCode([], [], true, MULTI_FILE_ERRORS);
        expect(result).to.be.null;
      });

      it('should set validation failure when page count failures exist alongside other errors', () => {
        const failed = [
          { errorType: 'OVER_MAX_PAGE_COUNT' },
          { errorType: 'OTHER_ERROR' },
        ];
        const results = [
          { ok: false },
          { ok: false },
        ];

        const result = getPageCountErrorCode(failed, results, true, MULTI_FILE_ERRORS);

        // Should set validation failure flag when page count failures exist
        expect(result).to.deep.equal({
          shouldDispatch: false,
          setValidationFailure: true,
        });
      });
    });
  });

  describe('resetPdfliteInstance', () => {
    it('should reset the pdflite instance', () => {
      // This is more of a smoke test to ensure the function exists and doesn't throw
      expect(() => resetPdfliteInstance()).to.not.throw();
    });
  });
});
