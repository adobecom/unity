import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setLibs, getLibs, getHeaders, getMatchedDomain } from '../../unitylibs/scripts/utils.js';

describe('Libs', () => {
  it('Default Libs', () => {
    const libs = setLibs('/libs');
    expect(libs).to.equal('https://main--milo--adobecom.aem.live/libs');
  });

  it('Does not support milolibs query param on prod', () => {
    const location = {
      hostname: 'business.adobe.com',
      search: '?milolibs=foo',
    };
    const libs = setLibs('/libs', location);
    expect(libs).to.equal('/libs');
  });

  it('Supports milolibs query param', () => {
    const location = {
      hostname: 'localhost',
      search: '?milolibs=foo',
    };
    const libs = setLibs('/libs', location);
    expect(libs).to.equal('https://foo--milo--adobecom.aem.live/libs');
  });

  it('Supports local milolibs query param', () => {
    const location = {
      hostname: 'localhost',
      search: '?milolibs=local',
    };
    const libs = setLibs('/libs', location);
    expect(libs).to.equal('http://localhost:6456/libs');
  });

  it('Supports forked milolibs query param', () => {
    const location = {
      hostname: 'localhost',
      search: '?milolibs=awesome--milo--forkedowner',
    };
    const libs = setLibs('/libs', location);
    expect(libs).to.equal('https://awesome--milo--forkedowner.aem.live/libs');
  });

  it('Should return libs', () => {
    const libs = getLibs();
    expect(libs).to.equal('https://awesome--milo--forkedowner.aem.live/libs');
  });
});

describe('Headers and Token', () => {
  let adobeIMSStub;

  beforeEach(() => {
    // Setup required global stubs
    window.getUnityLibs = sinon.stub().returns('../../unitylibs');
    window.getFlatObject = sinon.stub().resolves(() => 'mocked-flatten-result');

    window.adobeIMS = { getAccessToken: () => {}, refreshToken: () => {} };
    adobeIMSStub = sinon.stub(window.adobeIMS, 'getAccessToken');
  });

  afterEach(() => {
    adobeIMSStub.restore();
    delete window.getFlatObject;
    delete window.getUnityLibs;
  });

  it('Should return headers with guest access token', async () => {
    const token = { token: 'guest-token', expire: Date.now() + (10 * 60 * 1000) };
    adobeIMSStub.returns(token);

    const headers = await getHeaders('test-api-key');
    expect(headers).to.deep.equal({
      'Content-Type': 'application/json',
      Authorization: 'Bearer guest-token',
      'x-api-key': 'test-api-key',
    });
  });

  it('Should return headers with refreshed token if guest access token is expired', async () => {
    const token = { token: 'guest-token', expire: Date.now() - (10 * 60 * 1000) };
    adobeIMSStub.returns(token);
    sinon.stub(window.adobeIMS, 'refreshToken').resolves({ tokenInfo: { token: 'refreshed-token' } });

    const headers = await getHeaders('test-api-key');
    expect(headers).to.deep.equal({
      'Content-Type': 'application/json',
      Authorization: 'Bearer refreshed-token',
      'x-api-key': 'test-api-key',
    });
  });

  it.skip('Should return headers with empty string if refresh token fails', async function () {
    this.timeout(5000); // Increase timeout to handle retry delay
    const token = { token: 'guest-token', expire: Date.now() - (10 * 60 * 1000) };
    adobeIMSStub.returns(token);
    const refreshTokenStub = sinon.stub(window.adobeIMS, 'refreshToken').rejects(new Error('Refresh token failed'));

    try {
      const headers = await getHeaders('test-api-key');
      // When refresh token fails, utils returns "Bearer undefined"
      expect(headers).to.deep.equal({
        'Content-Type': 'application/json',
        Authorization: 'Bearer undefined',
        'x-api-key': 'test-api-key',
      });
    } finally {
      refreshTokenStub.restore();
    }
  });
});

describe('getMatchedDomain', () => {
  it('should return matching domain key for hostname', () => {
    const domainMap = { acrobat: ['^(stage\\.)?acrobat\\.adobe\\.com$'] };
    expect(getMatchedDomain(domainMap, 'acrobat.adobe.com')).to.equal('acrobat');
    expect(getMatchedDomain(domainMap, 'stage.acrobat.adobe.com')).to.equal('acrobat');
  });

  it('should match AEM preview/live domains', () => {
    const domainMap = { acrobat: ['^.+--dc-frictionless--adobecom\\.aem\\.(page|live)$'] };
    expect(getMatchedDomain(domainMap, 'main--dc-frictionless--adobecom.aem.page')).to.equal('acrobat');
    expect(getMatchedDomain(domainMap, 'main--dc-frictionless--adobecom.aem.live')).to.equal('acrobat');
  });

  it('should return undefined when no match', () => {
    const domainMap = { acrobat: ['^acrobat\\.adobe\\.com$'] };
    expect(getMatchedDomain(domainMap, 'www.adobe.com')).to.be.undefined;
  });

  it('should return undefined for empty domainMap', () => {
    expect(getMatchedDomain({}, 'acrobat.adobe.com')).to.be.undefined;
    expect(getMatchedDomain()).to.be.undefined;
  });
});
