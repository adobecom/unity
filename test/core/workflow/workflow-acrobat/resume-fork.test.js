import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import ActionBinder from '../../../../unitylibs/core/workflow/workflow-acrobat/action-binder.js';
import UploadHandler from '../../../../unitylibs/core/workflow/workflow-acrobat/upload-handler.js';

describe('Acrobat resume upload fork', () => {
  let binder;
  let block;
  let file;

  function respond(detail, target = block) {
    target.dispatchEvent(new CustomEvent('unity:resume-fork-response', { detail }));
  }

  function modalLoaded(id = 'resume-upload-fork') {
    window.dispatchEvent(new CustomEvent('milo:modal:loaded', { detail: { id } }));
  }

  beforeEach(() => {
    sinon.stub(ActionBinder.prototype, 'initialize').resolves();
    block = document.createElement('div');
    block.dataset.showResumeFork = 'true';
    binder = new ActionBinder(document.createElement('div'), {
      name: 'workflow-acrobat',
      productName: 'acrobat',
      enabledFeatures: ['resume-builder'],
      langRegion: 'us',
      langCode: 'en',
      targetCfg: {
        verbsWithoutMfuToSfuFallback: [],
        wordPageCountVerbs: ['resume-builder'],
        experimentationOn: [],
        nonpdfSfuProductScreen: ['resume-builder'],
      },
      errors: {},
    }, block, null);
    binder.signedOut = true;
    binder.pageConfigFetched = true;
    binder.applyApiConfig();
    file = new File(['resume'], 'resume.pdf', { type: 'application/pdf' });
    sinon.stub(binder, 'sanitizeFileName').callsFake(async (name) => name);
    sinon.stub(binder, 'getMimeType').callsFake(async () => file.type);
    sinon.stub(binder, 'filterFilesWithPdflite').callsFake(async (files) => files);
    sinon.stub(binder, 'validateWordFilePageCount').callsFake(async (files) => files);
    sinon.stub(binder, 'validateFiles').callsFake(async (files) => ({ isValid: true, validFiles: files }));
    sinon.stub(binder, 'initUploadHandler').resolves();
    sinon.stub(binder, 'handleSingleFileUpload').resolves();
    sinon.stub(binder, 'dispatchErrorToast').resolves();
    sinon.stub(binder, 'dispatchAnalyticsEvent');
  });

  afterEach(() => {
    if (binder.cancelResumeFork) binder.cancelResumeFork();
    sinon.restore();
  });

  it('opens only after validation and waits before initializing the upload', async () => {
    let shown;
    const opened = new Promise((resolve) => { shown = resolve; });
    block.addEventListener('unity:show-resume-fork', (event) => {
      expect(event.detail).to.equal(null);
      expect(binder.validateFiles.calledOnce).to.be.true;
      expect(binder.validateWordFilePageCount.calledOnce).to.be.true;
      expect(binder.initUploadHandler.called).to.be.false;
      shown();
    }, { once: true });
    const uploading = binder.handleFileUpload([file]);
    await opened;
    expect(binder.handleSingleFileUpload.called).to.be.false;
    respond({ action: 'continue-fork', choice: 'sharpen' });
    await uploading;
    expect(binder.handleSingleFileUpload.calledOnce).to.be.true;
    expect(binder.resumeForkChoice).to.equal(null);
    expect(binder.cancelResumeFork).to.equal(null);
  });

  ['sharpen', 'refresh'].forEach((choice) => {
    ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].forEach((type) => {
      it(`resumes the validated ${type} file with ${choice}`, async () => {
        file = new File(['resume'], 'resume.doc', { type });
        block.addEventListener('unity:show-resume-fork', () => {
          respond({ action: 'continue-fork', choice });
          respond({ action: 'cancel-fork' });
        });
        binder.handleSingleFileUpload.callsFake(async (files) => {
          expect(binder.resumeForkChoice).to.equal(choice);
          expect(files[0].type).to.equal(type);
          expect(files[0].name).to.equal(file.name);
        });
        await binder.handleFileUpload([file]);
        expect(binder.handleSingleFileUpload.calledOnce).to.be.true;
      });
    });
  });

  [undefined, 'false', 'TRUE', ''].forEach((flag) => {
    it(`does not open for flag ${flag}`, async () => {
      if (flag === undefined) block.removeAttribute('data-show-resume-fork');
      else block.dataset.showResumeFork = flag;
      const show = sinon.spy();
      block.addEventListener('unity:show-resume-fork', show);
      await binder.handleFileUpload([file]);
      expect(show.called).to.be.false;
      expect(binder.handleSingleFileUpload.calledOnce).to.be.true;
    });
  });

  [false, undefined].forEach((signedOut) => {
    it(`does not open unless guest status is confirmed (${signedOut})`, async () => {
      binder.signedOut = signedOut;
      const show = sinon.spy();
      block.addEventListener('unity:show-resume-fork', show);
      await binder.handleFileUpload([file]);
      expect(show.called).to.be.false;
    });
  });

  it('does not affect other Acrobat verbs', async () => {
    binder.workflowCfg.enabledFeatures = ['compress-pdf'];
    await binder.handleFileUpload([file]);
    expect(binder.handleSingleFileUpload.calledOnce).to.be.true;
  });

  it('never opens or uploads when validation fails', async () => {
    binder.validateFiles.resolves({ isValid: false, validFiles: [] });
    const show = sinon.spy();
    block.addEventListener('unity:show-resume-fork', show);
    await binder.handleFileUpload([file]);
    expect(show.called).to.be.false;
    expect(binder.initUploadHandler.called).to.be.false;
  });

  ['filterFilesWithPdflite', 'validateWordFilePageCount'].forEach((validation) => {
    it(`never opens or uploads when ${validation} rejects the file`, async () => {
      binder[validation].resolves([]);
      const show = sinon.spy();
      block.addEventListener('unity:show-resume-fork', show);
      await binder.handleFileUpload([file]);
      expect(show.called).to.be.false;
      expect(binder.initUploadHandler.called).to.be.false;
    });
  });

  it('cancels without upload and allows the same file to be selected again', async () => {
    block.addEventListener('unity:show-resume-fork', () => respond({ action: 'cancel-fork' }), { once: true });
    await binder.handleFileUpload([file]);
    expect(binder.initUploadHandler.called).to.be.false;
    expect(binder.filesData).to.deep.equal({});
    expect(binder.promiseStack).to.deep.equal([]);
    block.addEventListener('unity:show-resume-fork', () => respond({ action: 'continue-fork', choice: 'refresh' }), { once: true });
    await binder.handleFileUpload([file]);
    expect(binder.handleSingleFileUpload.calledOnce).to.be.true;
  });

  it('ignores responses from another block and late duplicate responses', async () => {
    const pending = binder.requestResumeFork();
    respond({ action: 'continue-fork', choice: 'sharpen' }, document.createElement('div'));
    expect(binder.cancelResumeFork).to.be.a('function');
    respond({ action: 'cancel-fork' });
    expect(await pending).to.equal(null);
    respond({ action: 'continue-fork', choice: 'sharpen' });
    expect(binder.resumeForkChoice).to.equal(null);
  });

  it('cancels a pending fork without invoking upload interruption', async () => {
    const pending = binder.requestResumeFork();
    const transition = sinon.stub(binder, 'showTransitionScreen').resolves();
    await binder.cancelAcrobatOperation();
    expect(await pending).to.equal(null);
    expect(transition.called).to.be.false;
    expect(binder.promiseStack).to.deep.equal([]);
  });

  it('releases the pending decision on abort', async () => {
    const pending = binder.requestResumeFork();
    binder.abortController.abort();
    expect(await pending).to.equal(null);
    expect(binder.cancelResumeFork).to.equal(null);
  });

  it('does not request the modal if the operation was already aborted', async () => {
    binder.abortController.abort();
    const show = sinon.spy();
    block.addEventListener('unity:show-resume-fork', show);
    expect(await binder.requestResumeFork()).to.equal(null);
    expect(show.called).to.be.false;
    expect(binder.dispatchErrorToast.called).to.be.false;
    expect(binder.cancelResumeFork).to.equal(null);
  });

  ['continue', 'cancel', 'abort', 'invalid', 'timeout', 'dispatch-error'].forEach((outcome) => {
    it(`cleans up listeners and the timer exactly once on ${outcome}`, async () => {
      const clock = sinon.useFakeTimers();
      const signal = binder.getAbortSignal();
      const removeResponse = sinon.spy(block, 'removeEventListener');
      const removeLoaded = sinon.spy(window, 'removeEventListener');
      const removeAbort = sinon.spy(signal, 'removeEventListener');
      if (outcome === 'dispatch-error') {
        sinon.stub(block, 'dispatchEvent').throws(new Error('Dispatch failed'));
      }

      const pending = binder.requestResumeFork();
      if (outcome === 'continue') respond({ action: 'continue-fork', choice: 'sharpen' });
      if (outcome === 'cancel') respond({ action: 'cancel-fork' });
      if (outcome === 'abort') binder.abortController.abort();
      if (outcome === 'invalid') respond({ action: 'unknown' });
      if (outcome === 'timeout') await clock.tickAsync(15000);

      expect(await pending).to.equal(outcome === 'continue' ? 'sharpen' : null);
      if (outcome !== 'dispatch-error') respond({ action: 'cancel-fork' });
      expect(removeResponse.calledOnce).to.be.true;
      expect(removeResponse.firstCall.args[0]).to.equal('unity:resume-fork-response');
      expect(removeLoaded.calledOnce).to.be.true;
      expect(removeLoaded.firstCall.args[0]).to.equal('milo:modal:loaded');
      expect(removeAbort.calledOnce).to.be.true;
      expect(removeAbort.firstCall.args[0]).to.equal('abort');
      expect(clock.countTimers()).to.equal(0);
      expect(binder.cancelResumeFork).to.equal(null);
      expect(binder.dispatchErrorToast.called).to.equal(['invalid', 'timeout', 'dispatch-error'].includes(outcome));
    });
  });

  [undefined, { action: 'continue', choice: 'sharpen' }, { action: 'continue-fork', choice: 'refine' }].forEach((detail) => {
    it(`reports invalid responses instead of uploading (${JSON.stringify(detail)})`, async () => {
      block.addEventListener('unity:show-resume-fork', () => respond(detail));
      await binder.handleFileUpload([file]);
      expect(binder.dispatchErrorToast.calledOnce).to.be.true;
      expect(binder.initUploadHandler.called).to.be.false;
      expect(binder.cancelResumeFork).to.equal(null);
    });
  });

  it('cancels with an error at exactly 15 seconds if its modal has not loaded', async () => {
    const clock = sinon.useFakeTimers();
    const pending = binder.requestResumeFork();
    modalLoaded('another-modal');
    await clock.tickAsync(14999);
    expect(binder.dispatchErrorToast.called).to.be.false;
    expect(binder.cancelResumeFork).to.be.a('function');
    await clock.tickAsync(1);
    expect(await pending).to.equal(null);
    expect(binder.dispatchErrorToast.calledOnce).to.be.true;
    expect(binder.cancelResumeFork).to.equal(null);
  });

  it('has no decision timeout once its modal loads', async () => {
    const clock = sinon.useFakeTimers();
    const pending = binder.requestResumeFork();
    modalLoaded();
    await clock.tickAsync(60000);
    expect(binder.dispatchErrorToast.called).to.be.false;
    expect(binder.cancelResumeFork).to.be.a('function');
    respond({ action: 'continue-fork', choice: 'refresh' });
    expect(await pending).to.equal('refresh');
  });

  it('reports modal-load failure without initializing or uploading the file', async () => {
    const clock = sinon.useFakeTimers();
    const uploading = binder.handleFileUpload([file]);
    await clock.tickAsync(15000);
    await uploading;
    expect(binder.dispatchErrorToast.calledOnce).to.be.true;
    expect(binder.initUploadHandler.called).to.be.false;
    expect(binder.handleSingleFileUpload.called).to.be.false;
    expect(binder.filesData).to.deep.equal({});
  });

  it('clears the load timeout even when the modal loads synchronously', async () => {
    const clock = sinon.useFakeTimers();
    block.addEventListener('unity:show-resume-fork', () => modalLoaded());
    const pending = binder.requestResumeFork();
    await clock.tickAsync(15000);
    expect(binder.dispatchErrorToast.called).to.be.false;
    respond({ action: 'cancel-fork' });
    expect(await pending).to.equal(null);
  });

  it('does not upload if interrupted after the decision while preparing the upload', async () => {
    block.addEventListener('unity:show-resume-fork', () => respond({ action: 'continue-fork', choice: 'sharpen' }));
    binder.initUploadHandler.callsFake(async () => {
      binder.abortController.abort();
    });
    await binder.handleFileUpload([file]);
    expect(binder.handleSingleFileUpload.called).to.be.false;
    expect(binder.resumeForkChoice).to.equal(null);
  });

  it('clears the choice if the resumed upload fails', async () => {
    block.addEventListener('unity:show-resume-fork', () => respond({ action: 'continue-fork', choice: 'sharpen' }));
    binder.handleSingleFileUpload.rejects(new Error('Upload failed'));
    let error;
    try {
      await binder.handleFileUpload([file]);
    } catch (failure) {
      error = failure;
    }
    expect(error.message).to.equal('Upload failed');
    expect(binder.resumeForkChoice).to.equal(null);
  });

  it('blocks concurrent upload actions until the first challenger upload completes', async () => {
    sinon.stub(binder, 'loadTransitionScreen').resolves();
    sinon.stub(binder, 'handlePreloads').resolves();
    let started;
    const ready = new Promise((resolve) => { started = resolve; });
    let finish;
    sinon.stub(binder, 'processSingleFile').callsFake(() => {
      started();
      return new Promise((resolve) => { finish = resolve; });
    });
    const uploading = binder.acrobatActionMaps('upload', [file], file.size, 'change');
    await ready;
    await binder.acrobatActionMaps('upload', [file], file.size, 'drop');
    expect(binder.processSingleFile.calledOnce).to.be.true;
    finish();
    await uploading;
    expect(binder.resumeForkUploadActive).to.be.false;
  });

  describe('connector routing', () => {
    beforeEach(() => {
      sinon.stub(binder, 'getRedirectUrl').callsFake(async () => {
        binder.redirectUrl = 'https://acrobat.adobe.com/resume?existing=value';
      });
      binder.experimentViaPageConfig = true;
      binder.experimentData = { variationId: 'experiment' };
    });

    ['sharpen', 'refresh'].forEach((choice) => {
      it(`gives ${choice} precedence over experiments without changing product or verb`, async () => {
        binder.resumeForkChoice = choice;
        const options = { targetProduct: 'acrobat', payload: { verb: 'resume-builder' } };
        await binder.handleRedirect(options, {});
        expect(options.targetProduct).to.equal('acrobat');
        expect(options.payload.verb).to.equal('resume-builder');
        if (choice === 'sharpen') expect(options.payload.variationId).to.equal('sharpen');
        else expect(options.payload).not.to.have.property('variationId');
        expect(binder.redirectUrl).to.include('existing=value');
      });

      [true, false].forEach((direct) => {
        it(`routes ${choice} through the ${direct ? 'direct' : 'chunked'} upload connector`, async () => {
          binder.resumeForkChoice = choice;
          const handler = new UploadHandler(binder, binder.networkUtils);
          const asset = { id: 'asset-id' };
          sinon.stub(binder, 'isDirectUploadVerb').returns(direct);
          sinon.stub(handler, 'directUploadAsset').resolves(asset);
          sinon.stub(handler, 'createAsset').resolves(asset);
          sinon.stub(handler, 'getBlobData').resolves(new Blob(['resume']));
          sinon.stub(handler, 'getEffectiveFileType').resolves(file.type);
          sinon.stub(handler, 'getConcurrentLimits').returns({ maxConcurrentChunks: 1 });
          sinon.stub(handler, 'chunkPdf').resolves({ failedFiles: new Set(), attemptMap: new Map() });
          sinon.stub(handler, 'verifyContent').resolves(true);
          await handler.uploadSingleFile(file, {});
          const options = binder.getRedirectUrl.firstCall.args[0];
          expect(options.targetProduct).to.equal('acrobat');
          expect(options.payload.verb).to.equal('resume-builder');
          if (choice === 'sharpen') expect(options.payload.variationId).to.equal('sharpen');
          else expect(options.payload).not.to.have.property('variationId');
        });
      });
    });

    it('preserves experiment routing for control', async () => {
      const options = { payload: { verb: 'resume-builder' } };
      await binder.handleRedirect(options, {});
      expect(options.payload.variationId).to.equal('experiment');
    });

    it('preserves experiment routing for signed-in users', async () => {
      binder.signedOut = false;
      binder.resumeForkChoice = 'sharpen';
      const options = { payload: { verb: 'resume-builder' } };
      await binder.handleRedirect(options, {});
      expect(options.payload.variationId).to.equal('experiment');
    });
  });
});
