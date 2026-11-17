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

    const hint = document.createElement('p');
    hint.className = 'unity-paf-voice-scroll-hint';
    hint.textContent = 'Swipe or scroll to see more voices';
    section.append(row, hint);
    widget.append(section);
    document.body.append(widget);
    return { row, section, hint };
  }

  it('keeps desktop voice descriptions on one line with the separator', () => {
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
      const lineTops = new Set([...range.getClientRects()].map((rect) => rect.top));

      expect(description.childElementCount).to.equal(0);
      expect(lineTops).to.have.lengthOf(1);
      expect(getComputedStyle(description).whiteSpace).to.equal('nowrap');
      expect(getComputedStyle(tile).padding).to.equal('14px');
      expect(tile.getBoundingClientRect().width).to.be.at.least(270);
    });
    expect(section.getBoundingClientRect().width).to.equal(900);
  });

  it('fits mobile tiles to the row, keeps labels readable, and shows a next-card peek', () => {
    const labels = [
      'Young Adult • Female',
      'Young Adult • Non-binary',
      'Middle Aged • Female',
    ];
    const { row, section, hint } = addVoiceSection(260, labels);
    const tiles = row.querySelectorAll('.unity-paf-voice-tile');
    const rowBounds = row.getBoundingClientRect();
    const firstBounds = tiles[0].getBoundingClientRect();
    const nextBounds = tiles[1].getBoundingClientRect();
    const visibleNextCardWidth = rowBounds.right - nextBounds.left;

    expect(firstBounds.width).to.be.lessThan(rowBounds.width);
    expect(firstBounds.width).to.be.within(190, 210);
    expect(visibleNextCardWidth).to.be.within(35, 75);
    expect(row.scrollWidth).to.be.greaterThan(row.clientWidth);
    expect(getComputedStyle(hint).display).to.equal('block');

    tiles.forEach((tile, index) => {
      const description = tile.querySelector('.unity-paf-voice-desc');
      const textBounds = tile.querySelector('.unity-paf-voice-tile-text').getBoundingClientRect();
      const tileBounds = tile.getBoundingClientRect();

      expect(description.textContent).to.equal(labels[index]);
      expect(description.childElementCount).to.equal(0);
      expect(getComputedStyle(description).whiteSpace).to.equal('normal');
      expect(getComputedStyle(tile).alignItems).to.equal('center');
      expect(Math.abs((textBounds.top + textBounds.bottom) / 2 - (tileBounds.top + tileBounds.bottom) / 2)).to.be.lessThan(1);
      expect(getComputedStyle(tile).padding).to.equal('14px');
      expect(tile.getBoundingClientRect().height).to.be.greaterThan(60);
    });
    expect(section.getBoundingClientRect().width).to.equal(260);
  });
});
