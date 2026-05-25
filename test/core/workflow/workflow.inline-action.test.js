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
    expect(meta.operation).to.equal('removeBackground');
    expect(meta.nbaCards).to.have.length(2);
    expect(meta.nbaCards[0].nba).to.equal('upscale');
    expect(meta.nbaCards[0].label).to.equal('Upscale');
    expect(meta.nbaCards[0].defaultPrompt).to.equal('Prompt');
    expect(meta.nbaHeading).to.equal('Do more with this image.');
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
    expect(document.querySelector('.ia-dropzone')).to.exist;
    expect(document.querySelectorAll('.ia-nba-card')).to.have.length(2);
    expect(document.querySelector('.ia-widget').dataset.state).to.equal('initial');
  });
});
