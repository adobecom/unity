import {
  createTag,
  loadStyle,
  getUnityLibs,
} from '../../../scripts/utils.js';

export default function createProgressCircle() {
  loadStyle(`${getUnityLibs()}/core/features/progress-circle/progress-circle.css`);
  debugger;
  const pdom = `<div class="spectrum-ProgressCircle-track"></div>
  <div class="spectrum-ProgressCircle-fills">
    <div class="spectrum-ProgressCircle-fillMask1">
      <div class="spectrum-ProgressCircle-fillSubMask1">
        <div class="spectrum-ProgressCircle-fill"></div>
      </div>
    </div>
    <div class="spectrum-ProgressCircle-fillMask2">
      <div class="spectrum-ProgressCircle-fillSubMask2">
        <div class="spectrum-ProgressCircle-fill"></div>
      </div>
    </div>
  </div>`;
  const prgc = createTag('div', { class: 'spectrum-ProgressCircle spectrum-ProgressCircle--indeterminate' }, pdom);
  const layer = createTag('div', { class: 'progress-holder' }, prgc);
  return layer;
}
