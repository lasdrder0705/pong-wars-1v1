'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_FILES = [
  'js/audio.js',
  'js/particles.js',
  'js/physics.js',
  'js/ai.js',
  'js/network.js',
  'js/game.js'
];

function createContext() {
  const context = {
    console,
    Math,
    Date,
    JSON,
    Promise,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);

  for (const file of SCRIPT_FILES) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    vm.runInContext(source, context, { filename: file });
  }
  return context;
}

function createGame(options = {}) {
  const context = createContext();
  const canvas = {
    width: 600,
    height: 600,
    getContext() {
      return {};
    }
  };
  const game = new context.PongWarsGame(canvas, options);
  return { context, game };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function linkManagers(host, guest) {
  host.transport = 'peer';
  guest.transport = 'peer';
  host.conn = {
    open: true,
    send(data) {
      guest.handleIncomingData(clone(data));
    }
  };
  guest.conn = {
    open: true,
    send(data) {
      host.handleIncomingData(clone(data));
    }
  };
}

module.exports = { createGame, clone, linkManagers };
