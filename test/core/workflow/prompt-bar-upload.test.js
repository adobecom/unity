import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { readFile } from '@web/test-runner-commands';
import { setUnityLibs } from '../../../unitylibs/scripts/utils.js';
import UnityWidget from '../../../unitylibs/core/widgets/prompt-bar-upload/prompt-bar-upload.js';

const actionMap = {
  '.gen-btn': [{ actionType: 'generate' }],
  '.inp-field': [{ actionType: 'autocomplete' }],
};

const defaultCfg = () => ({
  name: 'workflow-firefly',
  targetCfg: {
    renderWidget: true,
    insert: 'before',
    target: 'a:last-of-type',
    actionMap,
  },
});

const makeBlock = (innerHtml = '<div class="copy"><a href="#">Link</a></div>') => {
  const el = document.createElement('div');
  el.innerHTML = innerHtml;
  return el;
};

const makeUnityEl = (extraItems = '') => {
  const el = document.createElement('div');
  el.innerHTML = `
    <ul>
      <li><span class="icon icon-upload-label"></span>Upload an image</li>
      <li><span class="icon icon-placeholder-input"></span>Describe your animation</li>
      <li><span class="icon icon-placeholder-prompt"></span>Prompt</li>
      <li><span class="icon icon-placeholder-upload-label"></span>Upload image</li>
      <li><span class="icon icon-generate"></span><a href="http://localhost:2000/test/assets/img.svg">http://localhost:2000/test/assets/img.svg</a> Generate</li>
      <li><span class="icon icon-more"></span><a href="https://firefly.adobe.com">More on Firefly</a></li>
      <li><span class="icon icon-error-request"></span>Unable to process the request.</li>
      ${extraItems}
    </ul>
  `;
  return el;
};

