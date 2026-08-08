/*
 * POC mock for the keyword -> citation-matches search (requirement #2).
 * DEFERRED: lazy-imported on first Search, so it never blocks initial render/LCP.
 * Replace `searchCitations` with the real backend call once the API is available.
 */

const MOCK_CITATIONS = [
  { id: 'c1', title: 'Spectroscopic constraints on dark matter–photon coupling in dwarf galaxies', authors: 'Martínez, E., Singh, R., & Okafor, P.', year: '2026', source: 'Cosmological Physics, 17(2), 88–113.' },
  { id: 'c2', title: 'A survey of transformer architectures for scientific text', authors: 'Chen, L., & Gupta, A.', year: '2025', source: 'Journal of Machine Learning, 41(4), 210–245.' },
  { id: 'c3', title: 'Climate feedback loops in Arctic permafrost systems', authors: 'Olsen, K., Ahmed, S., & Rivera, M.', year: '2024', source: 'Nature Climate Science, 9(1), 12–34.' },
  { id: 'c4', title: 'Neural correlates of memory consolidation during sleep', authors: 'Nakamura, T., & Bauer, J.', year: '2023', source: 'Neuroscience Review, 58(3), 401–428.' },
  { id: 'c5', title: 'Photonic quantum computing: a decade in review', authors: 'Fernandez, D., Li, W., & Brown, C.', year: '2026', source: 'Quantum Reports, 5(2), 55–90.' },
];

// Simulate an async backend call.
export default function searchCitations(query = '') {
  const q = query.trim().toLowerCase();
  return new Promise((resolve) => {
    setTimeout(() => {
      if (!q) { resolve(MOCK_CITATIONS.slice(0, 3)); return; }
      const matches = MOCK_CITATIONS.filter((c) => `${c.title} ${c.authors} ${c.source}`.toLowerCase().includes(q));
      resolve(matches.length ? matches : MOCK_CITATIONS.slice(0, 2));
    }, 150);
  });
}
