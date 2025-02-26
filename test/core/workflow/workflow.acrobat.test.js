/* eslint-disable quote-props */
/* eslint-disable quotes */
import sinon from 'sinon';
import { readFile } from '@web/test-runner-commands';
import { expect } from '@esm-bundle/chai';

window.adobeIMS = {
  getAccessToken: () => 'token',
  adobeid: { locale: 'en' },
};
const { default: init } = await import('../../../unitylibs/blocks/unity/unity.js');
document.body.innerHTML = await readFile({ path: './mocks/ps-body.html' });
describe('Unity PS Block', () => {
  before(async () => {
    const unityElement = document.querySelector('.unity');
    await init(unityElement);
  });

  it('Unity PS block should be loaded', async () => {
    const unityWidget = document.querySelector('.unity-widget');
    expect(unityWidget).to.exist;
  });

  it('Test actions', async () => {
    const fetchStub = sinon.stub(window, 'fetch');
    fetchStub.callsFake(async (url) => {
      let payload = {};
      if (url.includes('PhotoshopRemoveBackground')) {
        payload = { assetId: 'testid', outputUrl: 'http://localhost:2000/test/assets/media_.jpeg?width=2000&format=webply&optimize=medium' };
      } else if (url.includes('asset')) {
        payload = { id: 'testid', href: 'http://localhost:2000/test/assets/media_.jpeg?width=2000&format=webply&optimize=medium' };
      } else if (url.includes('PhotoshopChangeBackground')) {
        payload = { assetId: 'testid', outputUrl: 'http://localhost:2000/test/assets/media_.jpeg?width=2000&format=webply&optimize=medium' };
      } else if (url.includes('finalize')) {
        payload = {};
      }
      return Promise.resolve({
        json: async () => payload,
        status: 200,
        ok: true,
      });
    });
    document.querySelector('.removebg-button').click();
    setTimeout(() => {
      document.querySelector('.changebg-option').click();
    }, 500);
    setTimeout(() => {
      fetchStub.restore();
    }, 2000);
  });
});
