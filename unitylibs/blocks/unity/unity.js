function getUnityLibs(prodLibs, project = 'unity') {
  let libs = '';
  const { hostname, origin } = window.location;
  if (project === 'unity') { libs = `${origin}/unitylibs`; return libs; }
  if (!hostname.includes('hlx.page')
    && !hostname.includes('hlx.live')
    && !hostname.includes('localhost')) {
    libs = prodLibs;
    return libs;
  }
  const branch = new URLSearchParams(window.location.search).get('unitylibs') || 'stage';
  if (branch.indexOf('--') > -1) { libs = `https://${branch}.hlx.live/unitylibs`; return libs; }
  libs = `https://${branch}--unity--adobecom.hlx.live/unitylibs`;
  return libs;
}

export default async function init(el) {
  const projectName = 'unity';
  const unitylibs = getUnityLibs('/unitylibs', projectName);
  const { default: wfinit } = await import(`${unitylibs}/core/workflow/workflow.js`);
  wfinit(el, projectName, unitylibs);
}
