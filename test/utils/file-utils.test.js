import { expect } from '@esm-bundle/chai';
import { getExtension, removeExtension, getImageDimensions } from '../../unitylibs/utils/FileUtils.js';

describe('FileUtils', () => {
  describe('getExtension', () => {
    it('should return empty string for null input', () => {
      expect(getExtension(null)).to.equal('');
    });

    it('should return empty string for undefined input', () => {
      expect(getExtension(undefined)).to.equal('');
    });

    it('should return empty string for filename without extension', () => {
      expect(getExtension('filename')).to.equal('');
    });

    it('should return correct extension for simple filename', () => {
      expect(getExtension('test.pdf')).to.equal('pdf');
    });

    it('should return correct extension for filename with multiple dots', () => {
      expect(getExtension('test.min.js')).to.equal('js');
    });

    it('should return empty string for filename ending with dot', () => {
      expect(getExtension('test.')).to.equal('');
    });

    it('should return empty string for filename starting with dot', () => {
      expect(getExtension('.gitignore')).to.equal('');
    });
  });

  describe('removeExtension', () => {
    it('should return null for null input', () => {
      expect(removeExtension(null)).to.equal(null);
    });

    it('should return undefined for undefined input', () => {
      expect(removeExtension(undefined)).to.equal(undefined);
    });

    it('should return original string for filename without extension', () => {
      expect(removeExtension('filename')).to.equal('filename');
    });

    it('should remove extension from simple filename', () => {
      expect(removeExtension('test.pdf')).to.equal('test');
    });

    it('should remove only last extension for filename with multiple dots', () => {
      expect(removeExtension('test.min.js')).to.equal('test.min');
    });

    it('should return original string for filename ending with dot', () => {
      expect(removeExtension('test.')).to.equal('test.');
    });

    it('should return original string for filename starting with dot', () => {
      expect(removeExtension('.gitignore')).to.equal('.gitignore');
    });
  });

  describe('getImageDimensions', () => {
    function makeFile(type, buffer) {
      return {
        type,
        slice: () => ({ arrayBuffer: async () => buffer }),
      };
    }

    it('should parse PNG dimensions', async () => {
      const width = 1024;
      const height = 768;
      const buffer = new ArrayBuffer(32);
      const view = new DataView(buffer);
      view.setUint32(16, width);
      view.setUint32(20, height);
      const file = makeFile('image/png', buffer);
      const dims = await getImageDimensions(file);
      expect(dims).to.deep.equal({ width, height });
    });

    it('should parse JPEG dimensions from SOF marker', async () => {
      const width = 640;
      const height = 480;
      const buffer = new ArrayBuffer(64);
      const view = new DataView(buffer);
      view.setUint8(0, 0xFF);
      view.setUint8(1, 0xD8);
      view.setUint8(2, 0xFF);
      view.setUint8(3, 0xC0);
      view.setUint16(4, 0x0011);
      view.setUint16(7, height);
      view.setUint16(9, width);
      const file = makeFile('image/jpeg', buffer);
      const dims = await getImageDimensions(file);
      expect(dims).to.deep.equal({ width, height });
    });

    it('should parse WebP VP8X dimensions', async () => {
      const width = 1000;
      const height = 500;
      const buffer = new ArrayBuffer(40);
      const arr = new Uint8Array(buffer);
      arr.set([0x52, 0x49, 0x46, 0x46], 0);
      arr.set([0x56, 0x50, 0x38, 0x58], 12);
      const wMinus1 = width - 1;
      const hMinus1 = height - 1;
      arr[24] = wMinus1 & 0xFF;
      arr[25] = (wMinus1 >> 8) & 0xFF;
      arr[26] = (wMinus1 >> 16) & 0xFF;
      arr[27] = hMinus1 & 0xFF;
      arr[28] = (hMinus1 >> 8) & 0xFF;
      arr[29] = (hMinus1 >> 16) & 0xFF;
      const file = makeFile('image/webp', buffer);
      const dims = await getImageDimensions(file);
      expect(dims).to.deep.equal({ width, height });
    });

    it('should parse WebP VP8 (lossy) dimensions', async () => {
      const width = 320;
      const height = 240;
      const buffer = new ArrayBuffer(40);
      const arr = new Uint8Array(buffer);
      const view = new DataView(buffer);
      arr.set([0x52, 0x49, 0x46, 0x46], 0);
      arr.set([0x56, 0x50, 0x38, 0x20], 12);
      view.setUint16(26, width, true);
      view.setUint16(28, height, true);
      const file = makeFile('image/webp', buffer);
      const dims = await getImageDimensions(file);
      expect(dims).to.deep.equal({ width, height });
    });

    it('should parse WebP VP8L (lossless) dimensions', async () => {
      const width = 300;
      const height = 97;
      const buffer = new ArrayBuffer(40);
      const arr = new Uint8Array(buffer);
      arr.set([0x52, 0x49, 0x46, 0x46], 0);
      arr.set([0x56, 0x50, 0x38, 0x4C], 12);
      const b0 = 0x2B;
      const b1 = 0x01;
      const b2 = 0x18;
      const b3 = 0x00;
      arr[21] = b0;
      arr[22] = b1;
      arr[23] = b2;
      arr[24] = b3;
      const file = makeFile('image/webp', buffer);
      const dims = await getImageDimensions(file);
      expect(dims).to.deep.equal({ width, height });
    });

    it('should throw for unsupported file type', async () => {
      const buffer = new ArrayBuffer(8);
      const file = makeFile('image/gif', buffer);
      try {
        await getImageDimensions(file);
        expect.fail('Expected to throw for unsupported type');
      } catch (e) {
        expect(e.message).to.equal('Unsupported file type: image/gif');
      }
    });

    it('should throw for invalid JPEG without SOF marker', async () => {
      const buffer = new ArrayBuffer(16);
      const view = new DataView(buffer);
      view.setUint8(2, 0x00);
      const file = makeFile('image/jpeg', buffer);
      try {
        await getImageDimensions(file);
        expect.fail('Expected to throw for invalid JPEG');
      } catch (e) {
        expect(e.message).to.equal('Invalid JPEG: SOFn marker not found');
      }
    });

    it('should throw for invalid WebP without RIFF header', async () => {
      const buffer = new ArrayBuffer(16);
      const file = makeFile('image/webp', buffer);
      try {
        await getImageDimensions(file);
        expect.fail('Expected to throw for invalid WebP');
      } catch (e) {
        expect(e.message).to.equal('Invalid WebP');
      }
    });
  });
});
