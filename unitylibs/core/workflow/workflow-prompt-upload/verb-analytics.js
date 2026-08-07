/* eslint-disable no-underscore-dangle */

const params = new Proxy(
  new URLSearchParams(window.location.search),
  { get: (searchParams, prop) => searchParams.get(prop) },
);

let appReferrer = params.x_api_client_id || params['x-product'] || '';
if (params.x_api_client_location || params['x-product-location']) {
  appReferrer = `${appReferrer}:${params.x_api_client_location || params['x-product-location']}`;
}
let trackingId = params.trackingid || '';
if (params.mv) trackingId = `${trackingId}:${params.mv}`;
if (params.mv2) trackingId = `${trackingId}:${params.mv2}`;

function ensureSatelliteReady(callback) {
  if (window._satellite?.track instanceof Function) callback();
  else setTimeout(() => ensureSatelliteReady(callback), 50);
}

function getSessionID() {
  const aToken = window.adobeIMS?.getAccessToken();
  const arrayToken = aToken?.token.split('.');
  if (!arrayToken) return undefined;
  const tokenPayload = JSON.parse(atob(arrayToken[1]));
  return tokenPayload.sub || tokenPayload.user_id;
}

function toLabel(product) {
  if (!product) return product;
  return product.charAt(0).toUpperCase() + product.slice(1);
}

function eventData(metaData, { appReferrer: referrer, trackingId: tracking }, product) {
  const {
    verb, eventName, errorInfo = '', noOfFiles, uploadTime, type, size, count, userAttempts,
  } = metaData;
  return {
    event: {
      pagename: `${product}:verb-${verb}:${eventName}${errorInfo ? ` ${errorInfo}` : ''}`,
      ...(noOfFiles ? { no_of_files: noOfFiles } : {}),
      ...(uploadTime ? { uploadTime } : {}),
    },
    content: { type, size, count, fileType: type, totalSize: size },
    source: {
      user_agent: navigator.userAgent,
      lang: document.documentElement.lang,
      app_name: `unity:${verb}`,
      url: window.location.href,
      referrer,
      tracking,
    },
    user: {
      locale: document.documentElement.lang.toLocaleLowerCase(),
      id: getSessionID(),
      is_authenticated: `${window.adobeIMS?.isSignedInUser() ? 'true' : 'false'}`,
      user_tags: [`${localStorage['unity.user'] ? 'frictionless_return_user' : 'frictionless_new_user'}`],
      ...(userAttempts && { return_user_type: userAttempts }),
    },
  };
}

function createPayloadForSplunk(metaData, product) {
  const {
    verb, eventName, noOfFiles, uploadTime, type, size, count, workflowStep,
    uploadType, userAttempts, errorData, chunkUploadAttempt, chunkNumber, assetId, maxRetryCount,
  } = metaData;
  return {
    event: {
      name: eventName,
      category: product,
      subcategory: verb,
      ...(uploadTime && { uploadTime }),
      ...(uploadType && { uploadType }),
    },
    content: {
      type,
      size,
      count,
      fileType: type,
      totalSize: size,
      ...(workflowStep && { workflowStep }),
      ...(noOfFiles && { no_of_files: noOfFiles }),
      ...(chunkUploadAttempt && { chunkUploadAttempt }),
      ...(chunkNumber && { chunkNumber }),
      ...(assetId && { assetId }),
      ...(maxRetryCount && { maxRetryCount }),
    },
    source: {
      user_agent: navigator.userAgent,
      lang: document.documentElement.lang,
      app_name: 'unity',
      url: window.location.href,
    },
    user: {
      locale: document.documentElement.lang.toLocaleLowerCase(),
      id: getSessionID(),
      isAuthenticated: `${window.adobeIMS?.isSignedInUser() ? 'true' : 'false'}`,
      type: [`${localStorage['unity.user'] ? 'frictionless_return_user' : 'frictionless_new_user'}`],
      ...(userAttempts && { return_user_type: userAttempts }),
    },
    error: errorData ? {
      type: errorData.code,
      ...(errorData.subCode && { subCode: errorData.subCode }),
      ...(errorData.desc && { desc: errorData.desc }),
    } : undefined,
  };
}

export function sendAnalyticsToSplunk(eventName, verb, product, metaData, splunkEndpoint, sendBeacon = false) {
  try {
    const eventDataPayload = createPayloadForSplunk({ ...metaData, eventName, verb }, product);
    const payloadString = JSON.stringify(eventDataPayload);
    if (sendBeacon && navigator.sendBeacon && navigator.sendBeacon(splunkEndpoint, payloadString)) return;
    fetch(splunkEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payloadString,
    });
  } catch (error) {
    window.lana?.log(
      `An error occurred while sending ${eventName} to splunk, verb: ${verb}, error: ${error}`,
      { sampleRate: 1, tags: 'DC_Milo,Project Unity (DC)', severity: 'error' },
    );
  }
}

export function createEventObject(eventName, verb, product, metaData, trackingParams, documentUnloading) {
  const verbEvent = `${product}:verb-${verb}:${eventName}`;
  const eventDataPayload = eventData({ ...metaData, eventName, verb }, trackingParams, product);
  const redirectReady = new CustomEvent('DCUnity:RedirectReady');
  return {
    documentUnloading,
    done(...args) {
      const error = args[1];
      if (documentUnloading) return;
      if (eventName === 'job:uploaded') window.dispatchEvent(redirectReady);
      const accountType = window?.adobeIMS?.getAccountType();
      if (error) {
        window.lana?.log(
          `Error Code: ${error}, Status: 'Unknown', Message: An error occurred while sending ${verbEvent}, Account Type: ${accountType}`,
          { sampleRate: 1, tags: 'DC_Milo,Project Unity (DC)', severity: 'error' },
        );
      }
    },
    data: {
      eventType: 'web.webinteraction.linkClicks',
      web: {
        webInteraction: {
          linkClicks: { value: 1 },
          type: 'other',
          name: verbEvent,
        },
      },
      _adobe_corpnew: {
        digitalData: {
          primaryEvent: {
            eventInfo: {
              eventName: `${verbEvent}${metaData.errorInfo ? ` ${metaData.errorInfo}` : ''}`,
              value: `${verb} - Frictionless to ${toLabel(product)} Web`,
            },
          },
          dcweb: eventDataPayload,
          dcweb2: eventDataPayload,
        },
        app: {
          appName: `${(product || '').toUpperCase()}_WEB_FRICTIONLESS`,
          appVersion: '1.0',
        },
      },
    },
  };
}

export default function verbAnalytics(eventName, verb, product, metaData = {}, documentUnloading = true) {
  const trackingParams = { appReferrer, trackingId };
  const trackEvent = () => {
    const event = createEventObject(eventName, verb, product, metaData, trackingParams, documentUnloading);
    window._satellite.track('event', event);
    window.alloy_getIdentity?.then((value) => { window.ecid = value.identity.ECID; });
  };
  if (window._satellite?.track instanceof Function) trackEvent();
  else ensureSatelliteReady(trackEvent);
}
