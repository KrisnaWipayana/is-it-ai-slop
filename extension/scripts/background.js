/**
 * Is It AI Slop? - Background Service Worker
 * Handles cross-origin requests to TypeSafe AI's Jev API endpoint,
 * and runs local ONNX WebAssembly machine learning inference.
 * Bypasses webpage Content Security Policy (CSP) and CORS restrictions.
 */

// Import ONNX Runtime into service worker scope
try {
  importScripts('../lib/onnxruntime/ort.min.js');
} catch (e) {
  console.warn('[Is It AI Slop?] Could not import ort.min.js in background:', e);
}

(function () {
  'use strict';

  const _browser = (typeof browser !== 'undefined' ? browser : chrome);

  let modelSession = null;
  let modelLoadingPromise = null;

  // Initializes ONNX runtime session inside service worker context
  async function ensureOnnxModelLoaded() {
    if (modelSession) return modelSession;
    if (modelLoadingPromise) return modelLoadingPromise;

    modelLoadingPromise = (async () => {
      const ortInstance = (typeof ort !== 'undefined' ? ort : (typeof self !== 'undefined' && self.ort ? self.ort : null));
      if (!ortInstance) {
        console.warn('[Is It AI Slop?] ONNX runtime object (ort) not found in background.');
        return null;
      }

      try {
        if (ortInstance.env && ortInstance.env.wasm) {
          ortInstance.env.wasm.wasmPaths = _browser.runtime.getURL('lib/onnxruntime/');
          ortInstance.env.wasm.numThreads = 1;

          // Pre-fetch WASM binary into wasmBinary to bypass WebAssembly.instantiateStreaming
          // (avoids MIME-type CompileError in extensions)
          try {
            const hasSimd = typeof WebAssembly === 'object' &&
              typeof WebAssembly.validate === 'function' &&
              WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 26, 11]));
            const wasmFileName = hasSimd ? 'ort-wasm-simd.wasm' : 'ort-wasm.wasm';
            const wasmUrl = _browser.runtime.getURL(`lib/onnxruntime/${wasmFileName}`);
            const wasmRes = await fetch(wasmUrl);
            if (wasmRes.ok) {
              ortInstance.env.wasm.wasmBinary = await wasmRes.arrayBuffer();
            }
          } catch (_) {
            // Falls back to wasmPaths if pre-fetch fails
          }
        }

        const modelUrl = _browser.runtime.getURL('models/ai-slop_model.onnx');
        const res = await fetch(modelUrl);
        if (res.ok) {
          const buffer = await res.arrayBuffer();
          modelSession = await ortInstance.InferenceSession.create(buffer, {
            executionProviders: ['wasm']
          });
          console.log('[Is It AI Slop?] ONNX XGBoost model initialized in background service worker.');
        }
      } catch (err) {
        console.warn('[Is It AI Slop?] Background ONNX initialization error:', err);
        modelSession = null;
      }
      return modelSession;
    })();

    return await modelLoadingPromise;
  }

  // Executes ONNX XGBoost prediction on a single 11-feature vector
  async function handleOnnxInference(featureVector) {
    const session = await ensureOnnxModelLoaded();
    if (!session) return { success: false, error: 'ONNX model not loaded' };

    const ortInstance = (typeof ort !== 'undefined' ? ort : self.ort);
    const inputTensor = new ortInstance.Tensor('float32', new Float32Array(featureVector), [1, 11]);
    const feeds = { float_input: inputTensor };
    const results = await session.run(feeds);

    if (results && results.probabilities && results.probabilities.data) {
      const probSlop = results.probabilities.data[1];
      const score = Math.min(Math.max(Math.round(probSlop * 100), 0), 100);
      return { success: true, score };
    }

    if (results && results.label && results.label.data) {
      const label = Number(results.label.data[0]);
      return { success: true, score: label === 1 ? 80 : 15 };
    }

    return { success: false, error: 'Unexpected ONNX output format' };
  }

  // Executes batch ONNX prediction on multiple feature vectors at once
  async function handleOnnxBatch(featureVectors) {
    const session = await ensureOnnxModelLoaded();
    if (!session || !Array.isArray(featureVectors) || featureVectors.length === 0) {
      return { success: false, error: 'ONNX model not loaded or empty batch' };
    }

    const count = featureVectors.length;
    const flat = new Float32Array(count * 11);
    for (let i = 0; i < count; i++) {
      flat.set(featureVectors[i], i * 11);
    }

    const ortInstance = (typeof ort !== 'undefined' ? ort : self.ort);
    const inputTensor = new ortInstance.Tensor('float32', flat, [count, 11]);
    const feeds = { float_input: inputTensor };
    const results = await session.run(feeds);

    const scores = [];
    if (results && results.probabilities && results.probabilities.data) {
      const probData = results.probabilities.data;
      for (let i = 0; i < count; i++) {
        const p = probData[i * 2 + 1];
        scores.push(Math.min(Math.max(Math.round(p * 100), 0), 100));
      }
      return { success: true, scores };
    }

    if (results && results.label && results.label.data) {
      for (let i = 0; i < count; i++) {
        scores.push(Number(results.label.data[i]) === 1 ? 80 : 15);
      }
      return { success: true, scores };
    }

    return { success: false, error: 'Unexpected ONNX batch output' };
  }

  _browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.action) return false;

    // Ping / Warm-up ONNX model
    if (message.action === 'PING_ONNX') {
      ensureOnnxModelLoaded()
        .then(session => sendResponse({ success: true, ready: Boolean(session) }))
        .catch(err => sendResponse({ success: false, error: err.message || String(err) }));
      return true;
    }

    // ONNX Single Inference
    if (message.action === 'RUN_ONNX_INFERENCE') {
      handleOnnxInference(message.featureVector)
        .then(res => sendResponse(res))
        .catch(err => sendResponse({ success: false, error: err.message || String(err) }));
      return true;
    }

    // ONNX Batch Inference
    if (message.action === 'RUN_ONNX_BATCH') {
      handleOnnxBatch(message.featureVectors)
        .then(res => sendResponse(res))
        .catch(err => sendResponse({ success: false, error: err.message || String(err) }));
      return true;
    }

    // TypeSafe AI JEV API Call
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

  // Dispatches request to TypeSafe AI System One decision API
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

  // Lightweight connection probe to verify API Key validity
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

  // Pre-load ONNX model eagerly in background
  ensureOnnxModelLoaded().catch(() => { });

  console.log('[Is It AI Slop?] Background service worker initialized with ONNX support.');
})();
