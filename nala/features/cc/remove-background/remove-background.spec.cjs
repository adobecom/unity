module.exports = {
  FeatureName: 'Remove Background',
  features: [
    {
      tcid: '0',
      name: '@remove-background',
      path: '/drafts/nala/unity/remove-background?georouting=off',
      data: {
        dropZoneText: 'Drag and drop an image',
        dropZoneFileText: 'File must be JPEG, JPG or PNG and up to 40MB',
        buttonLabel: 'Upload your photo',
      },
      tags: '@remove-background @smoke @regression @unity',
    },
  ],
};
