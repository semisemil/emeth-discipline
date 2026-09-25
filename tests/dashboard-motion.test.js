'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function setup({ reduced = false, storageUnavailable = false } = {}) {
  const saved = new Map([
    ['emeth.dashboard.theme', 'dark'],
    ['emeth.dashboard.accent', '#3459e6'],
    ['emeth.dashboard.sidebar', 'collapsed'],
  ]);
  const root = { dataset: {}, style: { setProperty() {} } };
  const context = vm.createContext({
    document: { documentElement: root },
    matchMedia: () => ({ matches: reduced }),
    localStorage: {
      getItem(key) { if (storageUnavailable) throw new Error('Storage disabled'); return saved.get(key); },
      setItem(key, value) { if (storageUnavailable) throw new Error('Storage disabled'); saved.set(key, value); },
    },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../dashboard/assets/motion.js'), 'utf8'), context);
  return { motion: context.EmethMotion, root, saved };
}

function region() {
  const classes = new Set();
  const attributes = new Map();
  return {
    classes, attributes, inert: false, animations: [],
    classList: { add: (value) => classes.add(value), remove: (value) => classes.delete(value) },
    setAttribute: (key, value) => attributes.set(key, value),
    removeAttribute: (key) => attributes.delete(key),
    animate(frames) {
      const animation = { frames, cancelled: false, cancel() { this.cancelled = true; } };
      this.animations.push(animation);
      return animation;
    },
  };
}

test('a stale project response cannot unlock or animate the current project transition', () => {
  const { motion } = setup();
  const panel = region();
  const first = motion.begin(panel);
  const second = motion.begin(panel);
  motion.finish(first);
  motion.enter(panel);
  assert.equal(panel.inert, true);
  assert.equal(panel.attributes.get('aria-busy'), 'true');
  assert.equal(panel.animations.length, 0);
  motion.finish(second);
  assert.equal(panel.inert, false);
  assert.equal(panel.attributes.has('aria-busy'), false);
  assert.equal(panel.classes.has('is-changing'), false);
  assert.equal(panel.animations.length, 1);
  assert.equal(panel.animations[0].frames[0].opacity, .8);
  motion.finish(second);
  motion.finish(null);
  assert.equal(panel.animations.length, 1);
});

test('reduced motion preserves the loading lifecycle without starting animations', () => {
  const { motion } = setup({ reduced: true });
  const panel = region();
  const transition = motion.begin(panel);
  assert.equal(panel.inert, true);
  motion.finish(transition);
  motion.enter(panel);
  assert.equal(panel.inert, false);
  assert.equal(panel.animations.length, 0);
});

test('interrupting an entrance cancels its animation and keeps other regions independent', () => {
  const { motion } = setup();
  const first = region();
  const second = region();
  motion.enter(first);
  const firstTransition = motion.begin(first);
  const secondTransition = motion.begin(second);
  assert.equal(first.animations[0].cancelled, true);
  motion.finish(firstTransition);
  assert.equal(first.inert, false);
  assert.equal(second.inert, true);
  motion.finish(secondTransition);
  assert.equal(second.inert, false);
});

test('page appearance is restored before rendering and sidebar controls tolerate unavailable storage', () => {
  const { motion, root, saved } = setup();
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(root.dataset.sidebar, 'collapsed');
  motion.sidebar(false);
  assert.equal(root.dataset.sidebar, 'expanded');
  assert.equal(saved.get('emeth.dashboard.sidebar'), 'expanded');
  const restricted = setup({ storageUnavailable: true });
  assert.doesNotThrow(() => restricted.motion.sidebar(true));
  assert.equal(restricted.root.dataset.sidebar, 'collapsed');
});
