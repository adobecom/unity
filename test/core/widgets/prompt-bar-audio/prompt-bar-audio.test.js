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

  function addVoiceSection(width, labels) {
    const widget = document.createElement('div');
    widget.className = 'unity-prompt-bar-audio';
    const section = document.createElement('div');
    section.className = 'unity-paf-voice-section';
    section.style.width = `${width}px`;

    const row = document.createElement('div');
    row.className = 'unity-paf-voice-row unity-paf-voice-row-peek';
    row.setAttribute('role', 'list');
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
      text.append(description);
      tile.append(text, player);
      row.append(tile);
    });

    section.append(row);
    widget.append(section);
    document.body.append(widget);
    return { row, section };
  }

  it('keeps complete desktop voice descriptions visible with text-spacing overrides', () => {
    const labels = [
      'Young Adult • Female',
      'Young Adult • Non-binary',
      'Middle Aged • Female',
    ];
    const { section, row } = addVoiceSection(900, labels);
    const tiles = row.querySelectorAll('.unity-paf-voice-tile');

    tiles.forEach((tile) => {
      const description = tile.querySelector('.unity-paf-voice-desc');
      const range = document.createRange();
      range.selectNodeContents(description);
      const fragments = [...range.getClientRects()];
      const descriptionBounds = description.getBoundingClientRect();
      const tileBounds = tile.getBoundingClientRect();

      expect(description.childElementCount).to.equal(0);
      expect(fragments.length).to.be.greaterThan(0);
      expect(getComputedStyle(description).whiteSpace).to.equal('normal');
      expect(getComputedStyle(description).overflow).to.equal('visible');
      expect(getComputedStyle(description).textOverflow).to.equal('clip');
      fragments.forEach((fragment) => {
        expect(fragment.left).to.be.at.least(descriptionBounds.left - 1);
        expect(fragment.right).to.be.at.most(descriptionBounds.right + 1);
        expect(fragment.top).to.be.at.least(tileBounds.top);
        expect(fragment.bottom).to.be.at.most(tileBounds.bottom);
      });
      expect(getComputedStyle(tile).padding).to.equal('14px');
      const expectedWidth = window.matchMedia('(max-width: 1199px)').matches ? 201 : 231;
      expect(tile.getBoundingClientRect().width).to.equal(expectedWidth);
    });
    expect(section.getBoundingClientRect().width).to.equal(900);
  });

  it('fits mobile tiles to the row, keeps labels readable, and shows a next-card peek', () => {
    const labels = [
      'Young Adult • Female',
      'Young Adult • Non-binary',
      'Middle Aged • Female',
    ];
    const { row, section } = addVoiceSection(260, labels);
    const tiles = row.querySelectorAll('.unity-paf-voice-tile');
    const rowBounds = row.getBoundingClientRect();
    const firstBounds = tiles[0].getBoundingClientRect();
    const nextBounds = tiles[1].getBoundingClientRect();
    const visibleNextCardWidth = rowBounds.right - nextBounds.left;

    expect(firstBounds.width).to.be.lessThan(rowBounds.width);
    expect(firstBounds.width).to.be.within(190, 210);
    expect(visibleNextCardWidth).to.be.within(35, 75);
    expect(row.scrollWidth).to.be.greaterThan(row.clientWidth);

    tiles.forEach((tile, index) => {
      const description = tile.querySelector('.unity-paf-voice-desc');
      const textBounds = tile.querySelector('.unity-paf-voice-tile-text').getBoundingClientRect();
      const tileBounds = tile.getBoundingClientRect();

      expect(description.textContent).to.equal(labels[index]);
      expect(description.childElementCount).to.equal(0);
      expect(getComputedStyle(description).whiteSpace).to.equal('normal');
      expect(getComputedStyle(description).overflow).to.equal('visible');
      expect(getComputedStyle(description).textOverflow).to.equal('clip');
      expect(getComputedStyle(tile).alignItems).to.equal('center');
      expect(Math.abs((textBounds.top + textBounds.bottom) / 2 - (tileBounds.top + tileBounds.bottom) / 2)).to.be.lessThan(1);
      expect(getComputedStyle(tile).padding).to.equal('14px');
      expect(tile.getBoundingClientRect().height).to.be.greaterThan(60);
    });
    expect(section.getBoundingClientRect().width).to.equal(260);
  });
});
