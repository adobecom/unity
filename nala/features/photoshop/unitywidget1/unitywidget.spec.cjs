module.exports = {
  FeatureName: 'PS Unity Widget',
  features: [
    {
      tcid: '0',
      name: '@ps-unityUI',
      path: '/drafts/nala/unity/remove-background?georouting=off',
      data: {
        CTATxt: 'Upload your photo',
        fileFormatTxt: 'File must be JPEG, JPG or PNG and up to 40MB',
        dropZoneTxt: 'Drag and drop an image to try it today.',
      },
      tags: '@ps-unity @smoke @regression @unity',
    },

    {
      tcid: '1',
      name: '@ps-unityFileUpload',
      path: '/drafts/nala/unity/remove-background?georouting=off',
      tags: '@ps-unity @smoke @regression @unity',
    },

    {
      tcid: '2',
      name: '@ps-unityPSProductpage',
      path: '/drafts/nala/unity/remove-background?georouting=off',
      url: 'stage.try.photoshop.adobe.com',
      tags: '@ps-unity @smoke @regression @unity',
    },
  ],
};
