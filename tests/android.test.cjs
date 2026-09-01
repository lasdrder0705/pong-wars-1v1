'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Android WebView 使用受控应用资源域且关闭 file/content 通用访问', () => {
  const source = read(
    'android/app/src/main/java/com/pongwars/onevone/MainActivity.java'
  );
  assert.match(source, /WebViewAssetLoader/);
  assert.match(source, /setHttpAllowed\(true\)/);
  assert.match(source, /http:\/\/appassets\.androidplatform\.net\/assets\/www\/index\.html/);
  assert.match(source, /setAllowFileAccess\(false\)/);
  assert.match(source, /setAllowContentAccess\(false\)/);
  assert.match(source, /setAllowFileAccessFromFileURLs\(false\)/);
  assert.match(source, /setAllowUniversalAccessFromFileURLs\(false\)/);
  assert.match(source, /MIXED_CONTENT_NEVER_ALLOW/);
  assert.doesNotMatch(source, /file:\/\/\/android_asset/);
  assert.doesNotMatch(source, /setAllowUniversalAccessFromFileURLs\(true\)/);
});

test('Android 构建不再用调试证书签 release 且声明 WebKit 依赖', () => {
  const build = read('android/app/build.gradle');
  assert.match(build, /androidx\.webkit:webkit:1\.17\.0/);
  assert.doesNotMatch(build, /signingConfig\s+signingConfigs\.debug/);

  const manifest = read('android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(manifest, /android:label="昼夜领地对战"/);

  const rootBuild = read('android/build.gradle');
  assert.match(rootBuild, /com\.android\.application' version '8\.9\.1'/);
});
