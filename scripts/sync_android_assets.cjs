'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ASSET_ROOT = path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'www');
const CHECK_ONLY = process.argv.includes('--check');

const WEB_FILES = [
  'index.html',
  'style.css',
  'js/audio.js',
  'js/particles.js',
  'js/physics.js',
  'js/ai.js',
  'js/network.js',
  'js/game.js',
  'js/main.js',
  'vendor/peerjs.min.js'
];

const NOTICE_FILES = [
  'THIRD_PARTY_NOTICES.md',
  'LICENSES/PONG_WARS-MIT.txt',
  'LICENSES/PEERJS-MIT.txt',
  'LICENSES/PEERJS-BUNDLED-DEPENDENCIES.txt',
  'LICENSES/APACHE-2.0.txt'
];

const mappings = [
  ...WEB_FILES.map((relativePath) => [relativePath, relativePath]),
  ...NOTICE_FILES.map((relativePath) => [relativePath, `licenses/${relativePath}`])
];

const mismatches = [];
for (const [sourceRelative, targetRelative] of mappings) {
  const source = path.join(ROOT, sourceRelative);
  const target = path.join(ASSET_ROOT, targetRelative);
  if (!fs.existsSync(source)) {
    mismatches.push(`缺少源文件：${sourceRelative}`);
    continue;
  }

  const sourceBytes = fs.readFileSync(source);
  const targetBytes = fs.existsSync(target) ? fs.readFileSync(target) : null;
  if (targetBytes && sourceBytes.equals(targetBytes)) continue;
  if (CHECK_ONLY) {
    mismatches.push(`Android asset 未同步：${targetRelative}`);
    continue;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  process.stdout.write(`已同步 ${sourceRelative} -> ${targetRelative}\n`);
}

if (mismatches.length) {
  process.stderr.write(`${mismatches.join('\n')}\n`);
  process.exitCode = 1;
} else if (CHECK_ONLY) {
  process.stdout.write(`Android assets 校验通过（${mappings.length} 个文件）\n`);
}

module.exports = { ASSET_ROOT, NOTICE_FILES, WEB_FILES };
