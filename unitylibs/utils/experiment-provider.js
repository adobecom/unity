export default async function getExperimentData() {
  const decisionScopes = ['ACOM_UNITY_ACROBAT_EDITPDF_POC'];

  return new Promise((resolve) => {
    try {
      // eslint-disable-next-line no-underscore-dangle
      window._satellite.track('propositionFetch', {
        decisionScopes,
        data: {},
        done: (TargetPropositionResult, error) => {
          if (error) {
            resolve({ variationId: 'variant1' });
            return;
          }

          const targetData = TargetPropositionResult?.decisions?.[0]?.items?.[0]?.data?.content;
          if (targetData) {
            // eslint-disable-next-line no-underscore-dangle
            window._satellite.track('propositionDisplay', TargetPropositionResult.propositions);
            resolve(targetData);
          } else {
            resolve({ variationId: 'variant1' });
          }
        },
      });
    } catch (e) {
      resolve({ variationId: 'variant1' });
    }
  });
}
