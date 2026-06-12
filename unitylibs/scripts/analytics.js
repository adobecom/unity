export const PROMPT_BAR_EVENTS = {
  ENTER_PROMPT: 'Enter Prompt|UnityWidget',
  MODEL_SELECT_DROPDOWN: 'Model Select Dropdown|UnityWidget',
  GENERATE_CTA: 'Click on Generate CTA|UnityWidget',
  EXPLORE_OTHER: 'Explore Other|UnityWidget',
  MODULE_PICKER: 'Module Picker Select Dropdown|UnityWidget',
  RATIO_DROPDOWN: 'Ratio Dropdown Select|UnityWidget',
  MORE: 'More|UnityWidget',
  UPLOAD_FILE_ATTEMPT: 'Upload file attempt|UnityWidget',
  UPLOAD_STARTED: 'Uploading started|UnityWidget',
  UPLOAD_ERROR: 'Upload error|UnityWidget',
  generateModel: (modelName) => `Generate ${modelName}|UnityWidget`,
  ratioSelect: (ratio) => `${ratio}|UnityWidget`,
};

export const PROMPT_WITH_STYLE_EVENTS = PROMPT_BAR_EVENTS;

export function styleSelectionGenerateEventName(styleIndexOneBased) {
  return `Style ${styleIndexOneBased}|UnityWidget`;
}

export function voiceModelGenerateEventName(voiceIndexOneBased, modelName) {
  const m = (modelName || '').trim() || 'Unknown';
  return `Voice ${voiceIndexOneBased} ${m} Generate|UnityWidget`;
}

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
    styleEventName, voiceEventName, modelGenEventName, aspectRatio, hasImage,
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
    content: {
      ...(assetId && { assetId }),
      ...(fileMetaData && { fileMetaData }),
      ...(styleEventName && { style: styleEventName }),
      ...(voiceEventName && { voice: voiceEventName }),
      ...(modelGenEventName && { model: modelGenEventName }),
      ...(aspectRatio && { aspectRatio }),
      ...(hasImage !== undefined && hasImage !== null && { hasImage }),
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
    },
    error: errorData ? {
      type: errorData.code,
      ...(errorData.subCode && { subCode: errorData.subCode }),
      ...(errorData.desc && { desc: errorData.desc }),
    } : undefined,
    ...(redirectUrl && { redirect: { url: redirectUrl } }),
  };
}

export default function sendAnalyticsToSplunk(eventName, product, metaData, splunkEndpoint, sendBeacon = false) {
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
