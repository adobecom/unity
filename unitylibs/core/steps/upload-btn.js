import { createTag, createActionBtn } from '../../scripts/utils.js';

export default async function createUpload(cfg, target, callback = null) {
  const { targetEl, unityEl, interactiveSwitchEvent } = cfg;
  const li = unityEl.querySelector('.icon-upload').parentElement;
  const a = await createActionBtn(li, 'show');
  const input = createTag('input', { class: 'file-upload', type: 'file', accept: 'image/png,image/jpg,image/jpeg', tabIndex: -1 });
  a.append(input);
  a.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.click();
  });
  a.addEventListener('change', async (e) => {
    const { default: showProgressCircle } = await import('../features/progress-circle/progress-circle.js');
    const { showErrorToast } = await import('../../scripts/utils.js');
    const file = e.target.files[0];
    if (!file) return;
    const MAX_FILE_SIZE = 400000000;
    if (file.size > MAX_FILE_SIZE) {
      await showErrorToast(targetEl, unityEl, '.icon-error-filesize');
      return;
    }
    const objUrl = URL.createObjectURL(file);
    target.src = objUrl;
    target.onload = async () => {
      cfg.uploadState.filetype = file.type;
      console.log("target width", targetEl.offsetWidth);
      console.log("target width", target.width);
      console.log("target height", target.height);
      console.log("target natural width", target.naturalWidth);
      console.log("target natural height", target.naturalHeight);
      if (callback) {
        try {
          if (target.naturalWidth !== target.naturalHeight) {
            console.log("different width and height");
            if (!target.classList.contains('contain-object') && !target.classList.contains('mobile-gray-bg')) target.classList.add('contain-object', 'mobile-gray-bg');
            if (!targetEl.classList.contains('gray-bg')) targetEl.classList.add('gray-bg');
          }
          else{
            if (target.classList.contains('contain-object')) target.classList.remove('contain-object');
            if (targetEl.classList.contains('gray-bg')) targetEl.classList.remove('gray-bg');
          }
          showProgressCircle(targetEl);
          await callback(cfg);
          if (target.classList.contains('mobile-gray-bg')) target.classList.remove('mobile-gray-bg');
          showProgressCircle(targetEl);
        } catch (err) {
          showProgressCircle(targetEl);
          await showErrorToast(targetEl, unityEl, '.icon-error-request');
          return;
        }
      }
      const alertHolder = document.querySelector('.unity-enabled .interactive-area .alert-holder');
      if (!alertHolder || alertHolder.style.display !== 'flex') {
        unityEl.dispatchEvent(new CustomEvent(interactiveSwitchEvent));
      }
    };
    target.onerror = async () => {
      await showErrorToast(targetEl, unityEl, '.icon-error-request');
    };
    e.target.value = '';
  });
  return a;
}
