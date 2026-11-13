import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { sendKeys, setViewport } from '@web/test-runner-commands';
import {
  zoomScale, containBox, centeredRect, frameFromDimensions, rawImageEdgesPct,
  imageBoundsPct, resizeRect, rectPctToSourceBounds,
  buildEditorLeftPanel, buildEditorRightPanel, EditorEngine, initEditor,
} from '../../../../unitylibs/core/widgets/inline-action/editor.js';
import { setUnityLibs } from '../../../../unitylibs/scripts/utils.js';

setUnityLibs('/unitylibs');
const engines = new WeakMap();

const cropData = {
  operation: 'crop',
  sliderModes: [{ mode: 'zoom', label: 'Zoom' }],
  aspectRows: [
    { nameId: 'freeform', nameLabel: 'Freeform' },
    { nameId: 'square', nameLabel: 'Square', ratio: '1:1' },
    { groupId: 'more', groupLabel: 'More', nameId: 'landscape', nameLabel: 'Landscape', ratio: '16:9' },
    { groupId: 'more', groupLabel: 'More', nameId: 'seeAll', nameLabel: 'See all' },
  ],
  nbaPills: [{ nba: 'removeBackground', label: 'Remove', iconHref: '' }],
};
const resizeData = {
  operation: 'resize',
  sliderModes: [{ mode: 'zoom', label: 'Zoom' }, { mode: 'quality', label: 'Quality' }],
  aspectRows: [
    { groupId: 'freeform', groupLabel: 'Custom' },
    { groupId: 'standard', groupLabel: 'Standard', ratio: '1:1', nameId: 'square', nameLabel: 'Square' },
    { groupId: 'social', groupLabel: 'Social', platformId: 'instagram', platformLabel: 'Instagram', nameId: 'square', nameLabel: 'Square', width: 1080, height: 1080 },
  ],
  nbaPills: [{ nba: 'cropImage', label: 'Crop', iconHref: '' }],
};

function dataUrl(w = 200, h = 100) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c.toDataURL('image/png');
}

async function makeEngine(data, { quality = false } = {}) {
  const left = buildEditorLeftPanel(data);
  const right = buildEditorRightPanel(data);
  if (quality) {
    right.append(Object.assign(document.createElement('button'), { className: 'ia-editor-quality' }));
  }
  const area = document.createElement('div');
  area.className = 'interactive-area';
  area.append(left, right);
  document.body.append(area);
  const track = sinon.spy();
  const engine = new EditorEngine(left, right, data, track);
  engines.set(area, engine);
  engine.viewportSize = () => [400, 300];
  await engine.setImage(dataUrl(), 2048, true);
  return { engine, area, track, left, right };
}

function cleanup(area) {
  const engine = engines.get(area);
  clearTimeout(engine?.idleTimer);
  clearTimeout(engine?.sizeReadoutTimer);
  if (engine?.qualityPreviewUrl) URL.revokeObjectURL(engine.qualityPreviewUrl);
  area.remove();
  document.querySelectorAll('.ia-more-menu, .ia-social-menu, .ia-unit-menu').forEach((m) => m.remove());
}

describe('Editor styling and layout', () => {
  let stylesheet;
  let widget;
  let originalViewport;

  before(async () => {
    originalViewport = { width: window.innerWidth, height: window.innerHeight };
    stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/unitylibs/core/widgets/inline-action/editor.css';
    await new Promise((resolve, reject) => {
      stylesheet.onload = resolve;
      stylesheet.onerror = reject;
      document.head.append(stylesheet);
    });
  });

  after(async () => {
    stylesheet.remove();
    await setViewport(originalViewport);
  });

  afterEach(() => widget?.remove());

  [375, 768, 1199, 1200, 1440].forEach((viewportWidth) => {
    it(`applies the specified resize dimension control styles at viewport ${viewportWidth}`, async () => {
      await setViewport({ width: viewportWidth, height: 800 });
      widget = document.createElement('div');
      widget.className = 'ia-widget';
      widget.append(buildEditorRightPanel(resizeData));
      document.body.append(widget);
      const inputs = widget.querySelectorAll('.ia-dim-field input');
      expect(inputs.length).to.equal(2);
      const compact = viewportWidth < 1200;
      inputs.forEach((input) => {
        const style = getComputedStyle(input);
        expect(style.width).to.equal(compact ? '62px' : '69px');
        expect(style.boxSizing).to.equal('border-box');
        expect(style.backgroundColor).to.equal('rgb(17, 17, 17)');
        expect(style.color).to.equal('rgb(219, 219, 219)');
        expect(style.borderColor).to.equal('rgb(57, 57, 57)');
        expect(style.borderWidth).to.equal('2px');
        expect(style.borderStyle).to.equal('solid');
        expect(style.borderRadius).to.equal(compact ? '8px' : '9px');
        expect(style.padding).to.equal(compact ? '0px 12px' : '10px 16px');
        expect(style.textAlign).to.equal('right');
        if (compact) {
          expect(style.height).to.equal('32px');
          expect(style.alignSelf).to.equal('stretch');
        }
      });
      const unitStyle = getComputedStyle(widget.querySelector('.ia-dim-unit'));
      expect(unitStyle.height).to.equal(compact ? '32px' : '40px');
      const lockStyle = getComputedStyle(widget.querySelector('.ia-dim-lock'));
      expect(lockStyle.width).to.equal(compact ? '24px' : '34px');
      expect(lockStyle.height).to.equal(compact ? '24px' : '34px');
      if (compact) expect(lockStyle.padding).to.equal('0px');
      const iconStyle = getComputedStyle(widget.querySelector('.ia-dim-lock-icon'));
      expect(iconStyle.width).to.equal('20px');
      expect(iconStyle.height).to.equal('20px');
    });
  });

  [
    { operation: 'crop', mode: 'zoom', value: '10.0x' },
    { operation: 'resize', mode: 'zoom', value: '10.0x' },
    { operation: 'resize', mode: 'quality', value: '100%' },
  ].flatMap((item) => [375, 1440].map((viewportWidth) => ({ ...item, viewportWidth }))).forEach(({ operation, mode, value, viewportWidth }) => {
    it(`keeps the ${operation} ${mode} slider and value inside the bar at viewport ${viewportWidth}`, async () => {
      widget = document.createElement('div');
      widget.className = 'ia-widget';
      widget.dataset.state = 'complete';
      widget.dataset.operation = operation;
      const data = operation === 'crop' ? cropData : resizeData;
      const iconHref = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"/>';
      widget.append(buildEditorLeftPanel({
        ...data,
        sliderModes: data.sliderModes.map((item) => ({ ...item, iconHref })),
      }));
      document.body.append(widget);
      const bar = widget.querySelector('.ia-adjust-bar');
      const slider = bar.querySelector('.ia-slider');
      const readout = bar.querySelector('.ia-val');
      bar.querySelectorAll('.ia-toggle__btn').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.mode === mode);
      });
      slider.value = '100';
      readout.textContent = value;
      await setViewport({ width: viewportWidth, height: 800 });
      const widths = viewportWidth < 1200 ? [180, 200, 205, 220, 240, 280, 307, 320, 375] : [484];
      widths.forEach((width) => {
        widget.style.width = `${width}px`;
        const bounds = bar.getBoundingClientRect();
        expect(bar.scrollWidth, `${viewportWidth}/${width}`).to.be.at.most(bar.clientWidth);
        [bar.querySelector('.ia-toggle'), slider, readout].forEach((element) => {
          const rect = element.getBoundingClientRect();
          expect(rect.left).to.be.at.least(bounds.left);
          expect(rect.right).to.be.at.most(bounds.right);
        });
        const text = document.createRange();
        text.selectNodeContents(readout);
        expect(text.getBoundingClientRect().right).to.be.at.most(bounds.right);
        expect(slider.getBoundingClientRect().width).to.be.at.least(24);
      });
    });
  });
});

