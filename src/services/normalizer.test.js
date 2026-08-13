const test = require('node:test');
const assert = require('node:assert');
const { normalizeSlang } = require('./normalizer');

test('expands colloquial abbreviations', () => {
  assert.strictEqual(normalizeSlang('ur the best'), 'your the best');
  assert.strictEqual(normalizeSlang('u r cool'), 'you are cool');
  assert.strictEqual(normalizeSlang('idk tbh'), 'I don\'t know to be honest');
  assert.strictEqual(normalizeSlang('gonna wanna gotta'), 'going to want to got to');
});

test('expands gaming abbreviations', () => {
  assert.strictEqual(normalizeSlang('AFK GG GL WP'), 'AWAY FROM KEYBOARD GOOD GAME GOOD LUCK WELL PLAYED');
  assert.strictEqual(normalizeSlang('gg gl hf'), 'good game good luck have fun');
  assert.strictEqual(normalizeSlang('kill the dps'), 'kill the damage per second');
});

test('expands leetspeak mixed alnum tokens', () => {
  assert.strictEqual(normalizeSlang('see u b4'), 'see you before');
  assert.strictEqual(normalizeSlang('gr8 m8'), 'great mate');
  assert.strictEqual(normalizeSlang('g2g 2moro'), 'got to go tomorrow');
  assert.strictEqual(normalizeSlang('2nite'), 'tonight');
});

test('does not expand standalone digits', () => {
  assert.strictEqual(normalizeSlang('I have 2 cats'), 'I have 2 cats');
  assert.strictEqual(normalizeSlang('rank 4 is good'), 'rank 4 is good');
});

test('respects word boundaries', () => {
  assert.strictEqual(normalizeSlang('running and caring'), 'running and caring');
  assert.strictEqual(normalizeSlang('you are the user'), 'you are the user');
  assert.strictEqual(normalizeSlang('cosplay is fun'), 'cosplay is fun');
});

test('preserves case classes', () => {
  assert.strictEqual(normalizeSlang('U rock'), 'You rock');
  assert.strictEqual(normalizeSlang('BRB soon'), 'BE RIGHT BACK soon');
  assert.strictEqual(normalizeSlang('THIS IS GG'), 'THIS IS GOOD GAME');
});

test('ignores mention placeholders', () => {
  assert.strictEqual(normalizeSlang('hi ⟪M0⟫ ⟪M12⟫'), 'hi ⟪M0⟫ ⟪M12⟫');
});

test('handles empty and whitespace input', () => {
  assert.strictEqual(normalizeSlang(''), '');
  assert.strictEqual(normalizeSlang('   '), '   ');
  assert.strictEqual(normalizeSlang(null), null);
  assert.strictEqual(normalizeSlang(undefined), undefined);
});

test('single occurrence vs repeated tokens', () => {
  assert.strictEqual(normalizeSlang('ty ty ty'), 'thank you thank you thank you');
  assert.strictEqual(normalizeSlang('np np'), 'no problem no problem');
});