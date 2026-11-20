import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { executeServerCommand, readFile, setViewport } from '@web/test-runner-commands';
import UnityWidget from '../../../../unitylibs/core/widgets/prompt-bar/prompt-bar.js';
import ActionBinder from '../../../../unitylibs/core/workflow/workflow-firefly/action-binder.js';
import { setUnityLibs } from '../../../../unitylibs/scripts/utils.js';

describe('Music functionality in the existing prompt bar', () => {
  let sandbox;
  let widget;
  let binder;
  let originalLana;
  let limits;

  before(async () => {
    const { _defaults: defaults } = JSON.parse(await readFile({ path: '../../../../unitylibs/core/workflow/workflow-firefly/target-config.json' }));
    limits = defaults.limits;
    setUnityLibs('', 'unity');
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/unitylibs/core/widgets/prompt-bar/prompt-bar.css';
    await new Promise((resolve, reject) => {
      stylesheet.onload = resolve;
      stylesheet.onerror = reject;
      document.head.append(stylesheet);
    });
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(ActionBinder.prototype, 'initAction').resolves();
    originalLana = window.lana;
    window.lana = { log: sandbox.spy() };
    document.body.innerHTML = '<div class="hero-marquee unity-enabled"><div class="interactive-area dark"><div class="copy"></div></div></div><div class="unity workflow-firefly"></div>';
    document.querySelector('.hero-marquee').style.setProperty('--s2a-font-family-body', 'Arial');
    const host = document.querySelector('.hero-marquee');
    host.style.setProperty('--s2a-font-family-caption', 'Verdana');
    host.style.setProperty('--s2a-typography-font-size-caption', '12px');
    host.style.setProperty('--s2a-font-weight-caption', '500');
    host.style.setProperty('--s2a-typography-line-height-caption', '16px');
    host.style.setProperty('--s2a-typography-letter-spacing-caption', '0.3px');
    host.style.setProperty('--s2a-typography-font-size-body-sm', '18px');
    host.style.setProperty('--s2a-typography-line-height-body-sm', '24px');
    host.style.setProperty('--s2a-typography-letter-spacing-body-sm', '0.2px');
  });

  afterEach(() => {
    binder?.rmvKeyDown();
    if (binder) document.removeEventListener('click', binder.boundOutsideClickHandler, true);
    if (widget?.outsideDropdownHandler) document.removeEventListener('click', widget.outsideDropdownHandler, true);
    sandbox.restore();
    window.lana = originalLana;
    widget = null;
    binder = null;
    document.body.innerHTML = '';
  });

  async function createWidget({
    verbs = ['music'],
    prompts = ['Gentle acoustic guitar', 'Ambient piano', 'Uplifting orchestral music'],
    shuffle = true,
    suggestions = false,
    redesign = false,
    max = limits['music-max-char-limit'],
    models = [],
  } = {}) {
    const author = document.querySelector('.unity');
    author.innerHTML = `<ul>
      ${verbs.map((verb) => `<li><span class="icon icon-verb-${verb}"></span><a href="/test/assets/img.svg">${verb}</a></li>`).join('')}
      <li><span class="icon icon-placeholder-input"></span>Describe your music</li>
      <li><span class="icon icon-placeholder-prompt-label"></span>Enter prompt</li>
      <li><span class="icon icon-generate"></span><img src="/test/assets/img.svg" alt="">Generate</li>
      ${shuffle ? `<li><span class="icon icon-shuffle"></span>${shuffle === 'noIcon' ? '' : '<img src="/test/assets/img.svg" alt="">'}Shuffle</li>` : ''}
      ${models.length ? '<li><span class="icon icon-model"></span></li>' : ''}
      ${suggestions ? '<li><span class="icon icon-placeholder-prompt"></span>Prompt</li><li><span class="icon icon-placeholder-suggestions"></span>Suggestions</li>' : ''}
    </ul>`;
    prompts.forEach((prompt) => {
      const row = document.createElement('li');
      row.innerHTML = '<span class="icon icon-music-prompt"></span>';
      row.append(document.createTextNode(prompt));
      author.querySelector('ul').append(row);
    });
    const actionMap = {
      '.inp-field': { actionType: 'autocomplete' },
      '.gen-btn': { actionType: 'generate' },
      '.drop-item': { actionType: 'setPromptValue' },
    };
    const cfg = {
      productName: 'Firefly',
      targetCfg: {
        selector: '.copy',
        target: 'a',
        actionMap,
        limits: { ...limits, 'music-max-char-limit': max },
        verbsWithoutPromptSuggestions: ['vector', 'music'],
      },
    };
    const host = document.querySelector('.hero-marquee');
    widget = new UnityWidget(host.querySelector('.interactive-area'), author, cfg, '<svg></svg>');
    widget.isFireflyRedesign = redesign;
    widget.models = models;
    sandbox.stub(widget, 'loadPrompts').callsFake(async () => {
      widget.prompts = {
        image: [{ prompt: 'An image suggestion', assetid: 'image-asset' }],
        sound: [{ prompt: 'A sound suggestion', assetid: 'sound-asset', variations: [] }],
        video: [{ prompt: 'A video suggestion', assetid: 'video-asset' }],
      };
    });
    await widget.initWidget();
    binder = new ActionBinder(author, cfg, host, host, actionMap);
    await binder.initActionListeners();
  }

  function input(value) {
    widget.musicInput.value = value;
    widget.musicInput.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Focus events are unreliable in background test tabs, so dispatch them explicitly.
  function focusEl(el) {
    el.focus();
    el.dispatchEvent(new FocusEvent('focus'));
  }

  function blurEl(el) {
    el.blur();
    el.dispatchEvent(new FocusEvent('blur'));
  }

  function clickAt(start, end = start) {
    focusEl(widget.musicInput);
    widget.musicInput.setSelectionRange(start, end);
    widget.musicInput.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }

  function expectTypography(style, color, size, lineHeight) {
    expect(style.color).to.equal(color);
    expect(style.fontFamily).to.equal('Arial, "Adobe Clean", adobe-clean, sans-serif');
    expect(style.fontSize).to.equal(`${size}px`);
    expect(style.fontStyle).to.equal('normal');
    expect(style.fontWeight).to.equal('400');
    expect(style.lineHeight).to.equal(`${lineHeight}px`);
    expect(style.letterSpacing).to.be.oneOf(['normal', '0px']);
  }

  function expectRedesignLabel(style, width, showcase = false) {
    let size = 12;
    let lineHeight = 16;
    if (width < 1280) {
      size = 8.53;
      lineHeight = 11.38;
    }
    if (width < 768) {
      size = 14.06;
      lineHeight = 18.75;
    }
    expect(style.color).to.equal(showcase ? 'rgb(219, 219, 219)' : 'rgba(248, 248, 248, 0.7)');
    expect(style.fontFamily).to.equal('Verdana');
    expect(style.fontSize).to.equal(`${size}px`);
    expect(style.fontWeight).to.equal('500');
    expect(style.lineHeight).to.equal(`${lineHeight}px`);
    expect(style.letterSpacing).to.equal(width < 1280 ? 'normal' : '0.3px');
    expect(style.marginBottom).to.equal('0px');
  }

  function expectRedesignInput(style, width, showcase = false) {
    const size = width < 768 ? '16.41px' : '18px';
    const lineHeight = width < 768 ? '21.09px' : '24px';
    expect(style.color).to.equal('rgb(255, 255, 255)');
    expect(style.fontFamily).to.equal('Arial, "Adobe Clean", adobe-clean, sans-serif');
    expect(style.fontSize).to.equal(showcase ? '16px' : size);
    expect(style.fontStyle).to.equal('normal');
    expect(style.fontWeight).to.equal('400');
    expect(style.lineHeight).to.equal(showcase ? '20px' : lineHeight);
    expect(style.letterSpacing).to.equal(width < 768 ? 'normal' : '0.2px');
  }

  it('starts empty with a placeholder, configured native cap and a live character counter', async () => {
    await createWidget();
    expect(widget.musicInput.value).to.equal('');
    expect(widget.musicInput.placeholder).to.equal('Describe your music');
    expect(widget.musicInput.maxLength).to.equal(500);
    expect(widget.musicCounter.textContent).to.equal('0/500');
    expect(widget.musicInput.getAttribute('aria-describedby')).to.include(widget.musicCounter.id);
    expect(widget.musicInput.hasAttribute('aria-controls')).to.be.false;
    expect(widget.widget.querySelector('.music-toolbar')).to.equal(null);
    expect(widget.widget.querySelector('.verb-segments')).to.equal(null);
    expect(widget.widgetWrap.classList.contains('prompt-bar-v2')).to.be.false;
  });

  it('counts raw characters including whitespace on input and reset', async () => {
    await createWidget();
    input('  bright\tpiano\nmusic  ');
    expect(widget.musicCounter.textContent).to.equal('22/500');
    input(' \n\t ');
    expect(widget.musicCounter.textContent).to.equal('4/500');
    binder.query = '';
    binder.resetDropdown();
    expect(widget.musicCounter.textContent).to.equal('0/500');
  });

  it('supports localized counter labels', async () => {
    await createWidget();
    widget.workflowCfg.placeholder['placeholder-character-count-label'] = 'Caracteres';
    input('piano doux');
    expect(widget.musicCounter.textContent).to.equal('10/500');
    expect(widget.musicCounter.getAttribute('aria-label')).to.equal('Caracteres: 10/500');
  });

  it('keeps the character counter without authoring Shuffle', async () => {
    await createWidget({ shuffle: false });
    expect(widget.widget.querySelector('.shuffle-btn')).to.equal(null);
    expect(widget.musicCounter.hidden).to.be.false;
    expect(widget.genBtn.parentElement.contains(widget.musicCounter)).to.be.true;
  });

  it('deduplicates and cycles through all authored suggestions without adjacent repeats', async () => {
    const prompts = Array.from({ length: 30 }, (_, index) => `Suggestion ${index}`);
    await createWidget({ prompts: [...prompts, prompts[0]] });
    const seen = new Set();
    prompts.forEach(() => {
      widget.shuffleMusicPrompt();
      expect(seen.has(widget.musicInput.value)).to.be.false;
      seen.add(widget.musicInput.value);
    });
    expect(seen.size).to.equal(30);
    const last = widget.musicInput.value;
    widget.shuffleMusicPrompt();
    expect(widget.musicInput.value).not.to.equal(last);
    expect(widget.musicCounter.textContent).to.equal(`${widget.musicInput.value.length}/500`);
    expect(widget.musicAnnouncement.textContent).to.equal(widget.musicInput.value);
  });

  it('handles a single authored suggestion', async () => {
    await createWidget({ prompts: ['One prompt'] });
    widget.shuffleMusicPrompt();
    widget.shuffleMusicPrompt();
    expect(widget.musicInput.value).to.equal('One prompt');
  });

  it('uses the configured cap for suggestions, native input, counters and validation', async () => {
    await createWidget({ max: 12, prompts: ['', 'x'.repeat(12), 'y'.repeat(13)] });
    expect(widget.musicPrompts).to.deep.equal(['x'.repeat(12)]);
    expect(window.lana.log.calledWithMatch('at most 12 characters')).to.be.true;
    widget.shuffleMusicPrompt();
    expect(widget.musicInput.maxLength).to.equal(12);
    expect(widget.musicCounter.textContent).to.equal('12/12');
    widget.musicInput.focus();
    widget.musicInput.setSelectionRange(12, 12);
    document.execCommand('insertText', false, 'more');
    expect(widget.musicInput.value.length).to.equal(12);
    input('x'.repeat(13));
    sandbox.stub(binder, 'showErrorToast');
    expect(binder.validateInput(widget.musicInput.value).isValid).to.be.false;
  });

  it('disables and logs Shuffle without valid suggestions', async () => {
    await createWidget({ prompts: ['', 'x'.repeat(501)] });
    expect(widget.musicShuffle.disabled).to.be.true;
    expect(window.lana.log.calledWithMatch('without any valid')).to.be.true;
  });

  [0, -1, 1.5, 'invalid'].forEach((max) => {
    it(`rejects invalid music configuration (${max})`, async () => {
      await createWidget({ max }).then(
        () => expect.fail('Expected invalid config to fail'),
        (error) => expect(error.message).to.include('positive integer'),
      );
    });
  });

  it('clears only a pending suggestion when clicked at its beginning', async () => {
    await createWidget();
    widget.shuffleMusicPrompt();
    clickAt(0);
    expect(widget.musicInput.value).to.equal('');
    expect(widget.musicCounter.textContent).to.equal('0/500');
    widget.shuffleMusicPrompt();
    const prompt = widget.musicInput.value;
    clickAt(4);
    expect(widget.musicInput.selectionStart).to.equal(4);
    clickAt(0);
    expect(widget.musicInput.value).to.equal(prompt);
  });

  it('preserves suggestions on focus and selection; typing accepts editing', async () => {
    await createWidget();
    widget.shuffleMusicPrompt();
    widget.musicInput.focus();
    expect(widget.musicSuggestionPending).to.be.true;
    clickAt(0, 3);
    expect(widget.musicInput.value).not.to.equal('');
    widget.shuffleMusicPrompt();
    input('My edited prompt');
    clickAt(0);
    expect(widget.musicInput.value).to.equal('My edited prompt');
  });

  it('submits untouched shuffled text to text-to-music, not a stale asset or sound override', async () => {
    await createWidget();
    sandbox.stub(binder, 'initAnalytics').resolves();
    sandbox.stub(binder, 'emitGenerateStartAnalytics').returns({});
    sandbox.stub(binder, 'logAnalytics');
    sandbox.stub(binder, 'showErrorToast');
    sandbox.stub(binder, 'resetDropdown');
    const fetch = sandbox.stub().resolves({});
    sandbox.stub(binder, 'getNetworkUtils').resolves({ fetchFromService: fetch });
    widget.shuffleMusicPrompt();
    const prompt = widget.musicInput.value;
    binder.id = 'old-asset';
    widget.genBtn.dataset.soundPrompt = 'old sound';
    await binder.generateContent();
    const payload = JSON.parse(fetch.firstCall.args[1].body);
    expect(payload.query).to.equal(prompt);
    expect(payload.assetId).to.equal(undefined);
    expect(payload.payload.workflow).to.equal('text-to-music');
    expect(payload.payload.action).to.equal('generate');
  });

  it('allows an empty music prompt and submits it to text-to-music without an error', async () => {
    await createWidget();
    sandbox.stub(binder, 'initAnalytics').resolves();
    sandbox.stub(binder, 'emitGenerateStartAnalytics').returns({});
    sandbox.stub(binder, 'logAnalytics');
    const toast = sandbox.stub(binder, 'showErrorToast');
    sandbox.stub(binder, 'resetDropdown');
    const fetch = sandbox.stub().resolves({});
    sandbox.stub(binder, 'getNetworkUtils').resolves({ fetchFromService: fetch });
    input('   ');
    expect(binder.validateInput('').isValid).to.be.true;
    await binder.generateContent();
    expect(toast.called).to.be.false;
    const payload = JSON.parse(fetch.firstCall.args[1].body);
    expect(payload.query).to.equal('');
    expect(payload.payload.workflow).to.equal('text-to-music');
  });

  it('validates the displayed raw character count', async () => {
    await createWidget();
    sandbox.stub(binder, 'showErrorToast');
    input(` ${'x'.repeat(499)} `);
    expect(binder.validateInput(widget.musicInput.value.trim()).isValid).to.be.false;
    expect(widget.musicCounter.textContent).to.equal('501/500');
  });

  it('submits Enter once, ignores composition Enter and supports keyboard Shuffle', async () => {
    await createWidget();
    const generate = sandbox.stub(binder, 'generateContent');
    input('A prompt');
    widget.musicInput.focus();
    widget.musicInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(generate.calledOnce).to.be.true;
    widget.musicInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true }));
    expect(generate.calledOnce).to.be.true;
    widget.musicShuffle.focus();
    widget.musicShuffle.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(widget.musicSuggestionPending).to.be.true;
    expect(generate.calledOnce).to.be.true;
  });

  [false, true].forEach((redesign) => {
    [390, 599, 600, 767, 768, 1024, 1440].forEach((width) => {
      it(`uses the responsive input radius at ${width}px (redesign: ${redesign})`, async () => {
        await setViewport({ width, height: 900 });
        try {
          await createWidget({ redesign });
          const host = document.querySelector('.hero-marquee');
          const area = host.querySelector('.interactive-area');
          const wrap = host.querySelector('.ex-unity-wrap');
          const inputWrap = host.querySelector('.inp-wrap');
          const radius = width <= 599 ? '24px' : '10px';
          ['dark', 'light'].forEach((skin) => {
            area.className = `interactive-area ${skin}`;
            expect(getComputedStyle(inputWrap).borderRadius).to.equal(radius);
            wrap.classList.add('verb-options');
            expect(getComputedStyle(inputWrap).borderRadius).to.equal(radius);
            host.classList.add('theme-two');
            expect(getComputedStyle(inputWrap).borderRadius).to.equal(radius);
            host.classList.remove('theme-two');
            wrap.classList.remove('verb-options');
          });
        } finally {
          await setViewport({ width: 1024, height: 768 });
        }
      });
    });

    [390, 900, 1440].forEach((width) => {
      ['dark', 'light'].forEach((skin) => {
        it(`uses the requested typography at ${width}px in ${skin} skin (redesign: ${redesign})`, async () => {
          await setViewport({ width, height: 900 });
          try {
            await createWidget({ verbs: ['image', 'music'], suggestions: true, redesign });
            document.querySelector('.interactive-area').className = `interactive-area ${skin}`;
            const host = document.querySelector('.hero-marquee');
            const label = widget.widget.querySelector('.inp-field-label');
            const suggestion = widget.widget.querySelector('.drop-item');
            if (redesign) {
              expectRedesignLabel(getComputedStyle(label), width);
              expectRedesignInput(getComputedStyle(widget.musicInput), width);
              const placeholder = getComputedStyle(widget.musicInput, '::placeholder');
              expectRedesignInput(placeholder, width);
              host.classList.add('theme-two');
              expect(getComputedStyle(widget.musicInput, '::placeholder').fontSize)
                .to.equal(width <= 1024 ? '16px' : '20px');
            }
            host.classList.add('theme-two', 'firefly-model-showcase');
            if (redesign) {
              expectRedesignLabel(getComputedStyle(label), width, true);
              expectRedesignInput(getComputedStyle(widget.musicInput), width, true);
              const placeholder = getComputedStyle(widget.musicInput, '::placeholder');
              expect(placeholder.color).to.equal('rgb(219, 219, 219)');
              expect(placeholder.fontSize).to.equal('16px');
              expect(placeholder.fontStyle).to.equal('normal');
              widget.musicInput.style.flex = 'none';
              expect(getComputedStyle(widget.musicInput).height).to.equal(width <= 599 ? '46px' : '36px');
              widget.musicInput.style.removeProperty('flex');
            } else {
              expectTypography(getComputedStyle(label), 'rgb(80, 80, 80)', 14, 16);
              expectTypography(getComputedStyle(widget.musicInput, '::placeholder'), 'rgb(68, 68, 68)', 16, 20);
            }
            expectTypography(getComputedStyle(suggestion), 'rgb(68, 68, 68)', 16, 20);
            suggestion.setAttribute('aria-selected', 'true');
            expectTypography(getComputedStyle(suggestion), 'rgb(0, 0, 0)', 16, 20);
            input('A user-written prompt');
            if (redesign) expectRedesignInput(getComputedStyle(widget.musicInput), width, true);
            else expectTypography(getComputedStyle(widget.musicInput), 'rgb(0, 0, 0)', 16, 20);
          } finally {
            await setViewport({ width: 1024, height: 768 });
          }
        });
      });
    });

    it(`styles pending music suggestions separately from active and edited text (redesign: ${redesign})`, async () => {
      await createWidget({ verbs: ['music', 'image'], redesign });
      const expectInput = (color) => {
        if (redesign) expectRedesignInput(getComputedStyle(widget.musicInput), window.innerWidth);
        else expectTypography(getComputedStyle(widget.musicInput), color, 16, 20);
      };
      widget.shuffleMusicPrompt();
      blurEl(widget.musicInput);
      expect(widget.musicSuggestionPending).to.be.true;
      expectInput('rgb(68, 68, 68)');
      await executeServerCommand('focus-test-page');
      focusEl(widget.musicInput);
      expectInput('rgb(0, 0, 0)');
      expect(widget.musicSuggestionPending).to.be.true;
      input('My edited suggestion');
      blurEl(widget.musicInput);
      expect(widget.musicSuggestionPending).to.be.false;
      expectInput('rgb(0, 0, 0)');
      widget.shuffleMusicPrompt();
      widget.widget.querySelector('[data-verb-type="image"]').click();
      expect(widget.musicInput.classList.contains('is-suggested')).to.be.false;
      expectInput('rgb(0, 0, 0)');
    });

    it(`resolves typography design-token overrides (redesign: ${redesign})`, async () => {
      await createWidget({ redesign });
      const host = document.querySelector('.hero-marquee');
      host.style.cssText += `
        --Alias-content-neutral-subdued-default: rgb(90, 91, 92);
        --Palette-gray-400: rgb(70, 71, 72);
        --Palette-gray-1000: rgb(10, 11, 12);
        --s2a-font-family-body: monospace;
        --Font-size-100: 15px;
        --Font-size-200: 17px;
        --Line-height-100: 19px;
        --Line-height-200: 21px;
        --Letter-spacing: 0.4px;
      `;
      const label = getComputedStyle(widget.widget.querySelector('.inp-field-label'));
      const placeholder = getComputedStyle(widget.musicInput, '::placeholder');
      const active = getComputedStyle(widget.musicInput);
      if (redesign) {
        expectRedesignLabel(label, window.innerWidth);
        [placeholder, active].forEach((style) => {
          expect(style.color).to.equal('rgb(255, 255, 255)');
          expect(style.fontSize).to.equal('18px');
          expect(style.lineHeight).to.equal('24px');
          expect(style.fontFamily).to.equal('monospace, "Adobe Clean", adobe-clean, sans-serif');
          expect(style.letterSpacing).to.equal('0.2px');
        });
        return;
      }
      expect(label.color).to.equal('rgb(90, 91, 92)');
      expect(label.fontSize).to.equal('15px');
      expect(label.lineHeight).to.equal('19px');
      expect(placeholder.color).to.equal('rgb(70, 71, 72)');
      expect(active.color).to.equal('rgb(10, 11, 12)');
      [placeholder, active].forEach((style) => {
        expect(style.fontSize).to.equal('17px');
        expect(style.lineHeight).to.equal('21px');
      });
      [label, placeholder, active].forEach((style) => {
        expect(style.fontFamily).to.equal('monospace, "Adobe Clean", adobe-clean, sans-serif');
        expect(style.letterSpacing).to.equal('0.4px');
      });
    });

    ['image', 'video', 'sound', 'music'].forEach((verb) => {
      it(`hides the ${verb} placeholder on focus and restores it when left empty (redesign: ${redesign})`, async () => {
        await createWidget({ verbs: [verb], redesign });
        const textarea = widget.widget.querySelector('.inp-field');
        const { placeholder } = textarea;
        expect(placeholder).not.to.equal('');
        focusEl(textarea);
        expect(textarea.placeholder).to.equal('');
        textarea.value = 'An edited prompt';
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.value = '';
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        expect(textarea.placeholder).to.equal('');
        blurEl(textarea);
        expect(textarea.placeholder).to.equal(placeholder);
      });
    });

    it(`keeps the placeholder hidden after clearing a pending music suggestion (redesign: ${redesign})`, async () => {
      await createWidget({ redesign });
      widget.shuffleMusicPrompt();
      clickAt(0);
      expect(widget.musicInput.value).to.equal('');
      expect(widget.musicInput.placeholder).to.equal('');
      expect(widget.musicCounter.textContent).to.equal('0/500');
      blurEl(widget.musicInput);
      expect(widget.musicInput.placeholder).to.equal('Describe your music');
    });

    it(`retains the selected verb placeholder through focus and feature switches (redesign: ${redesign})`, async () => {
      await createWidget({ verbs: ['music', 'image'], redesign });
      widget.workflowCfg.placeholder['placeholder-input-image'] = 'Describe an image';
      focusEl(widget.musicInput);
      widget.widget.querySelector('[data-verb-type="image"]').click();
      expect(widget.musicInput.placeholder).to.equal('Describe an image');
      focusEl(widget.musicInput);
      expect(widget.musicInput.placeholder).to.equal('');
      blurEl(widget.musicInput);
      expect(widget.musicInput.placeholder).to.equal('Describe an image');
    });

    it(`retains dropdowns and containers through feature switches (redesign: ${redesign})`, async () => {
      await createWidget({
        verbs: ['music', 'image'],
        redesign,
        models: [
          { module: 'music', id: 'music-one', version: '1', name: 'Music One', icon: '/test/assets/img.svg' },
          { module: 'image', id: 'image-one', version: '1', name: 'Image One', icon: '/test/assets/img.svg' },
        ],
      });
      const actWrap = widget.genBtn.parentElement;
      const parent = actWrap.parentElement;
      expect(widget.widget.querySelector('.selected-verb')).to.exist;
      expect(widget.widget.querySelector('.selected-model')).to.exist;
      expect(!!widget.widget.querySelector('.pb-redesign')).to.equal(redesign);
      const expectShuffleLast = () => {
        widget.widget.querySelectorAll('.verbs-container, .models-container').forEach((dropdown) => {
          // eslint-disable-next-line no-bitwise
          expect(dropdown.compareDocumentPosition(widget.musicShuffle) & Node.DOCUMENT_POSITION_FOLLOWING).to.not.equal(0);
        });
      };
      expectShuffleLast();
      widget.shuffleMusicPrompt();
      const text = widget.musicInput.value;
      widget.widget.querySelector('[data-verb-type="image"]').click();
      expect(widget.musicShuffle.hidden).to.be.true;
      expect(getComputedStyle(widget.musicShuffle).display).to.equal('none');
      expect(widget.musicCounter.hidden).to.be.true;
      expect(widget.musicInput.hasAttribute('maxlength')).to.be.false;
      expect(widget.musicInput.getAttribute('aria-controls')).to.equal('prompt-dropdown');
      expect(binder.getMaxPromptCharLimit()).to.equal(750);
      expect(binder.getSelectedModelId()).to.equal('image-one');
      expect(widget.musicInput.value).to.equal(text);
      widget.widget.querySelector('[data-verb-type="music"]').click();
      expect(widget.musicShuffle.hidden).to.be.false;
      expect(widget.musicInput.maxLength).to.equal(500);
      expect(binder.getSelectedModelId()).to.equal('music-one');
      expectShuffleLast();
      expect(widget.genBtn.parentElement).to.equal(actWrap);
      expect(actWrap.parentElement).to.equal(parent);
      expect(widget.widget.querySelector('.music-toolbar')).to.equal(null);
    });

    it(`keeps Shuffle after a model dropdown added by a feature switch (redesign: ${redesign})`, async () => {
      await createWidget({
        verbs: ['music', 'image'],
        redesign,
        models: [{ module: 'image', id: 'image-one', version: '1', name: 'Image One', icon: '/test/assets/img.svg' }],
      });
      expect(widget.widget.querySelector('.models-container')).to.equal(null);
      widget.widget.querySelector('[data-verb-type="image"]').click();
      const models = widget.widget.querySelector('.models-container');
      expect(models).to.exist;
      expect(models.parentElement).to.equal(widget.musicShuffle.parentElement);
      // eslint-disable-next-line no-bitwise
      expect(models.compareDocumentPosition(widget.musicShuffle) & Node.DOCUMENT_POSITION_FOLLOWING).to.not.equal(0);
    });

    it(`fits Shuffle, counters and Generate on mobile (redesign: ${redesign})`, async () => {
      await setViewport({ width: 390, height: 844 });
      try {
        await createWidget({ redesign });
        const panel = widget.widget.querySelector('.autocomplete').getBoundingClientRect();
        const controls = [widget.musicShuffle, widget.musicCounter, widget.genBtn]
          .map((el) => el.getBoundingClientRect());
        controls.forEach((rect) => {
          expect(rect.width).to.be.greaterThan(0);
          expect(rect.left).to.be.at.least(panel.left);
          expect(rect.right).to.be.at.most(panel.right);
        });
        expect(controls[0].right).to.be.at.most(controls[1].left);
        expect(controls[1].right).to.be.at.most(controls[2].left);
      } finally {
        await setViewport({ width: 1024, height: 768 });
      }
    });

    it(`hides Shuffle text where Generate text is hidden, keeping its accessible name (redesign: ${redesign})`, async () => {
      const textDisplay = () => getComputedStyle(widget.musicShuffle.querySelector('.shuffle-txt')).display;
      try {
        await setViewport({ width: 390, height: 844 });
        await createWidget({ redesign });
        expect(textDisplay()).to.equal('none');
        expect(getComputedStyle(widget.genBtn.querySelector('.btn-txt')).display).to.equal('none');
        expect(widget.musicShuffle.getAttribute('aria-label')).to.equal('Shuffle');
        expect(widget.musicShuffle.querySelector('img')).to.exist;
        await setViewport({ width: 1280, height: 800 });
        expect(textDisplay()).not.to.equal('none');
        await setViewport({ width: 900, height: 800 });
        expect(textDisplay() === 'none').to.equal(getComputedStyle(widget.genBtn.querySelector('.btn-txt')).display === 'none');
      } finally {
        await setViewport({ width: 1024, height: 768 });
      }
    });

    it(`keeps Shuffle text on mobile when no icon is authored (redesign: ${redesign})`, async () => {
      try {
        await setViewport({ width: 390, height: 844 });
        await createWidget({ redesign, shuffle: 'noIcon' });
        expect(getComputedStyle(widget.musicShuffle.querySelector('.shuffle-txt')).display).not.to.equal('none');
      } finally {
        await setViewport({ width: 1024, height: 768 });
      }
    });
  });

  it('keeps existing long text when switching into music and blocks submission', async () => {
    await createWidget({ verbs: ['image', 'music'] });
    input('x'.repeat(600));
    widget.widget.querySelector('[data-verb-type="music"]').click();
    expect(widget.musicInput.value.length).to.equal(600);
    sandbox.stub(binder, 'showErrorToast');
    expect(binder.validateInput(widget.musicInput.value).isValid).to.be.false;
  });

  ['image', 'video', 'sound'].forEach((verb) => {
    it(`retains ${verb} catalog suggestions when switching from music`, async () => {
      await createWidget({ verbs: ['music', verb], suggestions: true });
      expect(widget.loadPrompts.called).to.be.false;
      widget.widget.querySelector(`[data-verb-type="${verb}"]`).click();
      await widget.updateDropdownForVerb(verb);
      expect(widget.widget.querySelector('.drop-item').id).to.equal(`${verb}-asset`);
      expect(binder.getMaxPromptCharLimit()).to.equal(750);
      expect(widget.musicCounter.hidden).to.be.true;
      if (verb === 'sound') expect(widget.soundAugmented).to.be.true;
    });
  });

  it('discards an in-flight catalog result after switching to music', async () => {
    await createWidget({ verbs: ['image', 'music'], suggestions: true });
    let resolve;
    sandbox.stub(widget, 'getPrompt').returns(new Promise((done) => { resolve = done; }));
    const pending = widget.updateDropdownForVerb('image');
    await Promise.resolve();
    widget.widget.querySelector('[data-verb-type="music"]').click();
    resolve([{ prompt: 'Stale suggestion', assetid: 'stale' }]);
    await pending;
    expect(widget.widget.querySelector('#stale')).to.equal(null);
    binder.showDropdown();
    expect(widget.widget.querySelector('.drop').classList.contains('hidden')).to.be.true;
  });

  describe('Verb toggle', () => {
    const models = [
      { module: 'music', id: 'music-one', version: '1', name: 'Music One', icon: '/test/assets/img.svg' },
      { module: 'image', id: 'image-one', version: '1', name: 'Image One', icon: '/test/assets/img.svg' },
    ];
    const visible = (el) => getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
    const toggleBtn = (type) => widget.widget.querySelector(`.verb-toggle-btn[data-verb-type="${type}"]`);

    afterEach(() => setViewport({ width: 1024, height: 768 }));

    it('shows the toggle on desktop with authored labels/order and hides the verb dropdown', async () => {
      await setViewport({ width: 1280, height: 800 });
      await createWidget({ verbs: ['image', 'video', 'music'], models });
      const btns = [...widget.widget.querySelectorAll('.verb-toggle-btn')];
      expect(btns.map((b) => b.textContent)).to.deep.equal(['image', 'video', 'music']);
      expect(btns.map((b) => b.getAttribute('aria-checked'))).to.deep.equal(['true', 'false', 'false']);
      expect(widget.widget.querySelector('.verb-toggle').getAttribute('role')).to.equal('radiogroup');
      expect(visible(widget.widget.querySelector('.verb-toggle'))).to.be.true;
      expect(visible(widget.widget.querySelector('.verbs-container'))).to.be.false;
      expect(visible(widget.widget.querySelector('.selected-model'))).to.be.true;
      expect(binder.getFocusElems()).to.include(btns[0]);
      expect(binder.getFocusElems()).not.to.include(widget.widget.querySelector('.selected-verb'));
    });

    it('shows the toggle on tablet', async () => {
      await setViewport({ width: 768, height: 1024 });
      await createWidget({ verbs: ['image', 'video'] });
      expect(visible(widget.widget.querySelector('.verb-toggle'))).to.be.true;
      expect(visible(widget.widget.querySelector('.verbs-container'))).to.be.false;
    });

    it('keeps the verb dropdown on mobile and hides the toggle', async () => {
      await setViewport({ width: 390, height: 844 });
      await createWidget({ verbs: ['image', 'video'] });
      expect(visible(widget.widget.querySelector('.verb-toggle'))).to.be.false;
      expect(visible(widget.widget.querySelector('.selected-verb'))).to.be.true;
      expect(binder.getFocusElems()).not.to.include(toggleBtn('image'));
    });

    it('switches features through the shared selection logic without opening the dropdown', async () => {
      await setViewport({ width: 1280, height: 800 });
      await createWidget({ verbs: ['image', 'music'], models });
      widget.workflowCfg.placeholder['placeholder-input-image'] = 'Describe an image';
      toggleBtn('music').click();
      expect(binder.getSelectedVerbType()).to.equal('music');
      expect(binder.getSelectedModelId()).to.equal('music-one');
      expect(widget.musicShuffle.hidden).to.be.false;
      expect(widget.musicCounter.hidden).to.be.false;
      expect(widget.genBtn.getAttribute('daa-ll')).to.equal('Generate--music');
      expect(widget.widget.querySelector('.verbs-container').classList.contains('show-menu')).to.be.false;
      expect(widget.widget.querySelector('.selected-verb').dataset.selectedVerb).to.equal('music');
      expect(toggleBtn('music').getAttribute('aria-checked')).to.equal('true');
      expect(toggleBtn('image').tabIndex).to.equal(-1);
      toggleBtn('image').click();
      expect(binder.getSelectedVerbType()).to.equal('image');
      expect(binder.getSelectedModelId()).to.equal('image-one');
      expect(widget.musicShuffle.hidden).to.be.true;
      expect(widget.musicInput.placeholder).to.equal('Describe an image');
    });

    it('syncs the toggle when the dropdown is used (e.g. after resizing from mobile)', async () => {
      await setViewport({ width: 390, height: 844 });
      await createWidget({ verbs: ['image', 'video'] });
      widget.widget.querySelector('.selected-verb').click();
      widget.widget.querySelector('.verb-link[data-verb-type="video"]').click();
      expect(binder.getSelectedVerbType()).to.equal('video');
      expect(toggleBtn('video').getAttribute('aria-checked')).to.equal('true');
      expect(toggleBtn('image').getAttribute('aria-checked')).to.equal('false');
    });

    it('supports arrow keys and Home/End without generating', async () => {
      await setViewport({ width: 1280, height: 800 });
      await createWidget({ verbs: ['image', 'video', 'music'] });
      const generate = sandbox.stub(binder, 'generateContent');
      const key = (k) => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
      toggleBtn('image').focus();
      key('ArrowRight');
      expect(document.activeElement).to.equal(toggleBtn('video'));
      expect(binder.getSelectedVerbType()).to.equal('video');
      key('End');
      expect(binder.getSelectedVerbType()).to.equal('music');
      key('ArrowRight');
      expect(binder.getSelectedVerbType()).to.equal('image');
      key('Enter');
      key(' ');
      expect(generate.called).to.be.false;
    });

    it('is not rendered for a single verb or on pb-redesign pages', async () => {
      await setViewport({ width: 1280, height: 800 });
      await createWidget({ verbs: ['music'] });
      expect(widget.widget.querySelector('.verb-toggle')).to.equal(null);
      binder.rmvKeyDown();
      await createWidget({ verbs: ['image', 'video'], redesign: true });
      expect(widget.widget.querySelector('.verb-toggle')).to.equal(null);
      expect(widget.widget.querySelector('.verb-list-panel')).to.exist;
    });
  });
});
