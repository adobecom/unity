/* eslint-disable no-underscore-dangle */

export async function getDecisionScopesForVerb(verb) {
  const region = await getRegion().catch(() => undefined);
  return [`acom_unity_acrobat_${verb}${region ? `_${region}` : ''}`];
}

export async function getRegion() {
  const resp = await fetch('https://geo2.adobe.com/json/', { cache: 'no-cache' });
  if (!resp.ok) throw new Error(`Failed to resolve region: ${resp.statusText}`);
  const { country } = await resp.json();
  if (!country) throw new Error('Failed to resolve region: missing country');
  return country.toLowerCase();
}

export async function getExperimentData(decisionScopes) {
  if (!decisionScopes || decisionScopes.length === 0) {
    throw new Error('No decision scopes provided for experiment data fetch');
  }

  return new Promise((resolve, reject) => {
    try {
      
      window._satellite.track('propositionFetch', {
        decisionScopes,
        data: {},
        done: (TargetPropositionResult, error) => {
          if (error) {
            reject(new Error(`Target proposition fetch failed: ${error.message || 'Unknown error'}`));
            return;
          }

          const targetData = TargetPropositionResult?.decisions?.[0]?.items?.[0]?.data?.content;
          if (targetData) {
            window._satellite.track('propositionDisplay', TargetPropositionResult.propositions);
            resolve(targetData);
          } else {
            reject(new Error(`Target proposition returned but no valid data for scopes: ${Array.isArray(decisionScopes) ? decisionScopes.join(', ') : decisionScopes}`));
          }
        },
      });
    } catch (e) {
      reject(new Error(`Exception during Target proposition fetch: ${e.message || 'Unknown exception'}`));
    }
  });
}
