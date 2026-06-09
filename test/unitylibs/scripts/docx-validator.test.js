import { expect } from '@esm-bundle/chai';
import { getDocxPageCount, validateDocxFiles } from '../../../unitylibs/scripts/docx-validator.js';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// Builds a minimal valid ZIP containing one stored (uncompressed) entry.
function buildZipWithEntry(filename, content) {
  const encoder = new TextEncoder();
  const filenameBytes = encoder.encode(filename);
  const contentBytes = encoder.encode(content);

  // Local file header
  const localHeader = new Uint8Array(30 + filenameBytes.length);
  const localView = new DataView(localHeader.buffer);
  localView.setUint32(0, 0x04034b50, true); // signature
  localView.setUint16(4, 20, true); // version needed
  localView.setUint16(6, 0, true); // flags
  localView.setUint16(8, 0, true); // compression: stored
  localView.setUint16(10, 0, true); // mod time
  localView.setUint16(12, 0, true); // mod date
  localView.setUint32(14, 0, true); // crc32 (not validated)
  localView.setUint32(18, contentBytes.length, true); // compressed size
  localView.setUint32(22, contentBytes.length, true); // uncompressed size
  localView.setUint16(26, filenameBytes.length, true);
  localView.setUint16(28, 0, true); // extra field length
  localHeader.set(filenameBytes, 30);

  const localOffset = 0;

  // Central directory header
  const cdHeader = new Uint8Array(46 + filenameBytes.length);
  const cdView = new DataView(cdHeader.buffer);
  cdView.setUint32(0, 0x02014b50, true); // signature
  cdView.setUint16(4, 20, true); // version made by
  cdView.setUint16(6, 20, true); // version needed
  cdView.setUint16(8, 0, true); // flags
  cdView.setUint16(10, 0, true); // compression: stored
  cdView.setUint16(12, 0, true); // mod time
  cdView.setUint16(14, 0, true); // mod date
  cdView.setUint32(16, 0, true); // crc32
  cdView.setUint32(20, contentBytes.length, true);
  cdView.setUint32(24, contentBytes.length, true);
  cdView.setUint16(28, filenameBytes.length, true);
  cdView.setUint16(30, 0, true); // extra length
  cdView.setUint16(32, 0, true); // comment length
  cdView.setUint16(34, 0, true); // disk start
  cdView.setUint16(36, 0, true); // internal attrs
  cdView.setUint32(38, 0, true); // external attrs
  cdView.setUint32(42, localOffset, true); // local header offset
  cdHeader.set(filenameBytes, 46);

  const cdOffset = localHeader.length + contentBytes.length;

  // End of central directory
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true); // signature
  eocdView.setUint16(4, 0, true); // disk number
  eocdView.setUint16(6, 0, true); // cd start disk
  eocdView.setUint16(8, 1, true); // entries on disk
  eocdView.setUint16(10, 1, true); // total entries
  eocdView.setUint32(12, cdHeader.length, true);
  eocdView.setUint32(16, cdOffset, true);
  eocdView.setUint16(20, 0, true); // comment length

  const total = localHeader.length + contentBytes.length + cdHeader.length + eocd.length;
  const zip = new Uint8Array(total);
  let off = 0;
  zip.set(localHeader, off); off += localHeader.length;
  zip.set(contentBytes, off); off += contentBytes.length;
  zip.set(cdHeader, off); off += cdHeader.length;
  zip.set(eocd, off);
  return zip.buffer;
}

function makeDocxFile(pageCount) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Properties><Pages>${pageCount}</Pages></Properties>`;
  const buffer = buildZipWithEntry('docProps/app.xml', xml);
  return new File([buffer], 'resume.docx', { type: DOCX_MIME });
}

describe('docx-validator', () => {
  describe('getDocxPageCount', () => {
    it('returns null for non-docx files', async () => {
      const file = new File(['data'], 'test.pdf', { type: 'application/pdf' });
      const count = await getDocxPageCount(file);
      expect(count).to.be.null;
    });

    it('extracts page count from a valid docx file', async () => {
      const file = makeDocxFile(5);
      const count = await getDocxPageCount(file);
      expect(count).to.equal(5);
    });

    it('returns null when docProps/app.xml is missing', async () => {
      const xml = '<Other>content</Other>';
      const buffer = buildZipWithEntry('word/document.xml', xml);
      const file = new File([buffer], 'resume.docx', { type: DOCX_MIME });
      const count = await getDocxPageCount(file);
      expect(count).to.be.null;
    });

    it('returns null when Pages tag is absent from app.xml', async () => {
      const xml = '<?xml version="1.0"?><Properties><Characters>100</Characters></Properties>';
      const buffer = buildZipWithEntry('docProps/app.xml', xml);
      const file = new File([buffer], 'resume.docx', { type: DOCX_MIME });
      const count = await getDocxPageCount(file);
      expect(count).to.be.null;
    });

    it('returns null for a corrupt (non-zip) docx file', async () => {
      const file = new File([new Uint8Array([0x00, 0x01, 0x02])], 'bad.docx', { type: DOCX_MIME });
      const count = await getDocxPageCount(file);
      expect(count).to.be.null;
    });
  });

  describe('validateDocxFiles', () => {
    it('passes all files when none are docx', async () => {
      const files = [
        new File(['data'], 'test.pdf', { type: 'application/pdf' }),
      ];
      const result = await validateDocxFiles(files, { pageLimit: { maxNumPages: 10 } });
      expect(result.passed).to.deep.equal(files);
      expect(result.failed).to.be.empty;
    });

    it('passes a docx file within the page limit', async () => {
      const file = makeDocxFile(5);
      const result = await validateDocxFiles([file], { pageLimit: { maxNumPages: 10 } });
      expect(result.passed).to.have.length(1);
      expect(result.failed).to.be.empty;
    });

    it('fails a docx file that exceeds the page limit', async () => {
      const file = makeDocxFile(15);
      const result = await validateDocxFiles([file], { pageLimit: { maxNumPages: 10 } });
      expect(result.passed).to.be.empty;
      expect(result.failed).to.have.length(1);
      expect(result.failed[0].errorType).to.equal('OVER_MAX_PAGE_COUNT');
    });

    it('passes a docx file exactly at the page limit', async () => {
      const file = makeDocxFile(10);
      const result = await validateDocxFiles([file], { pageLimit: { maxNumPages: 10 } });
      expect(result.passed).to.have.length(1);
      expect(result.failed).to.be.empty;
    });

    it('passes a docx file when page count cannot be determined', async () => {
      const xml = '<?xml version="1.0"?><Properties></Properties>';
      const buffer = buildZipWithEntry('docProps/app.xml', xml);
      const file = new File([buffer], 'resume.docx', { type: DOCX_MIME });
      const result = await validateDocxFiles([file], { pageLimit: { maxNumPages: 10 } });
      expect(result.passed).to.have.length(1);
      expect(result.failed).to.be.empty;
    });

    it('handles mixed file types, only validating docx', async () => {
      const pdf = new File(['%PDF-'], 'doc.pdf', { type: 'application/pdf' });
      const docx = makeDocxFile(15);
      const result = await validateDocxFiles([pdf, docx], { pageLimit: { maxNumPages: 10 } });
      expect(result.passed).to.have.length(1);
      expect(result.passed[0]).to.equal(pdf);
      expect(result.failed).to.have.length(1);
    });
  });
});
