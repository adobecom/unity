import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import TransitionScreen from '../../../unitylibs/scripts/transition-screen.js';

describe('TransitionScreen', () => {
  let screen;
  let splashScreenEl;
  let workflowCfg;

  beforeEach(() => {
    splashScreenEl = document.createElement('div');
    workflowCfg = { targetCfg: { showSplashScreen: true }, productName: 'acrobat' };
    screen = new TransitionScreen(splashScreenEl, sinon.stub(), 95, workflowCfg);
    screen.splashScreenEl = splashScreenEl;
  });

  describe('updateProgressBar', () => {
    it('should update progress bar attributes and text', () => {
      splashScreenEl.innerHTML = `
        <div class="spectrum-ProgressBar" value="0" aria-valuenow="0"></div>
        <div class="spectrum-ProgressBar-percentage">0%</div>
        <div class="spectrum-ProgressBar-fill" style="width: 0%"></div>
        <div id="progress-status"></div>
      `;
      screen.updateProgressBar(splashScreenEl, 42);
      const spb = splashScreenEl.querySelector('.spectrum-ProgressBar');
      const percent = splashScreenEl.querySelector('.spectrum-ProgressBar-percentage');
      const fill = splashScreenEl.querySelector('.spectrum-ProgressBar-fill');
      const status = splashScreenEl.querySelector('#progress-status');
      expect(spb.getAttribute('value')).to.equal('42');
      expect(spb.getAttribute('aria-valuenow')).to.equal('42');
      expect(percent.innerHTML).to.equal('42%');
      expect(fill.style.width).to.equal('42%');
      expect(status.textContent).to.equal('42%');
    });

    it('should no-op when layer is null', () => {
      expect(() => screen.updateProgressBar(null, 50)).to.not.throw();
    });

    it('should restore progressText from lastProgressText when empty', () => {
      TransitionScreen.lastProgressText = 'Uploading %';
      screen.progressText = '';
      splashScreenEl.innerHTML = `
        <div class="spectrum-ProgressBar" value="0" aria-valuenow="0"></div>
        <div class="spectrum-ProgressBar-percentage">0%</div>
        <div class="spectrum-ProgressBar-fill" style="width: 0%"></div>
        <div id="progress-status"></div>
      `;
      screen.updateProgressBar(splashScreenEl, 10);
      const status = splashScreenEl.querySelector('#progress-status');
      expect(status.textContent).to.equal('Uploading 10%');
    });

    it('should cap percentage at LOADER_LIMIT', () => {
      screen.LOADER_LIMIT = 80;
      splashScreenEl.innerHTML = `
        <div class="spectrum-ProgressBar" value="0" aria-valuenow="0"></div>
        <div class="spectrum-ProgressBar-percentage">0%</div>
        <div class="spectrum-ProgressBar-fill" style="width: 0%"></div>
        <div id="progress-status"></div>
      `;
      screen.updateProgressBar(splashScreenEl, 99);
      expect(splashScreenEl.querySelector('.spectrum-ProgressBar').getAttribute('value')).to.equal('80');
    });
  });

  describe('createProgressBar', () => {
    it('should return a div with class progress-holder', () => {
      const el = TransitionScreen.createProgressBar();
      expect(el).to.be.instanceOf(HTMLElement);
      expect(el.className).to.include('progress-holder');
      expect(el.innerHTML).to.include('spectrum-ProgressBar');
    });
  });

  describe('progressBarHandler', () => {
    it('should call updateProgressBar and recurse', () => {
      splashScreenEl.innerHTML = `
        <div class="spectrum-ProgressBar" value="0" aria-valuenow="0"></div>
        <div class="spectrum-ProgressBar-percentage">0%</div>
        <div class="spectrum-ProgressBar-fill" style="width: 0%"></div>
        <div id="progress-status"></div>
      `;
      const spy = sinon.spy(screen, 'updateProgressBar');
      // Use fake timers to control setTimeout
      const clock = sinon.useFakeTimers();
      screen.progressBarHandler(splashScreenEl, 10, 10, true);
      clock.tick(20);
      expect(spy.called).to.be.true;
      spy.restore();
      clock.restore();
    });

    it('should return early when splash element is missing', () => {
      const clock = sinon.useFakeTimers();
      const spy = sinon.spy(screen, 'updateProgressBar');
      screen.progressBarHandler(null, 10, 10, true);
      clock.tick(100);
      expect(spy.called).to.be.false;
      spy.restore();
      clock.restore();
    });

    it('should return early when current value already at LOADER_LIMIT', () => {
      screen.LOADER_LIMIT = 70;
      splashScreenEl.innerHTML = `
        <div class="spectrum-ProgressBar" value="70" aria-valuenow="70"></div>
        <div class="spectrum-ProgressBar-percentage">70%</div>
        <div class="spectrum-ProgressBar-fill" style="width: 70%"></div>
        <div id="progress-status"></div>
      `;
      const clock = sinon.useFakeTimers();
      const spy = sinon.spy(screen, 'updateProgressBar');
      screen.progressBarHandler(splashScreenEl, 10, 10, false);
      clock.tick(100);
      expect(spy.called).to.be.false;
      spy.restore();
      clock.restore();
    });

    it('should return early inside timeout when value is 100', () => {
      splashScreenEl.innerHTML = `
        <div class="spectrum-ProgressBar" value="0" aria-valuenow="0"></div>
        <div class="spectrum-ProgressBar-percentage">0%</div>
        <div class="spectrum-ProgressBar-fill" style="width: 0%"></div>
        <div id="progress-status"></div>
      `;
      const clock = sinon.useFakeTimers();
      const stub = sinon.stub(screen, 'updateProgressBar').callsFake((layer, pct) => {
        if (pct === 10) {
          layer.querySelector('.spectrum-ProgressBar').setAttribute('value', '100');
        }
      });
      screen.progressBarHandler(splashScreenEl, 10, 10, true);
      clock.tick(20);
      stub.restore();
      clock.restore();
    });
  });

  describe('handleSplashProgressBar', () => {
    it('should replace icon-progress-bar and call progressBarHandler', () => {
      const icon = document.createElement('div');
      icon.className = 'icon-progress-bar';
      splashScreenEl.appendChild(icon);
      const stub = sinon.stub(screen, 'progressBarHandler');
      screen.createProgressBar = () => {
        const el = document.createElement('div');
        el.className = 'progress-holder';
        return el;
      };
      screen.handleSplashProgressBar();
      expect(splashScreenEl.querySelector('.progress-holder')).to.exist;
      expect(stub.called).to.be.true;
      stub.restore();
    });
  });

  describe('handleOperationCancel', () => {
    it('should call initActionListeners with correct actMap', () => {
      const stub = sinon.stub();
      screen.initActionListeners = stub;
      screen.handleOperationCancel();
      expect(stub.calledWith(splashScreenEl, { 'a.con-button[href*="#_cancel"]': 'interrupt' })).to.be.true;
    });
  });

  describe('splashVisibilityController', () => {
    beforeEach(() => {
      const parent = document.createElement('div');
      parent.appendChild(splashScreenEl);
      document.body.innerHTML = '<main></main><header></header><footer></footer>';
    });
    it('should hide splash and reset LOADER_LIMIT when displayOn is false', () => {
      screen.splashVisibilityController(false);
      expect(screen.LOADER_LIMIT).to.equal(95);
      expect(splashScreenEl.classList.contains('show')).to.be.false;
      expect(splashScreenEl.parentElement.classList.contains('hide-splash-overflow')).to.be.false;
    });
    it('should show splash and set aria-hidden when displayOn is true', () => {
      const stub = sinon.stub(screen, 'progressBarHandler');
      screen.splashVisibilityController(true);
      expect(splashScreenEl.classList.contains('show')).to.be.true;
      expect(splashScreenEl.parentElement.classList.contains('hide-splash-overflow')).to.be.true;
      expect(document.querySelector('main').getAttribute('aria-hidden')).to.equal('true');
      stub.restore();
    });

    it('should focus splash element after short delay when shown', () => {
      const stubPb = sinon.stub(screen, 'progressBarHandler');
      sinon.stub(screen, 'resetSplashVideos');
      splashScreenEl.setAttribute('tabindex', '-1');
      splashScreenEl.focus = sinon.spy();
      const clock = sinon.useFakeTimers();
      screen.splashVisibilityController(true);
      clock.tick(50);
      expect(splashScreenEl.focus.calledOnce).to.be.true;
      stubPb.restore();
      screen.resetSplashVideos.restore();
      clock.restore();
    });
  });

  describe('updateCopyForDevice', () => {
    it('should update heading display for desktop/mobile', () => {
      const h1 = document.createElement('h1');
      h1.innerText = 'Mobile';
      const h2 = document.createElement('h2');
      h2.innerText = 'Desktop';
      screen.headingElements = [null, null, h1, h2];
      screen.isDesktop = true;
      screen.splashScreenEl = document.createElement('div');
      screen.updateCopyForDevice();
      expect(h1.style.display).to.equal('none');
      expect(h2.style.display).to.equal('block');
      screen.isDesktop = false;
      screen.updateCopyForDevice();
      expect(h1.style.display).to.equal('block');
      expect(h2.style.display).to.equal('none');
    });
  });

  describe('showSplashScreen', () => {
    it('should not run if splashScreenEl is missing or showSplashScreen is false', async () => {
      screen.splashScreenEl = null;
      await screen.showSplashScreen(); // Should not throw
      screen.splashScreenEl = splashScreenEl;
      screen.workflowCfg.targetCfg.showSplashScreen = false;
      await screen.showSplashScreen(); // Should not throw
    });
    it('should run handleSplashProgressBar and handleOperationCancel if decorate class present', async () => {
      splashScreenEl.classList.add('decorate');
      const icon = document.createElement('div');
      icon.className = 'icon-progress-bar';
      splashScreenEl.appendChild(icon);
      const cancelBtn = document.createElement('a');
      cancelBtn.className = 'con-button';
      cancelBtn.href = '#_cancel';
      splashScreenEl.appendChild(cancelBtn);
      const h0 = document.createElement('h1');
      h0.innerText = 'Heading 0';
      const h1 = document.createElement('h2');
      h1.innerText = 'Heading 1';
      const h2 = document.createElement('h3');
      h2.innerText = 'Heading 2';
      splashScreenEl.appendChild(h0);
      splashScreenEl.appendChild(h1);
      splashScreenEl.appendChild(h2);
      const stub1 = sinon.stub(screen, 'handleSplashProgressBar').resolves();
      const stub2 = sinon.stub(screen, 'handleOperationCancel');
      await screen.showSplashScreen();
      expect(stub1.called).to.be.true;
      expect(stub2.called).to.be.true;
      stub1.restore();
      stub2.restore();
    });
  });

  describe('getFragmentLink', () => {
    it('should return domain-specific fragment link when domain matches', () => {
      screen.workflowCfg = {
        targetCfg: {
          splashScreenConfig: {
            fragmentLink: '/dc-shared/fragments/shared-fragments/frictionless/splash-page/splashscreen',
            'fragmentLink-acrobat': '/dc-shared/fragments/shared-fragments/frictionless/splash-page/splashscreen-acrobat',
          },
        },
        productName: 'Acrobat',
        name: 'workflow-acrobat',
      };
      expect(screen.getFragmentLink('acrobat')).to.equal('/dc-shared/fragments/shared-fragments/frictionless/splash-page/splashscreen-acrobat');
    });

    it('should fall back to default when domain matches but no domain-specific fragment exists', () => {
      const fragmentLink = '/dc-shared/fragments/shared-fragments/frictionless/splash-page/splashscreen';
      screen.workflowCfg = {
        targetCfg: { splashScreenConfig: { fragmentLink } },
        productName: 'Acrobat',
        name: 'workflow-acrobat',
      };
      expect(screen.getFragmentLink('acrobat')).to.equal(fragmentLink);
    });

    it('should return product-specific fragment link for workflow-upload', () => {
      screen.workflowCfg = {
        targetCfg: {
          splashScreenConfig: {
            fragmentLink: '/dc-shared/fragments/shared-fragments/frictionless/splash-page/splashscreen',
            'fragmentLink-photoshop': '/cc-shared/fragments/products/photoshop/unity/splash-page/splashscreen',
          },
        },
        productName: 'Photoshop',
        name: 'workflow-upload',
      };
      expect(screen.getFragmentLink(undefined)).to.equal('/cc-shared/fragments/products/photoshop/unity/splash-page/splashscreen');
    });

    it('should return default fragment link when no domain match and not workflow-upload', () => {
      const fragmentLink = '/dc-shared/fragments/shared-fragments/frictionless/splash-page/splashscreen';
      screen.workflowCfg = {
        targetCfg: { splashScreenConfig: { fragmentLink } },
        productName: 'Acrobat',
        name: 'workflow-acrobat',
      };
      expect(screen.getFragmentLink(undefined)).to.equal(fragmentLink);
    });

    it('should return themed fragment link for workflow-upload when theme is set', () => {
      screen.workflowCfg = {
        name: 'workflow-upload',
        theme: 'dark',
        productName: 'Firefly',
        targetCfg: {
          splashScreenConfig: {
            fragmentLink: '/default',
            'fragmentLink-firefly': '/ff-light',
            'fragmentLink-firefly-dark': '/ff-dark',
          },
        },
      };
      expect(screen.getFragmentLink(undefined)).to.equal('/ff-dark');
    });

    it('should fall back to product fragment when theme set but no themed key exists', () => {
      screen.workflowCfg = {
        name: 'workflow-upload',
        theme: 'dark',
        productName: 'Firefly',
        targetCfg: {
          splashScreenConfig: {
            fragmentLink: '/default',
            'fragmentLink-firefly': '/ff-only',
          },
        },
      };
      expect(screen.getFragmentLink(undefined)).to.equal('/ff-only');
    });
  });

  describe('checkForProgressBar', () => {
    it('should return icon-progress-bar element when present', () => {
      const icon = document.createElement('div');
      icon.className = 'icon-progress-bar';
      splashScreenEl.appendChild(icon);
      expect(screen.checkForProgressBar()).to.equal(icon);
    });

    it('should build progress bar from [[progress-bar]] placeholder paragraph', () => {
      const p = document.createElement('p');
      p.textContent = 'Status [[progress-bar]] more text';
      splashScreenEl.appendChild(p);
      const result = screen.checkForProgressBar();
      expect(result.classList.contains('progress-bar-area')).to.be.true;
      expect(result.querySelector('.progress-bar')).to.exist;
      expect(p.textContent).to.not.include('[[progress-bar]]');
    });

    it('should return null when no progress UI markers exist', () => {
      splashScreenEl.innerHTML = '<p>Plain copy only</p>';
      expect(screen.checkForProgressBar()).to.be.null;
    });
  });

  describe('setProgressTextFromDOM', () => {
    it('should collect text nodes next to progress-bar span', () => {
      splashScreenEl.innerHTML = `
        <div class="progress-bar-area">
          <span class="progress-bar"></span>
          Uploading your file
        </div>`;
      const nodes = screen.setProgressTextFromDOM();
      expect(nodes.length).to.be.at.least(1);
      expect(screen.progressText).to.include('Uploading');
    });
  });

  describe('resetSplashVideos', () => {
    it('should return when splashScreenEl is missing', () => {
      screen.splashScreenEl = null;
      expect(() => screen.resetSplashVideos()).to.not.throw();
    });

    it('should reset and play video when readyState is high enough', () => {
      const video = document.createElement('video');
      Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
      sinon.stub(video, 'play').resolves();
      sinon.stub(video, 'load');
      splashScreenEl.appendChild(video);
      screen.resetSplashVideos();
      expect(video.load.called).to.be.true;
      video.play.restore();
      video.load.restore();
    });

    it('should wait for canplay when video is not ready', () => {
      const video = document.createElement('video');
      Object.defineProperty(video, 'readyState', { value: 0, configurable: true });
      sinon.stub(video, 'load');
      sinon.stub(video, 'play').resolves();
      splashScreenEl.appendChild(video);
      screen.resetSplashVideos();
      video.dispatchEvent(new Event('canplay'));
      expect(video.load.called).to.be.true;
      video.play.restore();
      video.load.restore();
    });
  });

  describe('loadSplashFragment', () => {
    it('should return immediately when showSplashScreen is false', async () => {
      screen.workflowCfg = {
        targetCfg: { showSplashScreen: false, splashScreenConfig: { splashScreenParent: 'body' } },
        productName: 'test',
        name: 'workflow-upload',
      };
      const fetchSpy = sinon.spy(window, 'fetch');
      await screen.loadSplashFragment();
      expect(fetchSpy.called).to.be.false;
      fetchSpy.restore();
    });
  });

  describe('delayedSplashLoader', () => {
    it('should call loadSplashFragment after idle timeout', async () => {
      const stub = sinon.stub(screen, 'loadSplashFragment').resolves();
      const clock = sinon.useFakeTimers();
      screen.delayedSplashLoader();
      clock.tick(8000);
      await Promise.resolve();
      await Promise.resolve();
      expect(stub.calledOnce).to.be.true;
      stub.restore();
      clock.restore();
    });

    it('should call loadSplashFragment on first pointer interaction', async () => {
      const stub = sinon.stub(screen, 'loadSplashFragment').resolves();
      screen.delayedSplashLoader();
      document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      expect(stub.calledOnce).to.be.true;
      stub.restore();
    });
  });

  describe('showSplashScreen photoshop branch', () => {
    it('should call updateCopyForDevice when product is Photoshop', async () => {
      splashScreenEl.classList.add('decorate');
      const icon = document.createElement('div');
      icon.className = 'icon-progress-bar';
      splashScreenEl.appendChild(icon);
      const h0 = document.createElement('h1');
      h0.innerText = 'H0';
      const h1 = document.createElement('h2');
      h1.innerText = 'H1';
      const h2 = document.createElement('h3');
      h2.innerText = 'H2';
      const h3 = document.createElement('h4');
      h3.innerText = 'H3';
      splashScreenEl.appendChild(h0);
      splashScreenEl.appendChild(h1);
      splashScreenEl.appendChild(h2);
      splashScreenEl.appendChild(h3);
      screen.workflowCfg = {
        targetCfg: { showSplashScreen: true },
        productName: 'Photoshop',
        name: 'workflow-upload',
      };
      const stub = sinon.stub(screen, 'updateCopyForDevice');
      const stubPb = sinon.stub(screen, 'handleSplashProgressBar').resolves();
      await screen.showSplashScreen();
      expect(stub.called).to.be.true;
      stub.restore();
      stubPb.restore();
    });
  });
});
