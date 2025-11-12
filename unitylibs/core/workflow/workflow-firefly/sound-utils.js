/* eslint-disable class-methods-use-this */
import { createTag } from '../../../scripts/utils.js';

export default function augmentSound(widget) {
  widget.showPlaybackErrorToast = function showPlaybackErrorToast() {
    try {
      this.widgetWrap?.dispatchEvent(new CustomEvent('firefly-audio-error', { detail: { error: 'audio-playback-failed' } }));
    } catch (e) { /* noop */ }
  };

  widget.resetTileToIdle = function resetTileToIdle(tile) {
    if (!tile) return;
    const audioEl = tile.audioRef;
    if (audioEl) {
      tile.dataset.forceIdle = '1';
      try { audioEl.pause(); } catch (e) { /* noop */ }
      try { audioEl.currentTime = 0; } catch (e) { /* noop */ }
    }
    tile.classList.remove('playing', 'selected', 'paused', 'is-active');
    tile.classList.add('is-idle');
    tile.setAttribute('aria-pressed', 'false');
    const pb = tile.querySelector('.pause-btn');
    if (pb) pb.classList.add('hidden');
    const fill = tile.querySelector('.seek-fill');
    if (fill) { fill.style.width = '0%'; fill.style.transform = 'scaleX(0)'; }
    const bar = tile.querySelector('.seek-bar');
    if (bar) { bar.setAttribute('aria-valuenow', '0'); try { bar.style.setProperty('--progress', '0%'); } catch (e) { /* noop */ } }
    const tm = tile.querySelector('.time-el');
    if (tm && audioEl) {
      const setDuration = () => { tm.textContent = this.formatTime(audioEl.duration); };
      if (Number.isFinite(audioEl.duration) && audioEl.duration > 0) setDuration();
      else audioEl.addEventListener('loadedmetadata', setDuration, { once: true });
    }
  };

  widget.consumeEventAndFocus = function consumeEventAndFocus(ev, targetEl) {
    if (!ev) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (targetEl) {
      try { setTimeout(() => targetEl.focus(), 0); } catch (err) { /* noop */ }
    }
  };

  widget.formatTime = function formatTime(sec) {
    const s = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  widget.createVariationTile = function createVariationTile(v, i, strip) {
    const tile = createTag('div', { class: 'variation-tile', role: 'button', tabindex: '0', 'aria-pressed': 'false' });
    const labelText = v.label || `Example ${i + 1}`;
    const label = createTag('div', { class: 'variation-label inline' }, labelText);
    const audioObj = new Audio(v.url);
    audioObj.preload = 'auto';
    tile.audioRef = audioObj;
    const player = createTag('div', { class: 'custom-player' });
    const pauseBtn = createTag('button', { class: 'pause-btn hidden', 'aria-label': `Pause ${labelText}` });
    const setBtnToPause = () => {
      pauseBtn.innerHTML = '<svg width="20" height="20" aria-hidden="true"><use xlink:href="#unity-pause-icon"></use></svg>';
      pauseBtn.dataset.state = 'pause';
      pauseBtn.setAttribute('aria-label', `Pause ${labelText}`);
    };
    const setBtnToPlay = () => {
      pauseBtn.innerHTML = '<svg width="20" height="20" aria-hidden="true"><use xlink:href="#unity-play-icon"></use></svg>';
      pauseBtn.dataset.state = 'play';
      pauseBtn.setAttribute('aria-label', `Play ${labelText}`);
    };
    setBtnToPlay();
    const cached = this.durationCache.get(v.url);
    const timeEl = createTag('div', { class: 'time-el' }, cached ? this.formatTime(cached) : '0:00');
    const progressBar = createTag('div', {
      class: 'seek-bar',
      role: 'progressbar',
      'aria-label': `Progress ${labelText}`,
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': '0',
    });
    const progressFill = createTag('div', { class: 'seek-fill' });
    progressBar.append(progressFill);
    player.append(pauseBtn, label, timeEl, progressBar);
    tile.classList.add('is-idle');

    const pauseOthers = () => {
      strip.querySelectorAll('.variation-tile').forEach((t) => { if (t !== tile) this.resetTileToIdle(t); });
    };

    let rafId = null;
    const startRaf = () => {
      if (rafId) cancelAnimationFrame(rafId);
      const tick = () => {
        if (Number.isFinite(audioObj.duration) && audioObj.duration > 0) {
          const pct = (audioObj.currentTime / audioObj.duration) * 100;
          progressFill.style.width = `${pct}%`;
          progressBar.style.setProperty('--progress', `${pct}%`);
          progressBar.setAttribute('aria-valuenow', String(pct));
          timeEl.textContent = this.formatTime(audioObj.currentTime);
        }
        if (!audioObj.paused && !audioObj.ended) rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    };
    const stopRaf = () => { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } };
    const resetProgress = (durSec = audioObj?.duration) => {
      const dur = Number.isFinite(durSec) && durSec > 0 ? durSec : 0;
      progressFill.style.width = '0%';
      progressBar.style.setProperty('--progress', '0%');
      progressBar.setAttribute('aria-valuenow', '0');
      timeEl.textContent = this.formatTime(dur);
    };

    audioObj.addEventListener('loadedmetadata', () => {
      const dur = Number.isFinite(audioObj.duration) && audioObj.duration > 0 ? audioObj.duration : 0;
      if (dur > 0) this.durationCache.set(v.url, dur);
      resetProgress();
    });
    audioObj.addEventListener('timeupdate', () => {
      if (!Number.isFinite(audioObj.duration) || audioObj.duration === 0) return;
      if (tile.classList.contains('playing')) return;
      timeEl.textContent = this.formatTime(audioObj.duration);
    });
    audioObj.addEventListener('play', () => {
      pauseOthers();
      if (tile.dataset && tile.dataset.forceIdle) delete tile.dataset.forceIdle;
      tile.classList.add('playing', 'selected', 'is-active');
      tile.classList.remove('paused', 'is-idle');
      tile.setAttribute('aria-pressed', 'true');
      setBtnToPause();
      pauseBtn.classList.remove('hidden');
      startRaf();
      timeEl.textContent = this.formatTime(audioObj.currentTime);
    });
    audioObj.addEventListener('pause', () => {
      if (tile.dataset.forceIdle === '1') {
        delete tile.dataset.forceIdle;
        tile.classList.remove('playing', 'selected', 'paused', 'is-active');
        tile.classList.add('is-idle');
        pauseBtn.classList.add('hidden');
        try { audioObj.currentTime = 0; } catch (e) { /* noop */ }
        resetProgress();
        stopRaf();
        return;
      }
      tile.classList.remove('playing');
      tile.classList.add('paused');
      tile.setAttribute('aria-pressed', 'false');
      setBtnToPlay();
      pauseBtn.classList.remove('hidden');
      timeEl.textContent = this.formatTime(audioObj.currentTime);
      stopRaf();
    });
    audioObj.addEventListener('ended', () => {
      tile.classList.remove('playing', 'is-active', 'paused');
      tile.classList.add('is-idle');
      tile.setAttribute('aria-pressed', 'false');
      pauseBtn.classList.add('hidden');
      try { audioObj.currentTime = 0; } catch (e) { /* noop */ }
      resetProgress();
      stopRaf();
    });

    const togglePlayback = () => {
      const isPlaying = !audioObj.paused && !audioObj.ended;
      if (isPlaying) {
        setBtnToPlay();
        audioObj.pause();
      } else {
        setBtnToPause();
        audioObj.play().catch(() => { setBtnToPlay(); this.showPlaybackErrorToast(); });
      }
    };
    const handlePressToggle = (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { if ('pointerId' in e && pauseBtn.setPointerCapture) pauseBtn.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
      togglePlayback();
    };
    pauseBtn.addEventListener('pointerdown', handlePressToggle);
    pauseBtn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') handlePressToggle(e); });
    pauseBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });

    const playIfPaused = () => {
      if (!audioObj.paused) return;
      setBtnToPause();
      pauseBtn.classList.remove('hidden');
      audioObj.play().catch(() => { this.showPlaybackErrorToast(); });
    };
    tile.addEventListener('click', (ev) => {
      if (ev.target.closest && ev.target.closest('.pause-btn')) return;
      ev.preventDefault();
      playIfPaused();
    });
    tile.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        togglePlayback();
        return;
      }
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
        const detailsEl = tile.closest('.sound-details');
        const tiles = detailsEl ? Array.from(detailsEl.querySelectorAll('.variation-tile')) : [];
        if (!tiles.length) return;
        const idx = tiles.indexOf(tile);
        const dir = ev.key === 'ArrowRight' ? 1 : -1;
        const nextIdx = (idx + dir + tiles.length) % tiles.length;
        const target = tiles[nextIdx];
        this.consumeEventAndFocus(ev, target);
        return;
      }
      if (ev.key === 'Tab' && !ev.shiftKey) {
        const detailsEl = tile.closest('.sound-details');
        if (detailsEl) {
          const nextSuggestion = detailsEl.nextElementSibling && detailsEl.nextElementSibling.classList?.contains('drop-item')
            ? detailsEl.nextElementSibling
            : null;
          if (nextSuggestion) this.consumeEventAndFocus(ev, nextSuggestion);
        }
        return;
      }
      if (ev.key === 'Tab' && ev.shiftKey) {
        const detailsEl = tile.closest('.sound-details');
        if (detailsEl) {
          const prevRow = detailsEl.previousElementSibling;
          const useBtn = prevRow?.querySelector('.use-prompt-btn.inline');
          if (useBtn) this.consumeEventAndFocus(ev, useBtn);
        }
      }
    });

    tile.append(player);
    return tile;
  };

  widget.resetAllSoundVariations = function resetAllSoundVariations(rootEl) {
    const root = rootEl || this.widget;
    root.querySelectorAll('.variation-tile').forEach((t) => { this.resetTileToIdle(t); });
    root.querySelectorAll('.sound-details').forEach((d) => d.remove());
    root.querySelectorAll('.drop-item.sound-expanded').forEach((el) => el.classList.remove('sound-expanded'));
    root.querySelectorAll('.drop-item .use-prompt-btn.inline').forEach((b) => b.remove());
  };

  widget.toggleSoundDetails = function toggleSoundDetails(dropdown, item, promptObj, promptIndex) {
    const next = item.nextElementSibling;
    if (next && next.classList.contains('sound-details')) {
      next.querySelectorAll('.variation-tile').forEach((t) => { this.resetTileToIdle(t); });
      next.remove();
      item.classList.remove('sound-expanded');
      const inlineExisting = item.querySelector('.use-prompt-btn.inline');
      if (inlineExisting) inlineExisting.remove();
      return;
    }
    this.resetAllSoundVariations(dropdown);
    const inlineBtn = createTag('button', {
      class: 'use-prompt-btn inline',
      'data-prompt-index': String(promptIndex),
      'aria-label': `Use prompt ${promptIndex}: ${promptObj.prompt}`,
    }, 'Use prompt');
    inlineBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.hidePromptDropdown();
      const btn = this.genBtn;
      if (btn) {
        btn.dataset.soundPrompt = promptObj.prompt;
        btn.click();
      }
    });
    inlineBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        inlineBtn.click();
        return;
      }
      if (e.key === 'Tab' && !e.shiftKey) {
        const detailsEl = item.nextElementSibling && item.nextElementSibling.classList?.contains('sound-details')
          ? item.nextElementSibling
          : null;
        const firstTile = detailsEl?.querySelector('.variation-tile');
        if (firstTile) { this.consumeEventAndFocus(e, firstTile); }
      }
      if (e.key === 'Tab' && e.shiftKey) { this.consumeEventAndFocus(e, item); }
    });
    item.classList.add('sound-expanded');
    item.append(inlineBtn);
    const details = this.renderSoundDetails(promptObj);
    item.after(details);
  };

  widget.renderSoundDetails = function renderSoundDetails(promptObj) {
    const details = createTag('div', { class: 'sound-details', role: 'region' });
    const strip = createTag('div', { class: 'variation-strip' });
    const vars = Array.isArray(promptObj.variations) ? promptObj.variations : [];
    vars.forEach((v, i) => { const tile = this.createVariationTile(v, i, strip); strip.append(tile); });
    details.append(strip);
    return details;
  };

  widget.addSoundSuggestionHandlers = function addSoundSuggestionHandlers(dropdown, item, promptObj, promptIndex) {
    const expand = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      e.stopPropagation();
      this.toggleSoundDetails(dropdown, item, promptObj, promptIndex);
    };
    item.addEventListener('click', expand);
    item.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') expand(e); });
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && !e.shiftKey && item.classList.contains('sound-expanded')) {
        if (e.target && e.target.closest && e.target.closest('.use-prompt-btn.inline')) return;
        const useBtn = item.querySelector('.use-prompt-btn.inline');
        if (useBtn) { this.consumeEventAndFocus(e, useBtn); }
      }
    });
  };
}
