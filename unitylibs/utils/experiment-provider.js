/* eslint-disable no-underscore-dangle */
const VERB_DECISION_SCOPE_MAP = { 'add-comment': ['acom_unity_acrobat_edit-pdf_US'] };

export function getDecisionScopesForVerb(verb) {
  return VERB_DECISION_SCOPE_MAP[verb] || [];
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
            reject(new Error('Target proposition returned but no valid data found in response structure'));
          }
        },
      });
    } catch (e) {
      reject(new Error(`Exception during Target proposition fetch: ${e.message || 'Unknown exception'}`));
    }
  });
}
