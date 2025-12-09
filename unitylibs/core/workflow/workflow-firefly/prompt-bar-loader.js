// unitylibs/core/workflow/workflow-firefly/prompt-bar-loader.js

/**
 * Loader for prompt-bar-app component (Firefly Platform)
 * Loads the Lit-based prompt bar UI component
 */

// Base path to prompt-bar assets (adjust based on your CDN/path structure)
const getBasePath = () => {
    const scripts = document.querySelectorAll('script[src*="workflow-firefly"]');
    if (scripts.length) {
      const src = scripts[0].src;
      return src.substring(0, src.lastIndexOf('/')) + '/prompt-bar';
    }
    return '/unitylibs/core/workflow/workflow-firefly/prompt-bar';
  };
  
  let loadedModule = null;
  let loadPromise = null;
  
  /**
   * Dynamically load the prompt-bar component
   * @returns {Promise<Object>} The loaded module exports
   */
  export async function loadPromptBar() {
    if (loadedModule) return loadedModule;
    if (loadPromise) return loadPromise;
    
    const basePath = getBasePath();
    
    loadPromise = (async () => {
      // Load dependencies in order
      // 1. First load runtime (Lit)
      await import(`${basePath}/runtime.min.js`);
      
      // 2. Load the main component
      loadedModule = await import(`${basePath}/prompt-bar-app-lightweight.js`);
      
      return loadedModule;
    })();
    
    return loadPromise;
  }
  
  /**
   * Load a specific locale
   * @param {string} locale - Locale code (e.g., 'en-US', 'de-DE')
   * @returns {Promise<Object>} The locale data
   */
  export async function loadLocale(locale = 'en-US') {
    const basePath = getBasePath();
    try {
      const module = await import(`${basePath}/locales/${locale}.js`);
      return module.default;
    } catch (e) {
      console.warn(`Locale ${locale} not found, falling back to en-US`);
      const module = await import(`${basePath}/locales/en-US.js`);
      return module.default;
    }
  }
  
  export default { loadPromptBar, loadLocale };