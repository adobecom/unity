export function getCgenQueryParams(unityEl) {
  const label = Array.from(unityEl.querySelectorAll('div'))
    .find((el) => el.textContent?.trim().toLowerCase() === 'cgen');
  const cGenNew = label?.nextElementSibling?.textContent?.trim();
  const cGenLegacy = unityEl.querySelector('.icon-cgen')?.nextSibling?.textContent?.trim();
  const cgen = (cGenNew || cGenLegacy || '').trim();
  const params = {};
  if (!cgen) return params;
  cgen.split('&').forEach((param) => {
    const [key, value] = param.split('=');
    if (key && value) params[key] = value;
  });
  return params;
}
export default getCgenQueryParams;
