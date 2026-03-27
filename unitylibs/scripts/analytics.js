/** Canonical interaction names for the prompt-with-style UI (`widget-prompt-bar-style`). */
export const PROMPT_WITH_STYLE_UI = {
  ENTER_PROMPT: 'Enter Prompt|UnityWidget',
  MODEL_SELECT_DROPDOWN: 'Model Select Dropdown|UnityWidget',
  GENERATE_CTA: 'Click on Generate CTA|UnityWidget',
  MODULE_PICKER: 'Module Picker Select Dropdown|UnityWidget',
};

/**
 * Interaction name for the selected style when the user clicks Generate (1-based style index).
 * @param {number} styleIndexOneBased - 1 = first style, 2 = second, …
 * @returns {string} e.g. `'Style 1|UnityWidget'`
 */
export function styleSelectionGenerateEventName(styleIndexOneBased) {
  return `Style ${styleIndexOneBased}|UnityWidget`;
}

/**
 * Sends an interaction event to Adobe Analytics via Adobe Launch (_satellite).
 * @param {string} eventName - The interaction event name (e.g. 'Enter Prompt|UnityWidget')
 */
export function sendAdobeAnalytics(eventName) {
  window._satellite?.track('event', { // eslint-disable-line no-underscore-dangle
    xdm: {},
    data: { web: { webInteraction: { name: eventName } } },
  });
}

function getSessionID() {
  const aToken = window.adobeIMS.getAccessToken();
  const arrayToken = aToken?.token.split('.');
  if (!arrayToken) return;
  const tokenPayload = JSON.parse(atob(arrayToken[1]));
  // eslint-disable-next-line consistent-return
  return tokenPayload.sub || tokenPayload.user_id;
}

function createPayloadForSplunk(metaData) {
  const {
    eventName, product, errorData, redirectUrl, assetId, statusCode, verb, action, workflowStep, fileMetaData, operation,
  } = metaData;
  return {
    event: {
      name: eventName,
      category: product,
      ...(verb && { subcategory: verb }),
      ...(action && { action }),
      ...(operation && { verb: operation }),
      ...(statusCode !== undefined && { statusCode }),
      ...(workflowStep && { workflowStep }),
    },
    content: { ...(assetId && { assetId }), ...(fileMetaData && { fileMetaData }) },
    source: {
      user_agent: navigator.userAgent,
      lang: document.documentElement.lang,
      app_name: 'unity',
      url: window.location.href,
    },
    user: {
      locale: document.documentElement.lang.toLocaleLowerCase(),
      id: getSessionID(),
    },
    error: errorData ? {
      type: errorData.code,
      ...(errorData.subCode && { subCode: errorData.subCode }),
      ...(errorData.desc && { desc: errorData.desc }),
    } : undefined,
    ...(redirectUrl && { redirect: { url: redirectUrl } }),
  };
}

export function sendSplunkAnalytics(eventName, product, metaData, splunkEndpoint, sendBeacon = false) {
  try {
    const eventDataPayload = createPayloadForSplunk({ ...metaData, eventName, product });
    if (sendBeacon && navigator.sendBeacon && navigator.sendBeacon(splunkEndpoint, JSON.stringify(eventDataPayload))) return;
    fetch(splunkEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventDataPayload),
    });
  } catch (error) {
    window.lana?.log(
      `An error occurred while sending ${eventName} to splunk, metadata: ${JSON.stringify(metaData || {})}, error: ${error || ''}`,
      { sampleRate: 100, tags: 'Unity-PS-Upload' },
    );
  }
}

export default sendSplunkAnalytics;
