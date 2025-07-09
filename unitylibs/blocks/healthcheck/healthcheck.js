import { unityConfig, getHeaders, getUnityLibs, setUnityLibs } from '../../scripts/utils.js';

class HealthCheck {
  constructor(el) {
    this.el = el;
    this.workflowFunctions = { getBlobData: HealthCheck.getBlobData, uploadPdf: HealthCheck.uploadPdf };
    this.init();
  }

  async init() {
    this.services = this.services || await HealthCheck.loadServices();
    const apiStatuses = {};
    await Promise.all(Object.entries(this.services).map(async ([categoryName, apis]) => {
      const results = await this.checkCategory(categoryName, apis);
      apiStatuses[categoryName] = results.results.reduce((max, res) => (res.success ? max : Math.max(max, res.statusCode || 500)), 200);
      this.printResults(categoryName, results);
    }));
    this.printApiResponse(apiStatuses);
  }

  static async loadServices() {
    try {
      const response = await fetch(`${getUnityLibs()}/blocks/healthcheck/service-config.json`);
      if (!response.ok) throw new Error('Failed to load services configuration');
      return HealthCheck.replacePlaceholders(await response.json(), '{{apiEndPoint}}', unityConfig.apiEndPoint);
    } catch (error) {
      // Error loading services; returning null
      return null;
    }
  }

  static replacePlaceholders(services, placeholder, value) {
    return JSON.parse(JSON.stringify(services).replace(new RegExp(placeholder, 'g'), value));
  }

  static async getBlobData(options) {
    return new Promise((res, rej) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', `${getUnityLibs()}/img/healthcheck.jpeg`);
      xhr.responseType = 'blob';
      xhr.onload = () => (xhr.status === 200
        ? res({ ...options, body: xhr.response, headers: { 'Content-Type': 'image/jpeg' } })
        : rej(xhr.status));
      xhr.send();
    });
  }

  static async uploadPdf(options) {
    const pdfData = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]);
    const objUrl = URL.createObjectURL(new Blob([pdfData], { type: 'application/pdf' }));
    const response = await fetch(objUrl);
    URL.revokeObjectURL(objUrl);
    if (!response.ok) throw new Error(`Failed to create Blob: ${response.status}`);
    return { ...options, body: await response.blob(), headers: { 'Content-Type': 'application/pdf' } };
  }

  async checkService(category, service, apis) {
    try {
      let options = {
        method: service.method,
        headers: await getHeaders(service.apiKey),
      };
      if (service.workFlow && this.workflowFunctions[service.workFlow]) options = await this.workflowFunctions[service.workFlow](options);
      if (service.body && ['POST', 'PUT'].includes(service.method)) options.body = JSON.stringify(service.body);
      const response = await fetch(service.url, options);
      if (!response.ok) throw new Error(`${service.name} failed with status ${response.status}`);
      if (service.replaceKey) {
        const data = await response.json();
        service.replaceKey.forEach((key) => {
          this.services[category] = HealthCheck.replacePlaceholders(this.services[category], `{{${key}}}`, data[key]);
        });
        apis.forEach((_, i) => { apis[i] = this.services[category][i]; });
      }
      return { name: service.name, status: 'UP', success: true, statusCode: response.status };
    } catch (error) {
      return { name: service.name, status: 'DOWN', success: false, error: error.message, statusCode: parseInt(error.message.match(/\d+/)?.[0], 10) || 500 };
    }
  }

  async checkCategory(category, apis) {
    // Run all service checks in parallel
    const results = await Promise.all(apis.map((service) => this.checkService(category, service, apis)));
    return { allSuccess: results.every((res) => res.success), results };
  }

  printApiResponse(statusData) {
    const container = document.createElement('div');
    container.classList.add('healthcheck-container');
    container.innerHTML = `<h3>API Status</h3><pre>${JSON.stringify(statusData, null, 2)}</pre>`;
    this.el.insertBefore(container, this.el.firstChild);
  }

  printResults(category, { allSuccess, results }) {
    const container = document.createElement('div');
    container.classList.add('healthcheck-container', allSuccess ? 'success' : 'error');
    container.innerHTML = `<h3>${category.toUpperCase()} Workflow</h3>
      <p>${allSuccess ? '\u2705 All APIs are working. Workflow completed successfully!' : '\u274C Some APIs failed:'}</p>`;
    results.forEach(({ name, success, error }) => {
      container.innerHTML += `<p class="${success ? 'success' : 'error'}">
        ${String.fromCodePoint(0x1F539)} ${name}: ${success ? `${String.fromCodePoint(0x2705)} UP` : `${String.fromCodePoint(0x274C)} DOWN - ${error}`}
      </p>`;
    });
    this.el.appendChild(container);
  }
}

export default function init(el, project = 'unity', unityLibs = '/unitylibs') {
  setUnityLibs(unityLibs, project);
  let healthCheckInstance;
  if (window.adobeIMS) {
    healthCheckInstance = new HealthCheck(el);
  } else {
    window.addEventListener('onImsLibInstance', () => { healthCheckInstance = new HealthCheck(el); }, { once: true });
  }
  return healthCheckInstance;
}
