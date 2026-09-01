'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_ROOT = path.join(ROOT, 'dist', 'server-release');
const CHECK_ONLY = process.argv.includes('--check');

const RELEASE_FILES = [
  'DEPLOYMENT.md',
  'THIRD_PARTY_NOTICES.md',
  'index.html',
  'package.json',
  'server.js',
  'style.css',
  'deploy/day-night-territory-battle.service.example',
  'deploy/game.env.example',
  'deploy/nginx-game.conf.example',
  'js/ai.js',
  'js/audio.js',
  'js/game.js',
  'js/main.js',
  'js/network.js',
  'js/particles.js',
  'js/physics.js',
  'LICENSES/APACHE-2.0.txt',
  'LICENSES/PEERJS-BUNDLED-DEPENDENCIES.txt',
  'LICENSES/PEERJS-MIT.txt',
  'LICENSES/PONG_WARS-MIT.txt',
  'vendor/peerjs.min.js'
];

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function listFiles(root, relative = '') {
  const current = path.join(root, relative);
  if (!fs.existsSync(current)) return [];
  const output = [];
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) output.push(...listFiles(root, child));
    else if (entry.isFile()) output.push(child.split(path.sep).join('/'));
  }
  return output.sort();
}

function expectedManifest() {
  return RELEASE_FILES
    .slice()
    .sort()
    .map((relativePath) => `${sha256(path.join(ROOT, relativePath))}  ${relativePath}`)
    .join('\n') + '\n';
}

function verifyRelease() {
  const expectedFiles = [...RELEASE_FILES, 'SHA256SUMS'].sort();
  const actualFiles = listFiles(OUTPUT_ROOT);
  const mismatches = [];
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    mismatches.push('服务器发布目录的文件清单不匹配');
  }
  const manifestPath = path.join(OUTPUT_ROOT, 'SHA256SUMS');
  const actualManifest = fs.existsSync(manifestPath)
    ? fs.readFileSync(manifestPath, 'utf8')
    : '';
  if (actualManifest !== expectedManifest()) {
    mismatches.push('服务器发布目录的 SHA256SUMS 与当前源码不一致');
  }
  if (mismatches.length) {
    process.stderr.write(`${mismatches.join('\n')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`服务器发布包校验通过（${RELEASE_FILES.length} 个文件）\n`);
}

if (CHECK_ONLY) {
  verifyRelease();
} else {
  const expectedParent = path.join(ROOT, 'dist');
  if (path.dirname(OUTPUT_ROOT) !== expectedParent) {
    throw new Error('拒绝清理非预期发布目录');
  }
  fs.rmSync(OUTPUT_ROOT, { recursive: true, force: true });
  for (const relativePath of RELEASE_FILES) {
    const source = path.join(ROOT, relativePath);
    const target = path.join(OUTPUT_ROOT, relativePath);
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
      throw new Error(`缺少发布文件：${relativePath}`);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  fs.writeFileSync(path.join(OUTPUT_ROOT, 'SHA256SUMS'), expectedManifest());
  verifyRelease();
  process.stdout.write(`服务器发布包已生成：${OUTPUT_ROOT}\n`);
}

module.exports = { OUTPUT_ROOT, RELEASE_FILES };
