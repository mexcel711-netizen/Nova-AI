import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeHairMeshOffset,
  computeHairRegionMask,
  computeTargetHairWind,
  stepHairWind,
} from './hairPhysics';

test('returns zero wind when quiet or idle below noise floor', () => {
  assert.equal(computeTargetHairWind({ state: 'idle', micLevel: 0, lipOpenness: 0 }), 0);
  assert.equal(computeTargetHairWind({ state: 'idle', micLevel: 0.05, lipOpenness: 0.02 }), 0);
  assert.equal(computeTargetHairWind({ state: 'listening', micLevel: 0.04, lipOpenness: 0 }), 0);
});

test('ramps target wind when user speaks into mic or assistant speaks', () => {
  const userTalking = computeTargetHairWind({ state: 'listening', micLevel: 0.6, lipOpenness: 0 });
  assert.ok(userTalking > 0.5 && userTalking <= 1, `Expected strong user wind, got ${userTalking}`);

  const ambientSpeech = computeTargetHairWind({ state: 'idle', micLevel: 0.45, lipOpenness: 0 });
  assert.ok(ambientSpeech > 0.35, `Expected ambient mic voice wind, got ${ambientSpeech}`);

  const assistantSpeaking = computeTargetHairWind({
    state: 'speaking',
    micLevel: 0,
    lipOpenness: 0.7,
  });
  assert.ok(assistantSpeaking > 0.7, `Expected speaking wind, got ${assistantSpeaking}`);
});

test('stepHairWind attacks quickly and settles to exact zero when silent', () => {
  let wind = 0;
  for (let i = 0; i < 15; i++) {
    wind = stepHairWind(wind, 0.85);
  }
  assert.ok(wind > 0.75, `Expected wind to ramp quickly, got ${wind}`);

  for (let i = 0; i < 120; i++) {
    wind = stepHairWind(wind, 0);
  }
  assert.equal(wind, 0, 'Hair wind must damp cleanly back to exact 0 when silent');
});

test('hair region mask keeps inner face steady while allowing outer wavy locks to blow', () => {
  const faceMask = computeHairRegionMask(0.555, 0.305);
  const leftHairMask = computeHairRegionMask(0.28, 0.36);
  const rightHairMask = computeHairRegionMask(0.74, 0.38);

  assert.equal(faceMask, 0, 'Inner face anchor must stay undistorted');
  assert.ok(leftHairMask > 0.6, `Left wavy hair lock should have high mask, got ${leftHairMask}`);
  assert.ok(rightHairMask > 0.5, `Right hair lock should have high mask, got ${rightHairMask}`);
});

test('computeHairMeshOffset produces exact zero offsets at rest and nonzero waves during wind', () => {
  const calmLeft = computeHairMeshOffset({
    colNorm: 0.28,
    rowNorm: 0.36,
    wind: 0,
    phase: 2.5,
  });
  assert.equal(calmLeft.dx, 0);
  assert.equal(calmLeft.dy, 0);

  const windyFace = computeHairMeshOffset({
    colNorm: 0.555,
    rowNorm: 0.305,
    wind: 0.9,
    phase: 1.4,
  });
  assert.equal(windyFace.dx, 0);
  assert.equal(windyFace.dy, 0);

  const windyLeft = computeHairMeshOffset({
    colNorm: 0.28,
    rowNorm: 0.36,
    wind: 0.9,
    phase: 1.4,
  });
  assert.ok(
    Math.abs(windyLeft.dx) > 1.5 || Math.abs(windyLeft.dy) > 0.5,
    `Expected visible displacement in flowing hair when wind=0.9, got dx=${windyLeft.dx}, dy=${windyLeft.dy}`
  );
});
