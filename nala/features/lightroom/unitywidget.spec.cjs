module.exports = {
  FeatureName: 'Lr Unity Widget',
  features: [
    {
      tcid: '0',
      name: '@lr-unityUI',
      path: '/drafts/nala/unity/lightroom',
      data: {
        CTATxt: 'Upload your photo',
        fileFormatTxt: 'File must be JPEG or JPG and up to 40MB',
        dropZoneTxt: 'Drag and drop an image to try it today.',
      },
      tags: '@lr-unity @smoke @regression @unity',
    },

    {
      tcid: '1',
      name: '@lr-unityFileUpload',
      path: '/drafts/nala/unity/lightroom',
      tags: '@lr-unity @smoke @regression @unity',
    },

    {
      tcid: '2',
      name: '@lr-unityLrProductpage',
      path: '/drafts/nala/unity/lightroom',
      url: 'f0.lightroom.adobe.com',
      tags: '@lr-unity @smoke @regression @unity',
    },
  ],
};
