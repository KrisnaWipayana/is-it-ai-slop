/**
 * Is It AI Slop? - Text Analyzer
 * Combines in-browser ONNX Machine Learning (XGBoost) with calibrated linguistic heuristics.
 * Evaluates 11 stylometric, vocabulary, and cliché features per text block.
 * Protects against false positives on authentic human writing and Wikipedia articles.
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
    constructor() {
      this.modelSession = null;
      this.useOnnx = false;
      this.modelLoadingPromise = null;
    }

    // Initializes the in-browser ONNX runtime session with ai-slop_model.onnx
    async ensureModelLoaded() {
      if (this.modelSession) return;
      if (this.modelLoadingPromise) return this.modelLoadingPromise;

      this.modelLoadingPromise = (async () => {
        if (typeof ort === 'undefined') {
          console.info('[Is It AI Slop?] ONNX Runtime Web not present, using heuristic mode.');
          return;
        }

        try {
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
            // Configure local wasm paths so ONNX does not request external assets
            if (ort.env && ort.env.wasm) {
              ort.env.wasm.wasmPaths = chrome.runtime.getURL('lib/onnxruntime/');
              ort.env.wasm.numThreads = 1;
            }

            const modelUrl = chrome.runtime.getURL('models/ai-slop_model.onnx');
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

    // Extracts and scales the 11 numerical features expected by the model
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

      // Signals for popup explainability
      if (sentences.length >= 3 && transitionRatio >= 0.3) {
        signals.push(`Formal transitions (${transitionCount}/${sentCount} sentences)`);
      }

      if (sentLengths.length >= 4 && avgSentLen > 14 && avgSentLen < 28 && stdSentLen < 3.5) {
        signals.push("Monotonous sentence cadence");
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

    // Executes XGBoost inference on the scaled 11-feature tensor
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

    // Calibrates ML score with linguistic ground-truth validation
    calibrateBlockScore(mlScore, extracted) {
      const { wordCount, clicheHits, transitionRatio, ttr, signals } = extracted;

      // Guard against false positives on authentic human text:
      // If a paragraph has zero clichés and zero transition abuse, it cannot be high AI slop.
      if (clicheHits === 0 && transitionRatio === 0) {
        if (ttr >= 0.65) {
          // Highly diverse human vocabulary -> cap at 15%
          return Math.min(mlScore ?? 12, 15);
        } else {
          // Moderate vocabulary -> cap at 28%
          return Math.min(mlScore ?? 20, 28);
        }
      }

      // If AI markers are present, blend ML probability with indicator strength
      const heuristicScore = this.computeHeuristicScore(extracted);

      if (mlScore !== null) {
        // Balanced blend of ML tree and linguistic signal evidence
        return Math.min(Math.max(Math.round(0.45 * mlScore + 0.55 * heuristicScore), 0), 100);
      }

      return heuristicScore;
    }

    // Pure heuristic scoring fallback
    computeHeuristicScore(extracted) {
      const { wordCount, clicheHits, transitionRatio, ttr, featureVector } = extracted;
      if (wordCount < 12) return 0;

      const stdSentLen = featureVector[3];
      const avgSentLen = featureVector[2];

      let rawScore = 0;
      // Strong weight on verified AI clichés
      rawScore += Math.min(clicheHits * 22, 65);

      if (transitionRatio >= 0.3) rawScore += 18;
      if (stdSentLen < 3.5 && avgSentLen > 14) rawScore += 14;
      if (wordCount > 35 && ttr < 0.45) rawScore += 16;

      return Math.min(Math.max(Math.round(rawScore), 0), 100);
    }

    // Analyzes an array of extracted text blocks
    async analyze(blocks) {
      await this.ensureModelLoaded();

      const startTime = performance.now();
      const analyzedBlocks = [];
      let totalWords = 0;
      let totalWeightedScore = 0;
      const indicatorCounts = {};

      for (const block of blocks) {
        const extracted = this.extractFeatures(block.text);
        let rawMlScore = null;

        if (this.useOnnx) {
          rawMlScore = await this.predictWithOnnx(extracted.featureVector);
        }

        // Calibrate score with ground-truth linguistic guards
        const finalScore = this.calibrateBlockScore(rawMlScore, extracted);

        const analyzed = {
          ...block,
          score: finalScore,
          classification: this.getClassification(finalScore),
          signals: extracted.signals,
          metrics: {
            wordCount: extracted.wordCount,
            sentCount: extracted.sentCount,
            lexicalDiversity: parseFloat(extracted.ttr.toFixed(2))
          }
        };

        analyzedBlocks.push(analyzed);

        totalWords += block.wordCount;
        totalWeightedScore += (finalScore * block.wordCount);

        for (const sig of extracted.signals) {
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

      return {
        overallScore,
        classification: this.getClassification(overallScore),
        modelEngine: this.useOnnx ? 'XGBoost (Calibrated ONNX)' : 'Linguistic Engine',
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

  // Export to window
  window.SlopAnalyzer = SlopAnalyzer;
})();
