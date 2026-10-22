import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import InlineActionWidget, { extractHeroMedia, parseInlineAuthoring } from '../../../../unitylibs/core/widgets/inline-action/inline-action.js';
import { setUnityLibs } from '../../../../unitylibs/scripts/utils.js';

setUnityLibs('/unitylibs');

describe('Inline action widget', () => {
  let host;
  let instances;
  let observers;

  function author(operation = 'removeBackground', config = '', upload = '') {
    host.innerHTML = `<div><div>
      <p>${upload || '<span class="icon icon-upload"></span>'} Upload here</p>
      <p>Drop here</p><p>PNG or JPEG</p><p><a href="#terms">Terms</a></p>
    </div></div><div><div><ul>
      <li><span class="icon icon-operation-${operation}"></span></li>
      ${config}
    </ul></div></div>`;
    return host;
  }

  async function mount(operation, options = {}) {
    author(operation, options.config, options.upload);
    if (options.light) host.classList.add('light');
    const widget = new InlineActionWidget(null, host, { targetCfg: { actionMap: { '.ia-file-input': 'upload' } } }, options.sprite);
    instances.push(widget);
    await widget.initWidget();
    return widget;
  }

  beforeEach(() => {
    host = document.createElement('div');
    host.className = 'unity';
    document.body.append(host);
    instances = [];
    observers = [];
    sinon.stub(window, 'IntersectionObserver').callsFake(function observe(callback) {
      this.observe = (video) => observers.push({ callback, video });
      this.disconnect = () => {};
    });
    sinon.stub(HTMLMediaElement.prototype, 'play').resolves();
    sinon.stub(HTMLMediaElement.prototype, 'pause');
  });

  afterEach(() => {
    instances.forEach((widget) => {
      const engine = widget.editorEngine;
      if (engine) {
        clearTimeout(engine.idleTimer);
        clearTimeout(engine.sizeReadoutTimer);
        [engine.moreMenu, engine.socialMenu, engine.unitMenu].forEach((menu) => menu?.remove());
      }
      widget.extendedRoot?.remove();
    });
    host.remove();
    sinon.restore();
  });

  ['crop', 'resize', 'removeBackground'].forEach((operation) => {
    it(`renders the correct ${operation} panels and authored copy`, async () => {
      const widget = await mount(operation);
      expect(widget.widget.dataset.operation).to.equal(operation);
      expect(widget.widget.dataset.state).to.equal('initial');
      expect(widget.extendedRoot.querySelector('.ia-legal').textContent).to.equal('Terms');
      if (operation === 'removeBackground') {
        expect(widget.widget.querySelector('.ia-complete .ia-edit-in-firefly').textContent).to.equal('Edit in Firefly');
        expect(widget.widget.querySelector('.ia-result-img').alt).to.equal('Processed image');
      } else {
        expect(widget.editorLeftSlot.className).to.equal('ia-editor-left-slot');
        expect(widget.editorRightSlot.className).to.equal('ia-editor-right-slot');
        expect(widget.widget.querySelector('.ia-complete')).to.equal(null);
      }
      expect(widget.widget.querySelector('.action-button').textContent.trim()).to.equal('Upload here');
    });
  });

  it('parses all editor copy, icons and slider modes without localizing internal keys', () => {
    author('resize', `
      <li><span class="icon icon-reset"></span><a href="/reset.svg">https://host/reset.svg</a> Restaurer</li>
      <li><span class="icon icon-upload"></span><img src="/upload.svg">Importer</li>
      <li><span class="icon icon-placeholder-width"></span>Largeur</li>
      <li><span class="icon icon-placeholder-height"></span>Hauteur</li>
      <li><span class="icon icon-placeholder-editor"></span>Redimensionner</li>
      <li><span class="icon icon-placeholder-aspect-ratio"></span>Format</li>
      <li><span class="icon icon-placeholder-original-size"></span>Actuelle</li>
      <li><span class="icon icon-placeholder-new-size"></span>Nouvelle</li>
      <li><span class="icon icon-placeholder-slider-quality"></span><img src="/quality.svg">Qualité</li>
      <li>ignored</li>`);
    const data = parseInlineAuthoring(host);
    expect(data).to.include({
      operation: 'resize',
      resetLabel: 'Restaurer',
      resetIconHref: '/reset.svg',
      reuploadLabel: 'Importer',
      reuploadIconHref: '/upload.svg',
      widthLabel: 'Largeur',
      heightLabel: 'Hauteur',
      editorTitle: 'Redimensionner',
      aspectRatioLabel: 'Format',
      originalSizeLabel: 'Actuelle',
      newSizeLabel: 'Nouvelle',
    });
    expect(data.sliderModes).to.deep.equal([{ mode: 'quality', label: 'Qualité', iconHref: '/quality.svg' }]);
  });

  it('filters invalid NBA authoring rows and preserves an unlocalized verb', () => {
    author();
    host.insertAdjacentHTML('beforeend', `<div><div><ul>
      <li>Remove sky<br><span class="icon icon-nba-removeElement"></span>Replace with blue</li>
      <li>Unrelated</li>
    </ul></div></div>`);
    const data = parseInlineAuthoring(host);
    expect(data.nbaCards).to.deep.equal([{ label: 'Remove sky', nba: 'removeElement', defaultPrompt: 'Replace with blue', src: '' }]);
    expect(data.nbaPills).to.deep.equal([{ nba: 'removeElement', label: 'Remove skyReplace with blue', iconHref: undefined }]);
  });

  it('handles empty authoring and detached roots without legal or sprites', async () => {
    host.remove();
    const widget = new InlineActionWidget(null, host, { targetCfg: { actionMap: {} } });
    instances.push(widget);
    expect(await widget.initWidget()).to.deep.equal({});
    expect(widget.parsedData.operation).to.equal('removeBackground');
    expect(host.contains(widget.extendedRoot)).to.equal(true);
    expect(widget.extendedRoot.querySelector('.ia-legal')).to.equal(null);
    expect(widget.extendedRoot.querySelector('.action-button').textContent.trim()).to.equal('Upload your image');
  });

  it('keeps authored upload span icons and supports light skin with a sprite', async () => {
    const widget = await mount('removeBackground', { light: true, sprite: '<svg id="sprite"></svg>' });
    expect(widget.extendedRoot.querySelector('.interactive-area').classList.contains('light')).to.equal(true);
    expect(widget.widget.querySelector('.action-button span').className).to.equal('icon icon-upload');
    expect(widget.widget.querySelector('.ia-sprite').firstElementChild.id).to.equal('sprite');
  });

  it('uses default upload text and fallback icons when no markers exist', async () => {
    host.innerHTML = '<div><div><p>Drop</p><p>Limit</p><p>Legal</p></div></div>';
    const widget = new InlineActionWidget(null, host, { targetCfg: { actionMap: {} } });
    instances.push(widget);
    await widget.initWidget();
    expect(widget.widget.querySelector('.action-button img').getAttribute('src')).to.equal('/cc-shared/assets/svg/s2-icon-upload-20-n.svg');
    expect(widget.widget.querySelector('.action-button').textContent.trim()).to.equal('Upload your image');
  });

  it('updates loading layout only when entering loading from complete', async () => {
    const widget = await mount('resize');
    widget.setState('complete');
    widget.setState('loading');
    expect(widget.widget.dataset.loadingLayout).to.equal('complete');
    expect(widget.widget.querySelector('.ia-dropzone-shell').classList.contains('ia-from-complete')).to.equal(true);
    widget.setState('initial');
    expect(widget.widget.dataset.loadingLayout).to.equal(undefined);
    expect(widget.widget.querySelector('.ia-dropzone-shell').classList.contains('ia-from-complete')).to.equal(false);
    const empty = new InlineActionWidget(null, host, {});
    empty.setState('loading');
    expect(empty.state).to.equal('loading');
    empty.setProgress(10);
    empty.setResultUrl('unused');
    empty.openFilePicker();
  });

  it('clamps and rounds progress, keeps it monotonic, and allows an explicit reset', async () => {
    const widget = await mount('resize');
    const progress = widget.widget.querySelector('.spectrum-ProgressBar');
    widget.setProgress(60.6);
    expect(progress.getAttribute('value')).to.equal('61');
    widget.setProgress(10);
    expect(progress.getAttribute('value')).to.equal('61');
    widget.setProgress(120);
    expect(progress.getAttribute('value')).to.equal('100');
    widget.setProgress(-1);
    expect(progress.getAttribute('value')).to.equal('0');
    widget.progressScreen = null;
    widget.setProgress(20);
    expect(progress.getAttribute('value')).to.equal('0');
  });

  it('updates result media, suppresses context menus and resets the picker', async () => {
    const widget = await mount('removeBackground');
    widget.setResultUrl('data:image/png;base64,AAAA');
    expect(widget.widget.querySelector('.ia-result-img').getAttribute('src')).to.equal('data:image/png;base64,AAAA');
    const menu = new Event('contextmenu', { cancelable: true });
    widget.widget.querySelector('.ia-result').dispatchEvent(menu);
    expect(menu.defaultPrevented).to.equal(true);
    const input = widget.widget.querySelector('.ia-file-input');
    const click = sinon.stub(input, 'click');
    widget.openFilePicker();
    expect(click.calledOnce).to.equal(true);
    expect(input.value).to.equal('');
  });

  ['crop', 'resize'].forEach((operation) => {
    it(`lazily creates and reuses the ${operation} editor`, async () => {
      sinon.stub(window, 'fetch').resolves(new Response(JSON.stringify({ content: { data: [{ module: 'resize', group: 'Custom' }, { module: 'crop', name: 'Freeform' }] } })));
      const widget = await mount(operation);
      const track = sinon.spy();
      const engine = await widget.ensureEditorEngine(track);
      expect(engine.isCrop).to.equal(operation === 'crop');
      expect(widget.widget.querySelector('.ia-editor-left-panel')).to.equal(engine.leftPanel);
      expect(await widget.ensureEditorEngine(track)).to.equal(engine);
    });
  });

  it('decorates picture heroes and removes an emptied paragraph', () => {
    const vp = document.createElement('div');
    vp.innerHTML = '<p><picture><img src="data:image/png;base64,AAAA"></picture></p>';
    const preview = extractHeroMedia(vp);
    expect(vp.children.length).to.equal(0);
    expect(preview.querySelector('img').getAttribute('role')).to.equal('presentation');
    expect(preview.querySelector('img').getAttribute('fetchpriority')).to.equal('high');
    expect(extractHeroMedia(null).className).to.equal('ia-preview');
  });

  it('plays autoplay previews when visible and pauses when hidden', () => {
    const vp = document.createElement('div');
    vp.innerHTML = '<div class="video-container video-holder"><video autoplay></video></div>';
    const preview = extractHeroMedia(vp);
    const video = preview.querySelector('video');
    expect(HTMLMediaElement.prototype.play.calledOnce).to.equal(true);
    video.dispatchEvent(new Event('loadeddata'));
    observers[0].callback([{ isIntersecting: true }]);
    expect(HTMLMediaElement.prototype.play.callCount).to.equal(3);
    sinon.stub(video, 'paused').get(() => false);
    observers[0].callback([{ isIntersecting: false }]);
    expect(HTMLMediaElement.prototype.pause.calledOnce).to.equal(true);
  });
});
