import {
  createTag,
  localizeLink,
  loadImg,
  loadArea,
  getMatchedDomain,
} from './utils.js';

export default class TransitionScreen {
  static lastProgressText = '';

  constructor(splashScreenEl, initActionListeners, loaderLimit, workflowCfg, isDesktop = false) {
    this.splashScreenEl = splashScreenEl;
    this.initActionListeners = initActionListeners;
    this.LOADER_LIMIT = loaderLimit;
    this.workflowCfg = workflowCfg;
    this.LOADER_DELAY = 800;
    this.LOADER_INCREMENT = 30;
    this.isDesktop = isDesktop;
    this.headingElements = [];
    this.progressText = '';
  }

  setProgressTextFromDOM() {
    const textNodes = Array.from(this.splashScreenEl.querySelector('[class*="progress-bar"]')?.closest('.icon-area, .progress-bar-area')?.childNodes ?? [])
      .filter((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '');
    this.progressText = textNodes.map((node) => node.textContent.trim()).join(' ');
    if (this.progressText) TransitionScreen.lastProgressText = this.progressText;
    return textNodes;
  }

  updateProgressBar(layer, percentage) {
    if (!this.progressText && TransitionScreen.lastProgressText) this.progressText = TransitionScreen.lastProgressText;
    const p = Math.min(percentage, this.LOADER_LIMIT);
    const spb = layer.querySelector('.spectrum-ProgressBar');
    spb?.setAttribute('value', p);
    spb?.setAttribute('aria-valuenow', p);
    layer.querySelector('.spectrum-ProgressBar-percentage').innerHTML = `${p}%`;
    layer.querySelector('.spectrum-ProgressBar-fill').style.width = `${p}%`;
    const status = layer.querySelector('#progress-status');
    const newStatus = (this.progressText && this.progressText.trim() !== '')
      ? this.progressText.replace('%', `${p}%`)
      : `${p}%`;
    if (status && status.textContent !== newStatus) status.textContent = newStatus;
  }

  static createProgressBar() {
    const pdom = `<div class="spectrum-ProgressBar spectrum-ProgressBar--sizeM spectrum-ProgressBar--sideLabel" value="0" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
    <div class="spectrum-FieldLabel spectrum-FieldLabel--sizeM spectrum-ProgressBar-label"></div>
    <div class="spectrum-FieldLabel spectrum-FieldLabel--sizeM spectrum-ProgressBar-percentage">0%</div>
    <div class="spectrum-ProgressBar-track">
      <div class="spectrum-ProgressBar-fill" style="width: 0%;"></div>
    </div>
    </div>
    <div aria-live="polite" aria-atomic="true" class="sr-only" id="progress-status"></div>`;
    return createTag('div', { class: 'progress-holder' }, pdom);
  }

  progressBarHandler(s, delay, i, initialize = false) {
    if (!s) return;
    const newDelay = Math.min(delay + 100, 2000);
    const newI = Math.max(i - 5, 5);
    const progressBar = s.querySelector('.spectrum-ProgressBar');
    if (initialize) this.updateProgressBar(s, 0);
    else {
      const currentValue = parseInt(progressBar?.getAttribute('value'), 10);
      if (currentValue === 100 || currentValue >= this.LOADER_LIMIT) return;
    }

    setTimeout(() => {
      const v = initialize ? 0 : parseInt(progressBar.getAttribute('value'), 10);
      if (v === 100) return;
      this.updateProgressBar(s, v + newI);
      this.progressBarHandler(s, newDelay, newI);
    }, newDelay);
  }

  getFragmentLink() {
    const { splashScreenConfig, domainMap } = this.workflowCfg.targetCfg;
    const matchedDomain = getMatchedDomain(domainMap);
    if (matchedDomain) {
      return splashScreenConfig[`fragmentLink-${matchedDomain}`];
    }
    const productName = this.workflowCfg.productName.toLowerCase();
    if (this.workflowCfg.name === 'workflow-upload') {
      return splashScreenConfig[`fragmentLink-${productName}`];
    }
    return splashScreenConfig.fragmentLink;
  }

  async loadSplashFragment() {
    if (!this.workflowCfg.targetCfg.showSplashScreen) return;
    const fragmentLink = this.getFragmentLink();
    this.splashFragmentLink = localizeLink(`${window.location.origin}${fragmentLink}`);
    const resp = await fetch(`${this.splashFragmentLink}.plain.html`);
    const html = await resp.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const h2Elements = doc.querySelectorAll('h2');
    if (h2Elements.length > 1) {
      Array.from(h2Elements).slice(1).forEach((headingToReplace) => {
        const p = doc.createElement('p');
        Array.from(headingToReplace.attributes).forEach((attr) => {
          p.setAttribute(attr.name, attr.value);
        });
        p.innerHTML = headingToReplace.innerHTML;
        headingToReplace.replaceWith(p);
      });
    }
    const sections = doc.querySelectorAll('body > div');
    const f = createTag('div', { class: 'fragment splash-loader decorate', style: 'display: none', tabindex: '-1', role: 'dialog', 'aria-modal': 'true' });
    f.append(...sections);
    const splashDiv = document.querySelector(
      this.workflowCfg.targetCfg.splashScreenConfig.splashScreenParent,
    );
    splashDiv.append(f);
    const img = f.querySelector('img');
    if (img) loadImg(img);
    await loadArea(f);
    this.splashScreenEl = f;
  }

  async delayedSplashLoader() {
    let eventListeners = ['mousemove', 'keydown', 'click', 'touchstart'];
    let timeoutId;

    const cleanup = (handler) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (eventListeners) {
        eventListeners.forEach((event) => document.removeEventListener(event, handler));
        eventListeners = null;
      }
    };

    const interactionHandler = async () => {
      await this.loadSplashFragment();
      cleanup(interactionHandler);
    };

    const timeoutHandler = async () => {
      await this.loadSplashFragment();
      cleanup(interactionHandler);
    };

    // Timeout to load after 8 seconds
    timeoutId = setTimeout(timeoutHandler, 8000);

    eventListeners.forEach((event) => document.addEventListener(
      event,
      interactionHandler,
      { once: true },
    ));
  }

