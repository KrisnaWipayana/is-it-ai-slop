/**
 * Is It AI Slop? - Web Element Extractor
 * Extracts authentic readable prose blocks from a webpage.
 * Strictly filters out addresses, phone numbers, navigation crumbs, boilerplate,
 * ads, copyright notices, and widget fragments.
 */

(function () {
  'use strict';

  // Blacklisted HTML tags that never contain article prose
  const IGNORED_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'CANVAS', 'AUDIO', 'VIDEO',
    'IFRAME', 'FORM', 'INPUT', 'TEXTAREA', 'BUTTON', 'SELECT', 'OPTION',
    'HEADER', 'NAV', 'FOOTER', 'ASIDE', 'TIME', 'ADDRESS', 'FIGURE', 'FIGCAPTION'
  ]);

  // Boilerplate keywords found in element class names or IDs
  const BOILERPLATE_CLASS_REGEX = /cookie|banner|nav|footer|header|sidebar|advert|promo|sponsor|modal|dialog|popup|social|share|comment|newsletter|contact|phone|tel|address|vcard|author|byline|copyright|meta|breadcrumb|timestamp|menu/i;

  // Patterns for non-prose metadata (telephone numbers, street addresses, postal lines)
  const PHONE_REGEX = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/;
  const ADDRESS_KEYWORDS_REGEX = /\b(?:suite|ste|apt|building|bldg|floor|fl|street|st\.|avenue|ave\.|road|rd\.|blvd|lane|drive|dr\.|p\.?o\.?\s*box|zip|postal|phone|tel|fax)\b/i;

  class SlopExtractor {
    constructor(options = {}) {
      // Require at least 16 words for a prose paragraph
      this.minWords = options.minWords || 16;
      this.maxWords = options.maxWords || 1000;
      this.ignoreBoilerplate = options.ignoreBoilerplate ?? true;
    }

    /**
     * Extracts readable prose blocks from the document
     * @returns {Array<Object>} List of valid prose block objects
     */
    extract() {
      const blocks = [];
      let blockIndex = 0;

      // Locate main article content container
      const primaryContainer = document.querySelector('article') ||
                               document.querySelector('main') ||
                               document.querySelector('[role="main"]') ||
                               document.body;

      if (!primaryContainer) return [];

      // Target real prose tags: paragraphs, blockquotes, and substantial section texts
      const candidates = primaryContainer.querySelectorAll('p, blockquote, article section, main section');

      for (const el of candidates) {
        if (!this.isValidElement(el)) continue;

        // Skip parent elements if child paragraphs are handled
        if (this.hasSignificantBlockChildren(el)) continue;

        const text = this.cleanText(el.innerText || el.textContent || '');
        const wordCount = this.countWords(text);

        // Word count boundary check
        if (wordCount < this.minWords || wordCount > this.maxWords) {
          continue;
        }

        // Strict Prose Validation (reject addresses, phone numbers, copyright lines)
        if (!this.isProseContent(text, wordCount)) {
          continue;
        }

        // Avoid duplicate extracts
        if (el.hasAttribute('data-slop-id')) continue;

        const blockId = `slop-block-${blockIndex++}`;
        el.setAttribute('data-slop-id', blockId);

        blocks.push({
          id: blockId,
          tagName: el.tagName.toLowerCase(),
          text: text,
          wordCount: wordCount,
          charCount: text.length,
          selector: this.getElementSelector(el),
          isQuote: el.tagName === 'BLOCKQUOTE',
          element: el
        });
      }

      return blocks;
    }

    /**
     * Validates that the text is genuine prose, not contact info, addresses, or metadata
     */
    isProseContent(text, wordCount) {
      // 1. Digit density check (Phone numbers, addresses, pricing tables have high digits)
      const digits = (text.match(/\d/g) || []).length;
      const letters = (text.match(/[\p{L}]/gu) || []).length;
      if (letters === 0) return false;
      if (digits / letters > 0.18) return false; // Over 18% numbers = non-prose

      // 2. Telephone number detection
      if (PHONE_REGEX.test(text) && wordCount < 35) return false;

      // 3. Physical street address / postal detection in short blocks
      if (ADDRESS_KEYWORDS_REGEX.test(text) && digits >= 3 && wordCount < 30) return false;

      // 4. Navigation or breadcrumb crumbs (e.g. Home > Blog > Tech)
      const pipeCount = (text.match(/\|/g) || []).length;
      const arrowCount = (text.match(/[>»]/g) || []).length;
      if (pipeCount >= 2 || arrowCount >= 2) return false;

      // 5. Copyright notices
      if (/copyright|all rights reserved|©/i.test(text) && wordCount < 30) return false;

      return true;
    }

    /**
     * Checks if element is valid for text extraction
     */
    isValidElement(el) {
      if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;

      // Tag blacklist
      if (IGNORED_TAGS.has(el.tagName)) return false;

      // Skip hidden or invisible elements
      if (el.getAttribute('aria-hidden') === 'true') return false;
      if (el.offsetParent === null && el.tagName !== 'BODY') {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
          return false;
        }
      }

      // Check boilerplate classes/IDs
      if (this.ignoreBoilerplate) {
        const classStr = typeof el.className === 'string' ? el.className : (el.getAttribute('class') || '');
        const identifier = `${classStr} ${el.id || ''}`;
        if (BOILERPLATE_CLASS_REGEX.test(identifier) && !['MAIN', 'ARTICLE'].includes(el.tagName)) {
          return false;
        }
      }

      return true;
    }

    /**
     * Checks if element contains child block elements
     */
    hasSignificantBlockChildren(el) {
      if (['P', 'BLOCKQUOTE'].includes(el.tagName)) {
        return false;
      }
      return !!el.querySelector('p, blockquote, ul, ol');
    }

    /**
     * Cleans whitespace and line breaks
     */
    cleanText(raw) {
      return raw
        .replace(/\r\n|\r/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n+/g, '\n')
        .trim();
    }

    /**
     * Word count calculation
     */
    countWords(str) {
      const tokens = str.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu);
      return tokens ? tokens.length : 0;
    }

    /**
     * Generates a minimal CSS selector for the element
     */
    getElementSelector(el) {
      if (el.id) return `#${el.id}`;
      const path = [];
      let current = el;
      while (current && current !== document.body && current.parentNode) {
        let tag = current.tagName.toLowerCase();
        if (current.className && typeof current.className === 'string') {
          const firstClass = current.className.trim().split(/\s+/)[0];
          if (firstClass && !BOILERPLATE_CLASS_REGEX.test(firstClass)) {
            tag += `.${firstClass}`;
          }
        }
        path.unshift(tag);
        if (path.length >= 3) break;
        current = current.parentElement;
      }
      return path.join(' > ');
    }
  }

  // Export to window
  window.SlopExtractor = SlopExtractor;
})();
