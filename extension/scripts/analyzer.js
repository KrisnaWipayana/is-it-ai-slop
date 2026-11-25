/**
 * Is It AI Slop? - Text Analyzer
 * Multi-Engine Architecture:
 * 1. JEV (OpenRouter) Engine (cloud model called via OpenRouter)
 * 2. Zero-Dependency Linguistic Heuristic Engine (18+ calibrated patterns, cadence, TTR)
 */

(function () {
  'use strict';

  // Common high-frequency AI/LLM cliché patterns & filler phrases (base AI Slop rule)
  const SLOP_PATTERNS = [
    { regex: /\bdelv(?:e|ing|es)\s+into\b/i, weight: 20, label: "Cliché: 'delve into'" },
    { regex: /\ba\s+testament\s+to\b/i, weight: 20, label: "Cliché: 'testament to'" },
    { regex: /\b(rich|intricate|complex)\s+tapestry\b/i, weight: 25, label: "Cliché: 'tapestry'" },
    { regex: /\bin\s+today['’]?s\s+(fast-paced|rapidly\s+evolving|dynamic|modern)\s+world\b/i, weight: 25, label: "Cliché: 'in today's world'" },
    { regex: /\bnavigat(?:e|ing|ion)\s+(the\s+)?(landscape|complexities|intricacies)\b/i, weight: 20, label: "Cliché: 'navigating the landscape'" },
    { regex: /\bseamlessly\s+(integrat|blend|combin)/i, weight: 16, label: "Buzzword: 'seamlessly integrate'" },
    { regex: /\bcrucial\s+role\b/i, weight: 14, label: "Buzzword: 'crucial role'" },
    { regex: /\bvital\s+component\b/i, weight: 14, label: "Buzzword: 'vital component'" },
    { regex: /\bgame[- ]changer\b/i, weight: 16, label: "Buzzword: 'game changer'" },
    { regex: /\bunlock(?:ing)?\s+the\s+power\s+of\b/i, weight: 18, label: "Marketing cliché: 'unlocking power'" },
    { regex: /\bit['’]?s\s+important\s+to\s+(remember|note|consider)\b/i, weight: 15, label: "Hedge: 'important to note'" },
    { regex: /\bit\s+is\s+worth\s+noting\s+that\b/i, weight: 15, label: "Filler: 'worth noting that'" },
    { regex: /\ba\s+plethora\s+of\b/i, weight: 15, label: "Cliché: 'plethora of'" },
    { regex: /\bbeacon\s+of\b/i, weight: 16, label: "Cliché: 'beacon of'" },
    { regex: /\bfoster\s+(a\s+)?(sense\s+of|an\s+environment|collaboration)\b/i, weight: 15, label: "Buzzword: 'foster a sense of'" },
    { regex: /\bembark\s+on\s+(a|this)\s+journey\b/i, weight: 20, label: "Cliché: 'embark on a journey'" },
    { regex: /\bin\s+conclusion\b/i, weight: 12, label: "Boilerplate: 'in conclusion'" },
    { regex: /\bto\s+sum\s+up\b/i, weight: 10, label: "Boilerplate: 'to sum up'" }
  ];

  // Additional structural tells (LLM prose habits)
  const STRUCTURE_PATTERNS = [
    { regex: /\bnot\s+(?:just|only|merely)\b[^.!?]{3,80}?\bbut\s+(?:also\s+)?/i, weight: 14, label: "Structure: 'not just X, but Y'" },
    { regex: /\b(?:great|excellent|fantastic)\s+question\b|\bI\s+hope\s+this\s+helps\b|\bas\s+an\s+AI\b/i, weight: 25, label: "Chatbot boilerplate" },
    { regex: /\b(?:whether\s+you['’]?re|whether\s+you\s+are)\b[^.!?]{3,60}\b(?:or|,)\b/i, weight: 12, label: "Marketing: 'whether you're X or Y'" },
    { regex: /\b(?:revolutioni[sz]e|supercharge|elevate|leverage|streamline|empower)\b/i, weight: 10, label: "Buzzword verb" },
    { regex: /\b(?:ever[- ]evolving|ever[- ]changing|cutting[- ]edge|state[- ]of[- ]the[- ]art|holistic|robust|myriad)\b/i, weight: 10, label: "Buzzword adjective" }
  ];

  // Categories the JEV model may report, mapped to readable signal labels
  const JEV_CATEGORIES = {
    cliche_phrasing: 'JEV: Cliché phrasing',
    hollow_buzzwords: 'JEV: Hollow buzzwords',
    generic_filler: 'JEV: Generic filler, no concrete detail',
    formulaic_structure: 'JEV: Formulaic structure (rule of three, not-just-but)',
    uniform_cadence: 'JEV: Uniform sentence cadence',
    hedging_boilerplate: 'JEV: Hedging boilerplate',
    promotional_tone: 'JEV: Promotional tone',
    repetition: 'JEV: Repetitive ideas',
    no_specifics: 'JEV: Lacks specifics (names, numbers, examples)'
  };

  // AI-typical sentence-starting transition adverbs
  const TRANSITION_STARTERS = /^(furthermore|moreover|additionally|consequently|importantly|notably|ultimately|in essence|in summary)[,\s]/i;

  class SlopAnalyzer {
    constructor(options = {}) {
      this.useJev = false;
      this.selectedModel = options.selectedModel || 'auto'; // 'jev' | 'heuristic' | 'auto'

      // JEV (OpenRouter) configuration
      this.apiKey = options.apiKey || '';
      this.jevApiUrl = options.jevApiUrl || 'https://openrouter.ai/api/v1/chat/completions';
      this.jevModel = options.jevModel || 'jev-latest';
      this.maxConcurrency = options.maxConcurrency || 3;
      this.lastJevError = ''; // most recent JEV failure, surfaced in the popup
      this.jevCache = new Map(); // text -> JEV result (avoids repeat calls on re-scan)
    }

    /**
     * Resolves the selected model from storage or ENV
     */
    async resolveSelectedModel() {
      if (this.selectedModel && this.selectedModel !== 'auto') {
        return this.selectedModel;
      }

      try {
        const _runtime = (typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null));
        if (_runtime && _runtime.storage && _runtime.storage.local) {
          const res = await _runtime.storage.local.get(['SELECTED_MODEL']);
          if (res && res.SELECTED_MODEL && res.SELECTED_MODEL !== 'onnx') {
            this.selectedModel = res.SELECTED_MODEL;
            return this.selectedModel;
          }
        }
      } catch (_) {}

      const envObj = (typeof window !== 'undefined' ? window.ENV : null) ||
        (typeof globalThis !== 'undefined' ? globalThis.ENV : null);
      if (envObj && envObj.SELECTED_MODEL && envObj.SELECTED_MODEL !== 'onnx') {
        this.selectedModel = envObj.SELECTED_MODEL;
      }

      return this.selectedModel || 'auto';
    }

    /**
     * Resolves the OpenRouter API Key from chrome.storage or window.ENV
     */
    async resolveApiKey() {
      // Endpoint / model always come from ENV (if present), independent of where the key is stored
      const envObj = (typeof window !== 'undefined' ? window.ENV : null) ||
        (typeof globalThis !== 'undefined' ? globalThis.ENV : null);
      if (envObj) {
        if (envObj.JEV_API_URL) this.jevApiUrl = envObj.JEV_API_URL;
        if (envObj.JEV_MODEL) this.jevModel = envObj.JEV_MODEL;
      }

      if (this.apiKey) return this.apiKey;

      // 1. Try extension storage (key saved from the popup)
      try {
        const _runtime = (typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null));
        if (_runtime && _runtime.storage && _runtime.storage.local) {
          const res = await _runtime.storage.local.get(['OPENROUTER_API_KEY', 'JEV_MODEL']);
          if (res && res.JEV_MODEL && res.JEV_MODEL.trim()) this.jevModel = res.JEV_MODEL.trim();
          if (res && res.OPENROUTER_API_KEY && res.OPENROUTER_API_KEY.trim()) {
            this.apiKey = res.OPENROUTER_API_KEY.trim();
            return this.apiKey;
          }
        }
      } catch (_) {
        // Storage not accessible in this context
      }

      // 2. Fall back to the key in ENV
      if (envObj && envObj.OPENROUTER_API_KEY && envObj.OPENROUTER_API_KEY.trim()) {
        this.apiKey = envObj.OPENROUTER_API_KEY.trim();
      }

      return this.apiKey;
    }

    // Initializes engines based on selected model
    async ensureEnginesReady(options = {}) {
      if (options.selectedModel) {
        this.selectedModel = options.selectedModel;
      } else {
        await this.resolveSelectedModel();
      }

      await this.resolveApiKey();

      if (this.selectedModel === 'heuristic') {
        this.useJev = false;
        return;
      }

      if (this.selectedModel === 'jev') {
        this.useJev = Boolean(this.apiKey && this.apiKey.length > 5);
        return;
      }

      // 'auto' mode: use JEV if key present, otherwise heuristics
      this.useJev = Boolean(this.apiKey && this.apiKey.length > 5);
    }

    /**
     * Evaluates text using the JEV model via OpenRouter (chat completions).
     * The model is asked for a JSON verdict: { is_slop: 0..1, style: human|formulaic|ai_slop }.
     */
    async predictWithJev(text) {
      if (!this.apiKey) return null;

      const cacheKey = text.trim();
      if (this.jevCache.has(cacheKey)) return this.jevCache.get(cacheKey);

      const payload = {
        model: this.jevModel,
        temperature: 0,
        max_tokens: 1000, // headroom: reasoning models spend tokens thinking before the JSON
        messages: [
          {
            role: 'system',
            content: 'You detect AI-generated slop: generic, padded, formulaic or low-information synthetic text. ' +
              'Judge only the text given. Prefer concrete evidence (specific names, numbers, first-hand detail, ' +
              'irregular human voice) as a sign of human writing, and clichés, hollow buzzwords and uniform structure as signs of slop. ' +
              'Reply with ONLY a JSON object: {"is_slop": <probability 0 to 1>, "confidence": <0 to 1, how sure you are>, ' +
              '"style": "human" | "formulaic" | "ai_slop", ' +
              '"categories": [zero or more of: ' + Object.keys(JEV_CATEGORIES).join(', ') + '], ' +
              '"reason": "<one short sentence citing the strongest evidence>"}.'
          },
          { role: 'user', content: text }
        ]
      };

      try {
        const _runtime = (typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null));
        let responseData = null;
        let usage = null;

        // Route through background service worker to avoid page CSP / CORS restrictions
        if (_runtime && _runtime.runtime && _runtime.runtime.sendMessage) {
          const callBackground = () => new Promise((resolve) => {
            _runtime.runtime.sendMessage({
              action: 'CALL_JEV_API',
              apiUrl: this.jevApiUrl,
              apiKey: this.apiKey,
              payload
            }, (res) => {
              if (_runtime.runtime.lastError) {
                resolve({ success: false, transport: true, error: _runtime.runtime.lastError.message });
              } else {
                resolve(res || { success: false, transport: true, error: 'Empty response from background' });
              }
            });
          });

          let response = await callBackground();
          // Retry once on transient failures, but never on client errors (4xx other than 429): they won't change
          const retryable = r => !(r && r.success) && !/HTTP 4(?!29)\d\d|invalid|not a valid|No endpoints|unauthorized|credits/i.test(r?.error || '');
          if (retryable(response)) {
            await new Promise(r => setTimeout(r, 600));
            response = await callBackground();
          }
          if (response && response.success) {
            responseData = response.data;
          } else {
            this.lastJevError = response?.error || 'No response from background worker';
            console.warn('[Is It AI Slop?] JEV via background worker failed:', this.lastJevError);
            // The worker reached OpenRouter and got an API error: a direct fetch would fail the same way
            if (response && !response.transport) return null;
          }
        }

        // Direct fetch fallback if background message passing is unavailable
        if (!responseData && typeof fetch !== 'undefined') {
          const directRes = await fetch(this.jevApiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(payload)
          });
          if (directRes.ok) {
            responseData = await directRes.json();
          } else {
            let detail = '';
            try { const j = await directRes.json(); detail = j?.error?.message || ''; } catch (_) {}
            this.lastJevError = `HTTP ${directRes.status}${detail ? ': ' + detail : ''}`;
            console.warn(`[Is It AI Slop?] Direct JEV fetch failed: HTTP ${directRes.status}`);
          }
        }

        const choice = responseData?.choices?.[0];
        let content = choice?.message?.content;
        if (Array.isArray(content)) content = content.map(p => p?.text || '').join('');
        // Some reasoning models put everything in a reasoning field
        if (!content || !String(content).trim()) content = choice?.message?.reasoning || '';
        if (!content || !String(content).trim()) {
          const why = choice?.finish_reason ? ` (finish_reason: ${choice.finish_reason})` : '';
          this.lastJevError = (responseData?.error?.message || 'Model returned no content') + why;
          return null;
        }

        // Extract the JSON verdict (tolerate code fences / surrounding prose)
        const match = String(content).match(/\{[\s\S]*\}/);
        let answers = null;
        try { answers = match ? JSON.parse(match[0]) : null; } catch (_) {}
        if (!answers) {
          this.lastJevError = 'Model reply was not valid JSON';
          return null;
        }

        let probability = Number(answers.is_slop);
        if (!Number.isFinite(probability)) return null;
        if (probability > 1) probability /= 100; // tolerate 0-100 scale

        const score = Math.min(Math.max(Math.round(probability * 100), 0), 100);
        let confidence = Number(answers.confidence);
        if (!Number.isFinite(confidence)) confidence = 0.7;
        if (confidence > 1) confidence /= 100;
        confidence = Math.min(Math.max(confidence, 0), 1);

        const signals = [];
        const choiceKey = answers.style;
        if (choiceKey === 'ai_slop') {
          signals.push('JEV: Machine-generated slop signature');
        } else if (choiceKey === 'formulaic') {
          signals.push('JEV: Formulaic corporate cadence');
        } else if (choiceKey === 'human') {
          signals.push('JEV: Authentic human prose');
        }

        // Category signals only make sense when the verdict leans slop
        const categories = (Array.isArray(answers.categories) ? answers.categories : [])
          .filter(c => JEV_CATEGORIES[c]);
        if (score >= 35) {
          for (const c of categories) signals.push(JEV_CATEGORIES[c]);
        }
        const reason = typeof answers.reason === 'string' ? answers.reason.trim().slice(0, 240) : '';

        const result = { score, confidence, signals, categories, reason, style: choiceKey || null, rawAnswers: answers };
        if (this.jevCache.size > 500) this.jevCache.clear();
        this.jevCache.set(cacheKey, result);
        return result;
      } catch (err) {
        this.lastJevError = err.message || String(err);
        console.warn('[Is It AI Slop?] JEV prediction error:', err.message || err);
        return null;
      }
    }

    // Extracts and scales the 11 numerical features for XGBoost
    extractFeatures(text) {
      text = (text || '').trim();
      const words = text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || [];
      const wordCount = Math.max(words.length, 1);

      // Sentences
      const sentences = text
        .split(/(?<=[.!?])\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 0);
      const sentCount = Math.max(sentences.length, 1);

      const sentLengths = sentences.map(s => {
        const sw = s.match(/[\p{L}\p{N}]+/gu);
        return sw ? sw.length : 0;
      });

      const avgSentLen = sentLengths.reduce((a, b) => a + b, 0) / sentCount;
      let variance = 0;
      if (sentLengths.length > 1) {
        variance = sentLengths.reduce((a, b) => a + Math.pow(b - avgSentLen, 2), 0) / sentLengths.length;
      }
      const stdSentLen = Math.sqrt(variance);

      // Vocabulary richness (Type-Token Ratio)
      const lowerWords = words.map(w => w.toLowerCase());
      const uniqueWords = new Set(lowerWords).size;
      const ttr = uniqueWords / wordCount;

      // Transitions & Clichés
      let transitionCount = 0;
      for (const s of sentences) {
        if (TRANSITION_STARTERS.test(s)) transitionCount++;
      }
      const transitionRatio = transitionCount / sentCount;

      let clicheHits = 0;
      const signals = [];
      for (const pattern of SLOP_PATTERNS) {
        const m = text.match(new RegExp(pattern.regex, 'gi'));
        if (m) {
          clicheHits += m.length;
          signals.push(pattern.label + (m.length > 1 ? ` (×${m.length})` : ''));
        }
      }
      let structureScore = 0;
      for (const pattern of STRUCTURE_PATTERNS) {
        const m = text.match(new RegExp(pattern.regex, 'gi'));
        if (m) {
          structureScore += Math.min(pattern.weight * m.length, pattern.weight * 2);
          signals.push(pattern.label + (m.length > 1 ? ` (×${m.length})` : ''));
        }
      }

      // Em-dash overuse and "rule of three" lists are common LLM tells
      const emDashes = (text.match(/\u2014/g) || []).length;
      const emDashDensity = (emDashes / wordCount) * 100.0;
      if (emDashes >= 2 && emDashDensity >= 1.0) {
        structureScore += 10;
        signals.push(`Em-dash overuse (${emDashes})`);
      }
      const ruleOfThree = (text.match(/\b[\p{L}-]+,\s+[\p{L}-]+,?\s+and\s+[\p{L}-]+\b/giu) || []).length;
      if (ruleOfThree >= 2) {
        structureScore += 10;
        signals.push(`Rule-of-three lists (×${ruleOfThree})`);
      }

      // Repetitive sentence openers (same first word on >=40% of sentences)
      if (sentences.length >= 4) {
        const starts = {};
        for (const sn of sentences) {
          const w = (sn.match(/^[\p{L}']+/u) || [''])[0].toLowerCase();
          if (w) starts[w] = (starts[w] || 0) + 1;
        }
        const maxStart = Math.max(...Object.values(starts));
        if (maxStart / sentences.length >= 0.4) {
          structureScore += 10;
          signals.push('Repetitive sentence openers');
        }
      }

      const clicheDensity = (clicheHits / wordCount) * 100.0;

      // Signals for explainability
      if (sentences.length >= 3 && transitionRatio >= 0.3) {
        signals.push(`Formal transitions (${transitionCount}/${sentCount} sentences)`);
      }

      if (sentLengths.length >= 4 && avgSentLen > 14 && avgSentLen < 28 && stdSentLen < 3.5) {
        signals.push('Monotonous sentence cadence');
      }

      if (wordCount > 35 && ttr < 0.45) {
        signals.push(`Low vocabulary variety (${(ttr * 100).toFixed(0)}%)`);
      }

      // Word length & punctuation
      const totalWordChars = words.reduce((a, b) => a + b.length, 0);
      const avgWordLen = totalWordChars / wordCount;
      const commaCount = (text.match(/,/g) || []).length;
      const commaDensity = commaCount / wordCount;

      // Paragraph-to-Document Scaling:
      const scaledWordCount = Math.max(wordCount, 160.0);
      const scaledSentCount = Math.max(sentCount, 10.0);
      const scaledRootTtr = ttr * Math.sqrt(scaledWordCount);

      const featureVector = [
        scaledWordCount,
        scaledSentCount,
        avgSentLen,
        stdSentLen,
        ttr,
        scaledRootTtr,
        transitionRatio,
        clicheHits,
        clicheDensity,
        avgWordLen,
        commaDensity
      ];

      return {
        featureVector,
        signals,
        wordCount,
        sentCount,
        ttr,
        clicheHits,
        transitionRatio,
        structureScore
      };
    }

    // Executes XGBoost inference on the scaled 11-feature tensor
    async predictWithOnnx(featureVector) {
      const _runtime = (typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null));

      if (_runtime && _runtime.runtime && _runtime.runtime.sendMessage) {
        try {
          const response = await new Promise(resolve => {
            _runtime.runtime.sendMessage({
              action: 'RUN_ONNX_INFERENCE',
              featureVector
            }, (res) => {
              if (_runtime.runtime.lastError) {
                resolve(null);
              } else {
                resolve(res);
              }
            });
          });

          if (response && response.success && typeof response.score === 'number') {
            return response.score;
          }
        } catch (_) { }
      }

      if (this.modelSession && typeof ort !== 'undefined') {
        try {
          const inputTensor = new ort.Tensor('float32', new Float32Array(featureVector), [1, 11]);
          const feeds = { float_input: inputTensor };
          const results = await this.modelSession.run(feeds);

          if (results && results.probabilities && results.probabilities.data) {
            const probSlop = results.probabilities.data[1];
            return Math.min(Math.max(Math.round(probSlop * 100), 0), 100);
          }

          if (results && results.label && results.label.data) {
            const label = Number(results.label.data[0]);
            return label === 1 ? 80 : 15;
          }
        } catch (err) {
          console.warn('[Is It AI Slop?] Local ONNX inference warning:', err);
        }
      }
      return null;
    }

    // Calibrates ML score with linguistic ground-truth validation
    calibrateBlockScore(mlScore, extracted) {
      const { clicheHits, transitionRatio, ttr } = extracted;

      if (clicheHits === 0 && transitionRatio === 0) {
        if (ttr >= 0.65) {
          return Math.min(mlScore ?? 12, 15);
        } else {
          return Math.min(mlScore ?? 20, 28);
        }
      }

      const heuristicScore = this.computeHeuristicScore(extracted);

      if (mlScore !== null) {
        return Math.min(Math.max(Math.round(0.45 * mlScore + 0.55 * heuristicScore), 0), 100);
      }

      return heuristicScore;
    }

    // Pure heuristic scoring fallback
    computeHeuristicScore(extracted) {
      const { wordCount, clicheHits, transitionRatio, ttr, featureVector, structureScore = 0 } = extracted;
      if (wordCount < 12) return 0;

      const stdSentLen = featureVector[3];
      const avgSentLen = featureVector[2];

      let rawScore = 0;
      rawScore += Math.min(clicheHits * 22, 65);
      rawScore += Math.min(structureScore, 30);

      if (transitionRatio >= 0.3) rawScore += 18;
      if (stdSentLen < 3.5 && avgSentLen > 14) rawScore += 14;
      if (wordCount > 35 && ttr < 0.45) rawScore += 16;

      return Math.min(Math.max(Math.round(rawScore), 0), 100);
    }

    // Concurrency runner helper for pooled asynchronous execution
    async mapConcurrent(items, limit, asyncFn) {
      const results = new Array(items.length);
      let index = 0;
      const workerCount = Math.min(limit, items.length);
      const workers = new Array(workerCount).fill(0).map(async () => {
        while (index < items.length) {
          const current = index++;
          results[current] = await asyncFn(items[current], current);
        }
      });
      await Promise.all(workers);
      return results;
    }

    // Analyzes an array of extracted text blocks (or chunked blocks)
    async analyze(blocks, options = {}) {
      await this.ensureEnginesReady(options);

      const startTime = performance.now();
      let totalWords = 0;
      let totalWeightedScore = 0;
      const indicatorCounts = {};
      let usedJevCount = 0;
      this.lastJevError = '';

      // Analyze each block (chunk) concurrently with pooled calls
      const analyzedBlocks = await this.mapConcurrent(blocks, this.maxConcurrency, async (block) => {
        const extracted = this.extractFeatures(block.text);
        let finalScore = 0;
        let allSignals = [...extracted.signals];

        let jevSuccess = false;
        let jevInfo = null;
        if (this.useJev) {
          const jevResult = await this.predictWithJev(block.text);
          if (jevResult !== null) {
            // Ensemble: JEV leads, local heuristics nudge it when they see hard evidence.
            // Low-confidence JEV verdicts lean more on heuristics.
            const heuristic = this.computeHeuristicScore(extracted);
            const heuristicWeight = heuristic > 0 ? 0.35 - 0.2 * jevResult.confidence : 0;
            finalScore = Math.round((1 - heuristicWeight) * jevResult.score + heuristicWeight * Math.max(heuristic, jevResult.score * 0.5));
            jevInfo = { confidence: jevResult.confidence, reason: jevResult.reason, style: jevResult.style, categories: jevResult.categories, jevScore: jevResult.score };
            if (jevResult.signals && jevResult.signals.length > 0) {
              allSignals = [...jevResult.signals, ...allSignals];
            }
            jevSuccess = true;
            usedJevCount++;
          }
        }

        // If JEV was not active or call failed, fall back to Heuristic engine
        if (!jevSuccess) {
          finalScore = this.calibrateBlockScore(null, extracted);
        }

        return {
          ...block,
          score: finalScore,
          classification: this.getClassification(finalScore),
          signals: allSignals,
          reason: jevInfo ? jevInfo.reason : '',
          confidence: jevInfo ? jevInfo.confidence : null,
          jev: jevInfo,
          metrics: {
            wordCount: extracted.wordCount,
            sentCount: extracted.sentCount,
            lexicalDiversity: parseFloat(extracted.ttr.toFixed(2))
          }
        };
      });

      // Tally statistics
      for (const block of analyzedBlocks) {
        totalWords += block.wordCount;
        totalWeightedScore += (block.score * block.wordCount);

        for (const sig of block.signals) {
          indicatorCounts[sig] = (indicatorCounts[sig] || 0) + 1;
        }
      }

      const overallScore = totalWords > 0 ? Math.round(totalWeightedScore / totalWords) : 0;
      const flaggedBlocks = analyzedBlocks.filter(b => b.score >= 35);
      const highSlopBlocks = analyzedBlocks.filter(b => b.score >= 65);

      const topIndicators = Object.entries(indicatorCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

      const durationMs = Math.round(performance.now() - startTime);

      // Richer analytics
      const categoryCounts = {};
      let confSum = 0, confN = 0;
      for (const b of analyzedBlocks) {
        if (b.jev) {
          confSum += b.confidence; confN++;
          if (b.score >= 35) for (const c of b.jev.categories) categoryCounts[c] = (categoryCounts[c] || 0) + 1;
        }
      }
      const categoryBreakdown = Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([key, count]) => ({ key, label: JEV_CATEGORIES[key].replace('JEV: ', ''), count }));
      const distribution = {
        clean: analyzedBlocks.filter(b => b.classification === 'clean').length,
        suspicious: analyzedBlocks.filter(b => b.classification === 'suspicious').length,
        slop: highSlopBlocks.length
      };
      const wordsFlagged = flaggedBlocks.reduce((a, b) => a + b.wordCount, 0);
      const slopWordShare = totalWords > 0 ? Math.round((wordsFlagged / totalWords) * 100) : 0;
      const topBlock = analyzedBlocks.reduce((m, b) => (!m || b.score > m.score ? b : m), null);

      // Determine active engine label
      let engineName = 'Linguistic Heuristics';
      if (this.selectedModel === 'heuristic') {
        engineName = 'Linguistic Heuristics';
      } else if (this.selectedModel === 'jev') {
        if (usedJevCount > 0 || (this.useJev && blocks.length === 0)) {
          engineName = 'JEV (OpenRouter)';
        } else if (this.apiKey) {
          engineName = 'JEV (OpenRouter) (Fallback)';
        } else {
          engineName = 'JEV (Key Missing)';
        }
      } else {
        // Auto mode
        if (usedJevCount > 0 || (this.useJev && blocks.length === 0)) {
          engineName = 'JEV (OpenRouter)';
        } else {
          engineName = 'Linguistic Heuristics';
        }
      }

      return {
        overallScore,
        classification: this.getClassification(overallScore),
        modelEngine: engineName,
        selectedModel: this.selectedModel,
        totalWords,
        totalBlocks: blocks.length,
        flaggedBlockCount: flaggedBlocks.length,
        highSlopCount: highSlopBlocks.length,
        durationMs,
        topIndicators,
        categoryBreakdown,
        distribution,
        slopWordShare,
        avgConfidence: confN ? Math.round((confSum / confN) * 100) : null,
        jevCoverage: blocks.length ? Math.round((usedJevCount / blocks.length) * 100) : 0,
        jevError: usedJevCount < blocks.length && this.useJev ? this.lastJevError : '',
        topBlock: topBlock ? { id: topBlock.id, score: topBlock.score, reason: topBlock.reason || '' } : null,
        blocks: analyzedBlocks
      };
    }

    getClassification(score) {
      if (score >= 65) return 'slop';
      if (score >= 35) return 'suspicious';
      return 'clean';
    }
  }

  // Export to window and module
  if (typeof window !== 'undefined') {
    window.SlopAnalyzer = SlopAnalyzer;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SlopAnalyzer;
  }
})();
