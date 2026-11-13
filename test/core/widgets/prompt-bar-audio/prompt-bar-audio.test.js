import { expect } from '@esm-bundle/chai';

describe('Prompt Bar Audio voice description text spacing', () => {
  let stylesheet;

  before(async () => {
    stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/unitylibs/core/widgets/prompt-bar-audio/prompt-bar-audio.css';
    document.head.append(stylesheet);
    await new Promise((resolve, reject) => {
      stylesheet.addEventListener('load', resolve, { once: true });
      stylesheet.addEventListener('error', reject, { once: true });
    });
  });

  after(() => {
    stylesheet.remove();
    document.body.replaceChildren();
  });

  it('keeps the complete voice descriptions visible with WCAG text-spacing overrides', () => {
    const labels = [
      'Young Adult • Female',
      'Young Adult • Non-binary',
      'Middle Aged • Female',
    ];
    const widget = document.createElement('div');
    widget.className = 'unity-prompt-bar-audio';
    document.body.append(widget);

    labels.forEach((label) => {
      const tile = document.createElement('div');
      tile.className = 'unity-paf-voice-tile';

      const text = document.createElement('div');
      text.className = 'unity-paf-voice-tile-text';

      const description = document.createElement('span');
      description.className = 'unity-paf-voice-desc';
      description.textContent = label;
      description.style.setProperty('line-height', '1.5', 'important');
      description.style.setProperty('letter-spacing', '0.12em', 'important');
      description.style.setProperty('word-spacing', '0.16em', 'important');

      const player = document.createElement('div');
      player.className = 'unity-paf-voice-player';
      tile.append(text, player);
      text.append(description);
      widget.append(tile);
    });

    const descriptions = widget.querySelectorAll('.unity-paf-voice-desc');
    expect(descriptions).to.have.lengthOf(labels.length);
    descriptions.forEach((description, index) => {
      const range = document.createRange();
      range.selectNodeContents(description);
      const lineFragments = range.getClientRects();
      const style = getComputedStyle(description);
      const tile = description.closest('.unity-paf-voice-tile');
      const descriptionBounds = description.getBoundingClientRect();
      const tileBounds = tile.getBoundingClientRect();

      expect(description.textContent).to.equal(labels[index]);
      expect(lineFragments.length).to.be.greaterThan(1);
      expect(style.whiteSpace).to.equal('normal');
      expect(style.overflow).to.equal('visible');
      expect(descriptionBounds.height).to.be.greaterThan(30);
      expect(tileBounds.height).to.be.at.least(descriptionBounds.height + 28);
    });
  });
});
