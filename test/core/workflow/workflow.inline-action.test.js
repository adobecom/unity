import { readFile } from '@web/test-runner-commands';
import { expect } from '@esm-bundle/chai';
import { parseInlineAuthoring } from '../../../../unitylibs/core/widgets/inline-action/inline-action.js';

window.adobeIMS = {
  getAccessToken: () => ({ token: 'token', expire: { valueOf: () => Date.now() + 3600000 } }),
  refreshToken: async () => ({ token: { token: 'token', isGuestToken: true } }),
};

describe('Inline Action workflow', () => {
  it('parses authoring metadata', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/inline-action-body.html' });
    const unityEl = document.querySelector('.unity.workflow-inline-action');
    const meta = parseInlineAuthoring(unityEl);
    expect(meta.uploadLabel).to.include('Upload your image');
    expect(meta.uploadIconHref).to.include('s2-icon-upload');
    expect(meta.uploadIconHref).to.not.include('terms.html');
    expect(meta.dragHint).to.equal('Or drag and drop here');
    expect(meta.fileLimit).to.include('JPEG');
    expect(meta.legalHtml).to.include('Terms of Use');
    expect(meta.operation).to.equal('removeBackground');
    expect(meta.nbaCards).to.have.length(2);
    expect(meta.nbaCards[0].nba).to.equal('upscale');
    expect(meta.nbaCards[0].label).to.equal('Upscale');
    expect(meta.nbaCards[0].defaultPrompt).to.equal('Prompt');
    expect(meta.nbaHeading).to.equal('Do more with this image.');
  });

  it('parses production-style HTML (3 viewport blocks + 4 NBA cards)', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/inline-action-authored.html' });
    const unityEl = document.querySelector('.unity.workflow-inline-action');
    const meta = parseInlineAuthoring(unityEl);
    expect(meta.uploadIconHref).to.equal('/cc-shared/assets/svg/s2-icon-upload-20-n.svg');
    expect(meta.uploadLabel).to.equal('Upload your image');
    expect(meta.fileLimit).to.include('100MB');
    expect(meta.legalHtml).to.include('Terms of Use');
    expect(meta.downloadLabel).to.equal('Download');
    expect(meta.downloadIconHref).to.equal('/creativecloud/animation/testdoc/unity/generate.svg');
    expect(meta.editIconHref).to.equal('/creativecloud/animation/testdoc/unity/generate.svg');
    expect(meta.editLabel).to.include('Edit in Firefly');
    expect(meta.nbaCards).to.have.length(4);
    expect(meta.nbaCards[0].nba).to.equal('upscale');
    expect(meta.nbaCards[2].nba).to.equal('generate-new-bg');
    expect(meta.nbaCards[2].label).to.equal('Generate new background');
    expect(meta.nbaCards[2].defaultPrompt).to.equal('Generate prompt');
    expect(['Or tap here', 'Or drag and drop here']).to.include(meta.dragHint);
    expect(meta.heroSrc).to.match(/media_(mobile|tablet|desktop)/);
  });

  it('parses split upload paragraphs (icon row + label row)', () => {
    document.body.innerHTML = `
      <div class="unity workflow-inline-action widget-inline-action">
        <div><div>
          <p><picture><img src="/hero.jpg" alt=""></picture></p>
          <p><a href="/cc-shared/assets/svg/s2-icon-upload-20-n.svg">icon</a> Upload your image</p>
          <p>Or drag and drop here</p>
          <p>File must be JPEG(JPG), PNG, or WEBP and up to 100MB.</p>
          <p>Adobe <a href="https://www.adobe.com/legal/terms.html">Terms of Use</a></p>
        </div></div>
      </div>`;
    const meta = parseInlineAuthoring(document.querySelector('.unity'));
    expect(meta.uploadIconHref).to.include('s2-icon-upload');
    expect(meta.uploadLabel).to.equal('Upload your image');
    expect(meta.dragHint).to.equal('Or drag and drop here');
    expect(meta.fileLimit).to.include('100MB');
    expect(meta.legalHtml).to.include('Terms of Use');
  });

  it('uses desktop column when three viewport divs are section children', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/inline-action-three-columns.html' });
    const meta = parseInlineAuthoring(document.querySelector('.unity'));
    expect(['Or tap here', 'Or drag and drop here']).to.include(meta.dragHint);
    expect(meta.fileLimit).to.match(/Limits (mobile|tablet|desktop)/);
  });

  it('initializes widget and action binder', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/inline-action-body.html' });
    const { default: init } = await import('../../../../unitylibs/blocks/unity/unity.js');
    const unityEl = document.querySelector('.unity.workflow-inline-action');
    await init(unityEl);
    const host = document.querySelector('.unity-inline-action.unity-enabled');
    expect(host).to.exist;
    expect(host.nextElementSibling?.classList.contains('unity-inline-action-host')).to.be.true;
    expect(document.querySelector('.ia-widget')).to.exist;
    expect(document.querySelector('.drop-zone-container')).to.exist;
    expect(document.querySelector('.drop-zone.ia-dropzone')).to.exist;
    expect(document.querySelector('.upload-action-container .action-button')).to.exist;
    expect(document.querySelector('.drop-zone-default-icon img')).to.exist;
    expect(document.querySelector('.upload-action-container .action-button picture img')).to.exist;
    expect(document.querySelectorAll('.ia-nba-card')).to.have.length(2);
    expect(document.querySelector('.ia-widget').dataset.state).to.equal('initial');
  });
});
