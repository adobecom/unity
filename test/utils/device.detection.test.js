/* eslint-disable quote-props */
/* eslint-disable quotes */
import { expect } from '@esm-bundle/chai';
import isDesktop from '../../unitylibs/utils/device-detection.js';

describe('Device Detection', () => {
  let originalNavigator;

  beforeEach(() => {
    // Store original navigator
    originalNavigator = { ...navigator };

    // Mock navigator properties
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
    Object.defineProperty(navigator, 'msMaxTouchPoints', { value: 0, configurable: true });
    Object.defineProperty(navigator, 'userAgentData', { value: null, configurable: true });
  });

  afterEach(() => {
    // Restore original navigator
    Object.keys(originalNavigator).forEach((key) => {
      Object.defineProperty(navigator, key, { value: originalNavigator[key], configurable: true });
    });
  });

  it('should detect Windows desktop', () => {
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
    expect(isDesktop(userAgent)).to.equal(true);
  });

  it('should detect macOS desktop', () => {
    const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
    expect(isDesktop(userAgent)).to.equal(true);
  });

  it('should detect Linux desktop', () => {
    const userAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
    expect(isDesktop(userAgent)).to.equal(true);
  });

  it('should not detect iPad as desktop', () => {
    const userAgent = 'Mozilla/5.0 (iPad; CPU OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1';
    expect(isDesktop(userAgent)).to.equal(false);
  });

  it('should not detect Android device as desktop', () => {
    const userAgent = 'Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36';
    expect(isDesktop(userAgent)).to.equal(false);
  });

  it('should not detect iPhone as desktop', () => {
    const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1';
    expect(isDesktop(userAgent)).to.equal(false);
  });

  it('should use navigator.userAgent if no argument is provided', () => {
    Object.defineProperty(navigator, 'userAgent', { value: 'test-navigator-agent', configurable: true });
    expect(isDesktop()).to.be.a('boolean'); // Should not throw
  });

  it('should not detect desktop if userAgentData indicates iPad', () => {
    Object.defineProperty(navigator, 'userAgentData', { value: { platform: 'iOS', mobile: true }, configurable: true });
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', configurable: true });
    expect(isDesktop()).to.equal(false);
  });

  it('should not detect desktop if maxTouchPoints > 2 and Macintosh in UA', () => {
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true });
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', configurable: true });
    expect(isDesktop()).to.equal(false);
  });

  it('should not detect desktop if userAgentData indicates Windows tablet', () => {
    Object.defineProperty(navigator, 'userAgentData', { value: { platform: 'Windows', mobile: true }, configurable: true });
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', configurable: true });
    expect(isDesktop()).to.equal(false);
  });

  it('should not detect desktop if UA indicates Windows Phone', () => {
    const userAgent = 'Mozilla/5.0 (Windows Phone 10.0; Android 6.0.1;)';
    expect(isDesktop(userAgent)).to.equal(false);
  });

  it('should not detect desktop if maxTouchPoints > 2 and Windows NT with Tablet PC in UA', () => {
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true });
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Touch Tablet PC';
    expect(isDesktop(userAgent)).to.equal(false);
  });
});
