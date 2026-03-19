import { createTag, defineDeviceByScreenSize, getUnityLibs } from '../../utils.js';

export default class FireflyComposer {
  constructor(interactiveArea, el, workflowCfg) {
    this.container = interactiveArea;
    this.el = el;
    this.workflowCfg = workflowCfg;

    this.state = {
      selectedStyleIndex: 0,
      prompt: '',
      isUserEdited: false,
    };

    this.styles = [];
  }

  loadCSS() {
        const cssPath = `${getUnityLibs()}/core/widgets/firefly-composer/firefly-composer.css`;
      
        // prevent duplicate loads
        if (document.querySelector(`link[href="${cssPath}"]`)) return;
      
        const link = document.createElement('link');
      
        // 🔥 preload first
        link.rel = 'preload';
        link.as = 'style';
        link.href = cssPath;
      
        // 🔥 once loaded → apply stylesheet
        link.onload = () => {
          link.rel = 'stylesheet';
        };
      
        document.head.appendChild(link);
      }
  

  /* ---------------- INIT ---------------- */

  async render() {
    this.loadCSS();
    this.parseAuthoring();

    this.buildUI();

    this.attachEvents();

    this.applyInitialState();

    return {
      '.gen-btn': { actionType: 'generate' },
      '.style-item': { actionType: 'styleSelect' },
    };
  }

  /* ---------------- PARSE AUTHORING ---------------- */

  parseAuthoring() {
    const root = this.el.querySelector(':scope > div > div');
  
    if (!root) return;
  
    const ul = root.querySelector('ul');
    const variantItems = ul?.querySelectorAll(':scope > li') || [];
  
    const imageBlocks = root.querySelectorAll(':scope > div');
  
    this.styles = [];
  
    variantItems.forEach((li, index) => {
      const picture = li.querySelector('picture');
      const textNodes = li.querySelectorAll(':scope > *:not(picture)');
  
      const title = textNodes[0]?.textContent?.trim() || '';
      const prompt = textNodes[1]?.textContent?.trim() || '';
  
      const imageContainer = imageBlocks[index];
  
      let mobilePic;
      let tabletPic;
      let desktopPic;
  
      if (imageContainer) {
        const pictures = imageContainer.querySelectorAll('picture');
  
        // Based on your authoring:
        // picture[0] → mobile
        // picture[1] → tablet
        // picture[2] → desktop
  
        mobilePic = pictures[0]?.cloneNode(true);
        tabletPic = pictures[1]?.cloneNode(true);
        desktopPic = pictures[2]?.cloneNode(true);
      }
  
      this.styles.push({
        title,
        prompt,
        thumbnail: picture?.cloneNode(true),
        images: {
          mobile: mobilePic,
          tablet: tabletPic,
          desktop: desktopPic,
        },
      });
    });
  }

  /* ---------------- BUILD UI ---------------- */

  buildUI() {
    this.wrapper = createTag('div', { class: 'ff-composer' });

    /* LEFT PANEL */
    this.left = createTag('div', { class: 'ff-left' });

    this.textarea = createTag('textarea', {
      class: 'inp-field',
      placeholder: this.getText('placeholder-prompt'),
    });

    this.generateBtn = createTag('button', { class: 'gen-btn' }, 'Generate');

    this.stylesContainer = createTag('div', { class: 'styles' });

    this.styles.forEach((style, i) => {
      const item = createTag('div', {
        class: 'style-item',
        'data-index': i,
      });

      if (style.thumbnail) {
        item.append(style.thumbnail.cloneNode(true));
      }

      const label = createTag('span', {}, style.title);
      item.append(label);

      this.stylesContainer.append(item);
    });

    this.left.append(this.textarea, this.generateBtn, this.stylesContainer);

    /* RIGHT PANEL */
    this.right = createTag('div', { class: 'ff-right' });

    this.previewImg = createTag('img', {
      class: 'preview-img',
      loading: 'eager', // 🔥 important for LCP
      fetchpriority: 'high',
    });

    this.right.append(this.previewImg);

    this.wrapper.append(this.left, this.right);
    this.addWidget();
  }

  /**
   * Place the composer in the DOM using targetCfg.target and targetCfg.insert
   * (mirrors workflow-firefly/widget.js addWidget). Preserves hero-marquee content.
   */
  addWidget() {
    console.log("inside addWidget");
    const targetCfg = this.workflowCfg?.targetCfg;
    const interactArea = this.container.querySelector('.copy') || this.container.querySelector('.text');
    const para = targetCfg?.target && interactArea ? interactArea.querySelector(targetCfg.target) : null;

    if (para && targetCfg?.insert) {
      if (targetCfg.insert === 'before') para.before(this.wrapper);
      else para.after(this.wrapper);
    } else {
      this.container.innerHTML = '';
      this.container.append(this.wrapper);
    }
  }

  /* ---------------- EVENTS ---------------- */

  attachEvents() {
    this.stylesContainer.addEventListener('click', (e) => {
      const item = e.target.closest('.style-item');
      if (!item) return;

      const index = Number(item.dataset.index);
      this.selectStyle(index);
    });

    this.textarea.addEventListener('input', () => {
      this.state.isUserEdited = true;
      this.state.prompt = this.textarea.value;
    });
  }

  /* ---------------- STATE MANAGEMENT ---------------- */

  applyInitialState() {
    this.selectStyle(0);
  }

  selectStyle(index) {
    this.state.selectedStyleIndex = index;

    const style = this.styles[index];

    // Update prompt ONLY if user hasn’t edited
    if (!this.state.isUserEdited) {
      this.textarea.value = style.prompt;
      this.state.prompt = style.prompt;
    }

    this.updatePreviewImage(index);

    this.updateActiveStyleUI(index);
  }

  updateActiveStyleUI(index) {
    this.stylesContainer.querySelectorAll('.style-item').forEach((el) => {
      el.classList.remove('active');
    });

    this.stylesContainer
      .querySelector(`[data-index="${index}"]`)
      ?.classList.add('active');
  }

  /* ---------------- IMAGE LOGIC ---------------- */

  updatePreviewImage(index) {
    const style = this.styles[index];
    const viewport = defineDeviceByScreenSize();
  
    let pic;
  
    if (viewport === 'MOBILE') {
      pic = style.images.mobile;
    } else if (viewport === 'TABLET') {
      pic = style.images.tablet;
    } else {
      pic = style.images.desktop;
    }
  
    if (!pic) return;
  
    this.previewImg.src = this.getImgSrc(pic);
  }

  /* ---------------- UTILS ---------------- */

  getText(key) {
    return this.workflowCfg?.supportedTexts?.[key]?.[0] || '';
  }

  getImgSrc(pic) {
    if (!pic) return '';
    const viewport = defineDeviceByScreenSize();
    const source = viewport === 'MOBILE'
      ? pic.querySelector('source[type="image/webp"]:not([media])')
      : pic.querySelector('source[type="image/webp"][media]');
    return source?.srcset || pic.querySelector('img')?.src || '';
  }
}