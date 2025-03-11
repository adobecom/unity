/* eslint-disable quote-props */
/* eslint-disable quotes */
import { readFile } from '@web/test-runner-commands';
import { expect } from '@esm-bundle/chai';

window.adobeIMS = {
  getAccessToken: () => 'token',
  adobeid: { locale: 'en' },
};
const { default: init } = await import('../../../../unitylibs/blocks/unity/unity.js');
document.body.innerHTML = await readFile({ path: '../mocks/exp-body.html' });

describe('Unity Text-To-Image Block', () => {
  before(async () => {
    const unityElement = document.querySelector('.unity');
    await init(unityElement);
  });

  it('Unity Text to image block should be loaded', async () => {
    const unityWidget = document.querySelector('.unity');
    expect(unityWidget).to.exist;
  });
});