describe('editor geometry helpers', () => {
  it('zoomScale maps 0-100 to 1-10', () => {
    expect(zoomScale(0)).to.equal(1);
    expect(zoomScale(50)).to.equal(5.5);
    expect(zoomScale(100)).to.equal(10);
  });

  it('containBox fits the image in the viewport', () => {
    expect(containBox(200, 100, 100, 100)).to.deep.equal({ cs: 0.5, w: 100, h: 50 });
  });

  it('centeredRect uses the image ratio when none is given', () => {
    expect(centeredRect(null, 200, 100, 100, 100)).to.deep.equal({ x: 0, y: 25, w: 100, h: 50 });
  });

  it('centeredRect shrinks width when the ratio is taller than the image', () => {
    expect(centeredRect(1, 200, 100, 100, 100)).to.deep.equal({ x: 25, y: 25, w: 50, h: 50 });
  });

  it('centeredRect keeps full width when the ratio is wider than the box', () => {
    const r = centeredRect(4, 200, 100, 100, 100);
    expect(r.w).to.equal(100);
    expect(r.h).to.equal(25);
  });

  it('frameFromDimensions centers without an anchor', () => {
    expect(frameFromDimensions(100, 50, 200, 100, 100, 100)).to.deep.equal({ x: 25, y: 37.5, w: 50, h: 25 });
  });

  it('frameFromDimensions clamps to the minimum size and to the anchor', () => {
    const r = frameFromDimensions(1, 1, 200, 100, 100, 100, { x: 0, y: 0, w: 20, h: 20 });
    expect(r.w).to.equal(10);
    expect(r.x).to.equal(5);
    expect(r.y).to.be.at.least(0);
  });

  it('rawImageEdgesPct applies pan', () => {
    expect(rawImageEdgesPct(200, 100, 100, 100)).to.deep.equal({ left: 0, top: 25, right: 100, bottom: 75 });
    expect(rawImageEdgesPct(200, 100, 100, 100, 0, 5, 0).left).to.equal(5);
  });

  it('imageBoundsPct clamps edges to the viewport when zoomed', () => {
    expect(imageBoundsPct(200, 100, 100, 100, 100)).to.deep.equal({ left: 0, top: 0, right: 100, bottom: 100 });
  });

  describe('resizeRect', () => {
    const base = { x: 10, y: 10, w: 50, h: 50 };
    it('grows from the east handle', () => {
      expect(resizeRect(base, 'e', 10, 0, null)).to.deep.equal({ x: 10, y: 10, w: 60, h: 50 });
    });
    it('grows from the west handle, anchored on the right edge', () => {
      expect(resizeRect(base, 'w', -10, 0, null)).to.deep.equal({ x: 0, y: 10, w: 60, h: 50 });
    });
    it('enforces the minimum size', () => {
      expect(resizeRect(base, 'e', -100, 0, null).w).to.equal(10);
    });
    it('keeps the ratio on horizontal handles', () => {
      const r = resizeRect(base, 'e', 10, 0, 2);
      expect(r.w).to.equal(60);
      expect(r.h).to.equal(30);
    });
    it('keeps the ratio on vertical handles and scales to the bounds', () => {
      const r = resizeRect(base, 's', 0, 10, 2);
      expect(r.w).to.be.closeTo(90, 0.001);
      expect(r.h).to.be.closeTo(45, 0.001);
    });
    it('scales down to the bounds when ratio locked', () => {
      const r = resizeRect(base, 'e', 100, 0, 2);
      expect(r.w).to.be.closeTo(90, 0.001);
      expect(r.h).to.be.closeTo(45, 0.001);
    });
    it('clamps to the bounds when unlocked', () => {
      expect(resizeRect(base, 'e', 100, 0, null).w).to.equal(90);
    });
    it('ignores unknown handles', () => {
      const r = resizeRect(base, 'x', 10, 10, null);
      expect(r.w).to.equal(50);
      expect(r.h).to.equal(50);
    });
    it('handles corner handles', () => {
      expect(resizeRect(base, 'nw', -10, -10, null)).to.deep.equal({ x: 0, y: 0, w: 60, h: 60 });
    });
  });

  it('rectPctToSourceBounds converts the frame to source pixels', () => {
    const b = rectPctToSourceBounds({ x: 0, y: 25, w: 100, h: 50 }, 200, 100, 100, 100);
    expect(b).to.deep.equal({ left: 0, top: 0, right: 200, bottom: 100 });
  });

  it('rectPctToSourceBounds clamps out-of-range rects', () => {
    const b = rectPctToSourceBounds({ x: -50, y: -50, w: 300, h: 300 }, 200, 100, 100, 100, 0, 0, 0);
    expect(b.left).to.equal(0);
    expect(b.right).to.equal(200);
  });
});

describe('editor panel builders', () => {
  it('left panel has the viewport and no adjust bar without slider modes', () => {
    const p = buildEditorLeftPanel({ sliderModes: [] });
    expect(p.querySelector('.ia-viewport')).to.exist;
    expect(p.querySelector('.ia-adjust-bar')).to.not.exist;
    expect(p.querySelectorAll('.ia-handle').length).to.equal(8);
  });

  it('left panel builds toggles for zoom first', () => {
    const p = buildEditorLeftPanel(resizeData);
    expect(p.querySelectorAll('.ia-toggle__btn').length).to.equal(2);
    expect(p.querySelector('.ia-toggle__btn').classList.contains('is-active')).to.be.true;
    expect(p.querySelector('.ia-slider').value).to.equal('0');
    expect(p.querySelector('.ia-val').textContent).to.equal('1.0x');
  });

  it('left panel starts at 100% when quality is the first mode', () => {
    const p = buildEditorLeftPanel({ sliderModes: [{ mode: 'quality', label: 'Quality' }] });
    expect(p.querySelector('.ia-slider').value).to.equal('100');
    expect(p.querySelector('.ia-val').textContent).to.equal('100%');
  });

  it('crop right panel builds pills and the More menu', () => {
    const p = buildEditorRightPanel(cropData);
    expect(p.querySelector('.ia-editor-title').textContent).to.equal('Crop your image');
    expect(p.querySelectorAll('.ia-aspect-pill').length).to.equal(3);
    expect(p.querySelectorAll('.ia-more-opt').length).to.equal(2);
    expect(p.querySelectorAll('.ia-more-opt.ia-editor-open-in-firefly').length).to.equal(1);
    expect(p.querySelectorAll('.ia-further-pill').length).to.equal(1);
  });

  it('crop right panel omits More when there are no grouped rows', () => {
    const p = buildEditorRightPanel({ ...cropData, aspectRows: [{ nameId: 'freeform', nameLabel: 'Freeform' }] });
    expect(p.querySelector('.ia-more-trigger')).to.not.exist;
  });

  it('routes only the lowercase more group to the localized Crop menu', () => {
    const p = buildEditorRightPanel({
      ...cropData,
      aspectRows: [
        { groupId: 'primary', groupLabel: 'Formats', nameId: 'square', nameLabel: 'Square', ratio: '1:1' },
        { groupId: 'more', groupLabel: 'Plus', nameId: 'landscape', nameLabel: 'Landscape', ratio: '16:9' },
      ],
    });
    expect(p.querySelector('.ia-aspect-pill:not(.ia-more-trigger)').textContent).to.equal('Square 1:1');
    expect(p.querySelector('.ia-more-trigger').textContent).to.equal('Plus');
    expect(p.querySelectorAll('.ia-more-opt').length).to.equal(1);
    expect(p.querySelector('.ia-more-opt').dataset.label).to.equal('landscape 16:9');
  });

  it('identifies See all by nameId rather than missing ratio or localized text', () => {
    const p = buildEditorRightPanel({
      ...cropData,
      aspectRows: [
        { groupId: 'more', nameId: 'seeAll', nameLabel: 'Tout afficher', ratio: '1:1' },
        { groupId: 'more', nameId: 'portrait', nameLabel: 'See all' },
      ],
    });
    const [seeAll, preset] = p.querySelectorAll('.ia-more-opt');
    expect(seeAll.classList.contains('ia-editor-open-in-firefly')).to.equal(true);
    expect(seeAll.dataset.nameId).to.equal('seeAll');
    expect(preset.classList.contains('ia-editor-open-in-firefly')).to.equal(false);
  });

  it('resize right panel builds tabs, inputs and platform menu', () => {
    const p = buildEditorRightPanel(resizeData);
    expect(p.querySelector('.ia-editor-title').textContent).to.equal('Resize your image');
    expect(p.querySelectorAll('.ia-resize-tab').length).to.equal(3);
    expect(p.querySelector('.ia-width-input')).to.exist;
    expect(p.querySelector('.ia-height-input')).to.exist;
    expect(p.querySelectorAll('.ia-unit-opt').length).to.equal(4);
    expect(p.querySelectorAll('.ia-social-opt').length).to.equal(1);
  });

  it('resize right panel works with only the freeform tab', () => {
    const p = buildEditorRightPanel({ ...resizeData, aspectRows: [{ groupId: 'freeform', groupLabel: 'Custom' }] });
    expect(p.querySelectorAll('.ia-resize-tab').length).to.equal(1);
    expect(p.querySelector('.ia-resize-tab').dataset.tab).to.equal('freeform');
    expect(p.querySelector('.ia-resize-tab').textContent).to.equal('Custom');
    expect(p.querySelector('.ia-resize-detail-panel').dataset.tab).to.equal('freeform');
  });

  it('routes Resize rows by groupId even when labels repeat or fields suggest another group', () => {
    const p = buildEditorRightPanel({
      ...resizeData,
      aspectRows: [
        { groupId: 'social', groupLabel: 'Formats', platformId: 'instagram', platformLabel: 'Instagram', nameId: 'square', nameLabel: 'Square', width: 1080, height: 1080 },
        { groupId: 'freeform', groupLabel: 'Formats', ratio: '4:3' },
        { groupId: 'standard', groupLabel: 'Formats', nameId: 'square', nameLabel: 'Square', width: 1000, height: 1000 },
      ],
    });
    const tabs = [...p.querySelectorAll('.ia-resize-tab')];
    expect(tabs.map((tab) => tab.dataset.tab)).to.deep.equal(['freeform', 'standard', 'social']);
    expect(tabs.map((tab) => tab.textContent)).to.deep.equal(['Formats', 'Formats', 'Formats']);
    expect(p.querySelector('[data-tab="standard"] .ia-aspect-pill').dataset.nameId).to.equal('square');
    expect(p.querySelector('[data-tab="social"] .ia-aspect-pill').dataset.platformId).to.equal('instagram');
  });

  it('uses nameLabel for social preset text and nameId for preset metadata', () => {
    const p = buildEditorRightPanel({
      ...resizeData,
      aspectRows: [
        { groupId: 'social', groupLabel: 'Social', platformId: 'instagram', platformLabel: 'Instagram', nameId: 'square', nameLabel: 'Publication', width: 1080, height: 1080 },
      ],
    });
    const pill = p.querySelector('.ia-aspect-pill');
    expect(pill.textContent).to.equal('Publication 1080 x 1080');
    expect(pill.dataset.nameId).to.equal('square');
    expect(pill.dataset.label).to.equal('square 1080 x 1080');
  });

  it('falls back to nameId when nameLabel is empty', () => {
    const p = buildEditorRightPanel({
      ...cropData,
      aspectRows: [{ nameId: 'square', nameLabel: '', ratio: '1:1' }],
    });
    expect(p.querySelector('.ia-aspect-pill').textContent).to.equal('square 1:1');
  });

  it('uses authored labels when provided', () => {
    const p = buildEditorRightPanel({ ...cropData, editorTitle: 'T', resetLabel: 'R', downloadLabel: 'D', editLabel: 'E' });
    expect(p.querySelector('.ia-editor-title').textContent).to.equal('T');
    expect(p.querySelector('.ia-editor-reset').textContent).to.equal('R');
    expect(p.querySelector('.ia-editor-download').textContent).to.equal('D');
    expect(p.querySelector('.ia-cta-outline.ia-editor-open-in-firefly').textContent).to.equal('E');
  });
});

