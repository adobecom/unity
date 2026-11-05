import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { readFile, setViewport } from '@web/test-runner-commands';
import UnityWidget from '../../../../unitylibs/core/widgets/prompt-bar/prompt-bar.js';
import ActionBinder from '../../../../unitylibs/core/workflow/workflow-firefly/action-binder.js';
import { setUnityLibs } from '../../../../unitylibs/scripts/utils.js';

describe('Music prompt bar', () => {
  let sandbox;
  let widget;
  let binder;
  let originalLana;
  let targetDefaults;

  before(async () => {
    const { _defaults: defaults } = JSON.parse(await readFile({ path: '../../../../unitylibs/core/workflow/workflow-firefly/target-config.json' }));
    targetDefaults = defaults;
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
  });

  afterEach(() => {
    if (binder) {
      binder.rmvKeyDown();
      document.removeEventListener('click', binder.boundOutsideClickHandler, true);
    }
    if (widget?.outsideDropdownHandler) {
      document.removeEventListener('click', widget.outsideDropdownHandler, true);
    }
    sandbox.restore();
    window.lana = originalLana;
    binder = null;
    widget = null;
    document.body.innerHTML = '';
  });

  async function createWidget({
    verbs = ['music'],
    prompts = ['Gentle acoustic guitar with soft rain', 'Uplifting orchestral music', 'Ambient piano at sunset'],
    shuffle = true,
    suggestions = false,
    redesign = false,
    limits = {},
    models = [],
    v2 = false,
    generateLabel = 'Generate audio',
  } = {}) {
    const author = document.querySelector('.unity');
    author.classList.toggle('prompt-bar-v2', v2);
    author.innerHTML = `<ul>
      ${verbs.map((verb) => `<li><span class="icon icon-verb-${verb}"></span><a href="/test/assets/img.svg">${verb === 'music' ? 'audio' : verb}</a></li>`).join('')}
      <li><span class="icon icon-placeholder-input"></span>Describe the audio you want to generate</li>
      <li><span class="icon icon-placeholder-prompt-label"></span>Enter prompt</li>
      <li><span class="icon icon-generate"></span><img src="/test/assets/img.svg" alt="">${generateLabel}</li>
      <li><span class="icon icon-placeholder-input-image"></span>Describe an image</li>
      <li><span class="icon icon-placeholder-input-video"></span>Describe a video</li>
      ${shuffle ? '<li><span class="icon icon-shuffle"></span><img src="/test/assets/img.svg" alt="">Shuffle</li>' : ''}
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
        limits: { ...targetDefaults.limits, ...limits },
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
        video: [{ prompt: 'A video suggestion', assetid: 'video-asset' }],
        sound: [{ prompt: 'A sound suggestion', assetid: 'sound-asset', variations: [] }],
      };
    });
    await widget.initWidget();
    binder = new ActionBinder(author, cfg, host, host, actionMap);
    await binder.initActionListeners();
    return widget;
  }

  function clickInputAt(start, end = start) {
    widget.musicInput.focus();
    widget.musicInput.setSelectionRange(start, end);
    widget.musicInput.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  }

  function typeValue(value) {
    widget.musicInput.value = value;
    widget.musicInput.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function stubGeneration() {
    sandbox.stub(binder, 'initAnalytics').resolves();
    sandbox.stub(binder, 'emitGenerateStartAnalytics').returns({});
    sandbox.stub(binder, 'logAnalytics');
    sandbox.stub(binder, 'showErrorToast');
    sandbox.stub(binder, 'resetDropdown');
    const fetch = sandbox.stub().resolves({});
    sandbox.stub(binder, 'getNetworkUtils').resolves({ fetchFromService: fetch });
    return fetch;
  }

  it('starts empty with a placeholder, a 500-character limit and a visible counter', async () => {
    await createWidget();
    expect(widget.musicInput.value).to.equal('');
    expect(widget.musicInput.placeholder).to.equal('Describe the audio you want to generate');
    expect(widget.musicInput.maxLength).to.equal(500);
    expect(widget.musicCounter.textContent).to.equal('0/500');
    expect(widget.musicCounter.hidden).to.be.false;
    expect(widget.musicInput.getAttribute('aria-describedby')).to.include(widget.musicCounter.id);
    expect(widget.musicInput.hasAttribute('aria-controls')).to.be.false;
    expect(widget.widget.querySelector('.shuffle-btn').type).to.equal('button');
    expect(widget.genBtn.getAttribute('aria-label')).to.equal('Generate audio');
    expect(widget.genBtn.querySelector('img').alt).to.equal('');
    expect(widget.loadPrompts.called).to.be.false;
  });

  it('keeps the counter and generation available without an authored Shuffle button', async () => {
    await createWidget({ shuffle: false });
    expect(widget.widget.querySelector('.shuffle-btn')).to.equal(null);
    expect(widget.musicCounter.hidden).to.be.false;
    expect(widget.genBtn.parentElement.classList.contains('act-wrap')).to.be.true;
    expect(widget.genBtn.parentElement.contains(widget.musicCounter)).to.be.true;
    expect(widget.widget.querySelector('.music-toolbar')).to.equal(null);
    typeValue('My own music prompt');
    expect(widget.musicCounter.textContent).to.equal('19/500');
  });

  it('uses the configured music limit for native input, counters, suggestions and submission validation', async () => {
    await createWidget({
      limits: { 'music-max-char-limit': 12 },
      prompts: ['x'.repeat(12), 'y'.repeat(13)],
    });
    expect(widget.musicInput.maxLength).to.equal(12);
    expect(widget.musicCounter.textContent).to.equal('0/12');
    expect(widget.musicPrompts).to.deep.equal(['x'.repeat(12)]);
    expect(window.lana.log.calledWithMatch('at most 12 characters')).to.be.true;
    widget.shuffleMusicPrompt();
    expect(widget.musicCounter.textContent).to.equal('12/12');
    expect(widget.musicCounter.getAttribute('aria-label')).to.equal('Characters: 12/12');
    expect(binder.getMaxPromptCharLimit()).to.equal(12);
    expect(binder.validateInput(widget.musicInput.value).isValid).to.be.true;
    widget.musicInput.focus();
    widget.musicInput.setSelectionRange(12, 12);
    document.execCommand('insertText', false, 'more');
    expect(widget.musicInput.value.length).to.equal(12);
    typeValue('z'.repeat(13));
    sandbox.stub(binder, 'showErrorToast');
    expect(binder.validateInput(widget.musicInput.value).isValid).to.be.false;
    expect(widget.musicCounter.textContent).to.equal('13/12');
    expect(widget.musicInput.getAttribute('aria-invalid')).to.equal('true');
  });

  [undefined, 0, -1, 1.5, 'invalid'].forEach((limit) => {
    it(`rejects a missing or invalid music-max-char-limit (${String(limit)}) without a hardcoded fallback`, async () => {
      await createWidget({ limits: { 'music-max-char-limit': limit } }).then(
        () => expect.fail('Expected invalid music configuration to fail'),
        (error) => expect(error.message).to.include('positive integer limits.music-max-char-limit'),
      );
    });
  });

  it('does not require a music limit when no music verb is authored', async () => {
    await createWidget({ verbs: ['image'], limits: { 'music-max-char-limit': undefined } });
    expect(widget.musicInput).to.equal(undefined);
    expect(binder.getMaxPromptCharLimit()).to.equal(750);
  });

  it('cycles through all distinct authored suggestions without immediate repeats', async () => {
    await createWidget({ prompts: ['One', 'Two', 'Three', 'One'] });
    const generate = sandbox.stub(binder, 'generateContent').resolves();
    const shuffle = widget.widget.querySelector('.shuffle-btn');
    const seen = [];
    for (let i = 0; i < 6; i += 1) {
      shuffle.click();
      seen.push(widget.musicInput.value);
      expect(widget.musicSuggestionPending).to.be.true;
      expect(widget.musicCounter.textContent).to.equal(`${widget.musicInput.value.length}/500`);
      expect(widget.musicAnnouncement.textContent).to.equal(widget.musicInput.value);
    }
    expect(new Set(seen.slice(0, 3)).size).to.equal(3);
    expect(new Set(seen.slice(3)).size).to.equal(3);
    expect(seen[2]).not.to.equal(seen[3]);
    expect(generate.called).to.be.false;
    expect(widget.loadPrompts.called).to.be.false;
  });

  it('supports a single suggestion without failing on repeated Shuffle clicks', async () => {
    await createWidget({ prompts: ['Only suggestion'] });
    widget.shuffleMusicPrompt();
    widget.shuffleMusicPrompt();
    expect(widget.musicInput.value).to.equal('Only suggestion');
  });

  it('uses all 30 document-authored suggestions without loading the remote catalog', async () => {
    const prompts = Array.from({ length: 30 }, (_, index) => `Music suggestion ${index + 1}`);
    await createWidget({ prompts });
    const seen = new Set();
    for (let i = 0; i < prompts.length; i += 1) {
      widget.shuffleMusicPrompt();
      seen.add(widget.musicInput.value);
    }
    expect([...seen].sort()).to.deep.equal([...prompts].sort());
    expect(widget.loadPrompts.called).to.be.false;
  });

  it('parses authored suggestions as plain text and rejects empty or overlong rows', async () => {
    await createWidget({ prompts: ['   ', 'x'.repeat(501), 'Piano <strings> & drums'] });
    expect(widget.musicPrompts).to.deep.equal(['Piano <strings> & drums']);
    expect(window.lana.log.callCount).to.be.at.least(2);
    widget.shuffleMusicPrompt();
    expect(widget.musicInput.value).to.equal('Piano <strings> & drums');
    expect(widget.widget.querySelector('strings')).to.equal(null);
  });

  it('disables an authored Shuffle button with no valid suggestions and logs the error', async () => {
    await createWidget({ prompts: [] });
    expect(widget.widget.querySelector('.shuffle-btn').disabled).to.be.true;
    expect(window.lana.log.calledWithMatch('Music Shuffle is authored without')).to.be.true;
    expect(binder.getFocusElems()).not.to.include(widget.widget.querySelector('.shuffle-btn'));
  });

  it('clears only a pending suggestion when clicked at a collapsed caret position of zero', async () => {
    await createWidget();
    widget.shuffleMusicPrompt();
    clickInputAt(0);
    expect(widget.musicInput.value).to.equal('');
    expect(widget.musicCounter.textContent).to.equal('0/500');
    expect(widget.musicSuggestionPending).to.be.false;
    typeValue('My prompt');
    clickInputAt(0);
    expect(widget.musicInput.value).to.equal('My prompt');
  });

  it('accepts a suggestion at another caret position and preserves subsequent start clicks', async () => {
    await createWidget();
    widget.shuffleMusicPrompt();
    const suggestion = widget.musicInput.value;
    clickInputAt(5);
    expect(widget.musicInput.selectionStart).to.equal(5);
    expect(widget.musicInput.value).to.equal(suggestion);
    expect(widget.musicSuggestionPending).to.be.false;
    clickInputAt(0);
    expect(widget.musicInput.value).to.equal(suggestion);
  });

  it('preserves selected text that starts at zero rather than clearing the suggestion', async () => {
    await createWidget();
    widget.shuffleMusicPrompt();
    const suggestion = widget.musicInput.value;
    clickInputAt(0, 5);
    expect(widget.musicInput.value).to.equal(suggestion);
    expect(widget.musicInput.selectionEnd).to.equal(5);
    expect(widget.musicSuggestionPending).to.be.false;
  });

  it('does not clear pending text on focus and accepts normal keyboard editing', async () => {
    await createWidget();
    widget.shuffleMusicPrompt();
    const suggestion = widget.musicInput.value;
    widget.musicInput.focus();
    expect(widget.musicInput.value).to.equal(suggestion);
    expect(widget.musicSuggestionPending).to.be.true;
    typeValue(`${suggestion}!`);
    expect(widget.musicSuggestionPending).to.be.false;
    expect(widget.musicCounter.textContent).to.equal(`${suggestion.length + 1}/500`);
  });

  it('updates the count and clears stale asset state for typing, paste and deletion input events', async () => {
    await createWidget();
    binder.id = 'old-asset';
    binder.query = 'old query';
    typeValue('x'.repeat(500));
    expect(widget.musicCounter.textContent).to.equal('500/500');
    expect(binder.id).to.equal('');
    expect(binder.query).to.equal('');
    expect(binder.validateInput(widget.musicInput.value).isValid).to.be.true;
    typeValue('');
    expect(widget.musicCounter.textContent).to.equal('0/500');
  });

  it('prevents native text insertion beyond 500 characters', async () => {
    await createWidget();
    widget.musicInput.focus();
    document.execCommand('insertText', false, 'x'.repeat(501));
    expect(widget.musicInput.value.length).to.equal(500);
    expect(widget.musicCounter.textContent).to.equal('500/500');
    document.execCommand('insertText', false, 'more');
    expect(widget.musicInput.value.length).to.equal(500);
  });

  it('excludes music from remote suggestions even when legacy suggestion rows are authored', async () => {
    await createWidget({ suggestions: true });
    widget.musicInput.focus();
    expect(widget.loadPrompts.called).to.be.false;
    expect(binder.isDropdownVisible()).to.be.false;
    expect(binder.getDropdownItems()).to.deep.equal([]);
    expect(widget.widget.querySelector('.drop').classList.contains('hidden')).to.be.true;
  });

  it('discards an in-flight catalog response after switching into music', async () => {
    await createWidget({ verbs: ['image', 'music'], suggestions: true });
    let resolvePrompts;
    sandbox.stub(widget, 'getPrompt').returns(new Promise((resolve) => { resolvePrompts = resolve; }));
    const update = widget.updateDropdownForVerb('image');
    await Promise.resolve();
    widget.widget.querySelector('[data-verb-type="music"]').click();
    resolvePrompts([{ prompt: 'Stale image suggestion', assetid: 'stale-asset' }]);
    await update;
    expect(widget.widget.querySelectorAll('.drop-item').length).to.equal(0);
    expect(binder.isDropdownVisible()).to.be.false;
  });

  it('submits pending shuffled text as text-to-music query, never as an asset or sound override', async () => {
    await createWidget();
    widget.shuffleMusicPrompt();
    const suggestion = widget.musicInput.value;
    binder.id = 'stale-image-asset';
    widget.genBtn.dataset.soundPrompt = 'stale sound prompt';
    const fetch = stubGeneration();
    await binder.generateContent();
    expect(fetch.calledOnce).to.be.true;
    const request = JSON.parse(fetch.firstCall.args[1].body);
    expect(request.query).to.equal(suggestion);
    expect(request).not.to.have.property('assetId');
    expect(request.payload.workflow).to.equal('text-to-music');
    expect(request.payload.action).to.equal('generate');
    expect(request.targetProduct).to.equal('Firefly');
  });

  it('submits edited music text and blocks programmatic over-limit input at validation', async () => {
    await createWidget();
    typeValue('Edited music prompt');
    const fetch = stubGeneration();
    await binder.generateContent();
    expect(JSON.parse(fetch.firstCall.args[1].body).query).to.equal('Edited music prompt');
    typeValue('x'.repeat(501));
    await binder.generateContent();
    expect(fetch.callCount).to.equal(1);
    expect(binder.showErrorToast.calledOnce).to.be.true;
    expect(widget.musicInput.getAttribute('aria-invalid')).to.equal('true');
  });

  it('shows the existing empty-prompt error rather than submitting an empty music query', async () => {
    await createWidget();
    const fetch = stubGeneration();
    await binder.generateContent();
    expect(fetch.called).to.be.false;
    expect(binder.showErrorToast.firstCall.args[0].errorType).to.equal('.icon-error-empty');
  });

  it('handles Enter once, ignores composition Enter and lets Shuffle use the keyboard path', async () => {
    await createWidget();
    const generate = sandbox.stub(binder, 'generateContent').resolves();
    widget.musicInput.focus();
    typeValue('A music prompt');
    binder.query = 'previous query';
    widget.musicInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(generate.calledOnce).to.be.true;
    widget.musicInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true }));
    expect(generate.calledOnce).to.be.true;
    const shuffle = widget.widget.querySelector('.shuffle-btn');
    shuffle.focus();
    shuffle.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(widget.musicSuggestionPending).to.be.true;
    expect(generate.calledOnce).to.be.true;
  });

  it('cleans up music state and restores existing limits when switching features', async () => {
    await createWidget({ verbs: ['music', 'image'] });
    const actWrap = widget.genBtn.parentElement;
    const actionParent = actWrap.parentElement;
    widget.shuffleMusicPrompt();
    const text = widget.musicInput.value;
    widget.widget.querySelector('[data-verb-type="image"]').click();
    expect(widget.widgetWrap.classList.contains('music-prompt')).to.be.false;
    expect(widget.musicCounter.hidden).to.be.true;
    expect(widget.musicShuffle.hidden).to.be.true;
    expect(widget.musicAnnouncement.hidden).to.be.true;
    expect(getComputedStyle(widget.musicShuffle).display).to.equal('none');
    expect(widget.musicInput.hasAttribute('maxlength')).to.be.false;
    expect(widget.musicInput.value).to.equal(text);
    expect(widget.musicSuggestionPending).to.be.false;
    expect(binder.getMaxPromptCharLimit()).to.equal(750);
    expect(widget.genBtn.parentElement).to.equal(actWrap);
    expect(actWrap.parentElement).to.equal(actionParent);
    widget.widget.querySelector('[data-verb-type="music"]').click();
    expect(widget.musicInput.maxLength).to.equal(500);
    expect(widget.musicCounter.hidden).to.be.false;
    expect(widget.genBtn.parentElement).to.equal(actWrap);
    expect(actWrap.parentElement).to.equal(actionParent);
    expect(widget.musicShuffle.hidden).to.be.false;
    expect(widget.musicAnnouncement.hidden).to.be.false;
    expect(widget.musicInput.value).to.equal(text);
  });

  it('does not discard pre-existing over-limit text when switching into music', async () => {
    await createWidget({ verbs: ['image', 'music'] });
    typeValue('x'.repeat(600));
    widget.widget.querySelector('[data-verb-type="music"]').click();
    expect(widget.musicInput.value.length).to.equal(600);
    expect(widget.musicCounter.textContent).to.equal('600/500');
    sandbox.stub(binder, 'showErrorToast');
    expect(binder.validateInput(widget.musicInput.value).isValid).to.be.false;
  });

  it('validates the same raw character count shown by the counter, including spaces', async () => {
    await createWidget();
    typeValue(` ${'x'.repeat(499)} `);
    sandbox.stub(binder, 'showErrorToast');
    expect(widget.musicCounter.textContent).to.equal('501/500');
    expect(binder.validateInput(widget.musicInput.value.trim()).isValid).to.be.false;
  });

  it('refreshes the counter when the existing reset path clears music input', async () => {
    await createWidget();
    widget.shuffleMusicPrompt();
    binder.query = '';
    binder.resetDropdown();
    expect(widget.musicInput.value).to.equal('');
    expect(widget.musicCounter.textContent).to.equal('0/500');
    expect(widget.musicSuggestionPending).to.be.false;
  });

  it('renders music controls in the redesign without losing Generate', async () => {
    await createWidget({ redesign: true, verbs: ['music', 'image'] });
    const actWrap = widget.genBtn.parentElement;
    const actionBar = actWrap.parentElement;
    expect(widget.widget.querySelector('.autocomplete.pb-redesign')).to.exist;
    expect(actionBar.classList.contains('action-bar')).to.be.true;
    expect(actionBar.querySelector('.action-container').contains(widget.musicShuffle)).to.be.true;
    expect(widget.widget.querySelector('.music-toolbar')).to.equal(null);
    widget.widget.querySelector('[data-verb-type="image"]').click();
    expect(widget.genBtn.parentElement).to.equal(actWrap);
    expect(actWrap.parentElement).to.equal(actionBar);
  });

  describe('Opt-in prompt bar v2', () => {
    it('does not apply the v2 theme to music without the authoring flag', async () => {
      await createWidget({ verbs: ['music', 'image'] });
      expect(widget.widgetWrap.classList.contains('prompt-bar-v2')).to.be.false;
      expect(widget.widget.querySelector('.verb-segments')).to.equal(null);
      expect(widget.widget.querySelector('.selected-verb')).to.exist;
      expect(getComputedStyle(widget.widget.querySelector('.autocomplete')).backgroundColor).not.to.equal('rgb(27, 27, 27)');
      widget.shuffleMusicPrompt();
      expect(widget.musicCounter.textContent).not.to.equal('0/500');
    });

    ['image', 'video', 'sound', 'music'].forEach((verb) => {
      it(`applies the authored theme to a single ${verb} verb without adding a selector`, async () => {
        await createWidget({ v2: true, verbs: [verb] });
        expect(widget.widgetWrap.classList.contains('prompt-bar-v2')).to.be.true;
        expect(getComputedStyle(widget.widget.querySelector('.autocomplete')).backgroundColor).to.equal('rgb(27, 27, 27)');
        expect(widget.widget.querySelector('.verb-segments')).to.equal(null);
        expect(widget.widget.querySelector('.selected-verb')).to.equal(null);
        expect(!!widget.widget.querySelector('.shuffle-btn')).to.equal(verb === 'music');
        expect(!!widget.widget.querySelector('.music-char-count')).to.equal(verb === 'music');
        expect(binder.getSelectedVerbType()).to.equal(verb);
      });
    });

    it('uses the authored order, labels and initial selection with radiogroup semantics', async () => {
      await createWidget({ v2: true, verbs: ['video', 'image', 'music'], generateLabel: 'Generate' });
      const buttons = [...widget.widget.querySelectorAll('.verb-segment')];
      expect(buttons.map((button) => button.textContent)).to.deep.equal(['video', 'image', 'audio']);
      expect(buttons.map((button) => button.dataset.verbType)).to.deep.equal(['video', 'image', 'music']);
      expect(buttons.map((button) => button.tabIndex)).to.deep.equal([0, -1, -1]);
      expect(buttons.map((button) => button.getAttribute('aria-checked'))).to.deep.equal(['true', 'false', 'false']);
      expect(widget.widget.querySelector('.verb-segments').getAttribute('role')).to.equal('radiogroup');
      expect(widget.widget.querySelector('.selected-verb')).to.equal(null);
      expect(widget.widget.querySelector('.verb-list-panel')).to.equal(null);
      expect(widget.genBtn.querySelector('.btn-txt').textContent).to.equal('Generate video');
    });

    it('reuses verb selection for placeholders, models, analytics and music-only controls', async () => {
      await createWidget({
        v2: true,
        verbs: ['image', 'music', 'video'],
        generateLabel: 'Generate',
        models: [
          { module: 'image', id: 'image-one', version: '1', name: 'Image One', icon: '/test/assets/img.svg' },
          { module: 'music', id: 'music-one', version: '1', name: 'Music One', icon: '/test/assets/img.svg' },
        ],
      });
      const actWrap = widget.genBtn.parentElement;
      const parent = actWrap.parentElement;
      expect(widget.musicShuffle.hidden).to.be.true;
      widget.widget.querySelector('[data-verb-type="music"]').click();
      expect(binder.getSelectedVerbType()).to.equal('music');
      expect(binder.getSelectedModelId()).to.equal('music-one');
      expect(binder.getMaxPromptCharLimit()).to.equal(500);
      expect(widget.musicInput.placeholder).to.equal('Describe the audio you want to generate');
      expect(widget.musicShuffle.hidden).to.be.false;
      expect(widget.musicCounter.hidden).to.be.false;
      expect(widget.genBtn.getAttribute('daa-ll')).to.equal('Generate--music');
      expect(widget.genBtn.querySelector('.btn-txt').textContent).to.equal('Generate audio');
      widget.widget.querySelector('[data-verb-type="video"]').click();
      expect(widget.musicInput.placeholder).to.equal('Describe a video');
      expect(binder.getSelectedModelId()).to.equal(null);
      expect(binder.getMaxPromptCharLimit()).to.equal(750);
      expect(widget.musicShuffle.hidden).to.be.true;
      expect(widget.musicCounter.hidden).to.be.true;
      expect(widget.genBtn.querySelector('.btn-txt').textContent).to.equal('Generate video');
      expect(widget.widgetWrap.classList.contains('prompt-bar-v2')).to.be.true;
      expect(widget.widget.querySelector('.verbs-container.show-menu')).to.equal(null);
      expect(widget.genBtn.parentElement).to.equal(actWrap);
      expect(actWrap.parentElement).to.equal(parent);
    });

    ['image', 'video', 'sound'].forEach((verb) => {
      it(`keeps ${verb} catalog suggestions available after switching features`, async () => {
        await createWidget({ v2: true, verbs: ['music', 'image', 'video', 'sound'], suggestions: true });
        widget.widget.querySelector(`[data-verb-type="${verb}"]`).click();
        await widget.updateDropdownForVerb(verb);
        expect(widget.widget.querySelector('.drop-item').id).to.equal(`${verb}-asset`);
        expect(widget.widget.querySelector('.drop-item').getAttribute('daa-ll')).to.include(`--${verb}--`);
        expect(binder.getSelectedVerbType()).to.equal(verb);
        if (verb === 'sound') expect(widget.soundAugmented).to.be.true;
      });
    });

    it('supports arrow keys, Home/End, RTL and a single Tab stop without generating', async () => {
      await createWidget({ v2: true, verbs: ['image', 'video', 'music'] });
      const generate = sandbox.stub(binder, 'generateContent');
      const buttons = [...widget.widget.querySelectorAll('.verb-segment')];
      const key = (value) => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
      buttons[0].focus();
      key('ArrowRight');
      expect(document.activeElement).to.equal(buttons[1]);
      expect(binder.getSelectedVerbType()).to.equal('video');
      key('End');
      expect(document.activeElement).to.equal(buttons[2]);
      key('ArrowRight');
      expect(document.activeElement).to.equal(buttons[0]);
      key('ArrowUp');
      expect(document.activeElement).to.equal(buttons[2]);
      key('Home');
      expect(document.activeElement).to.equal(buttons[0]);
      widget.widget.querySelector('.verb-segments').dir = 'rtl';
      key('ArrowLeft');
      expect(document.activeElement).to.equal(buttons[1]);
      key('Enter');
      key(' ');
      expect(generate.called).to.be.false;
      expect(buttons.filter((button) => button.tabIndex === 0)).to.deep.equal([buttons[1]]);
      expect(binder.getFocusElems()).to.include(buttons[1]);
      expect(binder.getFocusElems()).not.to.include(buttons[0]);
    });

    it('gives the explicit block variant precedence over the page redesign', async () => {
      await createWidget({ v2: true, redesign: true, verbs: ['image', 'video'] });
      expect(widget.widget.querySelector('.autocomplete.pb-redesign')).to.equal(null);
      expect(widget.widget.querySelector('.verb-segments')).to.exist;
      expect(widget.widget.querySelector('.verb-list-panel')).to.equal(null);
    });

    it('keeps v2 opt-in local to the authored block', async () => {
      document.querySelector('.hero-marquee').classList.add('prompt-bar-v2');
      await createWidget({ verbs: ['image', 'video'] });
      expect(widget.widgetWrap.classList.contains('prompt-bar-v2')).to.be.false;
      expect(widget.widget.querySelector('.selected-verb')).to.exist;
    });

    it('fits all authored segments and music controls within the mobile panel', async () => {
      await setViewport({ width: 390, height: 844 });
      try {
        await createWidget({ v2: true, verbs: ['music', 'image', 'video', 'sound'] });
        const panel = widget.widget.querySelector('.autocomplete').getBoundingClientRect();
        const controls = [...widget.widget.querySelectorAll('.verb-segment'), widget.musicShuffle, widget.musicCounter, widget.genBtn]
          .map((el) => el.getBoundingClientRect());
        controls.forEach((rect, index) => {
          expect(rect.width).to.be.greaterThan(0);
          expect(rect.left).to.be.at.least(panel.left);
          expect(rect.right).to.be.at.most(panel.right);
          expect(rect.bottom).to.be.at.most(panel.bottom);
          controls.slice(index + 1).forEach((other) => {
            expect(rect.left < other.right && rect.right > other.left
              && rect.top < other.bottom && rect.bottom > other.top).to.be.false;
          });
        });
      } finally {
        await setViewport({ width: 1024, height: 768 });
      }
    });
  });

  [false, true].forEach((redesign) => {
    const models = [
      { module: 'music', id: 'music-one', version: '1', name: 'Music One', icon: '/test/assets/img.svg' },
      { module: 'music', id: 'music-two', version: '2', name: 'Music Two', icon: '/test/assets/img.svg' },
      { module: 'image', id: 'image-one', version: '1', name: 'Image One', icon: '/test/assets/img.svg' },
    ];

    it(`does not outline the textarea or widget while typing (redesign: ${redesign})`, async () => {
      await createWidget({ redesign });
      widget.musicInput.focus();
      typeValue('My music prompt');
      const panel = widget.widget.querySelector('.autocomplete');
      expect(document.activeElement).to.equal(widget.musicInput);
      expect(getComputedStyle(widget.musicInput).outlineStyle).to.equal('none');
      expect(getComputedStyle(panel).outlineStyle).to.equal('none');
      expect(getComputedStyle(widget.widget).outlineStyle).to.equal('none');
      widget.musicShuffle.focus();
      expect(getComputedStyle(panel).outlineStyle).to.equal('none');
      expect(widget.musicShuffle).to.equal(document.activeElement);
      widget.genBtn.focus();
      expect(widget.genBtn).to.equal(document.activeElement);
    });

    it(`preserves the existing action containers and authored dropdowns (redesign: ${redesign})`, async () => {
      await createWidget({ verbs: ['music', 'image'], models, redesign });
      const actions = widget.widget.querySelector('.action-container');
      const actWrap = widget.genBtn.parentElement;
      const actionParent = actWrap.parentElement;
      expect(actions.firstElementChild).to.equal(widget.musicShuffle);
      expect(actions.querySelector('.models-container')).to.exist;
      expect(widget.widget.querySelector('.selected-verb')).to.exist;
      expect(widget.widget.querySelector('.music-toolbar')).to.equal(null);
      expect(binder.getFocusElems()).to.include.members([
        widget.musicShuffle,
        widget.widget.querySelector('.selected-verb'),
        widget.widget.querySelector('.selected-model'),
      ]);
      widget.widget.querySelector('.selected-model').click();
      expect(widget.widget.querySelector('.models-container').classList.contains('show-menu')).to.be.true;
      widget.widget.querySelector('[data-model-id="music-two"].model-link').click();
      expect(binder.getSelectedModelId()).to.equal('music-two');
      widget.widget.querySelector('[data-verb-type="image"]').click();
      expect(widget.widget.querySelector('.selected-model').dataset.selectedModelId).to.equal('image-one');
      expect(widget.musicShuffle.hidden).to.be.true;
      expect(widget.genBtn.parentElement).to.equal(actWrap);
      expect(actWrap.parentElement).to.equal(actionParent);
      widget.widget.querySelector('[data-verb-type="music"]').click();
      expect(widget.widget.querySelector('.selected-model').dataset.selectedModelId).to.equal('music-one');
      expect(widget.musicShuffle.hidden).to.be.false;
      expect(widget.genBtn.parentElement).to.equal(actWrap);
      expect(actWrap.parentElement).to.equal(actionParent);
    });

    it(`renders an authored model picker with a single music verb (redesign: ${redesign})`, async () => {
      await createWidget({ models, redesign });
      const actions = widget.widget.querySelector('.action-container');
      const picker = actions.querySelector('.selected-model');
      expect(picker).to.exist;
      expect(picker.getBoundingClientRect().width).to.be.greaterThan(0);
      expect(actions.firstElementChild).to.equal(widget.musicShuffle);
      picker.click();
      expect(picker.getAttribute('aria-expanded')).to.equal('true');
      widget.widget.querySelector('[data-model-id="music-two"].model-link').click();
      expect(binder.getSelectedModelId()).to.equal('music-two');
    });

    it(`keeps the existing dropdowns without authored Shuffle (redesign: ${redesign})`, async () => {
      await createWidget({ verbs: ['music', 'image'], models, redesign, shuffle: false });
      expect(widget.widget.querySelector('.shuffle-btn')).to.equal(null);
      expect(widget.widget.querySelector('.selected-model')).to.exist;
      expect(widget.widget.querySelector('.selected-verb')).to.exist;
      expect(widget.genBtn.parentElement.contains(widget.musicCounter)).to.be.true;
      expect(widget.widget.querySelector('.music-toolbar')).to.equal(null);
    });

    it(`fits Shuffle, authored dropdowns, counter and Generate on mobile (redesign: ${redesign})`, async () => {
      await setViewport({ width: 390, height: 844 });
      try {
        await createWidget({ verbs: ['music', 'image'], models, redesign });
        const bar = widget.widget.querySelector('.autocomplete').getBoundingClientRect();
        const controls = [
          widget.musicShuffle,
          widget.widget.querySelector('.selected-verb'),
          widget.widget.querySelector('.selected-model'),
          widget.musicCounter,
          widget.genBtn,
        ].map((el) => el.getBoundingClientRect());
        controls.forEach((rect, index) => {
          expect(rect.width).to.be.greaterThan(0);
          expect(rect.left).to.be.at.least(bar.left);
          expect(rect.right).to.be.at.most(bar.right);
          expect(rect.top).to.be.at.least(bar.top);
          expect(rect.bottom).to.be.at.most(bar.bottom);
          controls.slice(index + 1).forEach((other) => {
            const overlap = rect.left < other.right && rect.right > other.left
              && rect.top < other.bottom && rect.bottom > other.top;
            expect(overlap).to.be.false;
          });
        });
      } finally {
        await setViewport({ width: 1024, height: 768 });
      }
    });
  });

  it('keeps the shuffle, counter and Generate within the mobile prompt bar', async () => {
    await setViewport({ width: 390, height: 844 });
    try {
      await createWidget();
      const bar = widget.widget.querySelector('.autocomplete').getBoundingClientRect();
      const controls = [
        widget.widget.querySelector('.shuffle-btn'),
        widget.musicCounter,
        widget.genBtn,
      ].map((el) => el.getBoundingClientRect());
      controls.forEach((rect) => {
        expect(rect.width).to.be.greaterThan(0);
        expect(rect.left).to.be.at.least(bar.left);
        expect(rect.right).to.be.at.most(bar.right);
      });
      expect(controls[0].right).to.be.at.most(controls[1].left);
      expect(controls[1].right).to.be.at.most(controls[2].left);
      expect(getComputedStyle(widget.musicCounter).display).not.to.equal('none');
    } finally {
      await setViewport({ width: 1024, height: 768 });
    }
  });
});
