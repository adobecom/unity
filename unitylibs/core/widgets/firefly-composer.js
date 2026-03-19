export default class FireflyComposer {
    constructor(slot, contentRow, workflowCfg) {
      this.slot = slot;
      this.contentRow = contentRow;
      this.workflowCfg = workflowCfg;
  
      this.state = {
        selectedIndex: 0,
        prompt: '',
        isUserEdited: false,
        styles: [],
      };
    }
  
    // ---------- PARSER ----------
    parseStyles() {
      const columns = [...this.contentRow.children];
  
      const styles = [];
  
      columns.forEach((col) => {
        const uls = [...col.querySelectorAll('ul')];
  
        uls.forEach((ul) => {
          const lis = ul.querySelectorAll('li');
  
          if (lis.length < 4) return;
  
          const thumbnail = lis[0]?.querySelector('picture');
          const name = lis[2]?.textContent?.trim();
          const prompt = lis[3]?.textContent?.trim();
  
          // Find images in following ULs (heuristic)
          const images = [...ul.parentElement.querySelectorAll('picture')];
  
          styles.push({
            thumbnail,
            name,
            defaultPrompt: prompt,
            images: {
              desktop: images[1] || images[0],
              tablet: images[2] || images[1],
              mobile: images[3] || images[2],
            },
          });
        });
      });
  
      return styles;
    }
  
    // ---------- IMAGE PICKER ----------
    getResponsiveImage(style) {
      const w = window.innerWidth;
  
      if (w < 600) return style.images.mobile;
      if (w < 1024) return style.images.tablet;
      return style.images.desktop;
    }
  
    // ---------- STATE ----------
    setStyle(index) {
      this.state.selectedIndex = index;
  
      const style = this.state.styles[index];
  
      if (!this.state.isUserEdited) {
        this.state.prompt = style.defaultPrompt;
        this.promptInput.value = this.state.prompt;
      }
  
      this.updatePreview();
      this.highlightSelected();
    }
  
    // ---------- UI BUILD ----------
    buildUI() {
      const container = document.createElement('div');
      container.className = 'firefly-composer';
  
      // LEFT
      const left = document.createElement('div');
      left.className = 'ffc-left';
  
      // Prompt
      const input = document.createElement('textarea');
      input.className = 'ffc-prompt';
      input.placeholder = 'Describe what you want to generate';
  
      input.addEventListener('input', () => {
        this.state.prompt = input.value;
        this.state.isUserEdited = input.value.length > 0;
      });
  
      this.promptInput = input;
  
      // Generate button
      const btn = document.createElement('button');
      btn.className = 'ffc-generate';
      btn.innerText = 'Generate';
  
      // Style list
      const stylesEl = document.createElement('div');
      stylesEl.className = 'ffc-styles';
  
      this.state.styles.forEach((style, i) => {
        const item = document.createElement('div');
        item.className = 'ffc-style';
  
        const thumb = style.thumbnail?.cloneNode(true);
        if (thumb) item.appendChild(thumb);
  
        const label = document.createElement('span');
        label.textContent = style.name;
        item.appendChild(label);
  
        item.addEventListener('click', () => this.setStyle(i));
  
        stylesEl.appendChild(item);
      });
  
      left.appendChild(input);
      left.appendChild(btn);
      left.appendChild(stylesEl);
  
      // RIGHT
      const right = document.createElement('div');
      right.className = 'ffc-right';
  
      const imgWrapper = document.createElement('div');
      imgWrapper.className = 'ffc-preview';
  
      this.previewContainer = imgWrapper;
  
      right.appendChild(imgWrapper);
  
      container.appendChild(left);
      container.appendChild(right);
  
      return container;
    }
  
    // ---------- PREVIEW ----------
    updatePreview() {
      const style = this.state.styles[this.state.selectedIndex];
      const pic = this.getResponsiveImage(style)?.cloneNode(true);
  
      if (!pic) return;
  
      const img = pic.querySelector('img');
      if (img) {
        img.loading = 'eager';
        img.fetchPriority = 'high';
      }
  
      this.previewContainer.innerHTML = '';
      this.previewContainer.appendChild(pic);
    }
  
    highlightSelected() {
      const items = this.slot.querySelectorAll('.ffc-style');
      items.forEach((el, i) => {
        el.classList.toggle('active', i === this.state.selectedIndex);
      });
    }
  
    // ---------- RENDER ----------
    async render() {
      this.state.styles = this.parseStyles();
  
      if (!this.state.styles.length) return {};
  
      this.state.prompt = this.state.styles[0].defaultPrompt;
  
      const ui = this.buildUI();
      this.slot.innerHTML = '';
      this.slot.appendChild(ui);
  
      this.promptInput.value = this.state.prompt;
  
      this.setStyle(0);
  
      return {
        '.ffc-generate': 'generate',
      };
    }
  }