describe('EditorEngine (crop)', () => {
  let ctx;
  beforeEach(async () => { ctx = await makeEngine(cropData); });
  afterEach(() => cleanup(ctx.area));

  it('tracks the freeform preset using its lowercase ID', () => {
    const pill = ctx.engine.aspectPills[0];
    expect(pill.dataset.label).to.equal('freeform');
    pill.click();
    expect(ctx.track.calledWith('Aspect Ratio freeform|UnityWidget')).to.equal(true);
  });

  it('setImage stores natural size and renders a full-width frame', () => {
    expect(ctx.engine.naturalW).to.equal(200);
    expect(ctx.engine.naturalH).to.equal(100);
    expect(ctx.engine.rect.w).to.equal(100);
    expect(ctx.engine.frame.style.width).to.equal('100%');
  });

  it('selectAspect applies the ratio and marks the pill active', () => {
    const pill = ctx.engine.aspectPills.find((p) => p.dataset.label === 'square 1:1');
    pill.click();
    expect(ctx.engine.selectedRatio).to.equal(1);
    expect(pill.classList.contains('is-active')).to.be.true;
    expect(ctx.engine.rect.w).to.be.below(100);
  });

  it('More menu opens, selects an option and updates the trigger', () => {
    ctx.engine.moreTrigger.click();
    expect(ctx.engine.moreMenu.classList.contains('hide')).to.be.false;
    expect(ctx.engine.moreTrigger.getAttribute('aria-expanded')).to.equal('true');
    ctx.engine.moreMenu.querySelector('.ia-more-opt[data-ratio="1.7777777777777777"]').click();
    expect(ctx.engine.moreMenu.classList.contains('hide')).to.be.true;
    expect(ctx.engine.moreTrigger.classList.contains('is-active')).to.be.true;
  });

  it('More menu closes from the close button and Escape', () => {
    ctx.engine.moreTrigger.click();
    ctx.engine.moreMenu.querySelector('.ia-dropdown-close').click();
    expect(ctx.engine.moreMenu.classList.contains('hide')).to.be.true;
    ctx.engine.moreTrigger.click();
    ctx.engine.moreMenu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(ctx.engine.moreMenu.classList.contains('hide')).to.be.true;
  });

  it('dropdown keyboard navigation wraps with arrows and Tab', () => {
    ctx.engine.moreTrigger.click();
    const items = [...ctx.engine.moreMenu.querySelectorAll('button')];
    const key = (k, shiftKey = false) => ctx.engine.moreMenu.dispatchEvent(
      new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true }),
    );
    items[items.length - 1].focus();
    key('ArrowDown');
    expect(document.activeElement).to.equal(items[0]);
    key('ArrowUp');
    expect(document.activeElement).to.equal(items[items.length - 1]);
    key('Tab');
    expect(document.activeElement).to.equal(items[0]);
    key('Tab', true);
    expect(document.activeElement).to.equal(items[items.length - 1]);
    key('a');
  });

  it('clicking outside closes the More menu', () => {
    ctx.engine.moreTrigger.click();
    document.body.click();
    expect(ctx.engine.moreMenu.classList.contains('hide')).to.be.true;
  });

  it('zoom slider updates zoom and the label', () => {
    ctx.engine.slider.value = '50';
    ctx.engine.slider.dispatchEvent(new Event('input'));
    expect(ctx.engine.zoom).to.equal(50);
    expect(ctx.engine.valEl.textContent).to.equal('5.5x');
  });

  it('crop mode toggle clicks do not send analytics', () => {
    ctx.engine.toggleBtns[0].click();
    expect(ctx.track.called).to.be.false;
  });

  it('dragging a handle resizes the frame', () => {
    const handle = ctx.engine.frame.querySelector('.ia-handle--e');
    handle.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, clientY: 0, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: -40, clientY: 0 }));
    window.dispatchEvent(new PointerEvent('pointerup'));
    expect(ctx.engine.rect.w).to.equal(90);
    expect(ctx.engine.hasInteracted).to.be.true;
  });

  it('dragging the frame body moves it within bounds', () => {
    ctx.engine.selectAspect(1, 'Square');
    const before = ctx.engine.rect.x;
    ctx.engine.frame.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, clientY: 0, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 20, clientY: 0 }));
    window.dispatchEvent(new PointerEvent('pointerup'));
    expect(ctx.engine.rect.x).to.be.greaterThan(before);
  });

  it('panning the viewport works only when the image is zoomed', () => {
    const vp = ctx.engine.viewport;
    vp.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, clientY: 0, bubbles: true }));
    expect(vp.classList.contains('is-panning')).to.be.false;
    ctx.engine.zoom = 50;
    ctx.engine.render();
    vp.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, clientY: 0, bubbles: true }));
    expect(vp.classList.contains('is-panning')).to.be.true;
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 10, clientY: 10 }));
    window.dispatchEvent(new PointerEvent('pointerup'));
    expect(vp.classList.contains('is-panning')).to.be.false;
  });

  it('getSourceBounds returns the crop in source pixels', () => {
    const b = ctx.engine.getSourceBounds();
    expect(b.right - b.left).to.equal(200);
    expect(b.bottom - b.top).to.equal(100);
  });

  it('reset restores zoom, pan and the default aspect', () => {
    ctx.engine.zoom = 40;
    ctx.engine.panX = 5;
    ctx.engine.reset();
    expect(ctx.engine.zoom).to.equal(0);
    expect(ctx.engine.panX).to.equal(0);
    expect(ctx.engine.hasInteracted).to.be.false;
  });

  it('idle class is toggled by resetIdle', () => {
    const clock = sinon.useFakeTimers();
    ctx.engine.resetIdle();
    expect(ctx.engine.frame.classList.contains('ia-frame--idle')).to.be.false;
    clock.tick(3100);
    expect(ctx.engine.frame.classList.contains('ia-frame--idle')).to.be.true;
    clock.restore();
  });

  it('setBusy toggles busy classes and the trigger spinner', () => {
    const btn = ctx.right.querySelector('.ia-editor-download');
    ctx.engine.setBusy(true, btn);
    expect(ctx.left.classList.contains('is-busy')).to.be.true;
    expect(btn.querySelector('.ia-btn-spinner')).to.exist;
    ctx.engine.setBusy(true, btn);
    expect(btn.querySelectorAll('.ia-btn-spinner').length).to.equal(1);
    ctx.engine.setBusy(false, btn);
    expect(btn.querySelector('.ia-btn-spinner')).to.not.exist;
    ctx.engine.setBusy(false);
  });

  it('setMode with an unknown mode shows a placeholder label', () => {
    ctx.engine.setMode('other');
    expect(ctx.engine.valEl.textContent).to.equal('--');
    ctx.engine.slider.dispatchEvent(new Event('input'));
    expect(ctx.engine.zoom).to.equal(0);
  });
});

