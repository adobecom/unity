import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { readFile } from '@web/test-runner-commands';

const {
  default: FaceSwapWidget,
  parseFaceSwapAuthoring,
  galleryCdnPath,
  pickViewportCell,
  iconAndText,
  tokenText,
  SLOT_IDS,
} = await import('../../../../unitylibs/core/widgets/face-swap/face-swap.js');

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const pngFile = (name = 'face.png') => new File([Uint8Array.from(atob(PNG), (c) => c.charCodeAt(0))], name, { type: 'image/png' });
const badFile = () => new File(['not an image'], 'bad.png', { type: 'image/png' });
const cfg = { targetCfg: { actionMap: { '.gen-btn': [{ actionType: 'generate' }] } } };

const waitFor = (check, timeout = 2000) => new Promise((resolve, reject) => {
  const start = Date.now();
  const poll = () => {
    if (check()) resolve();
    else if (Date.now() - start > timeout) reject(new Error('waitFor timed out'));
    else setTimeout(poll, 10);
  };
  poll();
});

async function mountWidget() {
  const el = document.querySelector('.unity.workflow-face-swap');
  const widget = new FaceSwapWidget(null, el, cfg, '<svg></svg>');
  const actionMap = await widget.initWidget();
  return { el, widget, actionMap };
}

