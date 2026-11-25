/**
 * Is It AI Slop? - Background Service Worker
 * Handles cross-origin requests to the OpenRouter API (JEV model).
 * Bypasses webpage Content Security Policy (CSP) and CORS restrictions.
 */

(function () {
  'use strict';

  const _browser = (typeof browser !== 'undefined' ? browser : chrome);

  _browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.action) return false;

    // JEV model call via OpenRouter
    if (message.action === 'CALL_JEV_API') {
      handleJevApiCall(message)
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message || String(err) }));
      return true;
    }

    if (message.action === 'TEST_JEV_CONNECTION') {
      testJevConnection(message)
        .then(result => sendResponse({ success: true, result }))
        .catch(err => sendResponse({ success: false, error: err.message || String(err) }));
      return true;
    }

    return false;
  });

  // Dispatches request to the OpenRouter chat completions API
  async function handleJevApiCall(params) {
    const { apiUrl, apiKey, payload } = params;

    if (!apiKey) {
      throw new Error('OpenRouter API Key is required. Please set OPENROUTER_API_KEY.');
    }

    const endpoint = apiUrl || 'https://openrouter.ai/api/v1/chat/completions';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`,
        'X-Title': 'Is It AI Slop?'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      let errMsg = `OpenRouter API returned HTTP ${response.status} (${response.statusText})`;
      try {
        const errorJson = await response.json();
        const e = errorJson && errorJson.error;
        const detail = (e && (e.message || e)) || (errorJson && errorJson.message);
        if (detail) errMsg = `OpenRouter: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
      } catch (_) {
        // body was not JSON; keep the status-based message
      }
      throw new Error(errMsg);
    }

    return await response.json();
  }

  // Lightweight connection probe to verify API Key validity
  async function testJevConnection(params) {
    return await handleJevApiCall({
      apiUrl: params.apiUrl,
      apiKey: params.apiKey,
      payload: {
        model: params.model || 'jev-latest',
        max_tokens: 5,
        messages: [{ role: 'user', content: 'ping' }]
      }
    });
  }

  console.log('[Is It AI Slop?] Background service worker initialized.');
})();
