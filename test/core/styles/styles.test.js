import { expect } from '@esm-bundle/chai';

const CSS_PATH = '/unitylibs/core/styles/styles.css';
const ALERT_HOLDER_SELECTORS = [
  '.unity-enabled .interactive-area .alert-holder',
  '.upload.unity-enabled .alert-holder',
  '.upload-marquee.unity-enabled .alert-holder',
];

describe('Error Toast Overlay CSS — MWPW-191453', () => {
  let cssText;

  before(async () => {
    const response = await fetch(CSS_PATH);
    cssText = await response.text();
  });

  describe('alert-holder background opacity', () => {
    it('uses 10% alpha, not 80%', () => {
      expect(cssText).to.include('rgba(0, 0, 0, 10%)');
      expect(cssText).to.not.include('rgba(0, 0, 0, 80%)');
    });

    it('contains the alert-holder rule for interactive-area context', () => {
      expect(cssText).to.include('.unity-enabled .interactive-area .alert-holder');
    });

    it('contains the alert-holder rule for upload context', () => {
      expect(cssText).to.include('.upload.unity-enabled .alert-holder');
    });

    it('contains the alert-holder rule for upload-marquee context', () => {
      expect(cssText).to.include('.upload-marquee.unity-enabled .alert-holder');
    });
  });

  describe('alert-holder computed style via injected stylesheet', () => {
    let link;
    let container;
    let alertHolder;

    before(async () => {
      link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = CSS_PATH;
      await new Promise((resolve, reject) => {
        link.onload = resolve;
        link.onerror = reject;
        document.head.appendChild(link);
      });

      container = document.createElement('div');
      container.className = 'unity-enabled';
      const interactive = document.createElement('div');
      interactive.className = 'interactive-area';
      alertHolder = document.createElement('div');
      alertHolder.className = 'alert-holder show';
      interactive.appendChild(alertHolder);
      container.appendChild(interactive);
      document.body.appendChild(container);
    });

    after(() => {
      document.head.removeChild(link);
      document.body.removeChild(container);
    });

    it('background-color alpha channel is 10% (≈ 0.1)', () => {
      const computed = window.getComputedStyle(alertHolder);
      const bg = computed.backgroundColor;
      expect(bg).to.match(/rgba\(0,\s*0,\s*0,\s*0\.1\d*\)/);
    });

    it('overlay is positioned to block interactions', () => {
      const computed = window.getComputedStyle(alertHolder);
      expect(computed.position).to.equal('absolute');
      expect(computed.zIndex).to.equal('2');
      expect(computed.top).to.equal('0px');
      expect(computed.left).to.equal('0px');
    });

    it('overlay displays as flex when .show is present', () => {
      const computed = window.getComputedStyle(alertHolder);
      expect(computed.display).to.equal('flex');
    });
  });

  describe('alert-holder selectors are all present as a group', () => {
    it('the three selector rule block contains exactly one background declaration', () => {
      const blockStart = cssText.indexOf(ALERT_HOLDER_SELECTORS[0]);
      const blockEnd = cssText.indexOf('}', blockStart);
      const block = cssText.slice(blockStart, blockEnd);
      const backgroundMatches = block.match(/background:/g) || [];
      expect(backgroundMatches).to.have.length(1);
    });
  });
});
