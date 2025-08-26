import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';

import * as utils from '../../unitylibs/scripts/utils.js';

describe('utils.js', () => {
  describe('delay', () => {
    it('should resolve after the specified duration', async () => {
      const clock = sinon.useFakeTimers();
      const promise = utils.delay(500);
      clock.tick(500);
      const result = await promise;
      expect(result).to.equal('Resolved after 1 second');
      clock.restore();
    });
  });

  describe('updateQueryParameter', () => {
    it('should update the query parameter if it matches oldValue', () => {
      const url = 'https://example.com/file?format=webply&foo=bar';
      const updated = utils.updateQueryParameter(url, 'format', 'webply', 'jpeg');
      expect(updated).to.include('format=jpeg');
    });
    it('should not update if param does not match oldValue', () => {
      const url = 'https://example.com/file?format=png&foo=bar';
      const updated = utils.updateQueryParameter(url, 'format', 'webply', 'jpeg');
      expect(updated).to.include('format=png');
    });
    it('should return null for invalid URL', () => {
      expect(utils.updateQueryParameter('not a url')).to.equal(null);
    });
  });

  describe('retryRequestUntilProductRedirect', () => {
    it('should retry until continueRetrying is false', async () => {
      let callCount = 0;
      const cfg = { continueRetrying: true, scanResponseAfterRetries: null };
      const requestFunction = sinon.stub().callsFake(() => {
        callCount += 1;
        if (callCount === 3) {
          cfg.continueRetrying = false;
          return { status: 200 };
        }
        return { status: 429 };
      });
      const result = await utils.retryRequestUntilProductRedirect(cfg, requestFunction, 1);
      expect(result.status).to.equal(200);
      expect(callCount).to.be.gte(3);
    });
    it('should return scanResponseAfterRetries if never successful', async () => {
      const cfg = { continueRetrying: false, scanResponseAfterRetries: { status: 500 } };
      const requestFunction = sinon.stub().returns({ status: 500 });
      const result = await utils.retryRequestUntilProductRedirect(cfg, requestFunction, 1);
      expect(result.status).to.equal(500);
    });
  });

  describe('createIntersectionObserver', () => {
    let origIntersectionObserver;
    before(() => {
      origIntersectionObserver = window.IntersectionObserver;
      window.IntersectionObserver = class {
        constructor(cb) { this.cb = cb; this.observe = sinon.stub(); }

        observe() { return this; }

        disconnect() { return this; }
      };
    });
    after(() => {
      window.IntersectionObserver = origIntersectionObserver;
    });
    it('should create and observe the element', () => {
      const el = document.createElement('div');
      const callback = sinon.stub();
      const cfg = {};
      const io = utils.createIntersectionObserver({ el, callback, cfg });
      expect(io).to.be.an('object');
      expect(io.observe).to.be.a('function');
    });
  });

  describe('loadImg', () => {
    it('should resolve immediately if img.complete is true', async () => {
      const img = { complete: true };
      const result = await utils.loadImg(img);
      expect(result).to.be.undefined;
    });
    it('should resolve on load event', async () => {
      const img = {};
      setTimeout(() => img.onload(), 10);
      const promise = utils.loadImg(img);
      img.onload = () => promise.then((res) => expect(res).to.be.undefined);
    });
    it('should resolve on error event', async () => {
      const img = {};
      setTimeout(() => img.onerror(), 10);
      const promise = utils.loadImg(img);
      img.onerror = () => promise.then((res) => expect(res).to.be.undefined);
    });
  });

  describe('loadSvg', () => {
    let fetchStub;
    beforeEach(() => {
      fetchStub = sinon.stub(window, 'fetch');
    });
    afterEach(() => {
      fetchStub.restore();
    });
    it('should return SVG text on success', async () => {
      fetchStub.resolves({ status: 200, text: () => Promise.resolve('<svg></svg>') });
      const result = await utils.loadSvg('/foo.svg');
      expect(result).to.equal('<svg></svg>');
    });
    it('should return empty string if status is not 200', async () => {
      fetchStub.resolves({ status: 404, text: () => Promise.resolve('') });
      const result = await utils.loadSvg('/foo.svg');
      expect(result).to.equal('');
    });
    it('should return empty string on error', async () => {
      fetchStub.rejects(new Error('fail'));
      const result = await utils.loadSvg('/foo.svg');
      expect(result).to.equal('');
    });
  });

  describe('loadSvgs', () => {
    let fetchStub;
    beforeEach(() => {
      fetchStub = sinon.stub(window, 'fetch');
    });
    afterEach(() => {
      fetchStub.restore();
    });
    it('should set parent innerHTML on success', async () => {
      const svg = { src: '/foo.svg', parentElement: { innerHTML: '' } };
      fetchStub.resolves({ ok: true, text: () => Promise.resolve('<svg></svg>') });
      await utils.loadSvgs([svg]);
      expect(svg.parentElement.innerHTML).to.equal('<svg></svg>');
    });
    it('should remove svg on error', async () => {
      const svg = { src: '/foo.svg', parentElement: {}, remove: sinon.stub() };
      fetchStub.rejects(new Error('fail'));
      await utils.loadSvgs([svg]);
      expect(svg.remove.called).to.be.true;
    });
  });

  describe('createActionBtn', () => {
    it('should create a button with text', async () => {
      const btnCfg = document.createElement('div');
      btnCfg.innerText = 'Test Button';
      const btn = await utils.createActionBtn(btnCfg, 'test-class');
      expect(btn).to.be.instanceOf(HTMLElement);
      expect(btn.className).to.include('test-class');
      expect(btn.textContent).to.include('Test Button');
    });
    it('should prepend text if swapOrder is true', async () => {
      const btnCfg = document.createElement('div');
      btnCfg.innerText = 'Test Button';
      const btn = await utils.createActionBtn(btnCfg, 'test-class', false, true);
      expect(btn.firstChild.className).to.include('btn-text');
    });
  });
  // DOM-heavy and async: createErrorToast, showErrorToast, createActionBtn
  // These can be tested with more advanced DOM mocking if needed
});
