import { unityConfig, getHeaders, getUnityLibs } from '../../scripts/utils.js';

class HealthCheck {
  constructor() {
    this.services = null;
    this.loadServices();
  }

  async loadServices() {
    try {
      const response = await fetch(`${getUnityLibs()}/blocks/unity/service-config.json`);
      if (!response.ok) throw new Error('Failed to load services configuration');

      let services = await response.json();

      // Replace placeholders with actual values
      this.services = this.replacePlaceholders(services, unityConfig.apiEndPoint);
      this.init();
    } catch (error) {
      console.error('Error loading services:', error.message);
    }
  }

  replacePlaceholders(services, apiEndPoint) {
    return JSON.parse(JSON.stringify(services).replace(/{{apiEndPoint}}/g, apiEndPoint));
  }

  async init() {
    if (!this.services) return;

    for (const categoryName of Object.keys(this.services)) {
      const apis = this.services[categoryName];
      const results = await this.checkCategory(categoryName, apis);
      this.printResults(categoryName, results);
    }
  }

  async checkCategory(category, apis) {
    let allSuccess = true;
    const results = [];

    for (const service of apis) {
      const result = await this.checkService(category, service);
      results.push(result);

      if (!result.success) {
        allSuccess = false;
      }
    }

    return { allSuccess, results };
  }

  async checkService(category, service) {
    try {
      const apiKey = category === 'acrobat' ? 'acrobatmilo' : unityConfig.apiKey;
      const options = {
        method: service.method,
        headers: getHeaders(apiKey),
      };

      if (service.body && ['POST', 'PUT'].includes(service.method)) {
        options.body = JSON.stringify(service.body);
      }

      const response = await fetch(service.url, options);

      if (!response.ok) {
        throw new Error(`${service.name} failed with status ${response.status}`);
      }

      console.log(`[${category}] ${service.name}: ✅ UP`);
      return { name: service.name, status: 'UP', success: true };
    } catch (error) {
      console.error(`[${category}] ${service.name}: ❌ DOWN - ${error.message}`);
      return { name: service.name, status: 'DOWN', success: false, error: error.message };
    }
  }
}

export default HealthCheck;
