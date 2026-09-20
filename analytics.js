// google-analytics.js
const GA_ENDPOINT = "https://www.google-analytics.com/mp/collect";
const MEASUREMENT_ID = "G-FDTQLQ6M1C";
const API_SECRET = "yOrB7DUFSiC48Tvk_r-jjg";
const DEFAULT_ENGAGEMENT_TIME_IN_MSEC = 100;
const SESSION_EXPIRATION_IN_MIN = 30;

// True only while this page still has a live connection to the extension.
// After an extension reload/update, stale pages keep a `chrome` object whose
// storage calls throw "Extension context invalidated" — this lets us bail out
// quietly instead of surfacing an unhandled rejection.
function extensionContextValid() {
  try {
    return !!(chrome && chrome.runtime && chrome.runtime.id);
  } catch (e) {
    return false;
  }
}

async function getOrCreateClientId() {
  const result = await chrome.storage.local.get("clientId");
  let clientId = result.clientId;
  if (!clientId) {
    clientId = self.crypto.randomUUID();
    await chrome.storage.local.set({ clientId });
  }
  return clientId;
}

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
  // Skip silently if the extension context is gone (e.g. after a reload).
  if (!extensionContextValid()) return;

  try {
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

    await fetch(
      `${GA_ENDPOINT}?measurement_id=${MEASUREMENT_ID}&api_secret=${API_SECRET}`,
      { method: "POST", body }
    );
  } catch (error) {
    // Context invalidation and transient network failures are non-fatal for a
    // notes app — never let analytics break the editor or spam the console.
    if (!/Extension context invalidated/i.test(String(error && error.message))) {
      console.debug("Napkin analytics skipped:", error && error.message);
    }
  }
}

export { sendAnalyticsEvent };