describe('EditorEngine (resize)', () => {
  let ctx;
  beforeEach(async () => { ctx = await makeEngine(resizeData); });
  afterEach(() => cleanup(ctx.area));

  it('initial target size equals the natural size', () => {
    expect(ctx.engine.getResizeDimensions()).to.deep.equal({ width: 200, height: 100 });
    expect(ctx.engine.widthInput.value).to.equal('200');
  });

  it('starts resize unlocked with consistent button state and icon', () => {
    expect(ctx.engine.locked).to.be.false;
    expect(ctx.engine.lockBtn.classList.contains('is-active')).to.be.false;
    expect(ctx.engine.lockBtn.getAttribute('aria-pressed')).to.equal('false');
    expect(ctx.engine.lockBtn.querySelector('img').src).to.match(/\/unlock\.svg$/);
    expect(ctx.engine.getDragRatioLock({ w: 50, h: 50 })).to.equal(null);
  });

  it('formatBytes formats sizes', () => {
    expect(EditorEngine.formatBytes(0)).to.equal('--');
    expect(EditorEngine.formatBytes(500)).to.equal('1 KB');
    expect(EditorEngine.formatBytes(2 * 1024 * 1024)).to.equal('2.0 MB');
  });

  it('locked width commit keeps the aspect ratio', () => {
    ctx.engine.setLocked(true);
    ctx.engine.widthInput.value = '100';
    ctx.engine.onDimensionCommit('width');
    expect(ctx.engine.getResizeDimensions()).to.deep.equal({ width: 100, height: 50 });
  });

  it('locked height commit keeps the aspect ratio', () => {
    ctx.engine.setLocked(true);
    ctx.engine.heightInput.value = '50';
    ctx.engine.onDimensionCommit('height');
    expect(ctx.engine.getResizeDimensions()).to.deep.equal({ width: 100, height: 50 });
  });

  it('unlocked commit changes one axis and moves the frame', () => {
    ctx.engine.widthInput.value = '100';
    ctx.engine.onDimensionCommit('width');
    expect(ctx.engine.targetW).to.equal(100);
    expect(ctx.engine.targetH).to.equal(100);
    ctx.engine.heightInput.value = '50';
    ctx.engine.onDimensionCommit('height');
    expect(ctx.engine.targetH).to.equal(50);
  });

  ['width', 'height'].forEach((axis) => {
    it(`uses a text input and rejects non-numeric edits in ${axis}`, () => {
      const input = ctx.engine[`${axis}Input`];
      expect(input.type).to.equal('text');
      expect(input.inputMode).to.equal('decimal');
      input.focus();
      input.select();
      ['abc', '1e2', '1E2', '12@3', '1..5', '12px', ' 12 '].forEach((data) => {
        const event = new InputEvent('beforeinput', { data, inputType: 'insertText', bubbles: true, cancelable: true });
        input.dispatchEvent(event);
        expect(event.defaultPrevented, data).to.be.true;
      });
      input.value = '12abc';
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));
      expect(input.value).to.equal(axis === 'width' ? '200' : '100');
    });

    [
      { value: '0', expected: 50 },
      { value: '-12', expected: 50 },
      { value: '49.5', expected: 50 },
      { value: '50', expected: 50 },
      { value: '100.75', expected: 100.75 },
      { value: '6000', expected: 6000 },
      { value: '99999', expected: 6000 },
    ].forEach(({ value, expected }) => {
      it(`clamps unlocked ${axis} ${value} to Express limits`, () => {
        ctx.engine.setLocked(false);
        const input = ctx.engine[`${axis}Input`];
        input.value = value;
        ctx.engine.onDimensionCommit(axis);
        expect(ctx.engine.getResizeDimensions()[axis]).to.equal(expected);
        expect(input.value).to.equal(String(expected));
      });
    });

    ['', '-', '.', '-.', 'abc', '1e2', '12@3', '1.2.3', 'Infinity', '9'.repeat(310)].forEach((value) => {
      it(`restores ${axis} after an unfinished or invalid commit ${value.slice(0, 15)}`, () => {
        const input = ctx.engine[`${axis}Input`];
        input.value = value;
        ctx.engine.onDimensionCommit(axis);
        expect(ctx.engine.getResizeDimensions()).to.deep.equal({ width: 200, height: 100 });
        expect(input.value).to.equal(axis === 'width' ? '200' : '100');
      });
    });

    it(`allows clearing ${axis} during editing and restores it on blur`, () => {
      const input = ctx.engine[`${axis}Input`];
      input.focus();
      input.value = '';
      input.dispatchEvent(new Event('input'));
      expect(input.value).to.equal('');
      input.dispatchEvent(new Event('blur'));
      expect(input.value).to.equal(axis === 'width' ? '200' : '100');
    });
  });

  [
    { axis: 'width', value: '0', width: 100, height: 50 },
    { axis: 'height', value: '0', width: 100, height: 50 },
    { axis: 'width', value: '99999', width: 6000, height: 3000 },
    { axis: 'height', value: '99999', width: 6000, height: 3000 },
  ].forEach(({ axis, value, width, height }) => {
    it(`keeps both locked dimensions within bounds when committing ${axis} ${value}`, () => {
      ctx.engine.setLocked(true);
      ctx.engine[`${axis}Input`].value = value;
      ctx.engine.onDimensionCommit(axis);
      expect(ctx.engine.getResizeDimensions()).to.deep.equal({ width, height });
    });
  });

  [
    { sourceWidth: 20000, sourceHeight: 100, width: 6000, height: 50 },
    { sourceWidth: 100, sourceHeight: 20000, width: 50, height: 6000 },
  ].forEach(({ sourceWidth, sourceHeight, width, height }) => {
    it(`keeps extreme locked ratio ${sourceWidth}:${sourceHeight} within the pixel limits`, () => {
      ctx.engine.setLocked(true);
      ctx.engine.targetW = sourceWidth;
      ctx.engine.targetH = sourceHeight;
      ctx.engine.widthInput.value = '6000';
      ctx.engine.onDimensionCommit('width');
      expect(ctx.engine.getResizeDimensions()).to.deep.equal({ width, height });
    });
  });

  it('Enter commits, blur commits and arrow keys commit', () => {
    ctx.engine.setLocked(false);
    ctx.engine.widthInput.value = '100';
    ctx.engine.widthInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(ctx.engine.targetW).to.equal(100);
    ctx.engine.heightInput.value = '20';
    ctx.engine.heightInput.dispatchEvent(new Event('blur'));
    expect(ctx.engine.targetH).to.equal(50);
    ctx.engine.widthInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(ctx.engine.targetW).to.equal(101);
    ctx.engine.widthInput.value = '60';
    ctx.engine.widthInput.dispatchEvent(new Event('input'));
    expect(ctx.engine.targetW).to.equal(101);
    ctx.engine.widthInput.dispatchEvent(new Event('blur'));
    expect(ctx.engine.targetW).to.equal(60);
  });

  it('supports Shift arrow steps and clamps keyboard changes at the limits', () => {
    ctx.engine.setLocked(false);
    const input = ctx.engine.widthInput;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true }));
    expect(ctx.engine.targetW).to.equal(210);
    input.value = '50';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(ctx.engine.targetW).to.equal(50);
    input.value = '6000';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(ctx.engine.targetW).to.equal(6000);
  });

  it('supports native keyboard filtering, decimal input and Enter commits', async () => {
    ctx.engine.setLocked(false);
    const input = ctx.engine.widthInput;
    input.focus();
    input.select();
    await sendKeys({ type: 'abc@eE!' });
    expect(input.value).to.equal('200');
    await sendKeys({ type: '100.75' });
    await sendKeys({ press: 'Enter' });
    expect(ctx.engine.targetW).to.equal(100.75);
    expect(input.value).to.equal('100.75');
  });

  it('clicking Width and Height sends analytics', () => {
    ctx.engine.widthInput.click();
    ctx.engine.heightInput.click();
    expect(ctx.track.calledWith('Aspect Ratio freeform - Width|UnityWidget')).to.be.true;
    expect(ctx.track.calledWith('Aspect Ratio freeform - Height|UnityWidget')).to.be.true;
  });

  it('unit conversion preserves the agreed 72 dpi', () => {
    ctx.engine.setLocked(false);
    ctx.engine.unit = 'in';
    ctx.engine.widthInput.value = '1';
    ctx.engine.onDimensionCommit('width');
    expect(ctx.engine.targetW).to.equal(72);
    ctx.engine.syncDimensionFields();
    expect(ctx.engine.widthInput.value).to.equal('1');
  });

  [
    { unit: 'in', value: '1' },
    { unit: 'cm', value: '2.54' },
    { unit: 'mm', value: '25.4' },
  ].forEach(({ unit, value }) => {
    it(`converts ${unit} to pixels with the same physical limits`, () => {
      ctx.engine.setLocked(false);
      ctx.engine.unit = unit;
      const input = ctx.engine.widthInput;
      input.value = value;
      ctx.engine.onDimensionCommit('width');
      expect(ctx.engine.targetW).to.be.closeTo(72, 0.000001);
      input.value = '0';
      ctx.engine.onDimensionCommit('width');
      expect(ctx.engine.targetW).to.equal(50);
      input.value = '99999';
      ctx.engine.onDimensionCommit('width');
      expect(ctx.engine.targetW).to.equal(6000);
    });
  });

  it('shows physical unit dimensions to three decimal places like Express', () => {
    ctx.engine.unit = 'in';
    ctx.engine.syncDimensionFields();
    expect(ctx.engine.widthInput.value).to.equal('2.778');
    expect(ctx.engine.heightInput.value).to.equal('1.389');
  });

  it('allows fractional edits and clamps their converted pixel dimensions', () => {
    ctx.engine.setLocked(true);
    ctx.engine.unit = 'in';
    const input = ctx.engine.widthInput;
    input.focus();
    ['0', '0.', '0.5'].forEach((value) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      expect(input.value).to.equal(value);
    });
    input.dispatchEvent(new Event('blur'));
    expect(ctx.engine.getResizeDimensions()).to.deep.equal({ width: 100, height: 50 });
    expect(input.value).to.equal('1.389');
  });

  it('unit menu selects a unit and sends analytics', () => {
    ctx.engine.unitTrigger.click();
    expect(ctx.engine.unitMenu.classList.contains('hide')).to.be.false;
    ctx.engine.unitMenu.querySelector('[data-unit="cm"]').click();
    expect(ctx.engine.unit).to.equal('cm');
    expect(ctx.engine.unitLabel.textContent).to.equal('cm');
    expect(ctx.track.calledWith('Aspect Ratio freeform - Unit|UnityWidget')).to.be.true;
    expect(ctx.track.calledWith('Aspect Ratio freeform - Unit - cm|UnityWidget')).to.be.true;
    ctx.engine.unitTrigger.click();
    ctx.engine.unitMenu.querySelector('.ia-dropdown-close').click();
    expect(ctx.engine.unitMenu.classList.contains('hide')).to.be.true;
    ctx.engine.unitTrigger.click();
    ctx.engine.unitTrigger.click();
    document.body.click();
  });

  it('lock button toggles the lock state and icon', () => {
    ctx.engine.lockBtn.click();
    expect(ctx.engine.locked).to.be.true;
    expect(ctx.engine.lockBtn.getAttribute('aria-pressed')).to.equal('true');
    expect(ctx.engine.lockBtn.querySelector('img').src).to.match(/\/lock\.svg$/);
    ctx.engine.lockBtn.click();
    expect(ctx.engine.locked).to.be.false;
    expect(ctx.engine.lockBtn.getAttribute('aria-pressed')).to.equal('false');
    expect(ctx.engine.lockBtn.querySelector('img').src).to.contain('unlock');
  });

  it('tabs switch panels and send analytics', () => {
    const std = ctx.engine.resizeTabs.find((t) => t.dataset.tab === 'standard');
    std.click();
    expect(ctx.engine.resizeTab).to.equal('standard');
    expect(ctx.track.calledWith('Aspect Ratio standard|UnityWidget')).to.be.true;
    expect(ctx.engine.locked).to.be.false;
    const panel = ctx.engine.resizeDetails.find((d) => d.dataset.tab === 'standard');
    expect(panel.classList.contains('hide')).to.be.false;
  });

  it('standard pill sends the name analytics and applies dimensions', () => {
    const pill = ctx.engine.aspectPills.find((p) => p.dataset.nameId === 'square');
    pill.click();
    expect(ctx.track.calledWith('Aspect Ratio standard - square|UnityWidget')).to.be.true;
    expect(ctx.engine.selectedPill).to.equal(pill);
    expect(ctx.engine.locked).to.be.true;
    expect(ctx.engine.lockBtn.getAttribute('aria-pressed')).to.equal('true');
    expect(ctx.engine.lockBtn.querySelector('img').src).to.match(/\/lock\.svg$/);
  });

  it('social menu selects a platform and its pill sends no analytics', () => {
    const social = ctx.engine.socialTrigger;
    social.click();
    expect(ctx.engine.socialMenu.classList.contains('hide')).to.be.false;
    ctx.engine.socialMenu.querySelector('.ia-social-opt').click();
    expect(ctx.track.calledWith('Aspect Ratio social - instagram|UnityWidget')).to.be.true;
    expect(social.textContent).to.equal('Instagram');
    expect(ctx.engine.locked).to.be.false;
    ctx.track.resetHistory();
    const pill = ctx.engine.aspectPills.find((p) => p.dataset.platformId === 'instagram');
    pill.click();
    expect(ctx.track.called).to.be.false;
    expect(ctx.engine.targetW).to.equal(1080);
    expect(ctx.engine.locked).to.be.true;
    expect(ctx.engine.lockBtn.getAttribute('aria-pressed')).to.equal('true');
    expect(ctx.engine.lockBtn.querySelector('img').src).to.match(/\/lock\.svg$/);
    social.click();
    ctx.engine.socialMenu.querySelector('.ia-dropdown-close').click();
    social.click();
    social.click();
    document.body.click();
  });

  it('tracks Resize tab IDs independently of their display text', () => {
    ctx.track.resetHistory();
    ctx.engine.resizeTabs.forEach((tab) => {
      tab.textContent = 'Libellé localisé';
      tab.click();
    });
    expect(ctx.track.args.map(([name]) => name)).to.deep.equal([
      'Aspect Ratio freeform|UnityWidget',
      'Aspect Ratio standard|UnityWidget',
      'Aspect Ratio social|UnityWidget',
    ]);
  });

  it('uses platformLabel for display while grouping and tracking by platformId', async () => {
    cleanup(ctx.area);
    ctx = await makeEngine({
      ...resizeData,
      aspectRows: [
        { groupId: 'social', platformId: 'instagram', platformLabel: 'Instagram localisé', nameId: 'square', nameLabel: 'Square', width: 1080, height: 1080 },
        { groupId: 'social', platformId: 'instagram', platformLabel: 'Instagram localisé', nameId: 'story', nameLabel: 'Story', width: 1080, height: 1920 },
        { groupId: 'social', platformId: 'facebook', platformLabel: 'Instagram localisé', nameId: 'feedLandscape', nameLabel: 'Feed Landscape', width: 1200, height: 630 },
      ],
    });
    const options = ctx.engine.socialMenu.querySelectorAll('.ia-social-opt');
    expect(options.length).to.equal(2);
    ctx.engine.socialTrigger.click();
    options[0].click();
    expect(options[0].textContent).to.equal('Instagram localisé');
    expect(ctx.engine.socialTrigger.textContent).to.equal('Instagram localisé');
    expect(ctx.track.calledWith('Aspect Ratio social - instagram|UnityWidget')).to.equal(true);
    const instagramGrid = ctx.right.querySelector('.ia-social-grid[data-platform-id="instagram"]');
    expect(instagramGrid.classList.contains('hide')).to.equal(false);
    expect(instagramGrid.querySelectorAll('.ia-aspect-pill').length).to.equal(2);
    ctx.engine.socialTrigger.click();
    options[1].click();
    expect(ctx.track.calledWith('Aspect Ratio social - facebook|UnityWidget')).to.equal(true);
    expect(instagramGrid.classList.contains('hide')).to.equal(true);
    const facebookGrid = ctx.right.querySelector('.ia-social-grid[data-platform-id="facebook"]');
    expect(facebookGrid.classList.contains('hide')).to.equal(false);
    facebookGrid.querySelector('.ia-aspect-pill').click();
    expect(ctx.engine.selectedPill.dataset.platformId).to.equal('facebook');
  });

  it('switching away from the social tab restores its label', () => {
    ctx.engine.socialTrigger.textContent = 'Instagram';
    ctx.engine.resizeTabs.find((t) => t.dataset.tab === 'freeform').click();
    expect(ctx.engine.socialTrigger.textContent).to.equal(ctx.engine.socialDefaultLabel);
  });

  it('displays Twitter while tracking the configured x platform ID', async () => {
    cleanup(ctx.area);
    ctx = await makeEngine({
      ...resizeData,
      aspectRows: [{
        groupId: 'social',
        groupLabel: 'Social',
        platformId: 'x',
        platformLabel: 'Twitter',
        nameId: 'portrait',
        nameLabel: 'Portrait',
        width: 720,
        height: 1280,
      }],
    });
    ctx.engine.socialTrigger.click();
    ctx.engine.socialMenu.querySelector('.ia-social-opt').click();
    expect(ctx.engine.socialTrigger.textContent).to.equal('Twitter');
    expect(ctx.track.calledWith('Aspect Ratio social - x|UnityWidget')).to.equal(true);
    expect(ctx.engine.aspectPills[0].dataset.platformId).to.equal('x');
    expect(ctx.engine.aspectPills[0].textContent).to.equal('Portrait 720 x 1280');
  });

  it('zoom and quality toggles send analytics', () => {
    ctx.engine.toggleBtns.find((b) => b.dataset.mode === 'zoom').click();
    ctx.engine.toggleBtns.find((b) => b.dataset.mode === 'quality').click();
    expect(ctx.track.calledWith('Zoom|UnityWidget')).to.be.true;
    expect(ctx.track.calledWith('Quality|UnityWidget')).to.be.true;
    expect(ctx.engine.mode).to.equal('quality');
  });

  it('quality slider updates quality and the label', () => {
    ctx.engine.setMode('quality');
    ctx.engine.slider.value = '60';
    ctx.engine.slider.dispatchEvent(new Event('input'));
    expect(ctx.engine.quality).to.equal(60);
    expect(ctx.engine.valEl.textContent).to.equal('60%');
  });

  it('setOutputType hides quality for non-JPEG and normalizes image/jpg', () => {
    ctx.engine.setOutputType('image/png');
    expect(ctx.engine.encodeQuality()).to.be.undefined;
    expect(ctx.engine.toggleBtns.find((b) => b.dataset.mode === 'quality').classList.contains('hide')).to.be.true;
    expect(ctx.engine.mode).to.equal('zoom');
    ctx.engine.setOutputType('image/jpg');
    expect(ctx.engine.outputType).to.equal('image/jpeg');
    expect(ctx.engine.encodeQuality()).to.equal(1);
  });

  it('computeNewSize resolves a blob size or null', async () => {
    expect(await ctx.engine.computeNewSize(0, 0)).to.equal(null);
    expect(await ctx.engine.computeNewSize(20, 10)).to.be.a('number');
  });

  it('size readout shows the original size, then the new size after interaction', async () => {
    await ctx.engine.updateSizeReadout();
    expect(ctx.engine.sizeReadout.textContent).to.contain('2 KB');
    expect(ctx.engine.sizeReadout.textContent).to.contain('--');
    ctx.engine.hasInteracted = true;
    await ctx.engine.updateSizeReadout();
    expect(ctx.engine.sizeReadout.textContent).to.match(/New size: \d+ KB/);
  });

  it('scheduleSizeReadout debounces', () => {
    const clock = sinon.useFakeTimers();
    const spy = sinon.spy(ctx.engine, 'updateSizeReadout');
    ctx.engine.scheduleSizeReadout();
    ctx.engine.scheduleSizeReadout();
    clock.tick(200);
    expect(spy.calledOnce).to.be.true;
    clock.restore();
  });

  it('quality preview toggles on and off', async () => {
    ctx.engine.header.append(
      Object.assign(document.createElement('button'), { className: 'ia-editor-quality' }),
    );
    ctx.engine.qualityBtn = ctx.engine.header.querySelector('.ia-editor-quality');
    ctx.engine.applyQualityPreview();
    await new Promise((r) => { setTimeout(r, 200); });
    expect(ctx.engine.qualityPreviewActive).to.be.true;
    expect(ctx.engine.qualityBtn.textContent).to.equal('Original');
    ctx.engine.toggleQualityPreview();
    expect(ctx.engine.qualityPreviewActive).to.be.false;
    expect(ctx.engine.sharpImg.src).to.equal(ctx.engine.originalUrl);
    ctx.engine.toggleQualityPreview();
    ctx.engine.revertQualityPreview();
  });

  it('reset restores the freeform tab, unit, unlocked state and size', () => {
    ctx.engine.setLocked(true);
    ctx.engine.unit = 'in';
    ctx.engine.resizeTabs.find((t) => t.dataset.tab === 'standard').click();
    ctx.engine.reset();
    expect(ctx.engine.locked).to.be.false;
    expect(ctx.engine.lockBtn.getAttribute('aria-pressed')).to.equal('false');
    expect(ctx.engine.lockBtn.querySelector('img').src).to.match(/\/unlock\.svg$/);
    expect(ctx.engine.unit).to.equal('px');
    expect(ctx.engine.resizeTab).to.equal('freeform');
    expect(ctx.engine.resizeDetails.filter((panel) => !panel.classList.contains('hide'))
      .map((panel) => panel.dataset.tab)).to.deep.equal(['freeform']);
    expect(ctx.engine.getResizeDimensions()).to.deep.equal({ width: 200, height: 100 });
  });

  it('starts a new image unlocked after a previous preset selection', async () => {
    ctx.engine.aspectPills.find((pill) => pill.dataset.nameId === 'square').click();
    expect(ctx.engine.locked).to.be.true;
    await ctx.engine.setImage(dataUrl(400, 300), 4096, true);
    ctx.engine.reset();
    expect(ctx.engine.locked).to.be.false;
    expect(ctx.engine.lockBtn.getAttribute('aria-pressed')).to.equal('false');
    expect(ctx.engine.lockBtn.querySelector('img').src).to.match(/\/unlock\.svg$/);
    expect(ctx.engine.getResizeDimensions()).to.deep.equal({ width: 400, height: 300 });
  });

  it('unlocked freeform drag updates the target size', () => {
    ctx.engine.setLocked(false);
    const handle = ctx.engine.frame.querySelector('.ia-handle--e');
    handle.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, clientY: 0, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: -40, clientY: 0 }));
    window.dispatchEvent(new PointerEvent('pointerup'));
    expect(ctx.engine.targetW).to.be.below(200);
  });

  it('getDragRatioLock returns null when unlocked and the frame ratio when locked', () => {
    ctx.engine.setLocked(true);
    expect(ctx.engine.getDragRatioLock({ w: 50, h: 50 })).to.be.a('number');
    ctx.engine.setLocked(false);
    expect(ctx.engine.getDragRatioLock({ w: 50, h: 50 })).to.equal(null);
    ctx.engine.resizeTab = 'standard';
    ctx.engine.selectedRatio = 2;
    expect(ctx.engine.getDragRatioLock({ w: 50, h: 50 })).to.equal(2);
  });
});

