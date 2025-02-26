import { unityConfig, getHeaders, getUnityLibs, setUnityLibs } from '../../scripts/utils.js';

class HealthCheck {
  constructor(el) {
    this.el = el;
    this.workflowFunctions = { getBlogData: this.getBlogData, uploadPdf: this.uploadPdf };
    this.init();
  }

  async init() {
    this.services = this.services || await this.loadServices();
    const apiStatuses = {};
    for (const [categoryName, apis] of Object.entries(this.services)) {
      const results = await this.checkCategory(categoryName, apis);
      apiStatuses[categoryName] = results.results.reduce((max, res) => res.success ? max : Math.max(max, res.statusCode || 500), 200);
      this.printResults(categoryName, results);
    }
    this.printApiResponse(apiStatuses);
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
    return JSON.parse(JSON.stringify(services).replace(new RegExp(placeholder, 'g'), value));
  }

  async getBlogData() {
    return new Promise((res, rej) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', `${getUnityLibs()}/img/healthcheck.jpeg`);
      xhr.responseType = 'blob';
      xhr.onload = () => xhr.status === 200
        ? res({ method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: xhr.response })
        : rej(xhr.status);
      xhr.send();
    });
  }

  async uploadPdf() {
    const pdfData = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]);
    const objUrl = URL.createObjectURL(new Blob([pdfData], { type: 'application/pdf' }));
    const response = await fetch(objUrl);
    URL.revokeObjectURL(objUrl);
    if (!response.ok) throw new Error(`Failed to create Blob: ${response.status}`);
    return { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: await response.blob() };
  }

  async checkService(category, service, apis) {
    try {
      const options = {
        method: service.method,
        headers: getHeaders(category === 'acrobat' ? 'acrobatmilo' : 'adobedotcom-cc'),
        ...(service.body && ['POST', 'PUT'].includes(service.method) && { body: JSON.stringify(service.body) })
      };

      if (service.workFlow) options = await this.workflowFunctions[service.workFlow]();
      const response = await fetch(service.url, options);
      if (!response.ok) throw new Error(`${service.name} failed with status ${response.status}`);

      if (service.replaceKey) {
        const data = await response.json();
        service.replaceKey.forEach(key => {
          this.services[category] = this.replacePlaceholders(this.services[category], `{{${key}}}`, data[key]);
        });
        apis.forEach((_, i) => apis[i] = this.services[category][i]);
      }

      return { name: service.name, status: 'UP', success: true, statusCode: response.status };
    } catch (error) {
      return { name: service.name, status: 'DOWN', success: false, error: error.message, statusCode: parseInt(error.message.match(/\d+/)?.[0]) || 500 };
    }
  }

  async checkCategory(category, apis) {
    const results = await Promise.all(apis.map(service => this.checkService(category, service, apis)));
    return { allSuccess: results.every(res => res.success), results };
  }

  printApiResponse(statusData) {
    const statusContainer = document.createElement('div');
    Object.assign(statusContainer.style, { padding: '10px', border: '1px solid #ccc', margin: '10px', borderRadius: '5px', backgroundColor: '#f1f1f1' });

    statusContainer.innerHTML = `<h3>API Status</h3><pre>${JSON.stringify(statusData, null, 2)}</pre>`;
    this.el.insertBefore(statusContainer, this.el.firstChild);
  }

  printResults(category, { allSuccess, results }) {
    const container = document.createElement('div');
    Object.assign(container.style, { padding: '10px', border: '1px solid #ccc', margin: '10px', borderRadius: '5px', backgroundColor: allSuccess ? '#d4edda' : '#f8d7da' });

    container.innerHTML = `<h3>${category.toUpperCase()} Workflow</h3>
      <p>${allSuccess ? '✅ All APIs are working. Workflow completed successfully!' : '❌ Some APIs failed:'}</p>`;

    results.forEach(({ name, success, error }) => {
      container.innerHTML += `<p style="color:${success ? 'green' : 'red'}">🔹 ${name}: ${success ? '✅ UP' : `❌ DOWN - ${error}`}</p>`;
    });

    this.el.appendChild(container);
  }
}

export default function init(el, project = 'unity', unityLibs = '/unitylibs') {
  setUnityLibs(unityLibs, project);
  window.adobeIMS ? new HealthCheck(el) : window.addEventListener('onImsLibInstance', () => new HealthCheck(el), { once: true });
}
