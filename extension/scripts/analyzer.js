/**
 * Is It AI Slop? - Text Analyzer
 * Multi-Engine Architecture:
 * 1. TypeSafe AI JEV Engine (Flagship System One decision model from TypeSafe AI)
 * 2. In-Browser ONNX Machine Learning (XGBoost / GBDT with 11 stylometric features)
 * 3. Zero-Dependency Linguistic Heuristic Engine (18+ calibrated patterns, cadence, TTR)
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

  // AI-typical sentence-starting transition adverbs
  const TRANSITION_STARTERS = /^(furthermore|moreover|additionally|consequently|importantly|notably|ultimately|in essence|in summary)[,\s]/i;

  class SlopAnalyzer {
    constructor(options = {}) {
      this.modelSession = null;
      this.useOnnx = false;
      this.useJev = false;
      this.modelLoadingPromise = null;

      // TypeSafe AI JEV configuration
      this.apiKey = options.apiKey || '';
      this.jevApiUrl = options.jevApiUrl || 'https://api.typesafe.ai/v1/systemone';
      this.jevModel = options.jevModel || 'jev-latest';
      this.maxConcurrency = options.maxConcurrency || 3;
    }

    /**
     * Resolves the TypeSafe AI API Key from chrome.storage or window.ENV
     */
    async resolveApiKey() {
      if (this.apiKey) return this.apiKey;

      // 1. Try extension storage
      try {
        const _runtime = (typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null));
        if (_runtime && _runtime.storage && _runtime.storage.local) {
          const res = await _runtime.storage.local.get(['TYPESAFE_API_KEY']);
          if (res && res.TYPESAFE_API_KEY && res.TYPESAFE_API_KEY.trim()) {
            this.apiKey = res.TYPESAFE_API_KEY.trim();
            return this.apiKey;
          }
        }
      } catch (_) {
        // Storage not accessible in this context
      }

      // 2. Try window.ENV or globalThis.ENV
      const envObj = (typeof window !== 'undefined' ? window.ENV : null) ||
                     (typeof globalThis !== 'undefined' ? globalThis.ENV : null);
      if (envObj) {
        if (envObj.TYPESAFE_API_KEY && envObj.TYPESAFE_API_KEY.trim()) {
          this.apiKey = envObj.TYPESAFE_API_KEY.trim();
        }
        if (envObj.JEV_API_URL) this.jevApiUrl = envObj.JEV_API_URL;
        if (envObj.JEV_MODEL) this.jevModel = envObj.JEV_MODEL;
      }

      return this.apiKey;
    }

    /**
     * Initializes all available engines (JEV, ONNX, Heuristics)
     */
    async ensureEnginesReady() {
      await this.resolveApiKey();
      this.useJev = Boolean(this.apiKey && this.apiKey.length > 5);

      // Also initialize local ONNX as fallback/companion
      await this.ensureModelLoaded();
    }

    /**
     * Initializes in-browser ONNX runtime session with ai-slop_model.onnx
     */
    async ensureModelLoaded() {
      if (this.modelSession) return;
      if (this.modelLoadingPromise) return this.modelLoadingPromise;

      this.modelLoadingPromise = (async () => {
        if (typeof ort === 'undefined') {
          return;
        }

        try {
          const _runtime = (typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null));
          if (_runtime && _runtime.runtime && _runtime.runtime.getURL) {
            if (ort.env && ort.env.wasm) {
              ort.env.wasm.wasmPaths = _runtime.runtime.getURL('lib/onnxruntime/');
              ort.env.wasm.numThreads = 1;
            }

            const modelUrl = _runtime.runtime.getURL('models/ai-slop_model.onnx');
            const res = await fetch(modelUrl);
            if (res.ok) {
              const buffer = await res.arrayBuffer();
              this.modelSession = await ort.InferenceSession.create(buffer, {
                executionProviders: ['wasm']
              });
              this.useOnnx = true;
              console.log('[Is It AI Slop?] ONNX XGBoost model initialized.');
            }
          }
        } catch (err) {
          console.warn('[Is It AI Slop?] ONNX initialization note, falling back to heuristics:', err);
          this.useOnnx = false;
        }
      })();

      await this.modelLoadingPromise;
    }

    /**
     * Evaluates text using TypeSafe AI JEV System One decision model.
     * Uses structured questions (noul probability + choice) for instant, calibrated results.
     */
    async predictWithJev(text) {
      if (!this.apiKey) return null;

      const payload = {
        model: this.jevModel,
        state: text,
        questions: {
          is_slop: {
            type: 'noul',
            instructions: 'Is this text AI-generated slop, repetitive boilerplate, or low-quality synthetic content?'
          },
          style_choice: {
            type: 'choice',
            instructions: 'Identify the primary writing style of this text:',
            criteria: {
              human: 'Authentic human prose with natural voice and cadence',
              formulaic: 'Formulaic corporate style or standard academic prose',
              ai_slop: 'Typical AI clichés, repetitive adverbs, or machine-generated filler'
            }
          }
        }
      };

      try {
        const _runtime = (typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null));
        let responseData = null;

        // Route through background service worker to avoid page CSP / CORS restrictions
        if (_runtime && _runtime.runtime && _runtime.runtime.sendMessage) {
          const response = await new Promise((resolve) => {
            _runtime.runtime.sendMessage({
              action: 'CALL_JEV_API',
              apiUrl: this.jevApiUrl,
              apiKey: this.apiKey,
              payload
            }, (res) => {
              if (_runtime.runtime.lastError) {
                resolve({ success: false, error: _runtime.runtime.lastError.message });
              } else {
                resolve(res || { success: false, error: 'Empty response from background' });
              }
            });
          });

          if (response && response.success) {
            responseData = response.data;
          } else {
            console.warn('[Is It AI Slop?] JEV via background worker failed:', response?.error);
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
            console.warn(`[Is It AI Slop?] Direct JEV fetch failed: HTTP ${directRes.status}`);
          }
        }

        if (!responseData || !responseData.answers) {
          return null;
        }

        // Parse JEV typed answers
        const isSlopAnswer = responseData.answers.is_slop;
        let probability = null;

        if (typeof isSlopAnswer === 'number') {
          probability = isSlopAnswer;
        } else if (isSlopAnswer && typeof isSlopAnswer.noul === 'number') {
          probability = isSlopAnswer.noul;
        } else if (isSlopAnswer && typeof isSlopAnswer.score === 'number') {
          probability = isSlopAnswer.score;
        }

        if (probability === null) return null;

        const score = Math.min(Math.max(Math.round(probability * 100), 0), 100);
        const signals = [];

        // Parse style choice if provided by JEV
        const styleChoice = responseData.answers.style_choice;
        const choiceKey = (typeof styleChoice === 'string') ? styleChoice : (styleChoice?.choice || styleChoice?.value || '');
        if (choiceKey === 'ai_slop') {
          signals.push('JEV: Machine-generated slop signature');
        } else if (choiceKey === 'formulaic') {
          signals.push('JEV: Formulaic corporate cadence');
        } else if (choiceKey === 'human') {
          signals.push('JEV: Authentic human prose');
        }

        return { score, signals, rawAnswers: responseData.answers };
      } catch (err) {
        console.warn('[Is It AI Slop?] JEV prediction error:', err.message || err);
        return null;
      }
    }

    /**
     * Extracts and scales the 11 numerical features for XGBoost
     */
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
        transitionRatio
      };
    }

    /**
     * Executes XGBoost inference on the scaled 11-feature tensor
     */
    async predictWithOnnx(featureVector) {
      if (!this.modelSession) return null;

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
        console.warn('[Is It AI Slop?] ONNX inference warning:', err);
      }
      return null;
    }

    /**
     * Calibrates ML score with linguistic ground-truth validation
     */
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

    /**
     * Pure heuristic scoring fallback
     */
    computeHeuristicScore(extracted) {
      const { wordCount, clicheHits, transitionRatio, ttr, featureVector } = extracted;
      if (wordCount < 12) return 0;

      const stdSentLen = featureVector[3];
      const avgSentLen = featureVector[2];

      let rawScore = 0;
      rawScore += Math.min(clicheHits * 22, 65);

      if (transitionRatio >= 0.3) rawScore += 18;
      if (stdSentLen < 3.5 && avgSentLen > 14) rawScore += 14;
      if (wordCount > 35 && ttr < 0.45) rawScore += 16;

      return Math.min(Math.max(Math.round(rawScore), 0), 100);
    }

    /**
     * Concurrency runner helper for pooled asynchronous execution
     */
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

    /**
     * Analyzes an array of extracted text blocks (or chunked blocks)
     */
    async analyze(blocks) {
      await this.ensureEnginesReady();

      const startTime = performance.now();
      let totalWords = 0;
      let totalWeightedScore = 0;
      const indicatorCounts = {};
      let usedJevCount = 0;

      // Analyze each block (chunk) concurrently with pooled calls
      const analyzedBlocks = await this.mapConcurrent(blocks, this.maxConcurrency, async (block) => {
        const extracted = this.extractFeatures(block.text);
        let finalScore = 0;
        let allSignals = [...extracted.signals];

        let jevSuccess = false;
        if (this.useJev) {
          const jevResult = await this.predictWithJev(block.text);
          if (jevResult !== null) {
            finalScore = jevResult.score;
            if (jevResult.signals && jevResult.signals.length > 0) {
              allSignals = [...jevResult.signals, ...allSignals];
            }
            jevSuccess = true;
            usedJevCount++;
          }
        }

        // If JEV was not active or call failed, fall back to local ONNX / Heuristic engine
        if (!jevSuccess) {
          let rawMlScore = null;
          if (this.useOnnx) {
            rawMlScore = await this.predictWithOnnx(extracted.featureVector);
          }
          finalScore = this.calibrateBlockScore(rawMlScore, extracted);
        }

        return {
          ...block,
          score: finalScore,
          classification: this.getClassification(finalScore),
          signals: allSignals,
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

      // Determine active engine label
      let engineName = 'Linguistic Engine';
      if (usedJevCount > 0 || (this.useJev && blocks.length === 0)) {
        engineName = 'TypeSafe AI (JEV System One)';
      } else if (this.useOnnx) {
        engineName = 'XGBoost (Calibrated ONNX)';
      }

      return {
        overallScore,
        classification: this.getClassification(overallScore),
        modelEngine: engineName,
        totalWords,
        totalBlocks: blocks.length,
        flaggedBlockCount: flaggedBlocks.length,
        highSlopCount: highSlopBlocks.length,
        durationMs,
        topIndicators,
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