const ICON = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

function fakeMatchMedia(matches) {
  const listeners = [];
  const stub = sinon.stub(window, 'matchMedia').callsFake(() => ({
    matches,
    addEventListener: (type, cb) => listeners.push(cb),
  }));
  return { stub, fire: (m) => listeners.forEach((cb) => cb({ matches: m })) };
}

describe('EditorEngine responsive layout and extras', () => {
  let ctx;
  let mm;
  afterEach(() => {
    mm?.stub.restore();
    mm = null;
    if (ctx) cleanup(ctx.area);
    ctx = null;
    sinon.restore();
  });

  it('moves the header and actions between desktop and mobile layouts', async () => {
    mm = fakeMatchMedia(true);
    ctx = await makeEngine(cropData, { quality: true });
    const { engine, left, right } = ctx;
    expect(right.firstElementChild).to.equal(engine.header);
    expect(engine.resetBtn.parentElement).to.equal(engine.header);
    mm.fire(false);
    expect(left.firstElementChild).to.equal(engine.header);
    const actions = engine.header.querySelector('.ia-editor-header-actions');
    expect(actions.contains(engine.resetBtn)).to.be.true;
    expect(actions.contains(engine.qualityBtn)).to.be.true;
    mm.fire(true);
    expect(engine.resetBtn.parentElement).to.equal(engine.header);
  });

  it('works without a quality button in either layout', async () => {
    mm = fakeMatchMedia(false);
    ctx = await makeEngine(cropData);
    mm.fire(true);
    mm.fire(false);
    expect(ctx.engine.qualityBtn).to.equal(null);
  });

  it('quality button toggles the preview and follows the output type', async () => {
    ctx = await makeEngine(resizeData, { quality: true });
    ctx.engine.qualityBtn.click();
    await new Promise((r) => { setTimeout(r, 200); });
    expect(ctx.engine.qualityBtn.textContent).to.equal('Original');
    ctx.engine.qualityBtn.click();
    expect(ctx.engine.qualityBtn.textContent).to.equal('Quality');
    ctx.engine.setOutputType('image/png');
    expect(ctx.engine.qualityBtn.classList.contains('hide')).to.be.true;
  });

  it('wheel scrolls the crop aspect row horizontally', async () => {
    ctx = await makeEngine(cropData);
    const row = ctx.engine.aspectScrollRow;
    const ev = new WheelEvent('wheel', { deltaY: 40, cancelable: true });
    row.dispatchEvent(ev);
    expect(ev.defaultPrevented).to.be.true;
    const flat = new WheelEvent('wheel', { deltaY: 0, cancelable: true });
    row.dispatchEvent(flat);
    expect(flat.defaultPrevented).to.be.false;
  });

  it('dragging the aspect row swallows the following click, touch is ignored', async () => {
    ctx = await makeEngine(cropData);
    const row = ctx.engine.aspectScrollRow;
    const pill = ctx.engine.aspectPills[1];
    pill.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, pointerType: 'mouse', bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 102 }));
    window.dispatchEvent(new PointerEvent('pointerup'));
    pill.click();
    expect(ctx.track.callCount).to.equal(1);
    ctx.track.resetHistory();
    pill.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, pointerType: 'mouse', bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 40, cancelable: true }));
    window.dispatchEvent(new PointerEvent('pointerup'));
    pill.click();
    expect(ctx.track.called).to.be.false;
    row.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, pointerType: 'touch', bubbles: true }));
  });

  it('keys on the More trigger drive the menu only while it is open', async () => {
    ctx = await makeEngine(cropData);
    const key = (k) => ctx.engine.moreTrigger.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    key('Escape');
    ctx.engine.moreTrigger.click();
    key('Escape');
    expect(ctx.engine.moreMenu.classList.contains('hide')).to.be.true;
  });

  it('a More option with an icon replaces the trigger icon and restores it', async () => {
    ctx = await makeEngine(cropData);
    ctx.engine.selectAspect(1.5, 'Wide', true, null, '3:2', ICON);
    expect(ctx.engine.moreTrigger.querySelector('img.ia-btn-icon')).to.exist;
    ctx.engine.selectAspect(1, 'Square');
    expect(ctx.engine.moreTrigger.querySelector('svg.ia-btn-icon')).to.exist;
  });

  it('opening an Open-in-Firefly More option only closes the menu', async () => {
    ctx = await makeEngine(cropData);
    ctx.engine.moreTrigger.click();
    ctx.engine.moreMenu.querySelector('.ia-more-opt.ia-editor-open-in-firefly').click();
    expect(ctx.engine.moreMenu.classList.contains('hide')).to.be.true;
  });

  it('setImage waits for an image that is not loaded yet', async () => {
    ctx = await makeEngine(cropData);
    await ctx.engine.setImage(dataUrl(100, 50), 10);
    expect(ctx.engine.naturalW).to.equal(100);
    expect(ctx.engine.uploadedImageSize).to.equal(2048);
  });

  it('opening menus on a narrow viewport positions them above the trigger', async () => {
    ctx = await makeEngine(cropData);
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 500 });
    ctx.engine.moreTrigger.click();
    expect(ctx.engine.moreMenu.style.top).to.equal('auto');
    delete document.documentElement.clientWidth;
  });

  ['standard', 'social'].forEach((tab) => {
    ['e', 'se'].forEach((handleName) => {
      it(`keeps ${tab} output size fixed and ratio locked when dragging ${handleName}`, async () => {
        ctx = await makeEngine(resizeData);
        const { engine } = ctx;
        engine.resizeTab = tab;
        const pill = engine.aspectPills.find((p) => (tab === 'social'
          ? p.dataset.platformId === 'instagram' : p.dataset.nameId === 'square'));
        engine.setLocked(false);
        pill.click();
        expect(engine.locked).to.equal(true);
        const dimensions = engine.getResizeDimensions();
        const before = { ...engine.rect };
        engine.frame.querySelector(`.ia-handle--${handleName}`).dispatchEvent(
          new PointerEvent('pointerdown', { clientX: 100, clientY: 100, bubbles: true }),
        );
        window.dispatchEvent(new PointerEvent('pointermove', { clientX: 80, clientY: 80 }));
        window.dispatchEvent(new PointerEvent('pointerup'));
        expect(engine.rect.w).to.be.lessThan(before.w);
        expect(engine.rect.w / engine.rect.h).to.be.closeTo(before.w / before.h, 0.00001);
        expect(engine.getResizeDimensions()).to.deep.equal(dimensions);
        if (tab === 'social') expect(dimensions).to.deep.equal({ width: 1080, height: 1080 });
      });
    });
  });

  it('highlights the clicked Crop pill when labels repeat and resets to the default pill', async () => {
    ctx = await makeEngine({
      ...cropData,
      aspectRows: [
        { nameId: 'square', nameLabel: 'Carré', ratio: '1:1' },
        { nameId: 'square', nameLabel: 'Carré', ratio: '1:1' },
        { groupId: 'more', groupLabel: 'More', nameId: 'square', nameLabel: 'Carré', ratio: '1:1' },
      ],
    });
    const { engine } = ctx;
    const [first, second] = engine.aspectPills;
    second.click();
    expect(second.textContent).to.equal('Carré 1:1');
    expect(engine.selectedPill).to.equal(second);
    expect(engine.selectedRatio).to.equal(1);
    expect(engine.aspectPills.filter((pill) => pill.classList.contains('is-active'))).to.deep.equal([second]);
    engine.moreMenu.querySelector('.ia-more-opt').click();
    expect(engine.moreTrigger.textContent).to.equal('Carré 1:1');
    expect(engine.aspectPills.filter((pill) => pill.classList.contains('is-active'))).to.deep.equal([engine.moreTrigger]);
    engine.reset();
    expect(engine.aspectPills.filter((pill) => pill.classList.contains('is-active'))).to.deep.equal([first]);
  });

  ['linkedin', 'snapchat'].forEach((platform) => {
    it(`highlights the clicked ${platform} preset when another platform has the same label`, async () => {
      const landscape = { nameId: 'landscape', nameLabel: 'Landscape', width: 1920, height: 1080 };
      const story = { nameId: 'story', nameLabel: 'Story', width: 1080, height: 1920 };
      ctx = await makeEngine({
        ...resizeData,
        aspectRows: [
          ...resizeData.aspectRows,
          { groupId: 'social', platformId: 'facebook', platformLabel: 'Facebook', ...landscape },
          { groupId: 'social', platformId: 'instagram', platformLabel: 'Instagram', ...story },
          { groupId: 'social', platformId: 'linkedin', platformLabel: 'Linkedin', ...landscape },
          { groupId: 'social', platformId: 'linkedin', platformLabel: 'Linkedin', nameId: 'post', nameLabel: 'Post', width: 1920, height: 1920 },
          { groupId: 'social', platformId: 'linkedin', platformLabel: 'Linkedin', nameId: 'vertical', nameLabel: 'Vertical', width: 1080, height: 1920 },
          { groupId: 'social', platformId: 'linkedin', platformLabel: 'Linkedin', nameId: 'blogPost', nameLabel: 'Blog Post', width: 1200, height: 628 },
          { groupId: 'social', platformId: 'snapchat', platformLabel: 'Snapchat', ...story },
        ],
      });
      const { engine } = ctx;
      engine.socialTrigger.click();
      engine.socialMenu.querySelector(`[data-platform-id="${platform}"]`).click();
      const grid = ctx.right.querySelector(`.ia-social-grid[data-platform-id="${platform}"]`);
      const pill = grid.querySelector('.ia-aspect-pill');
      expect(grid.classList.contains('hide')).to.equal(false);
      pill.click();
      expect(engine.getResizeDimensions()).to.deep.equal(platform === 'linkedin'
        ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 });
      expect(engine.selectedPill).to.equal(pill);
      expect(engine.aspectPills.filter((p) => p.classList.contains('is-active'))).to.deep.equal([pill]);
      engine.reset();
      expect(engine.selectedPill).to.equal(null);
      expect(engine.aspectPills.some((p) => p.classList.contains('is-active'))).to.equal(false);
    });
  });

  it('keeps output dimensions independent of zoom while source bounds shrink', async () => {
    ctx = await makeEngine(resizeData);
    const before = ctx.engine.getSourceBounds();
    ctx.engine.zoom = 50;
    ctx.engine.render();
    const after = ctx.engine.getSourceBounds();
    expect(ctx.engine.getResizeDimensions()).to.deep.equal({ width: 200, height: 100 });
    expect(after.right - after.left).to.be.lessThan(before.right - before.left);
  });

  it('displays localized preset names but sends the stable Standard name', async () => {
    ctx = await makeEngine({
      ...resizeData,
      aspectRows: [
        { groupId: 'freeform', groupLabel: 'Personnalisé' },
        { groupId: 'standard', groupLabel: 'Standard', ratio: '4:3', nameId: 'landscape', nameLabel: 'Paysage' },
      ],
    });
    const pill = ctx.engine.aspectPills[0];
    expect(pill.textContent).to.equal('Paysage 4:3');
    pill.click();
    expect(ctx.track.firstCall.args[0]).to.equal('Aspect Ratio standard - landscape|UnityWidget');
    expect(ctx.engine.resizeTabs[0].textContent).to.equal('Personnalisé');
  });

  it('displays localized Crop pills and More selections without changing crop analytics', async () => {
    ctx = await makeEngine({
      ...cropData,
      aspectRows: [
        { nameId: 'square', nameLabel: 'Carré', ratio: '1:1' },
        { groupId: 'more', groupLabel: 'Plus', nameId: 'landscape', nameLabel: 'Paysage', ratio: '4:3' },
      ],
    });
    expect(ctx.engine.aspectPills[0].textContent).to.equal('Carré 1:1');
    expect(ctx.engine.moreTrigger.textContent).to.equal('Plus');
    ctx.engine.aspectPills[0].click();
    expect(ctx.track.firstCall.args[0]).to.equal('Aspect Ratio 1:1|UnityWidget');
    ctx.engine.moreTrigger.click();
    expect(ctx.track.lastCall.args[0]).to.equal('Aspect Ratio more|UnityWidget');
    ctx.engine.moreMenu.querySelector('.ia-more-opt').click();
    expect(ctx.engine.moreTrigger.textContent).to.equal('Paysage 4:3');
    expect(ctx.track.lastCall.args[0]).to.equal('Aspect Ratio 4:3|UnityWidget');
    ctx.engine.reset();
    expect(ctx.engine.moreTrigger.textContent).to.equal('Plus');
  });

  it('updates current byte size but retains uploaded byte size for reset', async () => {
    ctx = await makeEngine(resizeData);
    await ctx.engine.setImage(dataUrl(20, 10), 512);
    await ctx.engine.updateSizeReadout();
    expect(ctx.engine.currentImageSize).to.equal(512);
    expect(ctx.engine.uploadedImageSize).to.equal(2048);
    expect(ctx.engine.sizeReadout.textContent).to.equal('Original size: 1 KB New size: --');
  });

  ['image/png', 'image/webp'].forEach((type) => {
    it(`uses ${type} encoding with browser-default quality for the size estimate`, async () => {
      ctx = await makeEngine(resizeData);
      const encode = sinon.stub(HTMLCanvasElement.prototype, 'toBlob')
        .callsFake((callback) => callback(new Blob(['encoded'], { type })));
      ctx.engine.setOutputType(type);
      expect(await ctx.engine.computeNewSize(20, 10)).to.equal(7);
      expect(encode.firstCall.args.slice(1)).to.deep.equal([type, undefined]);
      expect(ctx.engine.toggleBtns.find((b) => b.dataset.mode === 'quality').classList.contains('hide')).to.equal(true);
      encode.restore();
    });
  });

  it('ignores stale size estimates that finish after a more recent estimate', async () => {
    ctx = await makeEngine(resizeData);
    const callbacks = [];
    const encode = sinon.stub(HTMLCanvasElement.prototype, 'toBlob').callsFake((callback) => callbacks.push(callback));
    ctx.engine.hasInteracted = true;
    const first = ctx.engine.updateSizeReadout();
    const second = ctx.engine.updateSizeReadout();
    callbacks[1](new Blob(['x'.repeat(4096)]));
    await second;
    callbacks[0](new Blob(['x'.repeat(8192)]));
    await first;
    expect(ctx.engine.sizeReadout.textContent).to.equal('Original size: 2 KB New size: 4 KB');
    encode.restore();
  });

  it('handles empty encoder output and source images that are not ready', async () => {
    ctx = await makeEngine(resizeData);
    const encode = sinon.stub(HTMLCanvasElement.prototype, 'toBlob').callsFake((callback) => callback(null));
    expect(await ctx.engine.computeNewSize(20, 10)).to.equal(null);
    ctx.engine.applyQualityPreview();
    expect(ctx.engine.qualityPreviewActive).to.equal(false);
    ctx.engine.sourceImg = null;
    expect(await ctx.engine.computeNewSize(20, 10)).to.equal(null);
    ctx.engine.applyQualityPreview();
    expect(ctx.engine.qualityPreviewActive).to.equal(false);
    encode.restore();
  });

  it('supports editors without optional sliders, headers or preset rows', async () => {
    const data = { operation: 'crop', sliderModes: [], aspectRows: [], nbaPills: [] };
    ctx = await makeEngine(data);
    ctx.engine.header.remove();
    ctx.engine.header = null;
    ctx.engine.setupResponsiveHeader();
    ctx.engine.setupResponsiveActions();
    ctx.engine.setMode('zoom');
    ctx.engine.setLocked(false);
    expect(ctx.engine.slider).to.equal(null);
    expect(ctx.engine.locked).to.equal(false);
    expect(ctx.engine.getResizeDimensions()).to.deep.equal({ width: 200, height: 100 });
  });

  it('preserves input text while the dimension field is focused', async () => {
    ctx = await makeEngine(resizeData);
    ctx.engine.widthInput.focus();
    ctx.engine.widthInput.value = '125';
    ctx.engine.syncDimensionFields();
    expect(ctx.engine.widthInput.value).to.equal('125');
    ctx.engine.widthInput.blur();
    ctx.engine.heightInput.focus();
    ctx.engine.heightInput.value = '75';
    ctx.engine.syncDimensionFields();
    expect(ctx.engine.heightInput.value).to.equal('75');
  });

  it('handles keyboard navigation in an empty menu and focus outside a menu', async () => {
    ctx = await makeEngine(resizeData);
    const empty = document.createElement('div');
    const key = (value) => new KeyboardEvent('keydown', { key: value, cancelable: true });
    ctx.engine.handleDropdownKeydown(key('ArrowDown'), empty, () => {});
    ctx.engine.unitTrigger.focus();
    ctx.engine.handleDropdownKeydown(key('ArrowUp'), ctx.engine.unitMenu, () => {});
    expect(document.activeElement).to.equal(ctx.engine.unitMenu.lastElementChild);
    ctx.engine.unitTrigger.focus();
    ctx.engine.handleDropdownKeydown(key('ArrowDown'), ctx.engine.unitMenu, () => {});
    expect(document.activeElement).to.equal(ctx.engine.unitMenu.firstElementChild);
  });
});

