/**
 * Is It AI Slop? - Popup Controller
 * Coordinates scanning requests, renders white/navy/orange visualizer,
 * manages model selection toggle buttons (TypeSafe JEV, Local ONNX, Heuristics, Auto),
 * and controls page highlighting interactions.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Cross-browser runtime: Firefox exposes `browser`, Chrome exposes `chrome`
  const _browser = (typeof browser !== 'undefined' ? browser : chrome);

  // DOM Elements - Navigation & Views
  const domainBadge = document.getElementById('domainBadge');
  const settingsBtn = document.getElementById('settingsBtn');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');

  const idleView = document.getElementById('idleView');
  const scanningView = document.getElementById('scanningView');
  const resultView = document.getElementById('resultView');
  const errorView = document.getElementById('errorView');
  const settingsView = document.getElementById('settingsView');

  const errorTitle = document.getElementById('errorTitle');
  const errorMessage = document.getElementById('errorMessage');

  // DOM Elements - Settings & Models
  const apiKeyInput = document.getElementById('apiKeyInput');
  const toggleKeyVisibility = document.getElementById('toggleKeyVisibility');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const engineStatusDot = document.getElementById('engineStatusDot');
  const currentEngineName = document.getElementById('currentEngineName');
  const currentEngineDetail = document.getElementById('currentEngineDetail');

  const modelToggleBtns = document.querySelectorAll('.model-toggle-btn');
  const segmentedBtns = document.querySelectorAll('.segmented-btn');
  const modelHelpText = document.getElementById('modelHelpText');
  const activeModelTag = document.getElementById('activeModelTag');
  const apiKeyRequiredHint = document.getElementById('apiKeyRequiredHint');

  // DOM Elements - Main Controls
  const startScanBtn = document.getElementById('startScanBtn');
  const rescanBtn = document.getElementById('rescanBtn');
  const highlightToggle = document.getElementById('highlightToggle');

  // DOM Elements - Results
  const scoreNumber = document.getElementById('scoreNumber');
  const gaugeProgress = document.getElementById('gaugeProgress');
  const verdictBadge = document.getElementById('verdictBadge');
  const verdictDesc = document.getElementById('verdictDesc');
  const engineBadge = document.getElementById('engineBadge');

  const statWords = document.getElementById('statWords');
  const statBlocks = document.getElementById('statBlocks');
  const statFlagged = document.getElementById('statFlagged');

  const indicatorsSection = document.getElementById('indicatorsSection');
  const indicatorTags = document.getElementById('indicatorTags');

  const flaggedSection = document.getElementById('flaggedSection');
  const flaggedCountBadge = document.getElementById('flaggedCountBadge');
  const flaggedList = document.getElementById('flaggedList');

  // Model Descriptions and Labels
  const MODEL_METADATA = {
    jev: {
      label: 'TypeSafe JEV',
      helpText: 'TypeSafe AI JEV: Ultra-fast System One decision model evaluating calibrated probabilities in parallel.',
      hint: '(Required for JEV)'
    },
    onnx: {
      label: 'Local ONNX',
      helpText: 'Local ONNX: In-browser XGBoost ML running via WebAssembly. Zero cloud calls, 100% private.',
      hint: '(Not needed for ONNX)'
    },
    heuristic: {
      label: 'Heuristic',
      helpText: 'Linguistic Heuristics: Fast rule-based engine detecting clichés, cadence monotony, and lexical diversity.',
      hint: '(Not needed for Heuristics)'
    },
    auto: {
      label: 'Auto',
      helpText: 'Auto: Automatically uses TypeSafe JEV if API key is present, otherwise falls back to ONNX and Heuristics.',
      hint: '(Optional - enables JEV)'
    }
  };

  let selectedModel = 'jev';
  let currentTabId = null;
  let previousView = idleView;

  // Gauge constants
  const CIRCUMFERENCE = 2 * Math.PI * 50;
  gaugeProgress.style.strokeDasharray = `${CIRCUMFERENCE}`;
  gaugeProgress.style.strokeDashoffset = `${CIRCUMFERENCE}`;

  // View state helper
  function showView(view) {
    if (view !== settingsView) {
      previousView = view;
    }
    idleView.classList.add('hidden');
    scanningView.classList.add('hidden');
    resultView.classList.add('hidden');
    errorView.classList.add('hidden');
    settingsView.classList.add('hidden');
    view.classList.remove('hidden');
  }

  // Updates active model state across both settings toggle and idle quick selector
  async function setModel(model, persist = true) {
    if (!MODEL_METADATA[model]) model = 'auto';
    selectedModel = model;

    // Update settings buttons
    modelToggleBtns.forEach(btn => {
      const match = btn.getAttribute('data-model') === model;
      btn.classList.toggle('active', match);
      btn.setAttribute('aria-checked', match ? 'true' : 'false');
    });

    // Update idle view segmented buttons
    segmentedBtns.forEach(btn => {
      const match = btn.getAttribute('data-model') === model;
      btn.classList.toggle('active', match);
    });

    const meta = MODEL_METADATA[model];
    if (activeModelTag) activeModelTag.textContent = meta.label;
    if (modelHelpText) modelHelpText.textContent = meta.helpText;
    if (apiKeyRequiredHint) apiKeyRequiredHint.textContent = meta.hint;

    if (persist) {
      try {
        if (_browser.storage && _browser.storage.local) {
          await _browser.storage.local.set({ SELECTED_MODEL: model });
        }
        if (typeof window !== 'undefined' && window.ENV) {
          window.ENV.SELECTED_MODEL = model;
        }
      } catch (_) {}
    }

    await refreshEngineStatus();
  }

  // Load and refresh engine status in settings
  async function refreshEngineStatus() {
    let activeKey = '';

    // Check storage for key and selected model
    try {
      if (_browser.storage && _browser.storage.local) {
        const stored = await _browser.storage.local.get(['TYPESAFE_API_KEY', 'SELECTED_MODEL']);
        if (stored) {
          if (stored.TYPESAFE_API_KEY) activeKey = stored.TYPESAFE_API_KEY.trim();
          if (stored.SELECTED_MODEL && MODEL_METADATA[stored.SELECTED_MODEL]) {
            selectedModel = stored.SELECTED_MODEL;
          }
        }
      }
    } catch (_) {
      // Storage unavailable
    }

    // Fall back to window.ENV
    if (!activeKey && typeof window !== 'undefined' && window.ENV && window.ENV.TYPESAFE_API_KEY) {
      activeKey = window.ENV.TYPESAFE_API_KEY.trim();
    }
    if (typeof window !== 'undefined' && window.ENV && window.ENV.SELECTED_MODEL && MODEL_METADATA[window.ENV.SELECTED_MODEL]) {
      selectedModel = window.ENV.SELECTED_MODEL;
    }

    if (apiKeyInput) {
      apiKeyInput.value = activeKey;
    }

    // Reflect status according to selected model
    if (selectedModel === 'jev') {
      if (activeKey) {
        engineStatusDot.className = 'status-indicator-dot';
        currentEngineName.textContent = 'TypeSafe AI JEV (System One)';
        currentEngineDetail.textContent = 'Active • Ultra-fast structured decisions & calibrated probabilities';
        if (engineBadge) engineBadge.textContent = 'TypeSafe AI JEV';
      } else {
        engineStatusDot.className = 'status-indicator-dot inactive';
        currentEngineName.textContent = 'TypeSafe AI JEV (API Key Needed)';
        currentEngineDetail.textContent = 'Please enter your TypeSafe AI API key below to activate JEV';
        if (engineBadge) engineBadge.textContent = 'TypeSafe AI JEV';
      }
    } else if (selectedModel === 'onnx') {
      engineStatusDot.className = 'status-indicator-dot';
      currentEngineName.textContent = 'Local ONNX (In-Browser ML)';
      currentEngineDetail.textContent = 'Active • XGBoost stylometric model running via WebAssembly';
      if (engineBadge) engineBadge.textContent = 'Local ONNX';
    } else if (selectedModel === 'heuristic') {
      engineStatusDot.className = 'status-indicator-dot';
      currentEngineName.textContent = 'Linguistic Heuristics (Local)';
      currentEngineDetail.textContent = 'Active • 18+ calibrated clichés, cadence, and lexical metrics';
      if (engineBadge) engineBadge.textContent = 'Heuristics';
    } else {
      // Auto mode
      if (activeKey) {
        engineStatusDot.className = 'status-indicator-dot';
        currentEngineName.textContent = 'Auto (TypeSafe JEV Active)';
        currentEngineDetail.textContent = 'JEV active with local ONNX and heuristic fallback';
        if (engineBadge) engineBadge.textContent = 'TypeSafe AI JEV';
      } else {
        engineStatusDot.className = 'status-indicator-dot';
        currentEngineName.textContent = 'Auto (Local Engines Active)';
        currentEngineDetail.textContent = 'Running local ONNX & heuristic engines (Set API key for JEV)';
        if (engineBadge) engineBadge.textContent = 'Local Engine';
      }
    }
  }

  // Initialize stored model and engine status
  try {
    if (_browser.storage && _browser.storage.local) {
      const stored = await _browser.storage.local.get(['SELECTED_MODEL']);
      if (stored && stored.SELECTED_MODEL && MODEL_METADATA[stored.SELECTED_MODEL]) {
        selectedModel = stored.SELECTED_MODEL;
      }
    }
  } catch (_) {}

  await setModel(selectedModel, false);
  await refreshEngineStatus();

  // Attach toggle listeners for Settings model buttons
  modelToggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const model = btn.getAttribute('data-model');
      if (model) setModel(model, true);
    });
  });

  // Attach toggle listeners for Idle view segmented buttons
  segmentedBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const model = btn.getAttribute('data-model');
      if (model) setModel(model, true);
    });
  });

  // Get active tab and verify support
  try {
    const tabs = await _browser.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      showError('No active tab', 'Please select an open browser tab.');
      return;
    }

    const tab = tabs[0];
    currentTabId = tab.id;

    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
      showError('Restricted Page', 'Is It AI Slop? cannot run on browser system pages. Please try on a regular web article.');
      return;
    }

    try {
      const urlObj = new URL(tab.url);
      domainBadge.textContent = urlObj.hostname.replace(/^www\./, '');
      domainBadge.title = tab.url;
    } catch {
      domainBadge.textContent = 'Active Page';
    }

    // Check if page has already been scanned
    await checkPageStatus();
  } catch (err) {
    showError('Initialization Error', err.message);
  }

  // Ensures content scripts and env are injected before messaging
  async function ensureScriptsInjected() {
    try {
      await _browser.scripting.executeScript({
        target: { tabId: currentTabId },
        files: [
          'env.js',
          'scripts/extractor.js',
          'scripts/analyzer.js',
          'scripts/content.js'
        ]
      });
    } catch (e) {
      // If already injected or failed due to permission, let runtime.sendMessage attempt anyway
    }
  }

  // Checks status of content script in active tab
  async function checkPageStatus() {
    try {
      const response = await _browser.tabs.sendMessage(currentTabId, { action: 'GET_STATUS' });
      if (response && response.scanned && response.analysis) {
        if (highlightToggle) {
          highlightToggle.checked = !!response.highlightsActive;
        }
        renderResults(response.analysis);
        showView(resultView);
      } else {
        showView(idleView);
      }
    } catch (e) {
      // Content script not yet injected
      showView(idleView);
    }
  }

  // Triggers element extraction and text analysis
  async function runScan() {
    showView(scanningView);

    try {
      await ensureScriptsInjected();

      const response = await _browser.tabs.sendMessage(currentTabId, {
        action: 'SCAN_PAGE',
        options: { selectedModel }
      });

      if (!response || !response.success) {
        throw new Error(response ? response.error : 'Failed to communicate with page.');
      }

      renderResults(response.data);
      showView(resultView);
    } catch (err) {
      showError('Scan Failed', err.message || 'Unable to analyze content on this page.');
    }
  }

  // Renders analysis results on the UI
  function renderResults(data) {
    const score = data.overallScore || 0;
    const classification = data.classification || 'clean';

    // Animate Gauge & Score Number
    animateScoreNumber(score);
    const offset = CIRCUMFERENCE - (score / 100) * CIRCUMFERENCE;
    gaugeProgress.style.strokeDashoffset = offset;

    // Colors & Verdict
    let colorVar = '#059669'; // Clean emerald
    let verdictText = 'Likely Human';
    let descText = 'Content exhibits natural cadence, varied vocabulary, and low AI indicators.';

    verdictBadge.className = `verdict-badge ${classification}`;

    if (classification === 'slop') {
      colorVar = '#dc2626'; // Red
      verdictText = 'High AI Slop';
      descText = 'Dense presence of repetitive clichés, formulaic transitions, and robotic rhythm.';
    } else if (classification === 'suspicious') {
      colorVar = '#d97706'; // Amber
      verdictText = 'Moderate Suspicion';
      descText = 'Multiple AI patterns or boilerplate phrases detected in several paragraphs.';
    }

    verdictBadge.textContent = verdictText;
    verdictDesc.textContent = descText;
    gaugeProgress.style.stroke = colorVar;

    if (engineBadge && data.modelEngine) {
      engineBadge.textContent = data.modelEngine;
    }

    // Stats
    statWords.textContent = (data.totalWords || 0).toLocaleString();
    statBlocks.textContent = data.totalBlocks || 0;
    statFlagged.textContent = data.flaggedBlockCount || 0;

    // Top Indicators
    if (data.topIndicators && data.topIndicators.length > 0) {
      indicatorsSection.classList.remove('hidden');
      indicatorTags.innerHTML = '';
      data.topIndicators.forEach(ind => {
        const tag = document.createElement('span');
        tag.className = 'tag-pill';
        tag.textContent = `${ind.name} (${ind.count})`;
        indicatorTags.appendChild(tag);
      });
    } else {
      indicatorsSection.classList.add('hidden');
    }

    // Flagged Block Snippets
    const flagged = (data.blocks || []).filter(b => b.score >= 35);
    if (flagged.length > 0) {
      flaggedSection.classList.remove('hidden');
      flaggedCountBadge.textContent = flagged.length;
      flaggedList.innerHTML = '';

      flagged.forEach(b => {
        const item = document.createElement('div');
        item.className = 'block-item';
        item.title = 'Click to jump to this paragraph on the page';

        const header = document.createElement('div');
        header.className = 'block-item-header';

        const tag = document.createElement('span');
        tag.className = 'block-tag';
        const chunkSuffix = (b.totalChunks && b.totalChunks > 1) ? ` [part ${b.chunkIndex + 1}/${b.totalChunks}]` : '';
        tag.textContent = `<${b.tagName}> (${b.wordCount} words)${chunkSuffix}`;

        const scorePill = document.createElement('span');
        scorePill.className = `block-score ${b.classification}`;
        scorePill.textContent = `${b.score}% Slop`;

        header.appendChild(tag);
        header.appendChild(scorePill);

        const snippet = document.createElement('p');
        snippet.className = 'block-snippet';
        snippet.textContent = b.text;

        const signals = document.createElement('p');
        signals.className = 'block-signals';
        signals.textContent = b.signals && b.signals.length > 0 ? `Signals: ${b.signals.join(' • ')}` : '';

        item.appendChild(header);
        item.appendChild(snippet);
        if (b.signals && b.signals.length > 0) item.appendChild(signals);

        // Click to scroll
        item.addEventListener('click', () => {
          _browser.tabs.sendMessage(currentTabId, {
            action: 'SCROLL_TO_BLOCK',
            blockId: b.elementId || b.id
          });
        });

        flaggedList.appendChild(item);
      });
    } else {
      flaggedSection.classList.add('hidden');
    }
  }

  // Number counter animation
  function animateScoreNumber(target) {
    let current = 0;
    const duration = 600;
    const stepTime = 20;
    const steps = duration / stepTime;
    const increment = target / steps;

    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        scoreNumber.textContent = target;
        clearInterval(timer);
      } else {
        scoreNumber.textContent = Math.round(current);
      }
    }, stepTime);
  }

  // Shows error message view
  function showError(title, message) {
    errorTitle.textContent = title;
    errorMessage.textContent = message;
    showView(errorView);
  }

  // Event Listeners - Settings Navigation
  settingsBtn.addEventListener('click', () => {
    showView(settingsView);
  });

  closeSettingsBtn.addEventListener('click', () => {
    showView(previousView || idleView);
  });

  toggleKeyVisibility.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      toggleKeyVisibility.textContent = 'Hide';
    } else {
      apiKeyInput.type = 'password';
      toggleKeyVisibility.textContent = 'Show';
    }
  });

  saveSettingsBtn.addEventListener('click', async () => {
    const newKey = apiKeyInput.value.trim();

    try {
      if (_browser.storage && _browser.storage.local) {
        await _browser.storage.local.set({
          TYPESAFE_API_KEY: newKey,
          SELECTED_MODEL: selectedModel
        });
      }
      if (typeof window !== 'undefined' && window.ENV) {
        window.ENV.TYPESAFE_API_KEY = newKey;
        window.ENV.SELECTED_MODEL = selectedModel;
      }

      await refreshEngineStatus();
      saveSettingsBtn.textContent = 'Saved!';
      setTimeout(() => {
        saveSettingsBtn.textContent = 'Save Settings';
        showView(previousView || idleView);
      }, 700);
    } catch (err) {
      alert('Could not save settings: ' + err.message);
    }
  });

  // Event Listeners - Main
  startScanBtn.addEventListener('click', runScan);
  rescanBtn.addEventListener('click', runScan);

  highlightToggle.addEventListener('change', (e) => {
    if (!currentTabId) return;
    _browser.tabs.sendMessage(currentTabId, {
      action: 'TOGGLE_HIGHLIGHTS',
      enable: e.target.checked
    });
  });
});
