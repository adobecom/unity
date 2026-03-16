import { getUnityLibs } from '../../scripts/utils.js';

const REGISTRY = {
  'dropzone': {
    widget: () => import(`${getUnityLibs()}/core/widgets/dropzone/widget.js`),
  },
  'prompt-bar': {
    widget: () => import(`${getUnityLibs()}/core/widgets/prompt-bar/widget.js`),
  },
};

export default function getWidgetEntry(name) {
  const entry = REGISTRY[name];
  if (!entry) throw new Error(`Unknown widget type: "${name}". Register it in widget-registry.js`);
  return entry;
}