describe('initEditor', () => {
  const mount = () => {
    document.body.innerHTML = '<div id="l"></div><div id="r"></div>';
    return [document.getElementById('l'), document.getElementById('r')];
  };
  afterEach(() => {
    sinon.restore();
    document.querySelectorAll('.ia-more-menu, .ia-social-menu, .ia-unit-menu').forEach((m) => m.remove());
    document.body.innerHTML = '';
  });

  it('loads the rows for the operation and builds the engine', async () => {
    sinon.stub(window, 'fetch').resolves({
      ok: true,
      json: async () => ({ content: { data: [{ module: 'crop', nameId: 'freeform', nameLabel: 'Freeform' }, { module: 'resize', groupId: 'freeform', groupLabel: 'Custom' }] } }),
    });
    const [l, r] = mount();
    const engine = await initEditor(l, r, { ...cropData, aspectRows: undefined });
    expect(engine).to.be.instanceOf(EditorEngine);
    expect(engine.aspectPills.length).to.equal(1);
  });

  it('falls back to no rows when the request fails, is not ok or has bad data', async () => {
    const stub = sinon.stub(window, 'fetch');
    stub.onCall(0).resolves({ ok: false, status: 500 });
    stub.onCall(1).resolves({ ok: true, json: async () => ({ content: { data: 'x' } }) });
    stub.onCall(2).rejects(new Error('network'));
    const lana = sinon.stub();
    window.lana = { log: lana };
    for (let i = 0; i < 3; i += 1) {
      const [l, r] = mount();
      // eslint-disable-next-line no-await-in-loop
      const engine = await initEditor(l, r, { ...cropData, aspectRows: undefined });
      expect(engine.aspectPills.length).to.equal(0);
    }
    expect(lana.calledTwice).to.be.true;
    delete window.lana;
  });
});
