#!/usr/bin/env node
/**
 * Builds browser-specific extension folders from `extension/`.
 *   dist/chrome  -> manifest with background.service_worker only
 *   dist/firefox -> manifest with background.scripts only (+ gecko settings)
 * Usage: node scripts/build.js [chrome|firefox|all]
 */
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'extension');
const target = process.argv[2] || 'all';
const targets = target === 'all' ? ['chrome', 'firefox'] : [target];

const base = JSON.parse(fs.readFileSync(path.join(srcDir, 'manifest.json'), 'utf8'));
const worker = base.background.service_worker || base.background.scripts[0];

for (const t of targets) {
  if (!['chrome', 'firefox'].includes(t)) {
    console.error(`Unknown target "${t}". Use chrome, firefox or all.`);
    process.exit(1);
  }
  const outDir = path.join(rootDir, 'dist', t);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.cpSync(srcDir, outDir, { recursive: true });

  const manifest = JSON.parse(JSON.stringify(base));
  if (t === 'chrome') {
    manifest.background = { service_worker: worker };
    delete manifest.browser_specific_settings;
  } else {
    manifest.background = { scripts: [worker] };
  }
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Built ${t} -> ${outDir}`);
}
