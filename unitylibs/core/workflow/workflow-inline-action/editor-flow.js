// Crop/Resize CTA-click flow. buildCropPayload() is real and reusable as-is once a
// real Unity wrapper endpoint exists to actually send it to. No network call yet.

export function buildCropPayload(bounds, sourceUrl) {
  return {
    image: { source: { url: sourceUrl } },
    edits: { document: { crop: { bounds, hide: false } } },
  };
}

export default { buildCropPayload };
