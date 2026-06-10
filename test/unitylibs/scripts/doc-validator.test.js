import { expect } from '@esm-bundle/chai';
import { getDocPageCount } from '../../../unitylibs/scripts/doc-validator.js';

const DOC_MIME = 'application/msword';
const SECTOR_SIZE = 512;
const ENDOFCHAIN = 0xFFFFFFFE;

// Builds a minimal OLE2 compound file containing a SummaryInformation stream
// with a PID_PAGECOUNT (0x0E) property. miniCutoff is set to 0 so the stream
// lives in a regular sector rather than the mini stream, keeping the layout simple.
function buildDocBuffer(pageCount) {
  // SummaryInfo property set (padded to one sector)
  const si = new Uint8Array(SECTOR_SIZE);
  const siv = new DataView(si.buffer);
  siv.setUint16(0, 0xfffe, true); // byte order
  siv.setUint32(24, 1, true); // cSections = 1
  siv.setUint32(44, 48, true); // section offset = 48 (right after stream header)
  // Section at offset 48:
  siv.setUint32(48, 24, true); // section size = 24 bytes
  siv.setUint32(52, 1, true); // property count = 1
  siv.setUint32(56, 0x0e, true); // propId = PID_PAGECOUNT
  siv.setUint32(60, 16, true); // propOffset = 16 (from section start)
  // Property at section offset 16 (= stream offset 64):
  siv.setUint32(64, 3, true); // type = VT_I4
  siv.setInt32(68, pageCount, true); // value

  // Layout: header(512) + FAT(sector 0) + Dir(sector 1) + SI stream(sector 2)
  const buf = new Uint8Array(512 + 3 * SECTOR_SIZE);
  const v = new DataView(buf.buffer);

  // OLE2 magic
  [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].forEach((b, i) => { buf[i] = b; });

  // Header fields
  v.setUint16(0x1e, 9, true); // sector size = 2^9 = 512
  v.setUint16(0x20, 6, true); // mini sector size = 2^6 = 64
  v.setUint32(0x2c, 1, true); // total FAT sectors = 1
  v.setUint32(0x30, 1, true); // dir start = sector 1
  v.setUint32(0x38, 0, true); // miniCutoff = 0 → all streams in regular sectors
  v.setUint32(0x3c, ENDOFCHAIN, true); // no mini FAT
  v.setUint32(0x40, 0, true); // total mini FAT sectors = 0
  v.setUint32(0x44, ENDOFCHAIN, true); // no DIFAT chain
  v.setUint32(0x4c, 0, true); // DIFAT[0] = sector 0 (FAT)
  for (let i = 1; i < 109; i++) v.setUint32(0x4c + i * 4, 0xffffffff, true);

  // FAT (sector 0, bytes 512–1023)
  v.setUint32(512 + 0 * 4, 0xfffffffd, true); // sector 0 = FATSECT
  v.setUint32(512 + 1 * 4, ENDOFCHAIN, true); // sector 1 = dir (ENDOFCHAIN)
  v.setUint32(512 + 2 * 4, ENDOFCHAIN, true); // sector 2 = SI stream (ENDOFCHAIN)
  for (let i = 3; i < SECTOR_SIZE / 4; i++) v.setUint32(512 + i * 4, 0xffffffff, true);

  // Directory (sector 1, bytes 1024–1535) — 128 bytes per entry
  const dir = 1024;

  // Entry 0: Root Entry (type = 5)
  const rootName = [...'Root Entry\0'].flatMap((c) => [c.charCodeAt(0), 0]);
  buf.set(rootName, dir);
  v.setUint16(dir + 64, rootName.length, true);
  buf[dir + 66] = 5; // root storage
  buf[dir + 67] = 1;
  v.setUint32(dir + 68, 0xffffffff, true); // left sibling
  v.setUint32(dir + 72, 0xffffffff, true); // right sibling
  v.setUint32(dir + 76, 1, true); // child = entry 1
  v.setUint32(dir + 116, ENDOFCHAIN, true); // no mini stream
  v.setUint32(dir + 120, 0, true);

  // Entry 1: \x05SummaryInformation (type = 2, stream)
  const siName = [...'\x05SummaryInformation\0'].flatMap((c) => [c.charCodeAt(0), 0]);
  const e1 = dir + 128;
  buf.set(siName, e1);
  v.setUint16(e1 + 64, siName.length, true);
  buf[e1 + 66] = 2; // stream
  buf[e1 + 67] = 1;
  v.setUint32(e1 + 68, 0xffffffff, true); // left sibling
  v.setUint32(e1 + 72, 0xffffffff, true); // right sibling
  v.setUint32(e1 + 76, 0xffffffff, true); // no child
  v.setUint32(e1 + 116, 2, true); // start = sector 2
  v.setUint32(e1 + 120, 72, true); // size = 72 bytes (the property set)

  // SI stream (sector 2, bytes 1536–2047)
  buf.set(si, 1536);

  return buf.buffer;
}

