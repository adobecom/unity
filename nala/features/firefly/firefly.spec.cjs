module.exports = {
  FeatureName: 'Unity Firefly',
  features: [
    {
      tcid: '0',
      name: '@firefly',
      path: process.env.FIREFLY_TEST_PATH || '/drafts/nala/unity/firefly',
      data: {
        // Optional: add static expectations if a stable page is used
      },
      tags: '@firefly @unity @smoke @regression',
    },
  ],
};

