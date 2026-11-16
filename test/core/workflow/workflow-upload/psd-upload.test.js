import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { readFile } from '@web/test-runner-commands';
import { setUnityLibs } from '../../../../unitylibs/scripts/utils.js';

setUnityLibs('/unitylibs');

const { default: ActionBinder } = await import('../../../../unitylibs/core/workflow/workflow-upload/action-binder.js');
const { _defaults: targetCfg } = JSON.parse(await readFile({ path: '../../../../unitylibs/core/workflow/workflow-upload/target-config.json' }));
const PSD_TYPE = 'image/vnd.adobe.photoshop';
const PSD_SIZE_LIMIT = targetCfg['limits-photoshop'].maxFileSizeByType[PSD_TYPE];

function makePsdFile({ name = 'document.psd', type = PSD_TYPE, width = 6000, height = 4000 } = {}) {
  const header = new ArrayBuffer(26);
  const view = new DataView(header);
  view.setUint32(0, 0x38425053);
  view.setUint16(4, 1);
  view.setUint16(12, 3);
  view.setUint32(14, height);
  view.setUint32(18, width);
  view.setUint16(22, 8);
  view.setUint16(24, 3);
  return new File([header, 'original layer data'], name, { type, lastModified: 123456789 });
}

describe('Photoshop PSD upload', () => {
  let binder;
  let unityEl;
  let uploadAsset;
  let continueInApp;
  let showErrorToast;

  beforeEach(() => {
    document.body.innerHTML = '<div class="unity"></div>';
    unityEl = document.querySelector('.unity');
    unityEl.innerHTML = '<ul><li><span class="icon-error-filesize-psd"></span>Authored PSD size error</li></ul>';
    binder = new ActionBinder(unityEl, {
      productName: 'photoshop',
      supportedFeatures: new Set(['tbd']),
      targetCfg: { ...targetCfg, showSplashScreen: false, sendSplunkAnalytics: false },
    }, unityEl, [unityEl]);
    showErrorToast = sinon.spy();
    binder.serviceHandler = { showErrorToast };
    binder.errorToastEl = document.createElement('div');
    binder.transitionScreen = {
      showSplashScreen: sinon.stub().resolves(),
      updateProgressBar: sinon.stub(),
    };
    uploadAsset = sinon.stub(binder, 'uploadAsset').resolves(true);
    continueInApp = sinon.stub(binder, 'continueInApp').resolves();
  });

  afterEach(() => {
    sinon.restore();
    document.body.innerHTML = '';
    window.location.hash = '';
  });

  const devices = [
    { name: 'Windows desktop', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Windows', mobile: false, desktop: true },
    { name: 'macOS desktop', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'macOS', mobile: false, desktop: true },
    { name: 'Linux desktop', userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', platform: 'Linux', mobile: false, desktop: true },
    { name: 'touchscreen Windows laptop', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Windows', mobile: false, maxTouchPoints: 10, desktop: true },
    { name: 'iPhone', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', platform: 'iOS', mobile: true, maxTouchPoints: 5, desktop: false },
    { name: 'Android phone', userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile', platform: 'Android', mobile: true, maxTouchPoints: 5, desktop: false },
    { name: 'Android tablet', userAgent: 'Mozilla/5.0 (Linux; Android 14; Tablet)', platform: 'Android', mobile: false, maxTouchPoints: 10, desktop: false },
    { name: 'iPad desktop mode', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'macOS', mobile: false, maxTouchPoints: 5, desktop: false },
    { name: 'Windows tablet', userAgent: 'Mozilla/5.0 (Windows NT 10.0; ARM; Touch)', platform: 'Windows', mobile: false, maxTouchPoints: 10, desktop: false },
    { name: 'unknown device', userAgent: 'UnknownDevice', platform: 'unknown', mobile: false, desktop: false },
  ];
  const nonDesktopDevice = devices.find(({ name }) => name === 'iPad desktop mode');

  function useDevice({ userAgent, platform, mobile, maxTouchPoints = 0 }) {
    sinon.stub(navigator, 'userAgent').get(() => userAgent);
    sinon.stub(navigator, 'userAgentData').get(() => ({ platform, mobile }));
    sinon.stub(navigator, 'maxTouchPoints').get(() => maxTouchPoints);
    const previousBinder = binder;
    binder = new ActionBinder(unityEl, previousBinder.workflowCfg, unityEl, [unityEl]);
    binder.serviceHandler = previousBinder.serviceHandler;
    binder.errorToastEl = previousBinder.errorToastEl;
    binder.transitionScreen = previousBinder.transitionScreen;
    uploadAsset = sinon.stub(binder, 'uploadAsset').resolves(true);
    continueInApp = sinon.stub(binder, 'continueInApp').resolves();
  }

  devices.forEach((device) => {
    it(`should expose PSD only on desktop for ${device.name}`, async () => {
      useDevice(device);
      const expectedTypes = ['image/jpeg', 'image/png', 'image/jpg', ...(device.desktop ? [PSD_TYPE] : [])];
      expect(binder.limits.allowedFileTypes).to.deep.equal(expectedTypes);
      expect(binder.limits.maxFileSize).to.equal(40000000);
      expect(targetCfg['limits-photoshop'].allowedFileTypes).to.include(PSD_TYPE);
      unityEl.innerHTML = '<input type="file" id="file-upload">';
      await binder.initActionListeners(unityEl, { '#file-upload': 'upload' });
      expect(unityEl.querySelector('input').accept.split(','))
        .to.deep.equal([...expectedTypes, ...(device.desktop ? ['.psd'] : [])]);
      await binder.uploadFile([makePsdFile()]);
      expect(uploadAsset.calledOnce).to.equal(device.desktop);
      expect(continueInApp.calledOnce).to.equal(device.desktop);
    });
  });

  [PSD_TYPE, '', 'application/octet-stream', 'image/x-photoshop', 'image/jpeg', 'image/png'].forEach((type) => {
    it(`should reject PSD on non-desktop with MIME "${type}" before uploading`, async () => {
      useDevice(nonDesktopDevice);
      await binder.uploadFile([makePsdFile({ name: 'document.PSD', type })]);
      expect(uploadAsset.called).to.be.false;
      expect(continueInApp.called).to.be.false;
      expect(showErrorToast.calledOnce).to.be.true;
      expect(showErrorToast.firstCall.args[0]).to.include({
        errorType: '.icon-error-filetype',
        errorCode: 'error-filetype',
      });
    });
  });

  ['image/jpeg', 'image/jpg', 'image/png'].forEach((type) => {
    it(`should retain uploads and the 40 MB boundary for ${type} on non-desktop`, async () => {
      useDevice(nonDesktopDevice);
      const file = new File(['image data'], 'image', { type });
      const sizeStub = sinon.stub(file, 'size').get(() => 40000000);
      await binder.uploadFile([file]);
      expect(uploadAsset.calledOnceWithExactly(file)).to.be.true;
      sizeStub.get(() => 40000001);
      await binder.uploadFile([file]);
      expect(uploadAsset.calledOnce).to.be.true;
      expect(showErrorToast.firstCall.args[0]).to.include({
        errorType: '.icon-error-filesize',
        errorCode: 'error-filesize',
      });
    });
  });

  ['picker', 'drop'].forEach((method) => {
    it(`should block PSD through the non-desktop ${method} event path`, async () => {
      useDevice(nonDesktopDevice);
      unityEl.innerHTML = '<div class="drop-zone"></div><input type="file" id="file-upload">';
      await binder.initActionListeners(unityEl, { '#file-upload': 'upload', '.drop-zone': 'upload' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(makePsdFile({ name: 'document.PSD', type: '' }));
      const finished = new Promise((resolve) => {
        sinon.stub(binder.serviceHandler, 'showErrorToast').callsFake(resolve);
      });
      if (method === 'picker') {
        const input = unityEl.querySelector('input');
        input.files = dataTransfer.files;
        input.dispatchEvent(new Event('change'));
      } else {
        unityEl.querySelector('.drop-zone').dispatchEvent(new DragEvent('drop', { dataTransfer }));
      }
      const errorOptions = await finished;
      expect(errorOptions.errorType).to.equal('.icon-error-filetype');
      expect(uploadAsset.called).to.be.false;
      expect(continueInApp.called).to.be.false;
    });
  });

  it('should configure PSD for Photoshop without changing JPEG and PNG limits', () => {
    expect(binder.limits.allowedFileTypes).to.include(PSD_TYPE);
    expect(binder.limits.maxFileSize).to.equal(40000000);
    expect(binder.limits.maxFileSizeByType[PSD_TYPE]).to.equal(1073741824);
    expect(binder.limits.maxWidth).to.equal(8000);
    expect(binder.limits.maxHeight).to.equal(8000);
    expect(binder.limits.maxNumFiles).to.equal(1);
  });

  [
    { type: PSD_TYPE, name: 'document.psd' },
    { type: '', name: 'document.psd' },
    { type: '', name: 'document.PSD' },
    { type: '', name: 'document.PsD' },
    { type: 'application/octet-stream', name: 'document.psd' },
    { type: 'image/x-photoshop', name: 'document.psd' },
    { type: 'application/x-photoshop', name: 'document.psd' },
    { type: 'image/photoshop', name: 'document.psd' },
  ].forEach(({ type, name }) => {
    it(`should normalize ${name} with MIME "${type}" and preserve its bytes`, async () => {
      const file = makePsdFile({ type, name });
      await binder.uploadFile([file]);
      expect(uploadAsset.calledOnce).to.be.true;
      const uploadedFile = uploadAsset.firstCall.args[0];
      expect(uploadedFile.type).to.equal(PSD_TYPE);
      expect(uploadedFile.name).to.equal(name);
      expect(uploadedFile.lastModified).to.equal(file.lastModified);
      expect(new Uint8Array(await uploadedFile.arrayBuffer()))
        .to.deep.equal(new Uint8Array(await file.arrayBuffer()));
      expect(continueInApp.firstCall.args[1]).to.equal(uploadedFile);
      expect(binder.filesData).to.include({ type: PSD_TYPE, width: 6000, height: 4000 });
    });
  });

  [500000001, 999999999, 1000000000, PSD_SIZE_LIMIT - 1, PSD_SIZE_LIMIT].forEach((size) => {
    it(`should allow a PSD of ${size} bytes`, async () => {
      const file = makePsdFile();
      sinon.stub(file, 'size').get(() => size);
      await binder.uploadFile([file]);
      expect(uploadAsset.calledOnceWithExactly(file)).to.be.true;
    });
  });

  [
    { type: PSD_TYPE, name: 'document.psd' },
    { type: '', name: 'document.PSD' },
    { type: 'application/octet-stream', name: 'document.PsD' },
  ].forEach(({ type, name }) => {
    it(`should select the PSD size error above the configured limit for ${name} with MIME "${type}"`, async () => {
      const file = makePsdFile({ type, name });
      sinon.stub(Blob.prototype, 'size').get(() => PSD_SIZE_LIMIT + 1);
      await binder.uploadFile([file]);
      expect(uploadAsset.called).to.be.false;
      expect(continueInApp.called).to.be.false;
      expect(showErrorToast.calledOnce).to.be.true;
      expect(showErrorToast.firstCall.args[0]).to.include({
        errorType: '.icon-error-filesize-psd',
        errorCode: 'error-filesize',
      });
    });
  });

  it('should allow a PSD at the 8000-pixel dimension boundary', async () => {
    await binder.uploadFile([makePsdFile({ width: 8000, height: 8000 })]);
    expect(uploadAsset.calledOnce).to.be.true;
    expect(binder.filesData).to.include({ width: 8000, height: 8000 });
  });

  [{ width: 8001 }, { height: 8001 }].forEach((dimensions) => {
    it(`should reject PSD dimensions ${JSON.stringify(dimensions)}`, async () => {
      await binder.uploadFile([makePsdFile(dimensions)]);
      expect(uploadAsset.called).to.be.false;
      expect(showErrorToast.firstCall.args[0].errorCode).to.equal('error-filedimension');
    });
  });

  [
    new File(['not a PSD'], 'renamed.psd', { type: '' }),
    new File([new Uint8Array(26)], 'invalid.psd', { type: PSD_TYPE }),
  ].forEach((file) => {
    it(`should reject ${file.name} rather than bypassing PSD validation`, async () => {
      await binder.uploadFile([file]);
      expect(uploadAsset.called).to.be.false;
      expect(continueInApp.called).to.be.false;
      expect(showErrorToast.firstCall.args[0].errorCode).to.equal('error-filetype');
    });
  });

  it('should reject PSB even when renamed to PSD', async () => {
    const file = makePsdFile();
    const buffer = await file.arrayBuffer();
    new DataView(buffer).setUint16(4, 2);
    await binder.uploadFile([new File([buffer], 'renamed.psd', { type: PSD_TYPE })]);
    expect(uploadAsset.called).to.be.false;
    expect(showErrorToast.firstCall.args[0].errorCode).to.equal('error-filetype');
  });

  it('should reject multiple PSD files', async () => {
    await binder.uploadFile([makePsdFile(), makePsdFile()]);
    expect(uploadAsset.called).to.be.false;
    expect(showErrorToast.firstCall.args[0].errorCode).to.equal('error-filecount');
  });

  ['image/jpeg', 'image/jpg', 'image/png'].forEach((type) => {
    it(`should retain the 40 MB size boundary for ${type}`, async () => {
      const file = new File(['image data'], 'image', { type });
      sinon.stub(file, 'size').get(() => 40000000);
      await binder.uploadFile([file]);
      expect(uploadAsset.calledOnceWithExactly(file)).to.be.true;
    });

    it(`should reject ${type} one byte above 40 MB`, async () => {
      const file = new File(['image data'], 'image', { type });
      sinon.stub(file, 'size').get(() => 40000001);
      await binder.uploadFile([file]);
      expect(uploadAsset.called).to.be.false;
      expect(showErrorToast.firstCall.args[0]).to.include({
        errorType: '.icon-error-filesize',
        errorCode: 'error-filesize',
      });
    });
  });

  [
    { type: PSD_TYPE, size: PSD_SIZE_LIMIT + 1, message: 'Authored PSD size error' },
    { type: PSD_TYPE, size: PSD_SIZE_LIMIT + 1, message: 'Authored image size error', psdMessage: null },
    { type: PSD_TYPE, size: PSD_SIZE_LIMIT + 1, message: 'Authored image size error', psdMessage: ' ' },
    { type: 'image/jpeg', size: 40000001, message: 'Authored image size error' },
    { type: 'image/png', size: 40000001, message: 'Authored image size error' },
  ].forEach(({ type, size, message, psdMessage = 'Authored PSD size error' }) => {
    it(`should display the authored size error for ${type} with PSD message ${JSON.stringify(psdMessage)}`, async () => {
      const psdErrorItem = psdMessage === null ? '' : `<li><span class="icon-error-filesize-psd"></span>${psdMessage}</li>`;
      unityEl.innerHTML = `
        <ul>
          <li><span class="icon-error-filesize"></span>Authored image size error</li>
          ${psdErrorItem}
        </ul>
        <div class="alert-holder">
          <button class="alert-close">Close</button>
          <div class="alert-text"><p></p></div>
        </div>`;
      await binder.initActionListeners();
      const file = type === PSD_TYPE ? makePsdFile() : new File(['image data'], 'image', { type });
      sinon.stub(file, 'size').get(() => size);
      await binder.uploadFile([file]);
      expect(unityEl.querySelector('.alert-text p').innerText).to.equal(message);
      expect(unityEl.querySelector('.alert-holder').classList.contains('show')).to.be.true;
      expect(uploadAsset.called).to.be.false;
      expect(continueInApp.called).to.be.false;
    });
  });

  ['lightroom', 'firefly'].forEach((productName) => {
    it(`should not enable PSD or increase limits for ${productName}`, async () => {
      const otherBinder = new ActionBinder(unityEl, { productName, targetCfg, supportedFeatures: new Set(['tbd']) }, unityEl, [unityEl]);
      otherBinder.serviceHandler = { showErrorToast };
      const otherUpload = sinon.stub(otherBinder, 'uploadAsset');
      await otherBinder.uploadFile([makePsdFile({ type: '' })]);
      expect(otherBinder.limits.allowedFileTypes).not.to.include(PSD_TYPE);
      expect(otherBinder.limits.maxFileSizeByType).to.be.undefined;
      expect(otherUpload.called).to.be.false;
      expect(showErrorToast.firstCall.args[0].errorCode).to.equal('error-filetype');
    });
  });

  it('should not enable PSD when feature limits override Photoshop limits', async () => {
    const videoBinder = new ActionBinder(unityEl, { productName: 'photoshop', targetCfg, supportedFeatures: new Set(['upload-video']) }, unityEl, [unityEl]);
    videoBinder.serviceHandler = { showErrorToast };
    const videoUpload = sinon.stub(videoBinder, 'uploadAsset');
    await videoBinder.uploadFile([makePsdFile()]);
    expect(videoBinder.limits.maxFileSize).to.equal(200000000);
    expect(videoBinder.limits.allowedFileTypes).not.to.include(PSD_TYPE);
    expect(videoUpload.called).to.be.false;
  });

  ['picker', 'drop'].forEach((method) => {
    it(`should upload PSD through the ${method} event path`, async () => {
      unityEl.innerHTML = '<div class="drop-zone"></div><input type="file" id="file-upload">';
      await binder.initActionListeners(unityEl, { '#file-upload': 'upload', '.drop-zone': 'upload' });
      const input = unityEl.querySelector('input');
      expect(input.accept.split(',')).to.include(PSD_TYPE);
      expect(input.accept.split(',')).to.include('.psd');
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(makePsdFile({ name: 'document.PSD', type: '' }));
      const finished = new Promise((resolve) => {
        continueInApp.callsFake(resolve);
      });
      if (method === 'picker') {
        input.files = dataTransfer.files;
        input.dispatchEvent(new Event('change'));
      } else {
        unityEl.querySelector('.drop-zone').dispatchEvent(new DragEvent('drop', { dataTransfer }));
      }
      await finished;
      expect(uploadAsset.calledOnce).to.be.true;
      expect(uploadAsset.firstCall.args[0].type).to.equal(PSD_TYPE);
    });
  });

  it('should send the normalized PSD MIME to asset creation and storage upload', async () => {
    uploadAsset.restore();
    const postCallToService = sinon.stub().resolves({ id: 'psd-asset', href: 'https://storage.example/psd' });
    binder.serviceHandler.postCallToService = postCallToService;
    sinon.stub(binder, 'scanImgForSafety').resolves();
    const fetchStub = sinon.stub(window, 'fetch').resolves({ status: 200 });
    await binder.uploadFile([makePsdFile({ type: '' })]);
    const assetDetails = JSON.parse(postCallToService.firstCall.args[1].body);
    expect(assetDetails).to.include({ format: PSD_TYPE, targetProduct: 'photoshop' });
    expect(fetchStub.firstCall.args[1].headers['Content-Type']).to.equal(PSD_TYPE);
    expect(fetchStub.firstCall.args[1].body.type).to.equal(PSD_TYPE);
    expect(continueInApp.firstCall.args[1].type).to.equal(PSD_TYPE);
  });

  it('should send the normalized PSD MIME to the Photoshop connector', async () => {
    continueInApp.restore();
    binder.assetId = 'psd-asset';
    const postCallToService = sinon.stub().resolves({ url: '#psd-upload-test' });
    binder.serviceHandler.postCallToService = postCallToService;
    await binder.uploadFile([makePsdFile({ type: '' })]);
    const request = JSON.parse(postCallToService.firstCall.args[1].body);
    expect(request.assetId).to.equal('psd-asset');
    expect(request.targetProduct).to.equal('photoshop');
    expect(request.payload.type).to.equal(PSD_TYPE);
  });
});
