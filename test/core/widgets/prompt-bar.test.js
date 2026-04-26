import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';

describe('prompt-bar.css', () => {
  let css;

  before(async () => {
    css = await readFile({ path: '../../../unitylibs/core/widgets/prompt-bar/prompt-bar.css' });
  });

  describe('RTL — base inp-wrap direction (Change A)', () => {
    it('contains direction: inherit in .inp-wrap rule', () => {
      expect(css).to.include('direction: inherit');
    });
  });

  describe('RTL — max25/theme-two logical padding (Change B)', () => {
    it('uses padding-block: 20px 18px instead of physical shorthand', () => {
      expect(css).to.include('padding-block: 20px 18px');
    });

    it('uses padding-inline: 26px 22px instead of physical shorthand', () => {
      expect(css).to.include('padding-inline: 26px 22px');
    });

    it('does not use physical padding: 20px 22px 18px 26px', () => {
      expect(css).not.to.include('padding: 20px 22px 18px 26px');
    });
  });

  describe('RTL — inp-field logical margin (Change C)', () => {
    it('uses margin-inline-end: 5px', () => {
      expect(css).to.include('margin-inline-end: 5px');
    });

    it('does not use physical margin: 0 5px 0 0', () => {
      expect(css).not.to.include('margin: 0 5px 0 0');
    });
  });

  describe('RTL — upload-marquee autocomplete logical margin (Change D)', () => {
    it('uses margin-inline-start: 16px', () => {
      expect(css).to.include('margin-inline-start: 16px');
    });

    it('does not use physical margin-left: 16px', () => {
      expect(css).not.to.include('margin-left: 16px');
    });
  });

  describe('RTL — upload-marquee widget logical padding (Change E)', () => {
    it('uses padding-inline-start: 0', () => {
      expect(css).to.include('padding-inline-start: 0');
    });
  });

  describe('RTL — upload-marquee mobile breakpoint logical margin (Change F)', () => {
    it('uses margin-block: 40px 0 in mobile breakpoint', () => {
      expect(css).to.include('margin-block: 40px 0');
    });

    it('uses margin-inline: 0 40px in mobile breakpoint', () => {
      expect(css).to.include('margin-inline: 0 40px');
    });

    it('does not use physical margin: 40px 40px 0 0', () => {
      expect(css).not.to.include('margin: 40px 40px 0 0');
    });
  });
});
