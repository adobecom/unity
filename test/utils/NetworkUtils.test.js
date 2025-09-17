import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import NetworkUtils from '../../unitylibs/utils/NetworkUtils.js';

describe('NetworkUtils', () => {
  let networkUtils;
  let fetchStub;

  beforeEach(() => {
    networkUtils = new NetworkUtils();
    fetchStub = sinon.stub(window, 'fetch');
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('handleAbortedRequest', () => {
    it('should throw AbortError when signal is aborted', () => {
      const url = 'https://example.com/api';
      const options = { signal: { aborted: true } };

      expect(() => networkUtils.handleAbortedRequest(url, options)).to.throw('Request to https://example.com/api aborted by user.');
      
      try {
        networkUtils.handleAbortedRequest(url, options);
      } catch (error) {
        expect(error.name).to.equal('AbortError');
        expect(error.status).to.equal(0);
      }
    });

    it('should not throw when signal is not aborted', () => {
      const url = 'https://example.com/api';
      const options = { signal: { aborted: false } };

      expect(() => networkUtils.handleAbortedRequest(url, options)).to.not.throw();
    });

    it('should not throw when no signal is provided', () => {
      const url = 'https://example.com/api';
      const options = {};

      expect(() => networkUtils.handleAbortedRequest(url, options)).to.not.throw();
    });
  });

  describe('fetchWithTimeout', () => {
    it('should make successful fetch', async () => {
      const mockResponse = { status: 200, data: 'success' };
      fetchStub.resolves(mockResponse);

      const result = await networkUtils.fetchWithTimeout('https://example.com/api');

      expect(fetchStub.calledOnce).to.be.true;
      expect(result).to.equal(mockResponse);
    });

    it('should merge options with abort signal', async () => {
      const mockResponse = { status: 200 };
      fetchStub.resolves(mockResponse);
      const customOptions = { method: 'POST', body: 'data' };

      await networkUtils.fetchWithTimeout('https://example.com/api', customOptions);

      const callArgs = fetchStub.getCall(0).args[1];
      expect(callArgs.method).to.equal('POST');
      expect(callArgs.body).to.equal('data');
      expect(callArgs.signal).to.exist;
    });

    it('should rethrow non-abort errors', async () => {
      const networkError = new Error('Network error');
      fetchStub.rejects(networkError);

      try {
        await networkUtils.fetchWithTimeout('https://example.com/api');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).to.equal(networkError);
      }
    });
  });

  describe('afterFetchFromService', () => {
    it('should return response for successful 200 status', async () => {
      const mockResponse = {
        status: 200,
        headers: { get: sinon.stub().withArgs('Content-Length').returns('100') }
      };

      const result = await networkUtils.afterFetchFromService('https://example.com/api', mockResponse);
      expect(result).to.equal(mockResponse);
    });

    it('should return empty object for 200 status with Content-Length 0', async () => {
      const mockResponse = {
        status: 200,
        headers: { get: sinon.stub().withArgs('Content-Length').returns('0') }
      };

      const result = await networkUtils.afterFetchFromService('https://example.com/api', mockResponse);
      expect(result).to.deep.equal({});
    });

    it('should throw error with parsed JSON for non-200 status', async () => {
      const mockResponse = {
        status: 400,
        headers: { get: sinon.stub().withArgs('Content-Length').returns('50') },
        json: sinon.stub().resolves({ reason: 'quotaexceeded' })
      };

      try {
        await networkUtils.afterFetchFromService('https://example.com/api', mockResponse);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.equal('quotaexceeded');
        expect(error.status).to.equal(400);
      }
    });

    it('should handle notentitled error type', async () => {
      const mockResponse = {
        status: 403,
        headers: { get: sinon.stub().withArgs('Content-Length').returns('50') },
        json: sinon.stub().resolves({ reason: 'user notentitled' })
      };

      try {
        await networkUtils.afterFetchFromService('https://example.com/api', mockResponse);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.equal('notentitled');
        expect(error.status).to.equal(403);
      }
    });

    it('should handle JSON parse errors for non-200 status', async () => {
      const mockResponse = {
        status: 500,
        headers: { get: sinon.stub().withArgs('Content-Length').returns('50') },
        json: sinon.stub().rejects(new Error('Invalid JSON'))
      };

      try {
        await networkUtils.afterFetchFromService('https://example.com/api', mockResponse);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.equal('Failed to parse JSON response. URL: https://example.com/api');
        expect(error.status).to.equal(500);
      }
    });
  });

  describe('getResponseJson', () => {
    it('should return parsed JSON for valid response', async () => {
      const mockResponse = {
        body: 'some body',
        headers: { get: sinon.stub().withArgs('Content-Length').returns('50') },
        json: sinon.stub().resolves({ data: 'test' })
      };

      const result = await networkUtils.getResponseJson(mockResponse);
      expect(result).to.deep.equal({ data: 'test' });
    });

    it('should return fallback for empty body', async () => {
      const mockResponse = {
        body: null,
        headers: { get: sinon.stub().returns(null) }
      };

      const result = await networkUtils.getResponseJson(mockResponse, { default: 'fallback' });
      expect(result).to.deep.equal({ default: 'fallback' });
    });

    it('should return fallback for Content-Length 0', async () => {
      const mockResponse = {
        body: 'some body',
        headers: { get: sinon.stub().withArgs('Content-Length').returns('0') }
      };

      const result = await networkUtils.getResponseJson(mockResponse, { empty: true });
      expect(result).to.deep.equal({ empty: true });
    });

    it('should return fallback for JSON parse errors', async () => {
      const mockResponse = {
        body: 'some body',
        headers: { get: sinon.stub().withArgs('Content-Length').returns('50') },
        json: sinon.stub().rejects(new Error('Invalid JSON'))
      };

      const result = await networkUtils.getResponseJson(mockResponse, { error: 'fallback' });
      expect(result).to.deep.equal({ error: 'fallback' });
    });

    it('should use default fallback when none provided', async () => {
      const mockResponse = {
        body: null,
        headers: { get: sinon.stub().returns(null) }
      };

      const result = await networkUtils.getResponseJson(mockResponse);
      expect(result).to.deep.equal({});
    });
  });

  describe('errorAfterFetchFromService', () => {
    it('should handle aborted requests', async () => {
      const url = 'https://example.com/api';
      const options = { signal: { aborted: true } };
      const error = new Error('Some error');

      try {
        await networkUtils.errorAfterFetchFromService(url, options, error);
        expect.fail('Should have thrown AbortError');
      } catch (thrownError) {
        expect(thrownError.name).to.equal('AbortError');
        expect(thrownError.message).to.include('aborted by user');
      }
    });

    it('should handle TypeError as network error', async () => {
      const url = 'https://example.com/api';
      const options = {};
      const typeError = new TypeError('Failed to fetch');

      try {
        await networkUtils.errorAfterFetchFromService(url, options, typeError);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Network error. URL: https://example.com/api');
        expect(error.message).to.include('Failed to fetch');
        expect(error.status).to.equal(0);
      }
    });

    it('should handle TimeoutError', async () => {
      const url = 'https://example.com/api';
      const options = {};
      const timeoutError = new Error('Request timed out');
      timeoutError.name = 'TimeoutError';

      try {
        await networkUtils.errorAfterFetchFromService(url, options, timeoutError);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Request timed out. URL: https://example.com/api');
        expect(error.status).to.equal(504);
      }
    });

    it('should rethrow other errors unchanged', async () => {
      const url = 'https://example.com/api';
      const options = {};
      const customError = new Error('Custom error');

      try {
        await networkUtils.errorAfterFetchFromService(url, options, customError);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).to.equal(customError);
      }
    });
  });

  describe('fetchFromService', () => {
    beforeEach(() => {
      sinon.stub(networkUtils, 'fetchWithTimeout');
      sinon.stub(networkUtils, 'afterFetchFromService');
      sinon.stub(networkUtils, 'errorAfterFetchFromService');
    });

    it('should call onSuccess when provided', async () => {
      const mockResponse = { status: 200 };
      const onSuccess = sinon.stub().resolves('success result');
      networkUtils.fetchWithTimeout.resolves(mockResponse);

      const result = await networkUtils.fetchFromService('https://example.com/api', {}, onSuccess);

      expect(onSuccess.calledWith(mockResponse)).to.be.true;
      expect(result).to.equal('success result');
    });

    it('should return response for 202 status without onSuccess', async () => {
      const mockResponse = { status: 202 };
      networkUtils.fetchWithTimeout.resolves(mockResponse);

      const result = await networkUtils.fetchFromService('https://example.com/api', {});

      expect(result).to.equal(mockResponse);
    });

    it('should return response for 5xx status without onSuccess', async () => {
      const mockResponse = { status: 500 };
      networkUtils.fetchWithTimeout.resolves(mockResponse);

      const result = await networkUtils.fetchFromService('https://example.com/api', {});

      expect(result).to.equal(mockResponse);
    });

    it('should return response for 429 status without onSuccess', async () => {
      const mockResponse = { status: 429 };
      networkUtils.fetchWithTimeout.resolves(mockResponse);

      const result = await networkUtils.fetchFromService('https://example.com/api', {});

      expect(result).to.equal(mockResponse);
    });

    it('should call afterFetchFromService for other statuses', async () => {
      const mockResponse = { status: 200 };
      const processedResponse = { processed: true };
      networkUtils.fetchWithTimeout.resolves(mockResponse);
      networkUtils.afterFetchFromService.resolves(processedResponse);

      const result = await networkUtils.fetchFromService('https://example.com/api', {});

      expect(networkUtils.afterFetchFromService.calledWith('https://example.com/api', mockResponse)).to.be.true;
      expect(result).to.equal(processedResponse);
    });

    it('should call onError when error occurs and onError provided', async () => {
      const error = new Error('Fetch failed');
      const onError = sinon.stub().resolves();
      networkUtils.fetchWithTimeout.rejects(error);

      await networkUtils.fetchFromService('https://example.com/api', {}, null, onError);

      expect(onError.calledWith(error)).to.be.true;
    });

    it('should call errorAfterFetchFromService when error occurs and no onError', async () => {
      const error = new Error('Fetch failed');
      networkUtils.fetchWithTimeout.rejects(error);

      await networkUtils.fetchFromService('https://example.com/api', {});

      expect(networkUtils.errorAfterFetchFromService.calledWith('https://example.com/api', {}, error)).to.be.true;
    });
  });

  describe('fetchFromServiceWithRetry', () => {
    beforeEach(() => {
      sinon.stub(networkUtils, 'fetchFromServiceWithExponentialRetry');
      sinon.stub(networkUtils, 'fetchFromServiceWithServerPollingRetry');
    });

    it('should use exponential retry for exponential retryType', async () => {
      const retryConfig = { retryType: 'exponential' };
      const expectedResult = { response: 'success' };
      networkUtils.fetchFromServiceWithExponentialRetry.resolves(expectedResult);

      const result = await networkUtils.fetchFromServiceWithRetry('https://example.com/api', {}, retryConfig);

      expect(networkUtils.fetchFromServiceWithExponentialRetry.calledOnce).to.be.true;
      expect(result).to.equal(expectedResult);
    });

    it('should use polling retry for polling retryType', async () => {
      const retryConfig = { retryType: 'polling' };
      const expectedResult = { response: 'success' };
      networkUtils.fetchFromServiceWithServerPollingRetry.resolves(expectedResult);

      const result = await networkUtils.fetchFromServiceWithRetry('https://example.com/api', {}, retryConfig);

      expect(networkUtils.fetchFromServiceWithServerPollingRetry.calledOnce).to.be.true;
      expect(result).to.equal(expectedResult);
    });

    it('should return undefined when no retryType specified', async () => {
      const retryConfig = { retryParams: { maxRetries: 3 } };
      networkUtils.fetchFromServiceWithExponentialRetry.resolves({ response: 'success' });
      networkUtils.fetchFromServiceWithServerPollingRetry.resolves({ response: 'success' });

      const result = await networkUtils.fetchFromServiceWithRetry('https://example.com/api', {}, retryConfig);

      expect(networkUtils.fetchFromServiceWithExponentialRetry.called).to.be.false;
      expect(networkUtils.fetchFromServiceWithServerPollingRetry.called).to.be.false;
      expect(result).to.be.undefined;
    });
  });

  describe('Basic retry functionality', () => {
    it('should handle successful exponential retry on first attempt', async () => {
      sinon.stub(networkUtils, 'fetchFromService');
      sinon.stub(networkUtils, 'getResponseJson');
      
      const mockResponse = { status: 200 };
      const responseData = { data: 'success' };
      networkUtils.fetchFromService.resolves(mockResponse);
      networkUtils.getResponseJson.resolves(responseData);

      const retryConfig = { retryParams: { maxRetries: 3, retryDelay: 1000 } };
      const result = await networkUtils.fetchFromServiceWithExponentialRetry('https://example.com/api', {}, retryConfig);

      expect(networkUtils.fetchFromService.calledOnce).to.be.true;
      expect(result.response).to.equal(responseData);
      expect(result.attempt).to.equal(1);
    });

    it('should handle successful polling on first attempt', async () => {
      sinon.stub(networkUtils, 'fetchFromService');
      sinon.stub(networkUtils, 'getResponseJson');
      sinon.stub(networkUtils, 'handleAbortedRequest');
      
      const mockResponse = { status: 200, headers: { get: sinon.stub().returns(null) } };
      const responseData = { data: 'success' };
      const onSuccess = sinon.stub().resolves('success result');
      
      networkUtils.fetchFromService.resolves(mockResponse);
      networkUtils.getResponseJson.resolves(responseData);

      const retryConfig = { retryParams: { maxRetryDelay: 100 } };
      const result = await networkUtils.fetchFromServiceWithServerPollingRetry('https://example.com/api', {}, retryConfig, onSuccess);

      expect(onSuccess.calledWith(responseData)).to.be.true;
      expect(result).to.equal('success result');
    });

    it('should return response when no onSuccess provided in polling', async () => {
      sinon.stub(networkUtils, 'fetchFromService');
      sinon.stub(networkUtils, 'getResponseJson');
      sinon.stub(networkUtils, 'handleAbortedRequest');
      
      const mockResponse = { status: 200, headers: { get: sinon.stub().returns(null) } };
      const responseData = { data: 'success' };
      
      networkUtils.fetchFromService.resolves(mockResponse);
      networkUtils.getResponseJson.resolves(responseData);

      const retryConfig = { retryParams: { maxRetryDelay: 100 } };
      const result = await networkUtils.fetchFromServiceWithServerPollingRetry('https://example.com/api', {}, retryConfig);

      expect(result).to.equal(mockResponse);
    });
  });

  describe('Integration tests', () => {
    it('should handle complete exponential retry workflow', async () => {
      const mockResponse = {
        status: 200,
        body: 'response body',
        headers: { get: sinon.stub().withArgs('Content-Length').returns('50') },
        json: sinon.stub().resolves({ data: 'success' })
      };
      fetchStub.resolves(mockResponse);

      const retryConfig = { 
        retryType: 'exponential',
        retryParams: { maxRetries: 1, retryDelay: 100 }
      };

      const result = await networkUtils.fetchFromServiceWithRetry('https://example.com/api', {}, retryConfig);

      expect(fetchStub.calledOnce).to.be.true;
      expect(result).to.have.property('response');
      expect(result).to.have.property('attempt', 1);
      expect(mockResponse.json.calledOnce).to.be.true;
    });

    it('should handle complete polling workflow with onSuccess', async () => {
      const mockResponse = {
        status: 200,
        body: 'response body',
        headers: { get: sinon.stub().returns(null) },
        json: sinon.stub().resolves({ status: 'complete' })
      };
      fetchStub.resolves(mockResponse);

      const onSuccess = sinon.stub().resolves('processed result');
      const retryConfig = { 
        retryType: 'polling',
        retryParams: { maxRetryDelay: 100, defaultRetryDelay: 10 }
      };

      const result = await networkUtils.fetchFromServiceWithRetry('https://example.com/api', {}, retryConfig, onSuccess);

      expect(onSuccess.called).to.be.true;
      expect(result).to.equal('processed result');
      expect(mockResponse.json.calledOnce).to.be.true;
    });
  });
});