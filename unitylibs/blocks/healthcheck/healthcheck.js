import { unityConfig, getHeaders, getUnityLibs, setUnityLibs } from '../../scripts/utils.js';

class HealthCheck {
  constructor(el) {
    this.services = null;
    this.el = el;
    this.workflowFunctions = { getBlogData: this.getBlogData };
    this.loadServices();
  }

  async loadServices() {
    console.log('Loading services configuration...', getUnityLibs());
    try {
      const response = await fetch(`${getUnityLibs()}/blocks/unity/service-config.json`);
      if (!response.ok) throw new Error('Failed to load services configuration');
      const services = await response.json();
      return this.replacePlaceholders(services, '{{apiEndPoint}}', unityConfig.apiEndPoint);
    } catch (error) {
      console.error('Error loading services:', error.message);
    }
  }

  replacePlaceholders(services, placeholder, value) {
    const jsonString = JSON.stringify(services).replace(new RegExp(placeholder, 'g'), value);
    return JSON.parse(jsonString);
  }

  async init(el = null) {
    console.log('init');
    this.el = el;
    if (!this.services) this.services = await this.loadServices();
    const apiStatuses = {};
    for (const categoryName of Object.keys(this.services)) {
      const apis = this.services[categoryName];
      const results = await this.checkCategory(categoryName, apis);
      const worstStatus = results.results.reduce((max, result) => {
        return result.success ? max : Math.max(max, result.statusCode || 500);
      }, 200);
      apiStatuses[categoryName] = worstStatus;
      this.printResults(categoryName, results);
    }
    this.printApiResponse(apiStatuses);
  }

  async getBlogData() {
    const imgUrl = `${getUnityLibs()}/img/healthcheck.jpeg`;
    return new Promise((res, rej) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', imgUrl);
      xhr.responseType = 'blob';
      xhr.onload = () => {
        if (xhr.status === 200) {
          const uploadOptions = {
            method: 'PUT',
            headers: { 'Content-Type': 'image/jpeg' },
            body: xhr.response,
          };
          res(uploadOptions);
        } else rej(xhr.status);
      };
      xhr.send();
    });
  }

  async uploadPdf() {
    const pdfData = new Uint8Array([
      0x25, 0x50, 0x44, 0x46,
      0x2D, 0x31, 0x2E, 0x34,
      0x0A, 0x25, 0xE2, 0xE3, 0xCF, 0xD3,
      0x0A, 0x0A, 0x78, 0x0A, 0x73, 0x74, 0x61, 0x72, 0x74,
    ]);
    const blobFile = new Blob([pdfData], { type: 'application/pdf' });

    // Step 2: Convert Blob to an object URL
    const objUrl = URL.createObjectURL(blobFile);
    const response = await fetch(objUrl);
    if (!response.ok) throw new Error(`Failed to create Blob: ${response.status}`);
    const blobData = await response.blob();
    URL.revokeObjectURL(objUrl);
    const uploadOptions = {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      body: blobData,
    };
    return uploadOptions;
  }

  async checkService(category, service, apis) {
    try {
      const apiKey = category === 'acrobat' ? 'acrobatmilo' : 'adobedotcom-cc';
      let options = {
        method: service.method,
        headers: getHeaders(apiKey),
      };

      if (service.workFlow && this.workflowFunctions[service.workFlow]) {
        options = await this.workflowFunctions[service.workFlow](options);
      }

      if (service.body && ['POST', 'PUT'].includes(service.method)) {
        options.body = JSON.stringify(service.body);
      }

      const response = await fetch(service.url, options);
      const statusCode = response.status;

      if (!response.ok) {
        throw new Error(`${service.name} failed with status ${statusCode}`);
      }

      if (service.replaceKey) {
        const data = await response.json();
        service.replaceKey.forEach((item) => {
          const placeholder = `{{${item}}}`;
          const value = data[item];
          this.services[category] = this.replacePlaceholders(this.services[category], placeholder, value);
        });
        for (let i = 0; i < apis.length; i += 1) {
          apis[i] = this.services[category][i];
        }
      }
      return { name: service.name, status: 'UP', success: true, statusCode };
    } catch (error) {
      const failureStatus = error.message.match(/\d+/) ? parseInt(error.message.match(/\d+/)[0]) : 500;
      return { name: service.name, status: 'DOWN', success: false, error: error.message, statusCode: failureStatus };
    }
  }

  async checkCategory(category, apis) {
    let allSuccess = true;
    const results = [];
    const categoryStatus = {}; // Store API response codes per category
    for (const service of apis) {
      const result = await this.checkService(category, service, apis);
      results.push(result);
      if (!result.success) {
        allSuccess = false;
      }
      categoryStatus[category] = result.statusCode || 'Failed';
    }
    return { allSuccess, results };
  }

  printApiResponse(statusData) {
    const statusContainer = document.createElement('div');
    statusContainer.style.padding = '10px';
    statusContainer.style.border = '1px solid #ccc';
    statusContainer.style.margin = '10px';
    statusContainer.style.borderRadius = '5px';
    statusContainer.style.backgroundColor = '#f1f1f1';

    const title = document.createElement('h3');
    title.textContent = 'API Status';
    statusContainer.appendChild(title);
    const statusText = document.createElement('pre');
    statusText.textContent = JSON.stringify(statusData, null, 2);
    statusContainer.appendChild(statusText);
    this.el.insertBefore(statusContainer, this.el.firstChild);
  }

  printResults(category, { allSuccess, results }) {
    const container = document.createElement('div');
    container.style.padding = '10px';
    container.style.border = '1px solid #ccc';
    container.style.margin = '10px';
    container.style.borderRadius = '5px';
    const title = document.createElement('h3');
    title.textContent = `${category.toUpperCase()} Workflow`;
    container.appendChild(title);
    if (allSuccess) {
      container.style.backgroundColor = '#d4edda'; // Green background
      container.innerHTML += `<p>✅ All ${category} APIs are working. Workflow completed successfully!</p>`;
    } else {
      container.style.backgroundColor = '#f8d7da'; // Red background
      container.innerHTML += `<p>❌ Some APIs in ${category} failed:</p>`;
      results.forEach((result) => {
        const statusText = document.createElement('p');
        statusText.textContent = `🔹 ${result.name}: ${result.success ? '✅ UP' : `❌ DOWN - ${result.error}`}`;
        statusText.style.color = result.success ? 'green' : 'red';
        container.appendChild(statusText);
      });
    }
    this.el.appendChild(container);
  }
}

export default async function init(el, project = 'cc', unityLibs = '/unitylibs') {
  setUnityLibs(unityLibs, project);
  setTimeout(async () => {
    await new HealthCheck().init(el);
  }, 3000);
}
