/**
 * Is It AI Slop? - Background Service Worker
 * Handles cross-origin requests to TypeSafe AI's Jev API endpoint,
 * bypassing webpage Content Security Policy (CSP) and CORS restrictions.
 */

(function () {
  'use strict';

  const _browser = (typeof browser !== 'undefined' ? browser : chrome);

  _browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.action) return false;

    if (message.action === 'CALL_JEV_API') {
      handleJevApiCall(message)
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message || String(err) }));
      return true; // Keep message channel open for async response
    }

    if (message.action === 'TEST_JEV_CONNECTION') {
      testJevConnection(message)
        .then(result => sendResponse({ success: true, result }))
        .catch(err => sendResponse({ success: false, error: err.message || String(err) }));
      return true;
    }

    return false;
  });

  /**
   * Dispatches request to TypeSafe AI System One decision API
   */
  async function handleJevApiCall(params) {
    const { apiUrl, apiKey, payload } = params;

    if (!apiKey) {
      throw new Error('TypeSafe AI API Key is required. Please set TYPESAFE_API_KEY.');
    }

    const endpoint = apiUrl || 'https://api.typesafe.ai/v1/systemone';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      let errMsg = `TypeSafe AI API returned HTTP ${response.status} (${response.statusText})`;
      try {
        const errorJson = await response.json();
        if (errorJson && (errorJson.message || errorJson.error)) {
          errMsg = `TypeSafe AI: ${errorJson.message || errorJson.error}`;
        }
      } catch (_) {
        const text = await response.text();
        if (text) errMsg += `: ${text.slice(0, 200)}`;
      }
      throw new Error(errMsg);
    }

    return await response.json();
  }

  /**
   * Lightweight connection probe to verify API Key validity
   */
  async function testJevConnection(params) {
    const payload = {
      model: params.model || 'jev-latest',
      state: 'Test probe',
      questions: {
        ping: {
          type: 'noul',
          instructions: 'Is this a valid test probe?'
        }
      }
    };

    return await handleJevApiCall({
      apiUrl: params.apiUrl,
      apiKey: params.apiKey,
      payload
    });
  }

  console.log('[Is It AI Slop?] Background service worker initialized.');
})();
