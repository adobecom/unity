/* eslint-disable no-underscore-dangle */
export default async function getExperimentData() {
  const decisionScopes = ['ACOM_UNITY_ACROBAT_EDITPDF_POC'];
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
