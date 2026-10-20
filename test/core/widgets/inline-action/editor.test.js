import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
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
    { name: 'Freeform' },
    { name: 'Square', ratio: '1:1' },
    { group: 'More', name: 'Wide', ratio: '16:9' },
    { group: 'More', name: 'Other' },
  ],
  nbaPills: [{ nba: 'removeBackground', label: 'Remove', iconHref: '' }],
};
const resizeData = {
  operation: 'resize',
  sliderModes: [{ mode: 'zoom', label: 'Zoom' }, { mode: 'quality', label: 'Quality' }],
  aspectRows: [
    { group: 'Custom' },
    { group: 'Standard', ratio: '1:1', name: 'Square' },
    { group: 'Social', platform: 'Instagram', name: 'Post', width: 1080, height: 1080 },
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
    const p = buildEditorRightPanel({ ...cropData, aspectRows: [{ name: 'Freeform' }] });
    expect(p.querySelector('.ia-more-trigger')).to.not.exist;
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

  it('resize right panel works with only the custom tab', () => {
    const p = buildEditorRightPanel({ ...resizeData, aspectRows: [{ group: 'Custom' }] });
    expect(p.querySelectorAll('.ia-resize-tab').length).to.equal(1);
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

  it('setImage stores natural size and renders a full-width frame', () => {
    expect(ctx.engine.naturalW).to.equal(200);
    expect(ctx.engine.naturalH).to.equal(100);
    expect(ctx.engine.rect.w).to.equal(100);
    expect(ctx.engine.frame.style.width).to.equal('100%');
  });

  it('selectAspect applies the ratio and marks the pill active', () => {
    const pill = ctx.engine.aspectPills.find((p) => p.dataset.label === 'Square 1:1');
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

  it('formatBytes formats sizes', () => {
    expect(EditorEngine.formatBytes(0)).to.equal('--');
    expect(EditorEngine.formatBytes(500)).to.equal('1 KB');
    expect(EditorEngine.formatBytes(2 * 1024 * 1024)).to.equal('2.0 MB');
  });

  it('locked width commit keeps the aspect ratio', () => {
    ctx.engine.widthInput.value = '100';
    ctx.engine.onDimensionCommit('width');
    expect(ctx.engine.getResizeDimensions()).to.deep.equal({ width: 100, height: 50 });
  });

  it('locked height commit keeps the aspect ratio', () => {
    ctx.engine.heightInput.value = '50';
    ctx.engine.onDimensionCommit('height');
    expect(ctx.engine.getResizeDimensions()).to.deep.equal({ width: 100, height: 50 });
  });

  it('unlocked commit changes one axis and moves the frame', () => {
    ctx.engine.setLocked(false);
    ctx.engine.widthInput.value = '100';
    ctx.engine.onDimensionCommit('width');
    expect(ctx.engine.targetW).to.equal(100);
    expect(ctx.engine.targetH).to.equal(100);
    ctx.engine.heightInput.value = '50';
    ctx.engine.onDimensionCommit('height');
    expect(ctx.engine.targetH).to.equal(50);
  });

  it('invalid commits are ignored', () => {
    ctx.engine.widthInput.value = '0';
    ctx.engine.onDimensionCommit('width');
    expect(ctx.engine.targetW).to.equal(200);
  });

  it('Enter commits, blur commits and arrow keys commit', () => {
    ctx.engine.widthInput.value = '100';
    ctx.engine.widthInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(ctx.engine.targetW).to.equal(100);
    ctx.engine.heightInput.value = '20';
    ctx.engine.heightInput.dispatchEvent(new Event('blur'));
    expect(ctx.engine.targetH).to.equal(20);
    ctx.engine.widthInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    ctx.engine.widthInput.value = '60';
    ctx.engine.widthInput.dispatchEvent(new Event('input'));
    expect(ctx.engine.targetW).to.equal(60);
    ctx.engine.widthInput.dispatchEvent(new Event('input'));
  });

  it('clicking Width and Height sends analytics', () => {
    ctx.engine.widthInput.click();
    ctx.engine.heightInput.click();
    expect(ctx.track.calledWith('Aspect Ratio Custom - Width|UnityWidget')).to.be.true;
    expect(ctx.track.calledWith('Aspect Ratio Custom - Height|UnityWidget')).to.be.true;
  });

  it('unit conversion uses 72 dpi', () => {
    ctx.engine.unit = 'in';
    ctx.engine.widthInput.value = '1';
    ctx.engine.onDimensionCommit('width');
    expect(ctx.engine.targetW).to.equal(72);
    ctx.engine.syncDimensionFields();
    expect(ctx.engine.widthInput.value).to.equal('1');
  });

  it('unit menu selects a unit and sends analytics', () => {
    ctx.engine.unitTrigger.click();
    expect(ctx.engine.unitMenu.classList.contains('hide')).to.be.false;
    ctx.engine.unitMenu.querySelector('[data-unit="cm"]').click();
    expect(ctx.engine.unit).to.equal('cm');
    expect(ctx.engine.unitLabel.textContent).to.equal('cm');
    expect(ctx.track.calledWith('Aspect Ratio Custom - Unit - cm|UnityWidget')).to.be.true;
    ctx.engine.unitTrigger.click();
    ctx.engine.unitMenu.querySelector('.ia-dropdown-close').click();
    expect(ctx.engine.unitMenu.classList.contains('hide')).to.be.true;
    ctx.engine.unitTrigger.click();
    ctx.engine.unitTrigger.click();
    document.body.click();
  });

  it('lock button toggles the lock state and icon', () => {
    ctx.engine.lockBtn.click();
    expect(ctx.engine.locked).to.be.false;
    expect(ctx.engine.lockBtn.getAttribute('aria-pressed')).to.equal('false');
    expect(ctx.engine.lockBtn.querySelector('img').src).to.contain('unlock');
  });

  it('tabs switch panels and send analytics', () => {
    const std = ctx.engine.resizeTabs.find((t) => t.dataset.tab === 'standard');
    std.click();
    expect(ctx.engine.resizeTab).to.equal('standard');
    expect(ctx.track.calledWith('Aspect Ratio Standard|UnityWidget')).to.be.true;
    const panel = ctx.engine.resizeDetails.find((d) => d.dataset.tab === 'standard');
    expect(panel.classList.contains('hide')).to.be.false;
  });

  it('standard pill sends the name analytics and applies dimensions', () => {
    const pill = ctx.engine.aspectPills.find((p) => p.dataset.name === 'Square');
    pill.click();
    expect(ctx.track.calledWith('Aspect Ratio Standard - Square|UnityWidget')).to.be.true;
    expect(ctx.engine.selectedPill).to.equal(pill);
  });

  it('social menu selects a platform and its pill sends no analytics', () => {
    const social = ctx.engine.socialTrigger;
    social.click();
    expect(ctx.engine.socialMenu.classList.contains('hide')).to.be.false;
    ctx.engine.socialMenu.querySelector('.ia-social-opt').click();
    expect(ctx.track.calledWith('Aspect Ratio Social - Instagram|UnityWidget')).to.be.true;
    expect(social.textContent).to.equal('Instagram');
    ctx.track.resetHistory();
    const pill = ctx.engine.aspectPills.find((p) => p.dataset.platform === 'Instagram');
    pill.click();
    expect(ctx.track.called).to.be.false;
    expect(ctx.engine.targetW).to.equal(1080);
    social.click();
    ctx.engine.socialMenu.querySelector('.ia-dropdown-close').click();
    social.click();
    social.click();
    document.body.click();
  });

  it('switching away from the social tab restores its label', () => {
    ctx.engine.socialTrigger.textContent = 'Instagram';
    ctx.engine.resizeTabs.find((t) => t.dataset.tab === 'custom').click();
    expect(ctx.engine.socialTrigger.textContent).to.equal(ctx.engine.socialDefaultLabel);
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

  it('reset restores the custom tab, unit, lock and size', () => {
    ctx.engine.setLocked(false);
    ctx.engine.unit = 'in';
    ctx.engine.resizeTabs.find((t) => t.dataset.tab === 'standard').click();
    ctx.engine.reset();
    expect(ctx.engine.locked).to.be.true;
    expect(ctx.engine.unit).to.equal('px');
    expect(ctx.engine.resizeTab).to.equal('custom');
    expect(ctx.engine.getResizeDimensions()).to.deep.equal({ width: 200, height: 100 });
  });

  it('unlocked custom drag updates the target size', () => {
    ctx.engine.setLocked(false);
    const handle = ctx.engine.frame.querySelector('.ia-handle--e');
    handle.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, clientY: 0, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: -40, clientY: 0 }));
    window.dispatchEvent(new PointerEvent('pointerup'));
    expect(ctx.engine.targetW).to.be.below(200);
  });

  it('getDragRatioLock returns null when unlocked and the frame ratio when locked', () => {
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
          ? p.dataset.platform === 'Instagram' : p.dataset.name === 'Square'));
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
        { group: 'Personnalisé' },
        { group: 'Standard', ratio: '4:3', name: 'Landscape', nameLoc: 'Paysage' },
      ],
    });
    const pill = ctx.engine.aspectPills[0];
    expect(pill.textContent).to.equal('Paysage 4:3');
    pill.click();
    expect(ctx.track.firstCall.args[0]).to.equal('Aspect Ratio Standard - Landscape|UnityWidget');
    expect(ctx.engine.resizeTabs[0].textContent).to.equal('Personnalisé');
  });

  it('displays localized Crop pills and More selections without changing crop analytics', async () => {
    ctx = await makeEngine({
      ...cropData,
      aspectRows: [
        { name: 'Square', nameLoc: 'Carré', ratio: '1:1' },
        { group: 'Plus', name: 'Landscape', nameLoc: 'Paysage', ratio: '4:3' },
      ],
    });
    expect(ctx.engine.aspectPills[0].textContent).to.equal('Carré 1:1');
    ctx.engine.aspectPills[0].click();
    expect(ctx.track.firstCall.args[0]).to.equal('Aspect Ratio 1:1|UnityWidget');
    ctx.engine.moreTrigger.click();
    ctx.engine.moreMenu.querySelector('.ia-more-opt').click();
    expect(ctx.engine.moreTrigger.textContent).to.equal('Paysage 4:3');
    expect(ctx.track.lastCall.args[0]).to.equal('Aspect Ratio 4:3|UnityWidget');
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
      json: async () => ({ content: { data: [{ module: 'crop', name: 'Freeform' }, { module: 'resize', group: 'Custom' }] } }),
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
