/* eslint-disable max-len */
import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import augmentSound from '../../../unitylibs/core/workflow/workflow-firefly/sound-utils.js';

describe('sound-utils augment', () => {
  let originalAudio;

  function makeWidget() {
    const widget = {
      widget: document.createElement('div'),
      widgetWrap: document.createElement('div'),
      durationCache: new Map(),
      genBtn: document.createElement('a'),
    };
    widget.genBtn.className = 'gen-btn';
    // stubbed methods expected by sound-utils
    widget.hidePromptDropdown = () => {};
    augmentSound(widget);
    return widget;
  }

  beforeEach(() => {
    originalAudio = window.Audio;
    function FakeAudio() {
      const obj = { paused: true, ended: false, duration: 60, currentTime: 0, listeners: {} };
      obj.addEventListener = function addEventListener(evt, cb) {
        if (!this.listeners[evt]) this.listeners[evt] = [];
        this.listeners[evt].push(cb);
      };
      obj.play = function play() { this.paused = false; (this.listeners.play || []).forEach((cb) => cb()); return Promise.resolve(); };
      obj.pause = function pause() { this.paused = true; (this.listeners.pause || []).forEach((cb) => cb()); };
      return obj;
    }
    window.Audio = FakeAudio;
  });

  afterEach(() => {
    window.Audio = originalAudio;
    sinon.restore();
  });

  it('attaches expected methods', () => {
    const w = makeWidget();
    ['formatTime', 'resetTileToIdle', 'toggleSoundDetails', 'renderSoundDetails', 'addSoundSuggestionHandlers', 'consumeEventAndFocus']
      .forEach((m) => expect(typeof w[m]).to.equal('function'));
  });

  it('formatTime returns expected strings', () => {
    const w = makeWidget();
    expect(w.formatTime(0)).to.equal('0:00');
    expect(w.formatTime(5)).to.equal('0:05');
    expect(w.formatTime(75)).to.equal('1:15');
  });

  it('toggleSoundDetails expands, wires Use button, and collapses', () => {
    const w = makeWidget();
    const dropdown = document.createElement('ul');
    const item = document.createElement('li');
    item.className = 'drop-item';
    dropdown.appendChild(item);
    const promptObj = { prompt: 'p', variations: [] };
    w.toggleSoundDetails(dropdown, item, promptObj, 1);
    expect(item.classList.contains('sound-expanded')).to.be.true;
    const inlineBtn = item.querySelector('.use-prompt-btn.inline');
    expect(inlineBtn).to.exist;
    inlineBtn.click();
    expect(w.genBtn.dataset.soundPrompt).to.equal('p');
    // collapse
    w.toggleSoundDetails(dropdown, item, promptObj, 1);
    expect(item.classList.contains('sound-expanded')).to.be.false;
  });

  it('addSoundSuggestionHandlers binds expand on click', () => {
    const w = makeWidget();
    const dropdown = document.createElement('ul');
    const item = document.createElement('li');
    item.className = 'drop-item';
    dropdown.appendChild(item);
    const promptObj = { prompt: 'q', variations: [] };
    w.addSoundSuggestionHandlers(dropdown, item, promptObj, 2);
    item.dispatchEvent(new Event('click', { bubbles: true }));
    expect(item.classList.contains('sound-expanded')).to.be.true;
  });

  it('resetTileToIdle clears playing state and aria attributes', () => {
    const w = makeWidget();
    const strip = document.createElement('div');
    const tile = w.createVariationTile({ label: 'A', url: 'u1' }, 0, strip);
    tile.classList.add('playing', 'selected', 'paused', 'is-active');
    w.resetTileToIdle(tile);
    expect(tile.classList.contains('is-idle')).to.be.true;
    expect(tile.getAttribute('aria-pressed')).to.equal('false');
    const pb = tile.querySelector('.pause-btn');
    expect(pb.classList.contains('hidden')).to.be.true;
  });
});