describe('Face Swap widget', () => {
  beforeEach(async () => {
    document.body.innerHTML = await readFile({ path: './mocks/body.html' });
  });

  afterEach(() => {
    sinon.restore();
    document.body.innerHTML = '';
  });

  describe('authoring', () => {
    it('parses tokens, gallery and media row', () => {
      const parsed = parseFaceSwapAuthoring(document.querySelector('.unity'));
      expect(parsed.title).to.equal('Get started');
      expect(parsed.reset).to.equal('Reset');
      expect(parsed.galleryLabel).to.equal('Image gallery');
      expect(parsed.generate).to.deep.equal({ src: '/cc-shared/assets/svg/generate.svg', txt: 'Try face swap' });
      expect(parsed.model).to.deep.equal({ src: '/cc-shared/assets/svg/gemini.svg', txt: 'Gemini 3.1 (Nano Banana 2)' });
      expect(parsed.slots.original.title).to.equal('Original Image');
      expect(parsed.slots.face.help).to.equal('Upload an image of the face you want to swap in.');
      expect(parsed.gallery.map((g) => g.cdnPath)).to.deep.equal([
        '/cc-shared/assets/face-swap/one.jpg',
        '/cc-shared/assets/face-swap/two.jpg',
        '/cc-shared/assets/face-swap/three.jpg',
      ]);
      expect(parsed.gallery[0].label).to.equal('Portrait');
      expect(parsed.mediaRow.children).to.have.length(3);
    });

    it('falls back when tokens are missing', () => {
      const el = document.createElement('div');
      expect(tokenText(el, 'placeholder-title')).to.equal('');
      expect(iconAndText(el, 'generate')).to.deep.equal({ src: '', txt: '' });
      const parsed = parseFaceSwapAuthoring(el);
      expect(parsed.reset).to.equal('Reset');
      expect(parsed.gallery).to.deep.equal([]);
      expect(parsed.mediaRow).to.equal(null);
    });

    it('accepts only root-relative gallery CDN paths', () => {
      const li = (html) => Object.assign(document.createElement('li'), { innerHTML: html });
      expect(galleryCdnPath(li('Label<br>/a/b.jpg'))).to.equal('/a/b.jpg');
      expect(galleryCdnPath(li('Label<br>https://x.com/b.jpg'))).to.equal(null);
      expect(galleryCdnPath(li('Label<br>//x.com/b.jpg'))).to.equal(null);
      expect(galleryCdnPath(li('Label only'))).to.equal(null);
    });

    it('picks the media cell for each viewport', () => {
      const row = document.createElement('div');
      row.innerHTML = '<div>m</div><div>t</div><div>d</div>';
      expect(pickViewportCell(row, 'MOBILE').textContent).to.equal('m');
      expect(pickViewportCell(row, 'TABLET').textContent).to.equal('t');
      expect(pickViewportCell(row, 'DESKTOP').textContent).to.equal('d');
      expect(pickViewportCell(row, 'UNKNOWN').textContent).to.equal('d');
      expect(pickViewportCell(null)).to.equal(null);
    });
  });

  describe('mount', () => {
    it('inserts the root before the host and hides authored markup', async () => {
      const { el, widget, actionMap } = await mountWidget();
      expect(actionMap).to.equal(cfg.targetCfg.actionMap);
      expect(el.previousElementSibling).to.equal(widget.extendedRoot);
      expect(el.classList.contains('unity-face-swap-host')).to.be.true;
      const holder = el.querySelector('.unity-slf-config-holder');
      expect(holder.getAttribute('aria-hidden')).to.equal('true');
      expect(widget.extendedRoot.querySelector('.interactive-area.dark')).to.exist;
      expect(widget.extendedRoot.querySelector('.fs-legal').textContent).to.include('Terms of Use');
      expect(widget.extendedRoot.querySelector('.fs-model-name').textContent).to.equal('Gemini 3.1 (Nano Banana 2)');
      expect(widget.genBtn.textContent).to.equal('Try face swap');
    });

    it('gives each slot a labelled input with a unique id across instances', async () => {
      const { widget } = await mountWidget();
      const second = new FaceSwapWidget(null, document.createElement('div'), cfg, '');
      await second.initWidget();
      const ids = [widget, second].flatMap((w) => SLOT_IDS.map((id) => w.slotEls[id].input.id));
      expect(new Set(ids).size).to.equal(4);
      SLOT_IDS.forEach((id) => {
        const { input, label, del } = widget.slotEls[id];
        expect(label.getAttribute('for')).to.equal(input.id);
        expect(input.hasAttribute('capture')).to.be.false;
        expect(del.hidden).to.be.true;
        expect(del.getAttribute('aria-label')).to.match(/^Remove /);
      });
    });

    it('renders the gallery as a labelled group of tabbable toggle buttons', async () => {
      const { widget } = await mountWidget();
      const list = widget.extendedRoot.querySelector('.fs-gallery-list[role="group"]');
      const label = document.getElementById(list.getAttribute('aria-labelledby'));
      expect(label.textContent).to.equal('Image gallery');
      expect(widget.galleryItems).to.have.length(3);
      widget.galleryItems.forEach((i) => {
        expect(i.tagName).to.equal('BUTTON');
        expect(i.type).to.equal('button');
        expect(i.tabIndex).to.equal(0);
        expect(i.getAttribute('aria-pressed')).to.equal('false');
      });
      expect(widget.galleryItems[0].querySelector('img').loading).to.equal('lazy');
    });

    it('mounts only the viewport video and disables the others', async () => {
      const { widget } = await mountWidget();
      const videos = widget.extendedRoot.querySelectorAll('.fs-preview video');
      expect(videos).to.have.length(1);
      document.querySelectorAll('.unity-slf-config-holder video').forEach((v) => {
        expect(v.hasAttribute('autoplay')).to.be.false;
        expect(v.getAttribute('preload')).to.equal('none');
      });
      expect(widget.videoObserver).to.exist;
    });

    it('does not autoplay the video when reduced motion is requested', async () => {
      const original = window.matchMedia;
      sinon.stub(window, 'matchMedia').callsFake((q) => (q.includes('reduced-motion')
        ? { matches: true } : original.call(window, q)));
      const { widget } = await mountWidget();
      const video = widget.extendedRoot.querySelector('.fs-preview video');
      expect(video.hasAttribute('autoplay')).to.be.false;
      expect(widget.videoObserver).to.equal(null);
    });
  });

  describe('slots', () => {
    it('previews an uploaded file and announces it', async () => {
      const { widget } = await mountWidget();
      const selected = sinon.spy();
      widget.widgetWrap.addEventListener('fs-slot-selected', selected);
      expect(widget.handleFiles('face', [pngFile()], 'upload')).to.be.true;
      expect(widget.slotEls.face.slot.dataset.state).to.equal('busy');
      await waitFor(() => widget.slots.face.status === 'ready');
      const { slot, del, img, status } = widget.slotEls.face;
      expect(slot.dataset.state).to.equal('ready');
      expect(del.hidden).to.be.false;
      expect(img.hidden).to.be.false;
      expect(status.textContent).to.equal(', face.png');
      expect(selected.calledOnce).to.be.true;
      expect(selected.firstCall.args[0].detail).to.include({ slotId: 'face', source: 'upload' });
      await waitFor(() => widget.liveRegion.textContent === 'Face Image added');
      expect(widget.getFilledSlots().map(([id]) => id)).to.deep.equal(['face']);
    });

    it('ignores empty selections and rejected files', async () => {
      const { widget } = await mountWidget();
      expect(widget.handleFiles('face', [], 'upload')).to.be.false;
      widget.validateFiles = sinon.stub().returns(false);
      expect(widget.handleFiles('face', [pngFile()], 'upload')).to.be.false;
      expect(widget.validateFiles.calledWith(sinon.match.array, 'face')).to.be.true;
      expect(widget.slots.face.status).to.equal('empty');
    });

    it('handles files chosen through the input', async () => {
      const { widget } = await mountWidget();
      const { input } = widget.slotEls.original;
      const dt = new DataTransfer();
      dt.items.add(pngFile('picked.png'));
      input.files = dt.files;
      input.dispatchEvent(new Event('change'));
      await waitFor(() => widget.slots.original.status === 'ready');
      expect(widget.slots.original.name).to.equal('picked.png');
      expect(widget.slots.original.source).to.equal('upload');
    });

    it('clears the slot and reports when the preview cannot load', async () => {
      const { widget } = await mountWidget();
      widget.onPreviewError = sinon.spy();
      widget.handleFiles('face', [badFile()], 'upload');
      await waitFor(() => widget.onPreviewError.called);
      expect(widget.onPreviewError.calledWith('face', 'upload')).to.be.true;
      expect(widget.slots.face.status).to.equal('empty');
    });

    it('revokes the previous object URL when a slot is replaced', async () => {
      const revoke = sinon.spy(URL, 'revokeObjectURL');
      const { widget } = await mountWidget();
      widget.handleFiles('face', [pngFile('a.png')], 'upload');
      const first = widget.slots.face.objectUrl;
      widget.handleFiles('face', [pngFile('b.png')], 'upload');
      expect(revoke.calledWith(first)).to.be.true;
      await waitFor(() => widget.slots.face.status === 'ready');
      expect(widget.slots.face.name).to.equal('b.png');
    });

    it('deletes a slot, restores focus and emits a cleared event', async () => {
      const { widget } = await mountWidget();
      const cleared = sinon.spy();
      widget.widgetWrap.addEventListener('fs-slot-cleared', cleared);
      widget.handleFiles('face', [pngFile()], 'upload');
      await waitFor(() => widget.slots.face.status === 'ready');
      widget.slotEls.face.del.click();
      expect(widget.slots.face.status).to.equal('empty');
      expect(widget.slotEls.face.del.hidden).to.be.true;
      expect(document.activeElement).to.equal(widget.slotEls.face.input);
      expect(cleared.firstCall.args[0].detail).to.deep.equal({ slotId: 'face' });
    });

    it('reveals the delete overlay on tap for touch devices', async () => {
      const original = window.matchMedia;
      sinon.stub(window, 'matchMedia').callsFake((q) => (q === '(hover: none)'
        ? { matches: true } : original.call(window, q)));
      const { widget } = await mountWidget();
      const { slot, label, input } = widget.slotEls.face;
      label.click();
      expect(slot.classList.contains('fs-revealed')).to.be.true;
      input.dispatchEvent(new Event('cancel'));
      expect(slot.classList.contains('fs-revealed')).to.be.false;
      label.click();
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      expect(slot.classList.contains('fs-revealed')).to.be.false;
    });
  });

  describe('drag and drop', () => {
    const drag = (type, target, files = [pngFile()]) => {
      const dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f));
      const e = new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true });
      target.dispatchEvent(e);
      return e;
    };

    it('tracks nested drag enter/leave without flicker', async () => {
      const { widget } = await mountWidget();
      const { slot, label } = widget.slotEls.face;
      drag('dragenter', label);
      drag('dragenter', label);
      expect(slot.classList.contains('fs-dragover')).to.be.true;
      drag('dragleave', label);
      expect(slot.classList.contains('fs-dragover')).to.be.true;
      drag('dragleave', label);
      expect(slot.classList.contains('fs-dragover')).to.be.false;
      expect(drag('dragover', label).defaultPrevented).to.be.true;
    });

    it('ignores drags that carry no files', async () => {
      const { widget } = await mountWidget();
      const { slot, label } = widget.slotEls.face;
      const e = new DragEvent('dragenter', { dataTransfer: new DataTransfer(), bubbles: true, cancelable: true });
      label.dispatchEvent(e);
      expect(slot.classList.contains('fs-dragover')).to.be.false;
      expect(e.defaultPrevented).to.be.false;
    });

    it('fills the slot on drop and blocks browser navigation elsewhere', async () => {
      const { widget } = await mountWidget();
      drag('dragenter', widget.slotEls.original.label);
      drag('drop', widget.slotEls.original.label);
      expect(widget.slotEls.original.slot.classList.contains('fs-dragover')).to.be.false;
      expect(widget.slots.original.source).to.equal('drop');
      expect(drag('drop', widget.extendedRoot.querySelector('.fs-header')).defaultPrevented).to.be.true;
    });
  });

  describe('gallery', () => {
    it('selects into the original slot and marks the option', async () => {
      const { widget } = await mountWidget();
      const selected = sinon.spy();
      widget.widgetWrap.addEventListener('fs-slot-selected', selected);
      widget.galleryItems[1].click();
      expect(widget.slots.original).to.include({ source: 'gallery', cdnPath: '/cc-shared/assets/face-swap/two.jpg', galleryIndex: 1 });
      expect(widget.galleryItems[1].getAttribute('aria-pressed')).to.equal('true');
      expect(widget.galleryItems[0].getAttribute('aria-pressed')).to.equal('false');
      expect(selected.firstCall.args[0].detail).to.deep.equal({ slotId: 'original', source: 'gallery', galleryIndex: 1 });
      await waitFor(() => widget.slots.original.status === 'ready');
      expect(widget.getFilledSlots().map(([id]) => id)).to.deep.equal(['original']);
    });

    it('clears the gallery selection when an upload replaces the original', async () => {
      const { widget } = await mountWidget();
      widget.selectGallery(0);
      widget.handleFiles('original', [pngFile()], 'upload');
      expect(widget.galleryItems.every((i) => i.getAttribute('aria-pressed') === 'false')).to.be.true;
      expect(widget.slots.original.cdnPath).to.equal(null);
    });

    it('keeps every tile a tab stop and moves focus with arrow, Home and End keys', async () => {
      const { widget } = await mountWidget();
      const items = widget.galleryItems;
      const key = (k) => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
      items[0].focus();
      key('ArrowRight');
      expect(document.activeElement).to.equal(items[1]);
      expect(items.every((i) => i.tabIndex === 0)).to.be.true;
      key('End');
      expect(document.activeElement).to.equal(items[2]);
      key('ArrowDown');
      expect(document.activeElement).to.equal(items[0]);
      key('ArrowLeft');
      expect(document.activeElement).to.equal(items[2]);
      key('Home');
      expect(document.activeElement).to.equal(items[0]);
      key('Tab');
      expect(document.activeElement).to.equal(items[0]);
    });
  });

  describe('reset', () => {
    it('is a silent no-op when nothing is selected', async () => {
      const { widget } = await mountWidget();
      const reset = sinon.spy();
      widget.widgetWrap.addEventListener('fs-reset', reset);
      expect(widget.reset()).to.be.false;
      expect(reset.called).to.be.false;
    });

    it('clears both slots, the gallery mark and focuses the original slot', async () => {
      const { widget } = await mountWidget();
      const reset = sinon.spy();
      widget.widgetWrap.addEventListener('fs-reset', reset);
      widget.selectGallery(2);
      widget.handleFiles('face', [pngFile()], 'upload');
      widget.resetBtn.click();
      expect(SLOT_IDS.every((id) => widget.slots[id].status === 'empty')).to.be.true;
      expect(widget.galleryItems.every((i) => i.getAttribute('aria-pressed') === 'false')).to.be.true;
      expect(reset.calledOnce).to.be.true;
      expect(document.activeElement).to.equal(widget.slotEls.original.input);
      await waitFor(() => widget.liveRegion.textContent === 'Images cleared');
    });
  });

  describe('teardown', () => {
    it('releases observers, listeners and object URLs when removed', async () => {
      const { widget } = await mountWidget();
      widget.handleFiles('face', [pngFile()], 'upload');
      const url = widget.slots.face.objectUrl;
      const revoke = sinon.spy(URL, 'revokeObjectURL');
      const removeListener = sinon.spy(document, 'removeEventListener');
      widget.extendedRoot.remove();
      await waitFor(() => widget.removalObserver === null);
      expect(revoke.calledWith(url)).to.be.true;
      expect(removeListener.calledWith('pointerdown', widget.onOutsideTap)).to.be.true;
      expect(widget.videoObserver).to.equal(null);
    });
  });
});