function makeDocFile(pageCount) {
  return new File([buildDocBuffer(pageCount)], 'resume.doc', { type: DOC_MIME });
}

describe('doc-validator', () => {
  describe('getDocPageCount', () => {
    it('returns null for non-doc files', async () => {
      const file = new File(['data'], 'test.pdf', { type: 'application/pdf' });
      expect(await getDocPageCount(file)).to.be.null;
    });

    it('extracts page count from a valid doc file', async () => {
      expect(await getDocPageCount(makeDocFile(5))).to.equal(5);
    });

    it('returns null for a corrupt (non-OLE2) doc file', async () => {
      const file = new File([new Uint8Array([0x00, 0x01, 0x02])], 'bad.doc', { type: DOC_MIME });
      expect(await getDocPageCount(file)).to.be.null;
    });

    it('returns null when SummaryInformation stream is absent', async () => {
      // Build a valid OLE2 file but with no SummaryInformation entry
      const buf = new Uint8Array(512 + 2 * SECTOR_SIZE);
      const v = new DataView(buf.buffer);
      [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].forEach((b, i) => { buf[i] = b; });
      v.setUint16(0x1e, 9, true);
      v.setUint16(0x20, 6, true);
      v.setUint32(0x2c, 1, true);
      v.setUint32(0x30, 1, true);
      v.setUint32(0x38, 0, true);
      v.setUint32(0x3c, ENDOFCHAIN, true);
      v.setUint32(0x4c, 0, true);
      for (let i = 1; i < 109; i++) v.setUint32(0x4c + i * 4, 0xffffffff, true);
      v.setUint32(512 + 0 * 4, 0xfffffffd, true);
      v.setUint32(512 + 1 * 4, ENDOFCHAIN, true);
      for (let i = 2; i < SECTOR_SIZE / 4; i++) v.setUint32(512 + i * 4, 0xffffffff, true);
      // Root entry only, no SummaryInformation child
      const rootName = [...'Root Entry\0'].flatMap((c) => [c.charCodeAt(0), 0]);
      buf.set(rootName, 1024);
      v.setUint16(1024 + 64, rootName.length, true);
      buf[1024 + 66] = 5;
      v.setUint32(1024 + 68, 0xffffffff, true);
      v.setUint32(1024 + 72, 0xffffffff, true);
      v.setUint32(1024 + 76, 0xffffffff, true); // no child
      v.setUint32(1024 + 116, ENDOFCHAIN, true);
      const file = new File([buf.buffer], 'no-si.doc', { type: DOC_MIME });
      expect(await getDocPageCount(file)).to.be.null;
    });

    it('returns null when Pages property is missing from the stream', async () => {
      // Build a valid OLE2 file with a SummaryInfo stream that has 0 properties
      const buf = buildDocBuffer(0);
      const v = new DataView(buf);
      // Overwrite propCount to 0 at sectionOffset(48) + 4 = stream offset 1536+52
      v.setUint32(1536 + 52, 0, true);
      const file = new File([buf], 'no-pages.doc', { type: DOC_MIME });
      expect(await getDocPageCount(file)).to.be.null;
    });
  });
});
