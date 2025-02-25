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
      // this.services = this.replacePlaceholders(services, '{{apiEndPoint}}', unityConfig.apiEndPoint);
      // this.init();
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
    if (!this.services) return;
    this.services = await this.loadServices();
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
      const result = await this.checkService(category, service, apis);
      results.push(result);
      if (!result.success) {
        allSuccess = false;
      }
    }

    return { allSuccess, results };
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

  async checkService(category, service, apis) {
    try {
      const apiKey = category === 'acrobat' ? 'acrobatmilo' : unityConfig.apiKey;
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

      if (!response.ok) {
        throw new Error(`${service.name} failed with status ${response.status}`);
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

      // const assetId = await uploadImgToUnity(cfg, href, id, blobData, fileType);

      console.log(`[${category}] ${service.name}: ✅ UP`);
      return { name: service.name, status: 'UP', success: true };
    } catch (error) {
      console.error(`[${category}] ${service.name}: ❌ DOWN - ${error.message}`);
      return { name: service.name, status: 'DOWN', success: false, error: error.message };
    }
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

    this.el = document.querySelector('.ex-unity-wrap');
    this.el.appendChild(container);
  }
}

// export default HealthCheck;

export default async function init(el, project = 'cc', unityLibs = '/unitylibs') {
  setUnityLibs(unityLibs, project);
  await new HealthCheck().init(el);
}
