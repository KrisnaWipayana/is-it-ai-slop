/**
 * Is It AI Slop? - Web Element Extractor
 * Extracts authentic readable prose blocks from a webpage.
 * Strictly filters out addresses, phone numbers, navigation crumbs, boilerplate,
 * ads, copyright notices, and widget fragments.
 *
 * Implements chunked extraction for TypeSafe AI JEV:
 * If a block contains too many words for a single call, it splits text cleanly
 * at paragraph breaks or period delimiters into multiple discrete calls.
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
      this.maxWords = options.maxWords || 2000;

      // Maximum words allowed per single call to JEV (default 150 words)
      const envWords = (typeof window !== 'undefined' && window.ENV?.JEV_MAX_WORDS_PER_CALL) ||
                       (typeof globalThis !== 'undefined' && globalThis.ENV?.JEV_MAX_WORDS_PER_CALL);
      this.maxWordsPerCall = options.maxWordsPerCall || envWords || 150;

      this.ignoreBoilerplate = options.ignoreBoilerplate ?? true;
    }

    /**
     * Splits text into smaller chunks if word count exceeds maxWordsPerCall.
     * Splitting is done based on paragraph breaks (\n) and periods (.).
     * Ensures extractor does not send overly large text in a single call to JEV.
     * @param {string} text - Cleaned prose text
     * @param {number} maxWords - Maximum words permitted per call
     * @returns {Array<string>} List of chunked text segments
     */
    splitTextIntoChunks(text, maxWords = this.maxWordsPerCall) {
      if (!text) return [];
      const totalWords = this.countWords(text);
      if (totalWords <= maxWords) {
        return [text];
      }

      // Step 1: Split by new paragraph boundaries (\r?\n+)
      const rawParagraphs = text.split(/\r?\n+/).map(p => p.trim()).filter(Boolean);
      const paragraphs = rawParagraphs.length > 0 ? rawParagraphs : [text];

      const chunks = [];
      let currentChunk = '';

      for (const para of paragraphs) {
        const paraWords = this.countWords(para);

        // If the paragraph itself fits within maxWords
        if (paraWords <= maxWords) {
          const testChunk = currentChunk ? `${currentChunk}\n\n${para}` : para;
          if (currentChunk && this.countWords(testChunk) > maxWords) {
            chunks.push(currentChunk.trim());
            currentChunk = para;
          } else {
            currentChunk = testChunk;
          }
        } else {
          // Paragraph itself exceeds maxWords: must split by period (.)
          if (currentChunk) {
            chunks.push(currentChunk.trim());
            currentChunk = '';
          }

          // Split by periods followed by whitespace or end of string
          const sentences = this.splitIntoSentences(para);
          let sentChunk = '';

          for (const sent of sentences) {
            const testSentChunk = sentChunk ? `${sentChunk} ${sent}` : sent;
            if (sentChunk && this.countWords(testSentChunk) > maxWords) {
              chunks.push(sentChunk.trim());
              sentChunk = sent;
            } else {
              sentChunk = testSentChunk;
            }
          }

          if (sentChunk && sentChunk.trim()) {
            currentChunk = sentChunk.trim();
          }
        }
      }

      if (currentChunk && currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }

      return chunks.length > 0 ? chunks : [text];
    }

    /**
     * Splits paragraph text into sentences using period delimiter.
     * Captures periods, question marks, and exclamation points followed by whitespace or line end.
     * @param {string} text
     * @returns {Array<string>}
     */
    splitIntoSentences(text) {
      if (!text) return [];
      const matches = text.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g);
      if (!matches) {
        return [text];
      }
      return matches.map(s => s.trim()).filter(Boolean);
    }

    /**
     * Extracts readable prose blocks from the document
     * @returns {Array<Object>} List of valid prose block objects (split into chunks if needed)
     */
    extract(rootDocument = (typeof document !== 'undefined' ? document : null)) {
      if (!rootDocument) return [];

      const blocks = [];
      let blockIndex = 0;

      // Locate main article content container
      const primaryContainer = rootDocument.querySelector('article') ||
                               rootDocument.querySelector('main') ||
                               rootDocument.querySelector('[role="main"]') ||
                               rootDocument.body;

      if (!primaryContainer) return [];

      // Remove existing badge elements from previous scans to avoid text contamination
      if (primaryContainer.querySelectorAll) {
        primaryContainer.querySelectorAll('.is-it-ai-slop-badge').forEach(b => {
          if (b && typeof b.remove === 'function') {
            b.remove();
          } else if (b && b.parentNode && b.parentNode.removeChild) {
            b.parentNode.removeChild(b);
          }
        });
      }

      // Target real prose tags: paragraphs, blockquotes, and substantial section texts
      const candidates = primaryContainer.querySelectorAll('p, blockquote, article section, main section');
      const visitedElements = new Set();

      for (const el of candidates) {
        if (!this.isValidElement(el)) continue;

        // Skip parent elements if child paragraphs are handled
        if (this.hasSignificantBlockChildren(el)) continue;

        // Avoid duplicate extracts within the current extraction run
        if (visitedElements.has(el)) continue;
        visitedElements.add(el);

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

        const baseBlockId = `slop-block-${blockIndex++}`;
        if (el.setAttribute) {
          el.setAttribute('data-slop-id', baseBlockId);
        }

        // Chunking check for JEV: ensure extractor does not select all text in one call if too many words
        const chunks = this.splitTextIntoChunks(text, this.maxWordsPerCall);

        if (chunks.length <= 1) {
          blocks.push({
            id: baseBlockId,
            elementId: baseBlockId,
            tagName: (el.tagName || 'p').toLowerCase(),
            text: text,
            wordCount: wordCount,
            charCount: text.length,
            selector: this.getElementSelector(el),
            isQuote: el.tagName === 'BLOCKQUOTE',
            element: el,
            chunkIndex: 0,
            totalChunks: 1
          });
        } else {
          // If too much text, create a new call / block for each chunk with period / paragraph split
          chunks.forEach((chunkText, cIdx) => {
            const chunkWords = this.countWords(chunkText);
            if (chunkWords >= Math.min(this.minWords, 10)) {
              blocks.push({
                id: `${baseBlockId}-c${cIdx}`,
                elementId: baseBlockId,
                tagName: (el.tagName || 'p').toLowerCase(),
                text: chunkText,
                wordCount: chunkWords,
                charCount: chunkText.length,
                selector: this.getElementSelector(el),
                isQuote: el.tagName === 'BLOCKQUOTE',
                element: el,
                chunkIndex: cIdx,
                totalChunks: chunks.length
              });
            }
          });
        }
      }

      return blocks;
    }

    /**
     * Validates that the text is genuine prose, not contact info, addresses, or metadata
     */
    isProseContent(text, wordCount) {
      if (!text) return false;

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
      if (!el || el.nodeType !== 1) return false; // 1 = Node.ELEMENT_NODE

      // Tag blacklist
      if (IGNORED_TAGS.has(el.tagName)) return false;

      // Skip hidden or invisible elements
      if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return false;
      if (typeof window !== 'undefined' && el.offsetParent === null && el.tagName !== 'BODY') {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
          return false;
        }
      }

      // Check boilerplate classes/IDs
      if (this.ignoreBoilerplate) {
        const classStr = typeof el.className === 'string' ? el.className : (el.getAttribute ? (el.getAttribute('class') || '') : '');
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
      if (!el || !el.querySelector) return false;
      if (['P', 'BLOCKQUOTE'].includes(el.tagName)) {
        return false;
      }
      return !!el.querySelector('p, blockquote, ul, ol');
    }

    /**
     * Cleans whitespace and line breaks
     */
    cleanText(raw) {
      return (raw || '')
        .replace(/\r\n|\r/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n+/g, '\n')
        .trim();
    }

    /**
     * Word count calculation
     */
    countWords(str) {
      if (!str) return 0;
      const tokens = str.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu);
      return tokens ? tokens.length : 0;
    }

    /**
     * Generates a minimal CSS selector for the element
     */
    getElementSelector(el) {
      if (!el) return '';
      if (el.id) return `#${el.id}`;
      const path = [];
      let current = el;
      while (current && current.tagName && current.tagName !== 'BODY' && current.parentNode) {
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

  // Export to window and module
  if (typeof window !== 'undefined') {
    window.SlopExtractor = SlopExtractor;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SlopExtractor;
  }
})();
