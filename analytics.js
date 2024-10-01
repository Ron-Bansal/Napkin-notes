// google-analytics.js
const GA_ENDPOINT = "https://www.google-analytics.com/mp/collect";
const GA_DEBUG_ENDPOINT = "https://www.google-analytics.com/debug/mp/collect";
const MEASUREMENT_ID = "G-FDTQLQ6M1C";
const API_SECRET = "yOrB7DUFSiC48Tvk_r-jjg";
const DEFAULT_ENGAGEMENT_TIME_IN_MSEC = 100;

async function getOrCreateClientId() {
  const result = await chrome.storage.local.get("clientId");
  let clientId = result.clientId;
  if (!clientId) {
    clientId = self.crypto.randomUUID();
    await chrome.storage.local.set({ clientId });
  }
  return clientId;
}

const SESSION_EXPIRATION_IN_MIN = 30;

async function getOrCreateSessionId() {
  let { sessionData } = await chrome.storage.session.get("sessionData");
  const currentTimeInMs = Date.now();
  if (sessionData && sessionData.timestamp) {
    const durationInMin = (currentTimeInMs - sessionData.timestamp) / 60000;
    if (durationInMin > SESSION_EXPIRATION_IN_MIN) {
      sessionData = null;
    } else {
      sessionData.timestamp = currentTimeInMs;
      await chrome.storage.session.set({ sessionData });
    }
  }
  if (!sessionData) {
    sessionData = {
      session_id: currentTimeInMs.toString(),
      timestamp: currentTimeInMs,
    };
    await chrome.storage.session.set({ sessionData });
  }
  return sessionData.session_id;
}

async function sendAnalyticsEvent(name, params = {}) {
  const clientId = await getOrCreateClientId();
  const sessionId = await getOrCreateSessionId();

  const body = JSON.stringify({
    client_id: clientId,
    events: [
      {
        name,
        params: {
          ...params,
          session_id: sessionId,
          engagement_time_msec: DEFAULT_ENGAGEMENT_TIME_IN_MSEC,
        },
      },
    ],
  });

  try {
    // Send to actual endpoint
    const response = await fetch(
      `${GA_ENDPOINT}?measurement_id=${MEASUREMENT_ID}&api_secret=${API_SECRET}`,
      {
        method: "POST",
        body,
      }
    );
    console.log("GA response status:", response.status);

    // Send to debug endpoint
    const debugResponse = await fetch(
      `${GA_DEBUG_ENDPOINT}?measurement_id=${MEASUREMENT_ID}&api_secret=${API_SECRET}`,
      {
        method: "POST",
        body,
      }
    );
    const debugResult = await debugResponse.json();
    console.log("GA debug response:", debugResult);
  } catch (error) {
    console.error("Error sending GA event:", error);
  }
}

export { sendAnalyticsEvent };
