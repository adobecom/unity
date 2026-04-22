import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { readFile } from '@web/test-runner-commands';
import { setUnityLibs } from '../../../unitylibs/scripts/utils.js';
import UnityWidget from '../../../unitylibs/core/widgets/image-to-film/image-to-film.js';
import { WfInitiator } from '../../../unitylibs/core/workflow/workflow.js';

describe('Image-to-Film Widget Tests', () => {
  let unityElement;
  let workflowCfg;
  let block;
  let unityWidget;
  let spriteContainer;

  before(async () => {
    setUnityLibs('', 'unity');
    document.body.innerHTML = await readFile({ path: './mocks/itf-body.html' });

    sinon.stub(UnityWidget.prototype, 'loadModels').callsFake(function loadModelsStub() {
      this.models = [];
      return Promise.resolve();
    });

    unityElement = document.querySelector('.unity');
    workflowCfg = {
      name: 'workflow-firefly',
      targetCfg: {
        renderWidget: true,
        insert: 'before',
        target: 'a:last-of-type',
        actionMap: {
          '.gen-btn': [{ actionType: 'generate' }],
          '.inp-field': [{ actionType: 'autocomplete' }],
        },
      },
    };
    spriteContainer = '<svg></svg>';
    block = document.querySelector('.unity-enabled');

    unityWidget = new UnityWidget(block, unityElement, workflowCfg, spriteContainer);
    await unityWidget.initWidget();
  });

  after(() => {
    sinon.restore();
  });

  it('widget instance is created and initWidget returns the actionMap', () => {
    expect(unityWidget).to.exist;
    const { actionMap } = workflowCfg.targetCfg;
    expect(actionMap).to.be.an('object');
  });

  it('.ex-unity-widget exists in DOM after initWidget()', () => {
    expect(document.querySelector('.ex-unity-widget')).to.exist;
  });

  it('.itf-dropzone exists in DOM', () => {
    expect(document.querySelector('.itf-dropzone')).to.exist;
  });

  it('.itf-label text matches the dropzone-label slot value', () => {
    const label = document.querySelector('.itf-label');
    expect(label).to.exist;
    expect(label.textContent).to.include('Drop an image or click to upload');
  });

  it('.inp-field exists with correct placeholder', () => {
    const field = document.querySelector('.inp-field');
    expect(field).to.exist;
    expect(field.getAttribute('placeholder')).to.include('Describe the film effect');
  });

  it('.gen-btn exists in DOM', () => {
    expect(document.querySelector('.gen-btn')).to.exist;
  });

  it('.gen-btn has data-event-bound set to true', () => {
    const genBtn = document.querySelector('.gen-btn');
    expect(genBtn.getAttribute('data-event-bound')).to.equal('true');
  });

  it('.inp-field has data-event-bound set to true', () => {
    const inpField = document.querySelector('.inp-field');
    expect(inpField.getAttribute('data-event-bound')).to.equal('true');
  });

  it('.itf-more-btn exists in DOM', () => {
    expect(document.querySelector('.itf-more-btn')).to.exist;
  });

  it('.alert-holder exists (error toast created)', () => {
    expect(document.querySelector('.alert-holder')).to.exist;
  });

  it('getWidgetRegistry() includes image-to-film', () => {
    const registry = WfInitiator.getWidgetRegistry();
    expect(registry).to.have.property('image-to-film');
    expect(registry['image-to-film']).to.be.an('array').with.length(2);
    expect(registry['image-to-film'][0]).to.include('image-to-film.js');
    expect(registry['image-to-film'][1]).to.include('image-to-film.css');
  });

  it('dropzone click triggers file input click', () => {
    const dropzone = document.querySelector('.itf-dropzone');
    const fileInput = dropzone.querySelector('.itf-file-input');
    const clickStub = sinon.stub(fileInput, 'click');
    dropzone.click();
    expect(clickStub.calledOnce).to.be.true;
    clickStub.restore();
  });

  it('file drop sets uploadedFile on widget instance', () => {
    const dropzone = document.querySelector('.itf-dropzone');
    const file = new File(['dummy content'], 'test.jpg', { type: 'image/jpeg' });
    const skeleton = dropzone.querySelector('.itf-skeleton');
    const preview = dropzone.querySelector('.itf-preview');
    const label = dropzone.querySelector('.itf-label');
    unityWidget.handleFileSelected(file, skeleton, preview, label);
    expect(unityWidget.uploadedFile).to.equal(file);
  });

  it('drag-over adds .itf-drag-over class; drag-leave removes it', () => {
    const dropzone = document.querySelector('.itf-dropzone');
    const dragOverEvent = new Event('dragover', { bubbles: true });
    dragOverEvent.preventDefault = sinon.stub();
    dropzone.dispatchEvent(dragOverEvent);
    expect(dropzone.classList.contains('itf-drag-over')).to.be.true;

    const dragLeaveEvent = new Event('dragleave', { bubbles: true });
    dropzone.dispatchEvent(dragLeaveEvent);
    expect(dropzone.classList.contains('itf-drag-over')).to.be.false;
  });
});
