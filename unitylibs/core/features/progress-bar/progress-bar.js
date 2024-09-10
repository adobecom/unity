import { createTag } from '../../../scripts/utils.js';

const pdom = `<div class="spectrum-ProgressBar spectrum-ProgressBar--sizeM spectrum-ProgressBar--sideLabel" value="0" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
  <div class="spectrum-FieldLabel spectrum-FieldLabel--sizeM spectrum-ProgressBar-label"></div>
  <div class="spectrum-FieldLabel spectrum-FieldLabel--sizeM spectrum-ProgressBar-percentage">0%</div>
  <div class="spectrum-ProgressBar-track">
    <div class="spectrum-ProgressBar-fill" style="width: 0%;"></div>
  </div>
</div>`;

export default function createProgressBar() {
  const layer = createTag('div', { class: 'progress-holder' }, pdom);
  layer.addEventListener('unity:progress-bar-update', (e) => {
    const spb = layer.querySelector('.spectrum-ProgressBar')
    spb.setAttribute('value', e.detail.percentage);
    spb.setAttribute('aria-valuenow', e.detail.percentage);
    layer.querySelector('.spectrum-ProgressBar-percentage').innerHTML = `${e.detail.percentage}%`;
    layer.querySelector('.spectrum-ProgressBar-fill').style.width = `${e.detail.percentage}%`;
  })
  return layer;
}
