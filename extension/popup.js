/**
 * Is It AI Slop? - Popup Controller
 * Coordinates scanning requests, renders minimalist dashboard visualizer,
 * manages TypeSafe AI JEV settings, and controls page highlighting interactions.
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

  // DOM Elements - Settings
  const apiKeyInput = document.getElementById('apiKeyInput');
  const toggleKeyVisibility = document.getElementById('toggleKeyVisibility');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const engineStatusDot = document.getElementById('engineStatusDot');
  const currentEngineName = document.getElementById('currentEngineName');
  const currentEngineDetail = document.getElementById('currentEngineDetail');

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

  // Gauge constants
  const CIRCUMFERENCE = 2 * Math.PI * 50;
  gaugeProgress.style.strokeDasharray = `${CIRCUMFERENCE}`;
  gaugeProgress.style.strokeDashoffset = `${CIRCUMFERENCE}`;

  let currentTabId = null;
  let previousView = idleView;

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

  // Load and refresh engine status in settings
  async function refreshEngineStatus() {
    let activeKey = '';

    // Check storage first
    try {
      if (_browser.storage && _browser.storage.local) {
        const stored = await _browser.storage.local.get(['TYPESAFE_API_KEY']);
        if (stored && stored.TYPESAFE_API_KEY) {
          activeKey = stored.TYPESAFE_API_KEY.trim();
        }
      }
    } catch (_) {
      // Storage unavailable
    }

    // Fall back to window.ENV
    if (!activeKey && typeof window !== 'undefined' && window.ENV && window.ENV.TYPESAFE_API_KEY) {
      activeKey = window.ENV.TYPESAFE_API_KEY.trim();
    }

    if (apiKeyInput) {
      apiKeyInput.value = activeKey;
    }

    if (activeKey) {
      engineStatusDot.classList.remove('inactive');
      currentEngineName.textContent = 'TypeSafe AI JEV (System One)';
      currentEngineDetail.textContent = 'Active • Ultra-fast structured decisions & calibrated probabilities';
      if (engineBadge) engineBadge.textContent = 'TypeSafe AI JEV';
    } else {
      engineStatusDot.classList.add('inactive');
      currentEngineName.textContent = 'Local Engine (ONNX / Heuristic)';
      currentEngineDetail.textContent = 'Provide a TypeSafe AI API key to enable cloud System One evaluation';
      if (engineBadge) engineBadge.textContent = 'Local Engine';
    }
  }

  await refreshEngineStatus();

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

      const response = await _browser.tabs.sendMessage(currentTabId, { action: 'SCAN_PAGE' });

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
    let colorVar = '#10b981';
    let verdictText = 'Likely Human';
    let descText = 'Content exhibits natural cadence, varied vocabulary, and low AI indicators.';

    verdictBadge.className = `verdict-badge ${classification}`;

    if (classification === 'slop') {
      colorVar = '#ef4444';
      verdictText = 'High AI Slop';
      descText = 'Dense presence of repetitive clichés, formulaic transitions, and robotic rhythm.';
    } else if (classification === 'suspicious') {
      colorVar = '#f59e0b';
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

  // Event Listeners - Settings
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
        await _browser.storage.local.set({ TYPESAFE_API_KEY: newKey });
      }
      if (typeof window !== 'undefined' && window.ENV) {
        window.ENV.TYPESAFE_API_KEY = newKey;
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
