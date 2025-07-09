import { expect } from '@esm-bundle/chai';
import { getExtension, removeExtension } from '../../unitylibs/utils/FileUtils.js';

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
});
