import { expect } from '@esm-bundle/chai';
import { getCgenQueryParams } from '../../unitylibs/utils/cgen-utils.js';

describe('cgen-utils.getCgenQueryParams', () => {
  let root;
  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });
  afterEach(() => {
    root.remove();
    root = null;
  });

  it('parses legacy DOM after .icon-cgen text node', () => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.className = 'icon icon-cgen';
    li.appendChild(span);
    li.appendChild(document.createTextNode('ff_campaign=embed_generate_acom&promoid=TG8SL6TN&mv=other'));
    const ul = document.createElement('ul');
    ul.appendChild(li);
    root.appendChild(ul);

    const params = getCgenQueryParams(root);
    expect(params).to.deep.equal({
      ff_campaign: 'embed_generate_acom',
      promoid: 'TG8SL6TN',
      mv: 'other',
    });
  });

  it('parses new DOM with "cgen" label and next sibling value div', () => {
    const wrapper = document.createElement('div');
    const label = document.createElement('div');
    label.textContent = 'cgen';
    const val = document.createElement('div');
    val.textContent = 'ff_campaign=embed_generate_acom&promoid=TG8SL6TN&mv=other';
    wrapper.append(label, val);
    root.appendChild(wrapper);

    const params = getCgenQueryParams(root);
    expect(params).to.deep.equal({
      ff_campaign: 'embed_generate_acom',
      promoid: 'TG8SL6TN',
      mv: 'other',
    });
  });

  it('returns empty object when no cgen present', () => {
    const params = getCgenQueryParams(root);
    expect(params).to.deep.equal({});
  });

  it('ignores pairs without "=" or with empty values', () => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.className = 'icon icon-cgen';
    li.appendChild(span);
    li.appendChild(document.createTextNode('foo&bar=baz&empty=&ok=1'));
    const ul = document.createElement('ul');
    ul.appendChild(li);
    root.appendChild(ul);

    const params = getCgenQueryParams(root);
    expect(params).to.deep.equal({ bar: 'baz', ok: '1' });
  });
});

