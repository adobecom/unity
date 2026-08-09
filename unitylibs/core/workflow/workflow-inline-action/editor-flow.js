// Crop/Resize CTA-click flow. buildCropPayload() is real and reusable as-is once a
// real Unity wrapper endpoint exists to actually send it to. No network call yet.

export function buildCropPayload(bounds, sourceUrl) {
  return {
    image: { source: { url: sourceUrl } },
    edits: { document: { crop: { bounds, hide: false } } },
  };
}

// Resize = crop-then-resample: bounds slice the frame, resize.width/height resamples
// it to the target output size. constrainProportions/resample/scaleStyles are fixed
// per the earlier payload discussion — pending confirmation, not user-facing yet.
export function buildResizePayload(bounds, dimensions, sourceUrl) {
  return {
    image: { source: { url: sourceUrl } },
    edits: {
      document: {
        crop: { bounds, hide: false },
        resize: {
          width: { unit: 'pixels_unit', value: dimensions.width },
          height: { unit: 'pixels_unit', value: dimensions.height },
          constrainProportions: true,
          resample: 'bicubic_sharper',
          scaleStyles: true,
        },
      },
    },
  };
}

export default { buildCropPayload, buildResizePayload };