describe('prompt-bar-upload Widget Tests', () => {
  let unityElement;
  let block;
  let widget;

  before(async () => {
    setUnityLibs('', 'unity');
    document.body.innerHTML = await readFile({ path: './mocks/ff-upload-body.html' });
    unityElement = document.querySelector('.unity');
    block = document.querySelector('.unity-enabled');
    const cfg = defaultCfg();
    widget = new UnityWidget(block, unityElement, cfg, '<svg></svg>');
    await widget.initWidget();
  });

  describe('Widget Initialization', () => {
    it('creates a UnityWidget instance', () => {
      expect(widget).to.be.instanceOf(UnityWidget);
    });

    it('stores constructor arguments', () => {
      const cfg = defaultCfg();
      const w = new UnityWidget(block, unityElement, cfg, '<svg></svg>');
      expect(w.el).to.equal(unityElement);
      expect(w.target).to.equal(block);
      expect(w.workflowCfg).to.equal(cfg);
      expect(w.spriteCon).to.equal('<svg></svg>');
    });

    it('initWidget() resolves and returns workflowCfg.targetCfg.actionMap', async () => {
      const localMap = { '.gen-btn': [{ actionType: 'generate' }] };
      const cfg = {
        name: 'workflow-firefly',
        targetCfg: { renderWidget: true, insert: 'before', target: 'a:last-of-type', actionMap: localMap },
      };
      const el = makeUnityEl();
      const b = makeBlock();
      const w = new UnityWidget(b, el, cfg, '<svg></svg>');
      const result = await w.initWidget();
      expect(result).to.equal(localMap);
    });
  });

  describe('DOM Structure after initWidget()', () => {
    it('renders .ex-unity-wrap', () => {
      expect(document.querySelector('.ex-unity-wrap')).to.exist;
    });

    it('renders .ex-unity-widget', () => {
      expect(document.querySelector('.ex-unity-widget')).to.exist;
    });

    it('renders .ex-pbu-content', () => {
      expect(document.querySelector('.ex-pbu-content')).to.exist;
    });

    it('renders .ex-pbu-dropzone', () => {
      expect(document.querySelector('.ex-pbu-dropzone')).to.exist;
    });

    it('renders .ex-pbu-divider', () => {
      expect(document.querySelector('.ex-pbu-divider')).to.exist;
    });

    it('renders .ex-pbu-right', () => {
      expect(document.querySelector('.ex-pbu-right')).to.exist;
    });

    it('renders .ex-pbu-footer', () => {
      expect(document.querySelector('.ex-pbu-footer')).to.exist;
    });

    it('renders .ex-pbu-error-holder', () => {
      expect(document.querySelector('.ex-pbu-error-holder')).to.exist;
    });

    it('renders textarea with class inp-field', () => {
      const textarea = document.querySelector('.inp-field');
      expect(textarea).to.exist;
      expect(textarea.tagName.toLowerCase()).to.equal('textarea');
    });

    it('renders generate button with class gen-btn', () => {
      expect(document.querySelector('.gen-btn')).to.exist;
    });

    it('renders hidden file input with id pbu-file-input', () => {
      const fileInput = document.querySelector('#pbu-file-input');
      expect(fileInput).to.exist;
      expect(fileInput.type).to.equal('file');
    });

    it('renders .ex-pbu-thumbnail inside dropzone', () => {
      expect(document.querySelector('.ex-pbu-dropzone .ex-pbu-thumbnail')).to.exist;
    });

    it('renders .ex-pbu-upload-btn inside thumbnail', () => {
      expect(document.querySelector('.ex-pbu-upload-btn')).to.exist;
    });
  });

  describe('Slot Parsing', () => {
    it('textarea placeholder matches icon-placeholder-input slot value', () => {
      const textarea = document.querySelector('.inp-field');
      expect(textarea.getAttribute('placeholder')).to.equal('Describe your animation');
    });

    it('dropzone label text matches icon-upload-label slot', () => {
      const labelText = document.querySelector('.ex-pbu-dropzone-label-text');
      expect(labelText).to.exist;
      expect(labelText.textContent).to.equal('Upload an image');
    });

    it('more button href matches icon-more link href', () => {
      const moreBtn = document.querySelector('.ex-pbu-more-btn');
      expect(moreBtn).to.exist;
      const href = moreBtn.getAttribute('href');
      expect(href).to.include('firefly.adobe.com');
    });

    it('popPlaceholders() returns object with placeholder keys', () => {
      const ph = widget.popPlaceholders();
      expect(ph).to.be.an('object');
      expect(Object.keys(ph).length).to.be.greaterThan(0);
      expect(ph['placeholder-input']).to.exist;
    });
  });

  describe('Model Dropdown', () => {
    it('does not render models-container when no icon-model-* slot present', () => {
      expect(document.querySelector('.models-container')).to.not.exist;
    });

    it('renders models-container when icon-model-* slot is present', async () => {
      const el = makeUnityEl('<li><span class="icon icon-model-firefly"></span>Firefly</li>');
      const b = makeBlock();
      const cfg = defaultCfg();
      const w = new UnityWidget(b, el, cfg, '<svg></svg>');
      sinon.stub(w, 'loadModels').callsFake(function stub() {
        this.models = [{ id: 'ff-v3', name: 'Firefly v3', version: '3' }];
        return Promise.resolve();
      });
      await w.initWidget();
      expect(b.querySelector('.models-container')).to.exist;
      sinon.restore();
    });

    it('getModel() returns empty array when hasModelOptions is false', async () => {
      const result = await widget.getModel();
      expect(result).to.deep.equal([]);
    });

    it('getModel() returns empty array when loadModels throws', async () => {
      const el = makeUnityEl('<li><span class="icon icon-model-ff"></span>Model</li>');
      const b = makeBlock();
      const cfg = defaultCfg();
      const w = new UnityWidget(b, el, cfg, '<svg></svg>');
      sinon.stub(w, 'loadModels').rejects(new Error('Network error'));
      w.hasModelOptions = true;
      const result = await w.getModel();
      expect(result).to.deep.equal([]);
      sinon.restore();
    });
  });

  describe('Aspect Ratio Dropdown', () => {
    it('does not render verbs-container when no icon-aspect-* slot present', () => {
      expect(document.querySelector('.verbs-container')).to.not.exist;
    });

    it('getAspectRatios() returns empty array when hasAspectRatioOptions is false', async () => {
      expect(await widget.getAspectRatios()).to.deep.equal([]);
    });

    it('renders verbs-container when icon-aspect-* slot is present', async () => {
      const el = makeUnityEl('<li><span class="icon icon-aspect-ratio"></span>Ratio</li>');
      const b = makeBlock();
      const cfg = defaultCfg();
      const w = new UnityWidget(b, el, cfg, '<svg></svg>');
      sinon.stub(w, 'loadAspectRatios').callsFake(function stub() {
        this.aspectRatios = [{ id: '9:16', label: '9:16', model: '' }, { id: '1:1', label: '1:1', model: '' }];
        return Promise.resolve();
      });
      await w.initWidget();
      expect(b.querySelector('.verbs-container')).to.exist;
      sinon.restore();
    });

    it('getAspectRatios() returns empty array when loadAspectRatios throws', async () => {
      const el = makeUnityEl('<li><span class="icon icon-aspect-test"></span>Aspect</li>');
      const b = makeBlock();
      const cfg = defaultCfg();
      const w = new UnityWidget(b, el, cfg, '<svg></svg>');
      w.hasAspectRatioOptions = true;
      sinon.stub(w, 'loadAspectRatios').rejects(new Error('Network error'));
      const result = await w.getAspectRatios('some-id');
      expect(result).to.deep.equal([]);
      sinon.restore();
    });
  });

  describe('Aspect Ratio Update on Model Change', () => {
    it('updateAspectRatioDropdown() refreshes verbs-container items', async () => {
      const el = makeUnityEl(`
        <li><span class="icon icon-model-ff"></span>Firefly</li>
        <li><span class="icon icon-aspect-ratio"></span>Ratio</li>
      `);
      const b = makeBlock();
      const cfg = defaultCfg();
      const w = new UnityWidget(b, el, cfg, '<svg></svg>');
      const modelData = [
        { id: 'ff-v3', name: 'Firefly v3', version: '3' },
        { id: 'ff-v4', name: 'Firefly v4', version: '4' },
      ];
      const aspectData = [
        { id: '9:16', label: '9:16', model: 'ff-v3' },
        { id: '1:1', label: '1:1', model: 'ff-v3' },
        { id: '16:9', label: '16:9', model: 'ff-v4' },
      ];
      sinon.stub(w, 'loadModels').callsFake(function stub() {
        this.models = modelData;
        return Promise.resolve();
      });
      sinon.stub(w, 'loadAspectRatios').callsFake(function stub() {
        this.aspectRatios = aspectData;
        return Promise.resolve();
      });
      await w.initWidget();
      w.selectedModelId = 'ff-v4';
      w.updateAspectRatioDropdown();
      const aspectContainer = b.querySelector('[data-aspect-container="true"]');
      expect(aspectContainer).to.exist;
      expect(aspectContainer.querySelector('.selected-verb')).to.exist;
      sinon.restore();
    });
  });

  describe('File Upload Wiring', () => {
    it('clicking upload button triggers file input click', () => {
      const fileInput = document.querySelector('#pbu-file-input');
      const clickSpy = sinon.spy();
      fileInput.addEventListener('click', clickSpy);
      document.querySelector('.ex-pbu-upload-btn').click();
      expect(clickSpy.calledOnce).to.be.true;
      fileInput.removeEventListener('click', clickSpy);
    });

    it('clicking dropzone triggers file input click', () => {
      const fileInput = document.querySelector('#pbu-file-input');
      const clickSpy = sinon.spy();
      fileInput.addEventListener('click', clickSpy);
      document.querySelector('.ex-pbu-dropzone').click();
      expect(clickSpy.calledOnce).to.be.true;
      fileInput.removeEventListener('click', clickSpy);
    });
  });

  describe('Dropzone Drag and Drop', () => {
    it('dragover event adds .drag-over class', () => {
      const dropzone = document.querySelector('.ex-pbu-dropzone');
      dropzone.classList.remove('drag-over');
      const ev = new Event('dragover');
      ev.preventDefault = sinon.spy();
      dropzone.dispatchEvent(ev);
      expect(dropzone.classList.contains('drag-over')).to.be.true;
    });

    it('dragleave event removes .drag-over class', () => {
      const dropzone = document.querySelector('.ex-pbu-dropzone');
      dropzone.classList.add('drag-over');
      dropzone.dispatchEvent(new Event('dragleave'));
      expect(dropzone.classList.contains('drag-over')).to.be.false;
    });

    it('drop event removes .drag-over class', () => {
      const dropzone = document.querySelector('.ex-pbu-dropzone');
      dropzone.classList.add('drag-over');
      const ev = new Event('drop');
      ev.preventDefault = sinon.spy();
      Object.defineProperty(ev, 'dataTransfer', { value: { files: [] } });
      dropzone.dispatchEvent(ev);
      expect(dropzone.classList.contains('drag-over')).to.be.false;
    });
  });

  describe('Spinner shown on upload start', () => {
    it('handleFileSelected() adds loading class to thumbnail immediately', () => {
      const dropzone = document.querySelector('.ex-pbu-dropzone');
      const thumbnail = dropzone.querySelector('.ex-pbu-thumbnail');
      thumbnail.classList.remove('loading', 'has-image');

      const handleFileSpy = sinon.spy(widget, 'handleFileSelected');
      const origHandleFileSelected = widget.handleFileSelected.bind(widget);
      let calledWithLoading = false;

      widget.handleFileSelected = (file, dz) => {
        const t = dz.querySelector('.ex-pbu-thumbnail');
        t.classList.add('loading');
        calledWithLoading = true;
      };

      const mockFile = new File(['data'], 'test.jpg', { type: 'image/jpeg' });
      widget.handleFileSelected(mockFile, dropzone);

      expect(calledWithLoading).to.be.true;
      expect(thumbnail.classList.contains('loading')).to.be.true;

      widget.handleFileSelected = origHandleFileSelected;
      handleFileSpy.restore();
    });
  });

  describe('Error Toast', () => {
    it('showErrorToast() adds .show class to .ex-pbu-error-holder', () => {
      widget.hideErrorToast();
      widget.showErrorToast('.icon-error-request', null);
      const errorHolder = widget.widget.querySelector('.ex-pbu-error-holder');
      expect(errorHolder.classList.contains('show')).to.be.true;
    });

    it('hideErrorToast() removes .show class from .ex-pbu-error-holder', () => {
      widget.widget.querySelector('.ex-pbu-error-holder').classList.add('show');
      widget.hideErrorToast();
      expect(widget.widget.querySelector('.ex-pbu-error-holder').classList.contains('show')).to.be.false;
    });

    it('clicking .alert-close removes .show from error holder', () => {
      const errorHolder = widget.widget.querySelector('.ex-pbu-error-holder');
      errorHolder.classList.add('show');
      const closeBtn = errorHolder.querySelector('.alert-close');
      expect(closeBtn).to.exist;
      closeBtn.click();
      expect(errorHolder.classList.contains('show')).to.be.false;
    });

    it('showErrorToast() does not throw with non-matching error selector', () => {
      expect(() => widget.showErrorToast('.icon-nonexistent', null)).to.not.throw();
    });
  });

  describe('Dropdown Interactions', () => {
    it('clicking selected-model toggles show-menu on models-container', async () => {
      const el = makeUnityEl(`
        <li><span class="icon icon-model-ff"></span>Firefly</li>
      `);
      const b = makeBlock();
      const cfg = defaultCfg();
      const w = new UnityWidget(b, el, cfg, '<svg></svg>');
      sinon.stub(w, 'loadModels').callsFake(function stub() {
        this.models = [
          { id: 'ff-v3', name: 'Firefly v3', version: '3' },
          { id: 'ff-v4', name: 'Firefly v4', version: '4' },
        ];
        return Promise.resolve();
      });
      await w.initWidget();
      const selectedModel = b.querySelector('.selected-model');
      expect(selectedModel).to.exist;
      selectedModel.click();
      const modelsContainer = b.querySelector('.models-container');
      expect(modelsContainer.classList.contains('show-menu')).to.be.true;
      sinon.restore();
    });

    it('closeVerbOrModelMenu() removes show-menu and sets aria-expanded to false', async () => {
      const el = makeUnityEl(`
        <li><span class="icon icon-model-ff"></span>Firefly</li>
      `);
      const b = makeBlock();
      const cfg = defaultCfg();
      const w = new UnityWidget(b, el, cfg, '<svg></svg>');
      sinon.stub(w, 'loadModels').callsFake(function stub() {
        this.models = [
          { id: 'ff-v3', name: 'Firefly v3', version: '3' },
          { id: 'ff-v4', name: 'Firefly v4', version: '4' },
        ];
        return Promise.resolve();
      });
      await w.initWidget();
      const selectedModel = b.querySelector('.selected-model');
      const modelsContainer = b.querySelector('.models-container');
      modelsContainer.classList.add('show-menu');
      selectedModel.setAttribute('aria-expanded', 'true');
      w.closeVerbOrModelMenu(selectedModel);
      expect(modelsContainer.classList.contains('show-menu')).to.be.false;
      expect(selectedModel.getAttribute('aria-expanded')).to.equal('false');
      sinon.restore();
    });

    it('selecting a model item updates selectedModelId', async () => {
      const el = makeUnityEl(`
        <li><span class="icon icon-model-ff"></span>Firefly</li>
      `);
      const b = makeBlock();
      const cfg = defaultCfg();
      const w = new UnityWidget(b, el, cfg, '<svg></svg>');
      sinon.stub(w, 'loadModels').callsFake(function stub() {
        this.models = [
          { id: 'ff-v3', name: 'Firefly v3', version: '3' },
          { id: 'ff-v4', name: 'Firefly v4', version: '4' },
        ];
        return Promise.resolve();
      });
      await w.initWidget();

      const verbList = b.querySelector('.verb-list');
      expect(verbList).to.exist;
      const secondLink = verbList.querySelectorAll('.verb-link')[1];
      expect(secondLink).to.exist;
      secondLink.click();
      expect(w.selectedModelId).to.equal('ff-v4');
      sinon.restore();
    });
  });
});
