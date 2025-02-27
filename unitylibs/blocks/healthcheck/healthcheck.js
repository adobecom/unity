import { unityConfig, getHeaders, getUnityLibs, setUnityLibs } from '../../scripts/utils.js';

class HealthCheck {
  constructor(el) {
    this.el = el;
    this.workflowFunctions = { getBlogData: this.getBlogData, uploadPdf: this.uploadPdf };
    this.init();
  }

  async init() {
    this.services = this.services || await this.loadServices();
    const categoryResults = await Promise.all(
      Object.entries(this.services).map(([categoryName, apis]) => this.checkCategory(categoryName, apis))
    );

    const apiStatuses = Object.fromEntries(
      categoryResults.map(({ category, results }) => [
        category, results.every(res => res.success) ? 200 : Math.max(...results.map(res => res.statusCode || 500))
      ])
    );

    this.printApiResponse(apiStatuses);
    categoryResults.forEach(({ category, results }) => this.printResults(category, results));
  }

  async loadServices() {
    try {
      const response = await fetch(`${getUnityLibs()}/blocks/healthcheck/service-config.json`);
      if (!response.ok) throw new Error('Failed to load services configuration');
      return this.replacePlaceholders(await response.json(), '{{apiEndPoint}}', unityConfig.apiEndPoint);
    } catch (error) {
      console.error('Error loading services:', error.message);
    }
  }

  replacePlaceholders(services, placeholder, value) {
    return JSON.parse(JSON.stringify(services).replaceAll(placeholder, value));
  }

  async getBlogData(options) {
    return new Promise((res, rej) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', `${getUnityLibs()}/img/healthcheck.jpeg`);
      xhr.responseType = 'blob';
      xhr.onload = () => xhr.status === 200
        ? res({ ...options, body: xhr.response, headers: { 'Content-Type': 'image/jpeg' } })
        : rej(xhr.status);
      xhr.send();
    });
  }

  async uploadPdf(options) {
    const pdfBlob = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34])], { type: 'application/pdf' });
    const response = await fetch(URL.createObjectURL(pdfBlob));
    if (!response.ok) throw new Error(`Failed to create Blob: ${response.status}`);
    return { ...options, body: await response.blob(), headers: { 'Content-Type': 'application/pdf' } };
  }

  async checkService(category, service, apis) {
    try {
      let options = {
        method: service.method,
        headers: getHeaders(service.apiKey),
      };

      if (service.workFlow && this.workflowFunctions[service.workFlow]) {
        options = await this.workflowFunctions[service.workFlow](options);
      }
      if (service.body && ['POST', 'PUT'].includes(service.method)) {
        options.body = JSON.stringify(service.body);
      }

      const response = await fetch(service.url, options);
      if (!response.ok) throw new Error(`${service.name} failed with status ${response.status}`);

      if (service.replaceKey) {
        const data = await response.json();
        service.replaceKey.forEach(key => {
          this.services[category] = this.replacePlaceholders(this.services[category], `{{${key}}}`, data[key]);
        });
        apis.forEach((_, i) => apis[i] = this.services[category][i]);
      }

      return { name: service.name, success: true, statusCode: response.status };
    } catch (error) {
      return { name: service.name, success: false, error: error.message, statusCode: parseInt(error.message.match(/\d+/)?.[0]) || 500 };
    }
  }

  async checkCategory(category, apis) {
    const results = await Promise.all(apis.map(service => this.checkService(category, service, apis)));
    return { category, results };
  }

  printApiResponse(statusData) {
    const container = document.createElement('div');
    container.classList.add('healthcheck-container');
    container.innerHTML = `<h3>API Status</h3><pre>${JSON.stringify(statusData, null, 2)}</pre>`;
    this.el.insertBefore(container, this.el.firstChild);
  }

  printResults(category, { results }) {
    const allSuccess = results.every(res => res.success);
    const container = document.createElement('div');
    container.classList.add('healthcheck-container', allSuccess ? 'success' : 'error');
    container.innerHTML = `<h3>${category.toUpperCase()} Workflow</h3>
      <p>${allSuccess ? '✅ All APIs are working. Workflow completed successfully!' : '❌ Some APIs failed:'}</p>`;
    results.forEach(({ name, success, error }) => {
      container.innerHTML += `<p class="${success ? 'success' : 'error'}">
        🔹 ${name}: ${success ? '✅ UP' : `❌ DOWN - ${error}`}
      </p>`;
    });
    this.el.appendChild(container);
  }
}

export default function init(el, project = 'unity', unityLibs = '/unitylibs') {
  setUnityLibs(unityLibs, project);
  window.adobeIMS ? new HealthCheck(el) : window.addEventListener('onImsLibInstance', () => new HealthCheck(el), { once: true });
}
