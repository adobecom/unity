import { getUnityLibs } from '../../../scripts/utils.js';

export default class FeatureLoader {
  constructor(workflowCfg) {
    this.workflowCfg = workflowCfg;
    this.loadedFeatures = new Set();
    this.loadingFeatures = new Map();
  }

  async loadFeature(featureName) {
    // If already loaded, return immediately
    if (this.loadedFeatures.has(featureName)) {
      return;
    }

    // If currently loading, wait for it
    if (this.loadingFeatures.has(featureName)) {
      return this.loadingFeatures.get(featureName);
    }

    // Start loading the feature
    const loadPromise = this.loadFeatureModule(featureName);
    this.loadingFeatures.set(featureName, loadPromise);

    try {
      await loadPromise;
      this.loadedFeatures.add(featureName);
    } finally {
      this.loadingFeatures.delete(featureName);
    }
  }

  async loadFeatureModule(featureName) {
    const featureMap = {
      'transition-screen': () => import(`${getUnityLibs()}/scripts/transition-screen.js`),
      'splunk-analytics': () => import(`${getUnityLibs()}/scripts/splunk-analytics.js`),
      'device-detection': () => import(`${getUnityLibs()}/utils/device-detection.js`),
      'upload-handler': () => import(`${getUnityLibs()}/core/workflow/workflow-acrobat/upload-handler.js`),
      'error-toast': () => import(`${getUnityLibs()}/core/workflow/shared/error-toast.js`),
    };

    const loader = featureMap[featureName];
    if (!loader) {
      throw new Error(`Unknown feature: ${featureName}`);
    }

    return loader();
  }

  async loadMultipleFeatures(featureNames) {
    const loadPromises = featureNames.map(feature => this.loadFeature(feature));
    await Promise.all(loadPromises);
  }

  isFeatureLoaded(featureName) {
    return this.loadedFeatures.has(featureName);
  }

  getLoadedFeatures() {
    return Array.from(this.loadedFeatures);
  }

  // Preload critical features that are likely to be needed
  async preloadCriticalFeatures() {
    const criticalFeatures = ['transition-screen', 'device-detection'];
    await this.loadMultipleFeatures(criticalFeatures);
  }

  // Load features based on workflow type
  async loadWorkflowFeatures() {
    const workflowFeatures = {
      'workflow-upload': ['transition-screen', 'device-detection', 'error-toast'],
      'workflow-acrobat': ['transition-screen', 'upload-handler', 'error-toast'],
      'workflow-ai': ['splunk-analytics'],
      'workflow-firefly': ['splunk-analytics'],
    };

    const features = workflowFeatures[this.workflowCfg.name] || [];
    await this.loadMultipleFeatures(features);
  }
} 