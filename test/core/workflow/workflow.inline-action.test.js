import { expect } from '@esm-bundle/chai';
import {
  parseInlineAuthoring, extractHeroMedia, InlineActionState,
} from '../../../../unitylibs/core/widgets/inline-action/inline-action.js';
import inlineActionBody from './mocks/inline-action-body.js';
import inlineActionAuthored from './mocks/inline-action-authored.js';
import inlineActionThreeColumns from './mocks/inline-action-three-columns.js';

window.adobeIMS = {
  getAccessToken: () => ({ token: 'token', expire: { valueOf: () => Date.now() + 3600000 } }),
  refreshToken: async () => ({ token: { token: 'token', isGuestToken: true } }),
};

describe('Inline Action workflow', () => {
  it('parses authoring metadata', async () => {
    document.body.innerHTML = inlineActionBody;
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
    expect(meta.loadingText).to.equal('Uploading image, loading remove background');
  });

  it('parses production-style HTML (3 viewport blocks + 4 NBA cards)', async () => {
    document.body.innerHTML = inlineActionAuthored;
    const unityEl = document.querySelector('.unity.workflow-inline-action');
    const meta = parseInlineAuthoring(unityEl);
    expect(meta.uploadIconHref).to.equal('/cc-shared/assets/svg/s2-icon-upload-20-n.svg');
    expect(meta.uploadLabel).to.equal('Upload your image');
    expect(meta.fileLimit).to.include('100MB');
    expect(meta.legalHtml).to.include('Terms of Use');
    expect(meta.downloadLabel).to.equal('Download');
    expect(meta.downloadIconHref).to.equal('/creativecloud/animation/testdoc/unity/generate.svg');
    expect(meta.editIconHref).to.equal('/creativecloud/animation/testdoc/unity/generate.svg');
    expect(meta.editLabel).to.equal('Edit in Firefly');
    expect(meta.nbaCards).to.have.length(4);
    expect(meta.nbaCards[0].nba).to.equal('upscale');
    expect(meta.nbaCards[2].nba).to.equal('generate-new-bg');
    expect(meta.nbaCards[2].label).to.equal('Generate new background');
    expect(meta.nbaCards[2].defaultPrompt).to.equal('Generate prompt');
    expect(['Or tap here', 'Or drag and drop here']).to.include(meta.dragHint);
  });

  it('parses config icon href from img when anchor is absent', () => {
    document.body.innerHTML = `
      <div class="unity workflow-inline-action widget-inline-action">
        <div><div><ul>
          <li><span class="icon icon-download"></span><img src="/cc-shared/assets/svg/s2-icon-download-20-w.svg" alt="">Download</li>
          <li><span class="icon icon-aiPhotoEditor"></span><img src="/cc-shared/assets/svg/s2-icon-edit-20-w.svg" alt=""> Edit in Firefly</li>
        </ul></div></div>
      </div>`;
    const meta = parseInlineAuthoring(document.querySelector('.unity'));
    expect(meta.downloadIconHref).to.equal('/cc-shared/assets/svg/s2-icon-download-20-w.svg');
    expect(meta.editIconHref).to.equal('/cc-shared/assets/svg/s2-icon-edit-20-w.svg');
    expect(meta.downloadLabel).to.equal('Download');
    expect(meta.editLabel).to.equal('Edit in Firefly');
  });

  it('ignores video-container svg imgs when parsing upload icon href', () => {
    document.body.innerHTML = `
      <div class="unity workflow-inline-action widget-inline-action">
        <div><div>
          <p>
            <div class="video-container video-holder">
              <img class="accessibility-control pause-icon" src="/federal/assets/svgs/accessibility-pause.svg" alt="">
            </div>
            <img src="/cc-shared/assets/svg/s2-icon-upload-20-n.svg" alt=""> Upload your image
          </p>
          <p>Or drag and drop here</p>
          <p>Limits apply.</p>
          <p>Terms</p>
        </div></div>
      </div>`;
    const meta = parseInlineAuthoring(document.querySelector('.unity'));
    expect(meta.uploadIconHref).to.equal('/cc-shared/assets/svg/s2-icon-upload-20-n.svg');
  });

  it('parses reupload icon href from config icon-share row', () => {
    document.body.innerHTML = `
      <div class="unity workflow-inline-action widget-inline-action">
        <div><div>
          <p><a href="/cc-shared/assets/svg/s2-icon-upload-20-n.svg">icon</a> Upload your image</p>
          <p>Or drag and drop here</p>
          <p>Limits apply.</p>
          <p>Terms</p>
        </div></div>
        <div><div><ul>
          <li><span class="icon icon-share"></span><img src="/cc-shared/assets/svg/s2-icon-upload-20-w.svg" alt=""></li>
          <li><span class="icon icon-operation-removeBackground"></span></li>
        </ul></div></div>
      </div>`;
    const meta = parseInlineAuthoring(document.querySelector('.unity'));
    expect(meta.uploadIconHref).to.equal('/cc-shared/assets/svg/s2-icon-upload-20-n.svg');
    expect(meta.reuploadIconHref).to.equal('/cc-shared/assets/svg/s2-icon-upload-20-w.svg');
  });

  it('parses upload icon href from img in upload paragraph', () => {
    document.body.innerHTML = `
      <div class="unity workflow-inline-action widget-inline-action">
        <div><div>
          <p><img src="/cc-shared/assets/svg/s2-icon-upload-20-w.svg" alt=""> Upload your image</p>
          <p>Or drag and drop here</p>
          <p>Limits apply.</p>
          <p>Terms</p>
        </div></div>
      </div>`;
    const meta = parseInlineAuthoring(document.querySelector('.unity'));
    expect(meta.uploadIconHref).to.equal('/cc-shared/assets/svg/s2-icon-upload-20-w.svg');
    expect(meta.uploadLabel).to.equal('Upload your image');
  });

  it('parses icon-aiPhotoEditor label and icon href from config li', () => {
    document.body.innerHTML = `
      <div class="unity workflow-inline-action widget-inline-action">
        <div><div><ul>
          <li><span class="icon icon-aiPhotoEditor"></span><a href="/creativecloud/animation/testdoc/unity/generate.svg">https://main--cc--adobecom.aem.live/creativecloud/animation/testdoc/unity/generate.svg</a> Edit in Firefly</li>
        </ul></div></div>
      </div>`;
    const meta = parseInlineAuthoring(document.querySelector('.unity'));
    expect(meta.editLabel).to.equal('Edit in Firefly');
    expect(meta.editIconHref).to.equal('/creativecloud/animation/testdoc/unity/generate.svg');
  });

  it('parses upload copy when hero is video-container', () => {
    document.body.innerHTML = `
      <div class="unity workflow-inline-action widget-inline-action">
        <div><div>
          <p>
            <div class="video-container video-holder">
              <video autoplay muted loop playsinline poster="./media_hero.jpg?width=750&amp;format=jpg">
                <source src="/cc-shared/assets/firefly/video/remove-background/media_1aa46b3e0b7d35da63fe79f69a542763329c1d626.mp4" type="video/mp4">
              </video>
              <a class="pause-play-wrapper" href="#">
                <div class="offset-filler">
                  <img class="accessibility-control pause-icon" src="/federal/assets/svgs/accessibility-pause.svg" alt="">
                  <img class="accessibility-control play-icon" src="/federal/assets/svgs/accessibility-play.svg" alt="">
                </div>
              </a>
            </div>
            <a href="/cc-shared/assets/svg/s2-icon-upload-20-n.svg">icon</a> Upload your image
          </p>
          <p>Or drag and drop here</p>
          <p>File must be JPEG(JPG), PNG, or WEBP and up to 100MB.</p>
          <p>Adobe <a href="https://www.adobe.com/legal/terms.html">Terms of Use</a></p>
        </div></div>
      </div>`;
    const vp = document.querySelector('.unity > div > div');
    const meta = parseInlineAuthoring(document.querySelector('.unity'));
    expect(meta.uploadIconHref).to.equal('/cc-shared/assets/svg/s2-icon-upload-20-n.svg');
    expect(meta.uploadLabel).to.equal('Upload your image');
    expect(extractHeroMedia(vp).querySelector('.video-container video')).to.exist;
  });

  it('moves authored picture or video-container into ia-preview', () => {
    document.body.innerHTML = `
      <div class="unity workflow-inline-action widget-inline-action">
        <div><div>
          <p><picture><img src="./hero.jpg" alt=""></picture></p>
          <p><a href="/cc-shared/assets/svg/s2-icon-upload-20-n.svg">icon</a> Upload your image</p>
          <p>Or drag and drop here</p>
          <p>Terms</p>
        </div></div>
      </div>`;
    const vp = document.querySelector('.unity > div > div');
    const preview = extractHeroMedia(vp);
    expect(preview.classList.contains('ia-preview')).to.be.true;
    expect(preview.querySelector('picture img')?.getAttribute('src')).to.include('hero.jpg');
    expect(vp.querySelector('picture')).to.not.exist;
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
    document.body.innerHTML = inlineActionThreeColumns;
    const meta = parseInlineAuthoring(document.querySelector('.unity'));
    expect(['Or tap here', 'Or drag and drop here']).to.include(meta.dragHint);
    expect(meta.fileLimit).to.match(/Limits (mobile|tablet|desktop)/);
  });

  it('fires upload CTA analytics on upload button click', async () => {
    const trackedEvents = [];
    window._satellite = {
      track: (_, data) => trackedEvents.push(data?.data?.web?.webInteraction?.name),
    };
    document.body.innerHTML = inlineActionBody;
    const { default: init } = await import('../../../../unitylibs/blocks/unity/unity.js');
    await init(document.querySelector('.unity.workflow-inline-action'));
    document.querySelector('.upload-action-container .action-button').click();
    expect(trackedEvents).to.include('Upload asset CTA|UnityWidget');
    expect(trackedEvents).to.not.include('Click Drag and drop|UnityWidget');
    delete window._satellite;
  });

  it('fires NBA and download analytics on complete-state CTAs', async () => {
    const trackedEvents = [];
    window._satellite = {
      track: (_, data) => trackedEvents.push(data?.data?.web?.webInteraction?.name),
    };
    document.body.innerHTML = inlineActionBody;
    const { default: init } = await import('../../../../unitylibs/blocks/unity/unity.js');
    await init(document.querySelector('.unity.workflow-inline-action'));
    const widget = document.querySelector('.ia-widget');
    widget.dataset.state = 'complete';
    document.querySelector('.ia-reupload-btn').click();
    document.querySelector('.ia-download-btn').click();
    document.querySelector('.ia-edit-in-firefly').click();
    document.querySelector('.ia-nba-card[data-nba="upscale"]').click();
    await new Promise((resolve) => { setTimeout(resolve, 50); });
    expect(trackedEvents).to.include('Try again|UnityWidget');
    expect(trackedEvents.filter((name) => name === 'Click Drag and drop|UnityWidget')).to.have.length(0);
    expect(trackedEvents).to.include('Download|UnityWidget');
    expect(trackedEvents).to.include('Edit in Firefly|UnityWidget');
    expect(trackedEvents).to.include('Upscale - Do more with|UnityWidget');
    delete window._satellite;
  });

  it('renders hero preview video from authored video-container', async () => {
    const videoUrl = '/cc-shared/assets/firefly/video/hero.mp4';
    document.body.innerHTML = `
      <div class="unity workflow-inline-action widget-inline-action">
        <div><div>
          <p>
            <div class="video-container video-holder">
              <video autoplay muted loop playsinline poster="./hero.jpg">
                <source src="${videoUrl}" type="video/mp4">
              </video>
              <a class="pause-play-wrapper" href="#">
                <img class="accessibility-control pause-icon" src="/federal/assets/svgs/accessibility-pause.svg" alt="">
              </a>
            </div>
            <a href="/cc-shared/assets/svg/s2-icon-upload-20-n.svg">icon</a> Upload your image
          </p>
          <p>Or drag and drop here</p>
          <p>File limits</p>
          <p>Terms</p>
        </div></div>
        <div><div><ul><li><span class="icon icon-operation-removeBackground"></span></li></ul></div></div>
      </div>`;
    const { default: InlineActionWidget } = await import('../../../../unitylibs/core/widgets/inline-action/inline-action.js');
    const widget = new InlineActionWidget(null, document.querySelector('.unity'), { targetCfg: { actionMap: {} } });
    await widget.initWidget();
    const video = document.querySelector('.ia-preview .video-container video');
    expect(video).to.exist;
    expect(video.querySelector('source')?.getAttribute('src')).to.equal(videoUrl);
    expect(document.querySelector('.ia-preview picture')).to.not.exist;
    const uploadIcon = document.querySelector('.upload-action-container .action-button picture img');
    expect(uploadIcon?.getAttribute('src')).to.equal('/cc-shared/assets/svg/s2-icon-upload-20-n.svg');
  });

  it('initializes widget and action binder', async () => {
    document.body.innerHTML = inlineActionBody;
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
    expect(document.querySelector('.drop-zone.ia-dropzone .ia-loading-visible')).to.exist;
    expect(document.querySelector('.ia-dropzone .progress-holder .spectrum-ProgressBar')).to.exist;
    expect(document.querySelectorAll('.ia-nba-card')).to.have.length(2);
    expect(document.querySelector('.ia-edit-in-firefly')).to.exist;
    expect(document.querySelector('.ia-widget').dataset.state).to.equal(InlineActionState.INITIAL);
  });
});
