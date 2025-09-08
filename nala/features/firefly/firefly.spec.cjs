module.exports = {
  FeatureName: 'Firefly',
  features: [
    {
      tcid: '0',
      name: '@fireflyImageUI',
      path: '/products/firefly?georouting=off',
      data: {
        inputPlaceholder: 'Describe what you want to generate',
        tipDescription: 'Describe a subject, an action, a place, a mood, or a style.',
        legalLinkText: 'Adobe Generative AI Terms',
        inputPrompt: 'a beautiful landscape with mountains and a river',
      },
      tags: '@firefly @smoke @regression @unity @nopr',
    },
    {
      tcid: '1',
      name: '@fireflyVideoUI',
      path: '/products/firefly?georouting=off',
      data: {
        inputPlaceholder: 'Describe what you want to generate',
        tipDescription: 'Describe a subject, an action, a place, a mood, or a style.',
        legalLinkText: 'Adobe Generative AI Terms',
      },
      tags: '@firefly @smoke @regression @unity @nopr',
    },
    {
      tcid: '2',
      name: '@fireflyVideoGeneration',
      path: '/products/firefly?georouting=off',
      data: {
        inputPlaceholder: 'Describe what you want to generate',
        inputPrompt: 'extreme close-up of an eye blinking, in the reflection of the eye is an entire universe, surreal lighting',
      },
      tags: '@firefly @smoke @regression @unity @nopr',
    },
    {
      tcid: '3',
      name: '@fireflyImageGeneration',
      path: '/products/firefly?georouting=off',
      data: {
        inputPlaceholder: 'Describe what you want to generate',
        inputPrompt: 'a beautiful landscape with mountains and a river',
      },
      tags: '@firefly @smoke @regression @unity @nopr',
    },
    {
      tcid: '4',
      name: '@fireflyVectorGeneration',
      path: '/products/firefly?georouting=off',
      data: {
        inputPlaceholder: 'Describe what you want to generate',
        inputPrompt: 'Modern vector logo of a coffee cup, minimal lines, scalable.',
      },
      tags: '@firefly @smoke @regression @unity @nopr',
    },
  ],
};