  async handleSplashProgressBar() {
    const pb = TransitionScreen.createProgressBar();
    this.splashScreenEl.querySelector('[class*="progress-bar"]').replaceWith(pb);
    this.progressBarHandler(this.splashScreenEl, this.LOADER_DELAY, this.LOADER_INCREMENT, true);
  }

  handleOperationCancel() {
    const actMap = { 'a.con-button[href*="#_cancel"]': 'interrupt' };
    this.initActionListeners(this.splashScreenEl, actMap);
  }

  splashVisibilityController(displayOn) {
    if (!displayOn) {
      this.LOADER_LIMIT = 95;
      this.splashScreenEl.parentElement?.classList.remove('hide-splash-overflow');
      this.splashScreenEl.classList.remove('show');
      document.querySelector('main').removeAttribute('aria-hidden');
      document.querySelector('header').removeAttribute('aria-hidden');
      document.querySelector('footer').removeAttribute('aria-hidden');
      return;
    }
    this.progressBarHandler(this.splashScreenEl, this.LOADER_DELAY, this.LOADER_INCREMENT, true);
    this.splashScreenEl.classList.add('show');
    this.splashScreenEl.parentElement?.classList.add('hide-splash-overflow');
    document.querySelector('main').setAttribute('aria-hidden', 'true');
    document.querySelector('header').setAttribute('aria-hidden', 'true');
    document.querySelector('footer').setAttribute('aria-hidden', 'true');
    setTimeout(() => this.splashScreenEl.focus(), 50);
  }

  updateCopyForDevice() {
    const mobileHeading = this.headingElements[2];
    const desktopHeading = this.headingElements[3];
    if (mobileHeading) {
      mobileHeading.style.display = (this.isDesktop && desktopHeading) ? 'none' : 'block';
    }
    if (desktopHeading) {
      if (this.isDesktop) {
        desktopHeading.style.display = 'block';
        this.splashScreenEl.setAttribute('aria-label', desktopHeading.innerText);
      } else {
        desktopHeading.style.display = 'none';
      }
    }
  }

  checkForProgressBar() {
    const iconSyntax = this.splashScreenEl.querySelector('.icon-progress-bar');
    const configPlaceholderSyntax = this.splashScreenEl.querySelectorAll('p');
    if (iconSyntax) return iconSyntax;

    const progressBarParagraph = [...configPlaceholderSyntax].find((p) => p.textContent.includes('[[progress-bar]]'));
    if (progressBarParagraph) {
      progressBarParagraph.classList.add('progress-bar-area');
      progressBarParagraph.textContent = progressBarParagraph.textContent.replace('[[progress-bar]]', '').trim();
      const progressBarElement = createTag('span', { class: 'progress-bar' });
      progressBarParagraph.prepend(progressBarElement);
      return progressBarParagraph;
    }
    return null;
  }

  async showSplashScreen(displayOn = false) {
    if (!this.splashScreenEl || !this.workflowCfg.targetCfg.showSplashScreen) return;
    if (this.splashScreenEl.classList.contains('decorate')) {
      const loadingProgressBar = this.checkForProgressBar();
      const textNodes = this.setProgressTextFromDOM();
      textNodes.forEach((node) => { node.textContent = ''; });
      if (loadingProgressBar) await this.handleSplashProgressBar();
      if (this.splashScreenEl.querySelector('a.con-button[href*="#_cancel"]')) this.handleOperationCancel();
      this.headingElements = this.splashScreenEl.querySelectorAll('h1, h2, h3, h4, h5, h6, p');
      this.splashScreenEl.setAttribute('aria-label', this.headingElements[2].innerText);
      if (this.workflowCfg.productName.toLowerCase() === 'photoshop') this.updateCopyForDevice();
      this.splashScreenEl.classList.remove('decorate');
    }
    this.splashVisibilityController(displayOn);
  }
}
