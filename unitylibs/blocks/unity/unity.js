import { loadStyle } from '../../scripts/utils.js';

export const localeMap = {
  '': 'en-us',
  br: 'pt-br',
  ca: 'en-us',
  ca_fr: 'fr-fr',
  mx: 'es-es',
  la: 'es-es',
  africa: 'en-us',
  za: 'en-us',
  be_nl: 'nl-nl',
  be_fr: 'fr-fr',
  be_en: 'en-us',
  cz: 'cs-cz',
  cy_en: 'en-us',
  dk: 'da-dk',
  de: 'de-de',
  ee: 'en-us',
  es: 'es-es',
  fr: 'fr-fr',
  gr_en: 'en-us',
  gr_el: 'en-us',
  ie: 'en-us',
  il_en: 'en-us',
  il_he: 'en-us',
  it: 'it-it',
  lv: 'en-us',
  lt: 'en-us',
  lu_de: 'de-de',
  lu_en: 'en-us',
  lu_fr: 'fr-fr',
  hu: 'en-us',
  mt: 'en-us',
  mena_en: 'en-us',
  mena_ar: 'en-us',
  nl: 'nl-nl',
  no: 'nb-no',
  at: 'de-de',
  pl: 'pl-pl',
  pt: 'pt-br',
  ro: 'ro-ro',
  ch_de: 'de-de',
  si: 'en-us',
  sk: 'en-us',
  ch_fr: 'fr-fr',
  fi: 'fi-fi',
  se: 'sv-se',
  ch_it: 'it-it',
  tr: 'tr-tr',
  uk: 'en-gb',
  bg: 'en-us',
  ru: 'ru-ru',
  ua: 'en-us',
  au: 'en-gb',
  hk_en: 'en-us',
  in: 'en-us',
  in_hi: 'hi-in',
  nz: 'en-gb',
  hk_zh: 'zh-tw',
  tw: 'zh-tw',
  jp: 'ja-jp',
  kr: 'ko-kr',
  ae_en: 'en-us',
  ae_ar: 'en-us',
  sa_en: 'en-us',
  sa_ar: 'en-us',
  th_en: 'en-us',
  th_th: 'th-th',
  sg: 'en-us',
  cl: 'es-es',
  co: 'es-es',
  ar: 'es-es',
  cr: 'es-es',
  pr: 'es-es',
  ec: 'es-es',
  pe: 'es-es',
  eg_en: 'en-us',
  eg_ar: 'en-us',
  gt: 'es-es',
  id_en: 'en-us',
  id_id: 'id-id',
  ph_en: 'en-us',
  ph_fil: 'en-us',
  my_en: 'en-us',
  my_ms: 'en-us',
  kw_en: 'en-us',
  kw_ar: 'en-us',
  ng: 'en-us',
  qa_en: 'en-us',
  qa_ar: 'en-us',
  vn_en: 'en-us',
  vn_vi: 'en-us',
};

function getUnityLibs(prodLibs, project = 'unity') {
  const { hostname, origin } = window.location;
  if (project === 'unity') { return `${origin}/unitylibs`; }
  if (!hostname.includes('.hlx.')
    && !hostname.includes('.aem.')
    && !hostname.includes('localhost')) {
    return prodLibs;
  }
  const branch = new URLSearchParams(window.location.search).get('unitylibs') || 'main';
  if (!/^[a-zA-Z0-9_-]+$/.test(branch)) throw new Error('Invalid branch name.');
  const helixVersion = hostname.includes('.hlx.') ? 'hlx' : 'aem';
  return branch.indexOf('--') > -1
    ? `https://${branch}.${helixVersion}.live/unitylibs`
    : `https://${branch}--unity--adobecom.${helixVersion}.live/unitylibs`;
}

export default async function init(el) {
  const projectName = 'unity';
  const unitylibs = getUnityLibs('/unitylibs', projectName);
  const stylePromise = new Promise((resolve) => {
    loadStyle(`${unitylibs}/core/styles/styles.css`, resolve);
  });
  await stylePromise;
  const { default: wfinit } = await import(`${unitylibs}/core/workflow/workflow.js`);
  await wfinit(el, projectName, unitylibs, 'v2');
}
