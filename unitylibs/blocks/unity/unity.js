import { loadStyle } from '../../scripts/utils.js';

function getUnityLibs(prodLibs, project = 'unity') {
  const { hostname, origin } = window.location;
  if (project === 'unity') { return `${origin}/unitylibs`; }
  if (!hostname.includes('.hlx.')
    && !hostname.includes('.aem.')
    && !hostname.includes('localhost')) {
    return prodLibs;
  }
  const branch = new URLSearchParams(window.location.search).get('unitylibs') || 'main';
  const helixVersion = hostname.includes('.hlx.') ? 'hlx' : 'aem';
  return branch.indexOf('--') > -1
    ? `https://${branch}.${helixVersion}.live/unitylibs`
    : `https://${branch}--unity--adobecom.${helixVersion}.live/unitylibs`;
}

function handlePropositions(AJOPropositionResult) {
  console.log('AJOPropositionResult: ', AJOPropositionResult);
}

function fetchAjoResponse() {
  window._satellite.track('propositionFetch', {
    personalization: { surfaces: ['web://adobe.com/acrobat#projectUnity'] },
    data: {},
    xdm: {},
    done(AJOPropositionResult, error) {
      if (error) {
        console.error('[AJO Fetch Error]:', err);
        return;
      }
      handlePropositions(AJOPropositionResult);
      window._satellite.track('propositionDisplay', AJOPropositionResult.propositions); // update Analytics/CJA response was displayed
    },
  });
}

export default async function init(el) {
  const projectName = 'unity';
  const unitylibs = getUnityLibs('/unitylibs', projectName);
  const stylePromise = new Promise((resolve) => {
    loadStyle(`${unitylibs}/core/styles/styles.css`, resolve);
  });
  await stylePromise;
  const { default: wfinit } = await import(`${unitylibs}/core/workflow/workflow.js`);
  fetchAjoResponse();
  await wfinit(el, projectName, unitylibs, 'v2');
}
