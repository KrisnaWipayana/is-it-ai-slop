/**
 * Is It AI Slop? - Content Script
 * Coordinates DOM element extraction, analysis, visual highlighting, and
 * communication with the extension popup.
 */

(function () {
  'use strict';

  // Prevent multiple initializations in the same frame
  if (window.__SLOP_SCAN_INITIALIZED__) return;
  window.__SLOP_SCAN_INITIALIZED__ = true;

  let currentAnalysis = null;
  let highlightsActive = false;

  // Initialize extractor and analyzer instances
  const extractor = new window.SlopExtractor();
  const analyzer = new window.SlopAnalyzer();

  // Injects CSS rules for minimal non-intrusive on-page highlighting
  function ensureStylesInjected() {
    if (document.getElementById('is-it-ai-slop-styles')) return;

    const style = document.createElement('style');
    style.id = 'is-it-ai-slop-styles';
    style.textContent = `
      .is-it-ai-slop-highlight-suspicious {
        outline: 2px dashed #f59e0b !important;
        outline-offset: 4px !important;
        background-color: rgba(245, 158, 11, 0.08) !important;
        border-radius: 4px !important;
        position: relative !important;
        transition: outline 0.2s ease, background-color 0.2s ease;
      }

      .is-it-ai-slop-highlight-slop {
        outline: 2px dashed #ef4444 !important;
        outline-offset: 4px !important;
        background-color: rgba(239, 68, 68, 0.10) !important;
        border-radius: 4px !important;
        position: relative !important;
        transition: outline 0.2s ease, background-color 0.2s ease;
      }

      .is-it-ai-slop-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        position: absolute;
        top: -12px;
        right: 8px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 11px;
        font-weight: 600;
        padding: 2px 7px;
        border-radius: 10px;
        color: #ffffff;
        z-index: 10000;
        pointer-events: none;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
        letter-spacing: 0.2px;
      }

      .is-it-ai-slop-badge-suspicious {
        background: #d97706;
      }

      .is-it-ai-slop-badge-slop {
        background: #dc2626;
      }

      .is-it-ai-slop-scroll-focus {
        animation: is-it-ai-slop-pulse 1.5s ease-out 1;
      }

      @keyframes is-it-ai-slop-pulse {
        0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.5); }
        50% { transform: scale(1.01); box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
        100% { transform: scale(1); }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  // Scans current page DOM and computes scores
  async function performScan() {
    const wasHighlighted = highlightsActive;
    clearHighlights();

    const blocks = extractor.extract();
    const result = await analyzer.analyze(blocks);

    currentAnalysis = {
      ...result,
      pageTitle: document.title || 'Untitled Page',
      pageUrl: window.location.href,
      // Strip element reference for serialization across chrome.runtime message passing
      blocks: result.blocks.map(b => ({
        id: b.id,
        elementId: b.elementId || b.id,
        tagName: b.tagName,
        text: b.text,
        wordCount: b.wordCount,
        score: b.score,
        classification: b.classification,
        signals: b.signals,
        metrics: b.metrics,
        chunkIndex: b.chunkIndex,
        totalChunks: b.totalChunks
      }))
    };

    if (wasHighlighted) {
      applyHighlights();
    }

    return currentAnalysis;
  }

  // Applies visual outlines & badges to elements on page (aggregating chunks per DOM element)
  function applyHighlights() {
    ensureStylesInjected();
    if (!currentAnalysis) return;

    // Aggregate maximum score per DOM element ID
    const elementMap = new Map();
    for (const block of currentAnalysis.blocks) {
      if (block.classification === 'clean') continue;

      const elId = block.elementId || block.id;
      const existing = elementMap.get(elId);
      if (!existing || block.score > existing.score) {
        elementMap.set(elId, block);
      }
    }

    for (const [elId, topBlock] of elementMap.entries()) {
      const el = document.querySelector(`[data-slop-id="${elId}"]`);
      if (!el) continue;

      const isHighSlop = topBlock.classification === 'slop';
      const className = isHighSlop ? 'is-it-ai-slop-highlight-slop' : 'is-it-ai-slop-highlight-suspicious';
      el.classList.add(className);

      // Create floating badge if not already present
      let badge = el.querySelector(':scope > .is-it-ai-slop-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = `is-it-ai-slop-badge ${isHighSlop ? 'is-it-ai-slop-badge-slop' : 'is-it-ai-slop-badge-suspicious'}`;
        badge.textContent = `${topBlock.score}% AI`;
        el.appendChild(badge);
      } else {
        badge.className = `is-it-ai-slop-badge ${isHighSlop ? 'is-it-ai-slop-badge-slop' : 'is-it-ai-slop-badge-suspicious'}`;
        badge.textContent = `${topBlock.score}% AI`;
      }
    }
    highlightsActive = true;
  }

  // Clears highlights and badges from page
  function clearHighlights() {
    document.querySelectorAll('.is-it-ai-slop-highlight-slop, .is-it-ai-slop-highlight-suspicious').forEach(el => {
      el.classList.remove('is-it-ai-slop-highlight-slop', 'is-it-ai-slop-highlight-suspicious');
      const badge = el.querySelector(':scope > .is-it-ai-slop-badge');
      if (badge) badge.remove();
    });
    highlightsActive = false;
  }

  // Scrolls to a specific block (or chunk parent) and briefly highlights it
  function scrollToBlock(blockId) {
    const el = document.querySelector(`[data-slop-id="${blockId}"]`) ||
               document.querySelector(`[data-slop-id="${blockId.replace(/-c\d+$/, '')}"]`);
    if (!el) return;

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('is-it-ai-slop-scroll-focus');
    setTimeout(() => {
      el.classList.remove('is-it-ai-slop-scroll-focus');
    }, 1600);
  }

  // Cross-browser runtime: Firefox exposes `browser`, Chrome exposes `chrome`
  const _browser = (typeof browser !== 'undefined' ? browser : chrome);

  // Listen for messages from popup
  _browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.action) return false;

    switch (message.action) {
      case 'SCAN_PAGE':
        performScan()
          .then(data => sendResponse({ success: true, data }))
          .catch(err => sendResponse({ success: false, error: err.message || String(err) }));
      return true; // Keep channel open for async response

      case 'TOGGLE_HIGHLIGHTS':
        if (message.enable ?? !highlightsActive) {
          applyHighlights();
        } else {
          clearHighlights();
        }
        sendResponse({ success: true, highlightsActive });
        return false;

      case 'SCROLL_TO_BLOCK':
        scrollToBlock(message.blockId);
        sendResponse({ success: true });
        return false;

      case 'GET_STATUS':
        sendResponse({
          success: true,
          scanned: currentAnalysis !== null,
          highlightsActive,
          analysis: currentAnalysis,
          summary: currentAnalysis ? {
            overallScore: currentAnalysis.overallScore,
            classification: currentAnalysis.classification,
            totalWords: currentAnalysis.totalWords,
            flaggedCount: currentAnalysis.flaggedBlockCount,
            modelEngine: currentAnalysis.modelEngine
          } : null
        });
        return false;

      default:
        sendResponse({ success: false, error: 'Unknown action' });
        return false;
    }
  });

  console.log('[Is It AI Slop?] Content script ready.');
})();
