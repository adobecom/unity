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
});
