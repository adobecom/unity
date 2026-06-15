import { expect } from '@esm-bundle/chai';
import { getDocxPageCount } from '../../../unitylibs/scripts/docx-validator.js';

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
  localView.setUint16(4, 20, true);
  localView.setUint16(6, 0, true);
  localView.setUint16(8, 0, true); // compression: stored
  localView.setUint16(10, 0, true);
  localView.setUint16(12, 0, true);
  localView.setUint32(14, 0, true); // crc32 (not validated)
  localView.setUint32(18, contentBytes.length, true);
  localView.setUint32(22, contentBytes.length, true);
  localView.setUint16(26, filenameBytes.length, true);
  localView.setUint16(28, 0, true);
  localHeader.set(filenameBytes, 30);

  // Central directory header
  const cdHeader = new Uint8Array(46 + filenameBytes.length);
  const cdView = new DataView(cdHeader.buffer);
  cdView.setUint32(0, 0x02014b50, true); // signature
  cdView.setUint16(4, 20, true);
  cdView.setUint16(6, 20, true);
  cdView.setUint16(8, 0, true);
  cdView.setUint16(10, 0, true); // compression: stored
  cdView.setUint16(12, 0, true);
  cdView.setUint16(14, 0, true);
  cdView.setUint32(16, 0, true);
  cdView.setUint32(20, contentBytes.length, true);
  cdView.setUint32(24, contentBytes.length, true);
  cdView.setUint16(28, filenameBytes.length, true);
  cdView.setUint16(30, 0, true);
  cdView.setUint16(32, 0, true);
  cdView.setUint16(34, 0, true);
  cdView.setUint16(36, 0, true);
  cdView.setUint32(38, 0, true);
  cdView.setUint32(42, 0, true); // local header offset
  cdHeader.set(filenameBytes, 46);

  const cdOffset = localHeader.length + contentBytes.length;

  // End of central directory
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true); // signature
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, 1, true);
  eocdView.setUint16(10, 1, true);
  eocdView.setUint32(12, cdHeader.length, true);
  eocdView.setUint32(16, cdOffset, true);
  eocdView.setUint16(20, 0, true);

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

async function deflate(data) {
  const cs = new CompressionStream('deflate-raw');
  const input = new ReadableStream({ start(c) { c.enqueue(data); c.close(); } });
  return new Uint8Array(await new Response(input.pipeThrough(cs)).arrayBuffer());
}

async function buildZipWithDeflateEntry(filename, content) {
  const filenameBytes = new TextEncoder().encode(filename);
  const contentBytes = new TextEncoder().encode(content);
  const compressed = await deflate(contentBytes);

  const localHeader = new Uint8Array(30 + filenameBytes.length);
  const lv = new DataView(localHeader.buffer);
  lv.setUint32(0, 0x04034b50, true);
  lv.setUint16(4, 20, true);
  lv.setUint16(8, 8, true); // deflate
  lv.setUint32(18, compressed.length, true);
  lv.setUint32(22, contentBytes.length, true);
  lv.setUint16(26, filenameBytes.length, true);
  localHeader.set(filenameBytes, 30);

  const cdHeader = new Uint8Array(46 + filenameBytes.length);
  const cv = new DataView(cdHeader.buffer);
  cv.setUint32(0, 0x02014b50, true);
  cv.setUint16(4, 20, true);
  cv.setUint16(6, 20, true);
  cv.setUint16(10, 8, true); // deflate
  cv.setUint32(20, compressed.length, true);
  cv.setUint32(24, contentBytes.length, true);
  cv.setUint16(28, filenameBytes.length, true);
  cv.setUint32(42, 0, true); // local header offset
  cdHeader.set(filenameBytes, 46);

  const cdOffset = localHeader.length + compressed.length;
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, 1, true);
  ev.setUint16(10, 1, true);
  ev.setUint32(12, cdHeader.length, true);
  ev.setUint32(16, cdOffset, true);

  const zip = new Uint8Array(localHeader.length + compressed.length + cdHeader.length + eocd.length);
  let off = 0;
  zip.set(localHeader, off); off += localHeader.length;
  zip.set(compressed, off); off += compressed.length;
  zip.set(cdHeader, off); off += cdHeader.length;
  zip.set(eocd, off);
  return zip.buffer;
}

async function makeDeflateDocxFile(pageCount) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Properties><Pages>${pageCount}</Pages></Properties>`;
  const buffer = await buildZipWithDeflateEntry('docProps/app.xml', xml);
  return new File([buffer], 'resume.docx', { type: DOCX_MIME });
}

describe('docx-validator', () => {
  describe('getDocxPageCount', () => {
    it('returns null for non-docx files', async () => {
      const file = new File(['data'], 'test.pdf', { type: 'application/pdf' });
      expect(await getDocxPageCount(file)).to.be.null;
    });

    it('extracts page count from a valid docx file', async () => {
      expect(await getDocxPageCount(makeDocxFile(5))).to.equal(5);
    });

    it('returns null when docProps/app.xml is missing from the zip', async () => {
      const buffer = buildZipWithEntry('word/document.xml', '<Other/>');
      const file = new File([buffer], 'resume.docx', { type: DOCX_MIME });
      expect(await getDocxPageCount(file)).to.be.null;
    });

    it('returns null when Pages tag is absent from app.xml', async () => {
      const buffer = buildZipWithEntry('docProps/app.xml', '<Properties><Characters>100</Characters></Properties>');
      const file = new File([buffer], 'resume.docx', { type: DOCX_MIME });
      expect(await getDocxPageCount(file)).to.be.null;
    });

    it('extracts page count from a deflate-compressed entry (as real DOCX files use)', async () => {
      const file = await makeDeflateDocxFile(7);
      expect(await getDocxPageCount(file)).to.equal(7);
    });

    it('returns null for a corrupt (non-zip) docx file', async () => {
      const file = new File([new Uint8Array([0x00, 0x01, 0x02])], 'bad.docx', { type: DOCX_MIME });
      expect(await getDocxPageCount(file)).to.be.null;
    });
  });
});
