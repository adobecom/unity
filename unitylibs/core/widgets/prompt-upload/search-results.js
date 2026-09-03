import { createTag } from '../../../scripts/utils.js';

// Renders the results dropdown for a query. Lazily imported on first search so this module
// and the results data stay off the initial widget bundle (Phase 1 ships without it).
export default async function renderSearchResults({ query, resultsEl, onSelect, lanaOptions }) {
  try {
    const { default: searchResults } = await import('./results-mock.js');
    const results = await searchResults(query);
    resultsEl.innerHTML = '';
    if (!results.length) { resultsEl.classList.add('hidden'); return; }

    const list = createTag('ul', { class: 'pu-results-list', role: 'listbox', 'aria-label': 'Matching results' });
    results.forEach((r) => {
      const link = createTag('a', { href: '#', class: 'verb-link model-link', role: 'option', 'data-result-id': r.id });
      const text = createTag('span', { class: 'model-name pu-result-text' });
      text.append(
        createTag('span', { class: 'pu-result-title' }, r.title),
        createTag('span', { class: 'pu-result-meta' }, `${r.authors} (${r.year}). ${r.source}`),
      );
      link.append(text);
      const li = createTag('li', { class: 'verb-item', role: 'presentation' });
      li.append(link);
      list.append(li);
    });
    list.addEventListener('click', (e) => {
      const link = e.target.closest('a.model-link');
      if (!link) return;
      e.preventDefault();
      e.stopPropagation();
      onSelect(results.find((r) => r.id === link.getAttribute('data-result-id')));
    });

    resultsEl.append(list);
    resultsEl.classList.remove('hidden');
  } catch (err) {
    window.lana?.log(`Message: result search failed, Error: ${err}`, lanaOptions);
  }
}
