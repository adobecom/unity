import { unityConfig, getHeaders } from '../../scripts/utils.js';

class HealthCheck {
  constructor() {
    this.services = this.getServices();
    this.init();
  }

  getServices() {
    return [
      {
        photoshop: [
          { name: 'assetUpload', url: `${unityConfig.apiEndPoint}/asset`, method: 'POST' },
          { name: 'acmpCheck', ur: `${unityConfig.apiEndPoint}/asset/finalize`, method: 'POST', body: { assetId: 'e15bcaf4-86da-4f0b-b5b1-3581e8cbe380', targetProduct: 'Photoshop' } },
          { name: 'removeBackground', url: `${unityConfig.apiEndPoint}/providers/PhotoshopRemoveBackground`, method: 'POST', body: { surfaceId: 'Unity', assets: [{ id: 'cd95ea21-daf3-4e3e-814a-b9490ea0626d' }] } },
          {
            name: 'changeBackground',
            url: `${unityConfig.apiEndPoint}/providers/PhotoshopChangeBackground`,
            method: 'POST',
            body: {
              metadata: {
                foregroundImageId: 'e64a3cec-31dc-49cd-bfa1-5173c055413c',
                backgroundImageId: 'dba480fc-f3d6-49c4-9478-91014f9e8528',
              },
              assets: [
                { id: 'e64a3cec-31dc-49cd-bfa1-5173c055413c' },
                { id: 'dba480fc-f3d6-49c4-9478-91014f9e8528' },
              ],
            },
          },
          {
            name: 'Connector',
            url: `${unityConfig.apiEndPoint}/asset/connector`,
            method: 'POST',
            body: {
              targetProduct: 'Photoshop',
              payload: {
                locale: 'in',
                operations: [
                  { name: 'removeBackground' },
                  {
                    name: 'changeBackground',
                    assetIds: ['dba480fc-f3d6-49c4-9478-91014f9e8528'],
                  },
                ],
                finalAssetId: '9c918be5-99bd-4fe3-b736-27dfb98d499b',
              },
              assetId: 'e15bcaf4-86da-4f0b-b5b1-3581e8cbe380',
            },
          },
        ],
        Express: [
          { name: 'Connector', url: `${unityConfig.apiEndPoint}/asset/connector`, method: 'POST', body: { targetProduct: 'Express', query: 'Soccer tournament finals poster' } },
        ],
      },
    ];
  }

  async init() {
    for (const category of this.services) {
      const categoryName = Object.keys(category)[0];
      const apis = category[categoryName];
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
      const options = {
        method: service.method,
        headers: getHeaders(unityConfig.apiKey),
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
      results.forEach(result => {
        const statusText = document.createElement('p');
        statusText.textContent = `🔹 ${result.name}: ${result.success ? '✅ UP' : `❌ DOWN - ${result.error}`}`;
        statusText.style.color = result.success ? 'green' : 'red';
        container.appendChild(statusText);
      });
    }

    document.body.appendChild(container);
  }
}

export default HealthCheck;
