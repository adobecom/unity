/* eslint-disable no-underscore-dangle */

export async function getRegion() {
  const resp = await fetch('https://geo2.adobe.com/json/', { cache: 'no-cache' });
  if (!resp.ok) throw new Error(`Failed to resolve region: ${resp.statusText}`);
  const { country } = await resp.json();
  if (!country) throw new Error('Failed to resolve region: missing country');
  return country.toLowerCase();
}

export async function getDecisionScopesForVerb(verb) {
  const region = await getRegion().catch(() => undefined);
  const verbScope = `acom_unity_acrobat_${verb}`;
  return region ? [`${verbScope}_${region}`, verbScope] : [verbScope];
}

function waitForSatellite(timeout = 5000) {
  if (window._satellite) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(() => {
      if (window._satellite) {
        clearInterval(interval);
        resolve();
      } else if (Date.now() - start >= timeout) {
        clearInterval(interval);
        reject(new Error('_satellite not available within timeout'));
      }
    }, 100);
  });
}

export default async function getExperimentData(decisionScopes) {
  if (!decisionScopes || decisionScopes.length === 0) {
    throw new Error('No decision scopes provided for experiment data fetch');
  }

  await waitForSatellite();

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
          }
          resolve(targetData || null);
        },
      });
    } catch (e) {
      reject(new Error(`Exception during Target proposition fetch: ${e.message || 'Unknown exception'}`));
    }
  });
}
