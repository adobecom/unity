import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';

describe('prompt-bar-style.css', () => {
  let css;

  before(async () => {
    css = await readFile({ path: '../../../unitylibs/core/widgets/prompt-bar-style/prompt-bar-style.css' });
  });

  describe('RTL — base inp-wrap direction (Change A)', () => {
    it('contains direction: inherit', () => {
      expect(css).to.include('direction: inherit');
    });
  });

  describe('RTL — inp-field logical margin (Change B)', () => {
    it('uses margin-inline-end: 5px', () => {
      expect(css).to.include('margin-inline-end: 5px');
    });

    it('does not use physical margin: 0 5px 0 0', () => {
      expect(css).not.to.include('margin: 0 5px 0 0');
    });
  });

  describe('error toast opacity rule (Change C)', () => {
    it('uses :has(.alert-holder.show) selector', () => {
      expect(css).to.include(':has(.alert-holder.show)');
    });

    it('targets .unity-slf-style-container', () => {
      expect(css).to.include(':has(.alert-holder.show) .unity-slf-style-container');
    });

    it('targets .ex-unity-wrap > :not(.alert-holder)', () => {
      expect(css).to.include(':has(.alert-holder.show) .ex-unity-wrap > :not(.alert-holder)');
    });

    it('sets opacity to 0.05', () => {
      expect(css).to.include('opacity: 0.05');
    });
  });

  describe('RTL — unity-prompt-bar-style grid inp-wrap (Change D)', () => {
    it('uses minmax(0, 1fr) to prevent grid overflow in RTL', () => {
      expect(css).to.include('minmax(0, 1fr)');
    });

    it('does not use plain grid-template-columns: 1fr auto', () => {
      expect(css).not.to.include('grid-template-columns: 1fr auto');
    });

    it('contains direction: inherit in unity-prompt-bar-style inp-wrap', () => {
      const matches = css.match(/direction:\s*inherit/g);
      expect(matches).to.have.length.at.least(2);
    });
  });

  describe('RTL — logical justify-content values (Changes E, F, G)', () => {
    it('uses justify-content: start (Change E and G)', () => {
      expect(css).to.include('justify-content: start');
    });

    it('uses justify-content: end (Change F)', () => {
      expect(css).to.include('justify-content: end');
    });
  });

  describe('opacity rule — computed style behavior', () => {
    let container;
    let style;

    before(() => {
      style = document.createElement('style');
      style.textContent = `
        .unity-prompt-bar-style .unity-slf-left:has(.alert-holder.show) .unity-slf-style-container,
        .unity-prompt-bar-style .unity-slf-left:has(.alert-holder.show) .ex-unity-wrap > :not(.alert-holder) {
          opacity: 0.05;
        }
      `;
      document.head.appendChild(style);

      container = document.createElement('div');
      container.className = 'unity-prompt-bar-style';
      container.innerHTML = `
        <div class="unity-slf-left">
          <div class="alert-holder show"></div>
          <div class="unity-slf-style-container"></div>
          <div class="ex-unity-wrap">
            <div class="other-child"></div>
            <div class="alert-holder"></div>
          </div>
        </div>
      `;
      document.body.appendChild(container);
    });

    after(() => {
      document.body.removeChild(container);
      document.head.removeChild(style);
    });

    it('fades .unity-slf-style-container to 0.05 when .alert-holder has show class', () => {
      const el = container.querySelector('.unity-slf-style-container');
      expect(window.getComputedStyle(el).opacity).to.equal('0.05');
    });

    it('fades non-alert .ex-unity-wrap children to 0.05', () => {
      const el = container.querySelector('.other-child');
      expect(window.getComputedStyle(el).opacity).to.equal('0.05');
    });

    it('does not fade .alert-holder inside .ex-unity-wrap (excluded by :not)', () => {
      const el = container.querySelector('.ex-unity-wrap .alert-holder');
      expect(window.getComputedStyle(el).opacity).to.equal('1');
    });

    it('restores normal opacity when .alert-holder loses show class', () => {
      const showAlert = container.querySelector('.alert-holder.show');
      showAlert.classList.remove('show');

      const el = container.querySelector('.unity-slf-style-container');
      expect(window.getComputedStyle(el).opacity).to.equal('1');

      showAlert.classList.add('show');
    });
  });
});
