import assert from "node:assert/strict";

export const MAP_SIZE = 120;
export const CENTER = Object.freeze({ x: 50, y: 50 });
export const HOME_CENTERS = Object.freeze([
  Object.freeze({ x: 14, y: 14, zone: "SOUTHWEST_HOME_ZONE" }),
  Object.freeze({ x: 86, y: 86, zone: "NORTHEAST_HOME_ZONE" }),
]);
export const ARM_ATTACHMENTS = Object.freeze([
  Object.freeze({ x: 20, y: 20 }),
  Object.freeze({ x: 80, y: 80 }),
]);

export const START_ANGLE = (-3 * Math.PI) / 4;
export const START_RADIUS = Math.hypot(30, 30);
export const END_RADIUS = 8.5;
export const END_THETA = 9;
export const RADIAL_FALLOFF = (START_RADIUS - END_RADIUS) / END_THETA;
export const ARM_STAMP_SIZE = 7;
export const ARM_SAMPLE_STEP = 0.07;

export const TIDE_STATES = Object.freeze([
  Object.freeze({ define: "OUTER_LOCKED", label: "Outer lock", chance: 33 }),
  Object.freeze({ define: "MIDDLE_LOCKED", label: "Middle lock", chance: 34 }),
  Object.freeze({ define: "INNER_LOCKED", label: "Inner lock", chance: 33 }),
]);

export const NODE_PAIRS = Object.freeze([
  Object.freeze({
    key: "SALVAGE",
    theta: 2.05,
    size: 11,
    terrain: "SALVAGE_GROUND",
    purpose: "gold and stone",
  }),
  Object.freeze({
    key: "PROVISION",
    theta: 4.65,
    size: 11,
    terrain: "PROVISION_GROUND",
    purpose: "berries and deer",
  }),
  Object.freeze({
    key: "SHRINE",
    theta: 7.05,
    size: 9,
    terrain: "SHRINE_GROUND",
    purpose: "gold and relic",
  }),
]);

export const GATE_PAIRS = Object.freeze([
  Object.freeze({ key: "OUTER", theta: 4.0, lockedBy: "OUTER_LOCKED" }),
  Object.freeze({ key: "MIDDLE", theta: 5.5, lockedBy: "MIDDLE_LOCKED" }),
  Object.freeze({ key: "INNER", theta: 8.2, lockedBy: "INNER_LOCKED" }),
]);

export const RESOURCE_CONTRACT = Object.freeze({
  villagers: 6,
  houses: 2,
  scouts: 1,
  transports: 1,
  herdables: 8,
  lureables: 2,
  huntables: 4,
  forage: 6,
  homeGold: 15,
  homeStone: 9,
  homeForestTiles: 135,
  homeForestClumps: 3,
  extraStragglers: 6,
  homeShoreFish: 8,
  homeDeepFish: 10,
  neutralDeepFish: 24,
  relics: 5,
});

export function rotate180({ x, y }) {
  return { x: 100 - x, y: 100 - y };
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function spiralPoint(theta, arm = 0) {
  assert.ok(theta >= 0 && theta <= END_THETA, `theta ${theta} is outside the spiral`);
  assert.ok(arm === 0 || arm === 1, `unknown spiral arm ${arm}`);
  const radius = START_RADIUS - RADIAL_FALLOFF * theta;
  const angle = START_ANGLE + theta + arm * Math.PI;
  return {
    x: CENTER.x + radius * Math.cos(angle),
    y: CENTER.y + radius * Math.sin(angle),
    radius,
    theta,
    arm,
  };
}

export function roundPoint(point) {
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

function uniqueRounded(points) {
  const seen = new Set();
  return points.filter((point) => {
    const rounded = roundPoint(point);
    const key = `${rounded.x},${rounded.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((point) => ({ ...point, ...roundPoint(point) }));
}

export function nodeLands() {
  let nextId = 201;
  const lands = [];

  for (const pair of NODE_PAIRS) {
    const first = roundPoint(spiralPoint(pair.theta, 0));
    const second = rotate180(first);
    for (const [side, point] of [["A", first], ["B", second]]) {
      lands.push({
        ...pair,
        ...point,
        side,
        id: nextId,
        idName: `${pair.key}_${side}_ID`,
        actorBase: 5000 + nextId * 10,
      });
      nextId += 1;
    }
  }

  return lands;
}

export function armSamples(arm) {
  const raw = [];

  for (let theta = 0; theta <= END_THETA + 0.0001; theta += ARM_SAMPLE_STEP) {
    const point = spiralPoint(Math.min(theta, END_THETA), arm);
    raw.push(point);
  }
  raw.push(spiralPoint(END_THETA, arm));

  return uniqueRounded(raw);
}

export function gatePair(pair) {
  const innerA = spiralPoint(pair.theta, 0);
  const outerB = spiralPoint(pair.theta - Math.PI, 1);
  assert.ok(
    Math.abs(
      Math.atan2(innerA.y - CENTER.y, innerA.x - CENTER.x)
      - Math.atan2(outerB.y - CENTER.y, outerB.x - CENTER.x),
    ) < 0.001,
    `${pair.key} gate endpoints must share a ray`,
  );

  const fractions = [0.24, 0.39, 0.54, 0.69, 0.76];
  const first = uniqueRounded(fractions.map((fraction) => ({
    x: innerA.x + (outerB.x - innerA.x) * fraction,
    y: innerA.y + (outerB.y - innerA.y) * fraction,
    fraction,
  })));
  const second = first.map((point) => ({ ...point, ...rotate180(point) }));

  return {
    ...pair,
    endpointA: roundPoint(innerA),
    endpointB: roundPoint(outerB),
    lines: [first, second],
  };
}

export function allGatePairs() {
  return GATE_PAIRS.map(gatePair);
}

export function mapToMinimap({ x, y }) {
  return { x: x + y, y: 100 + y - x };
}

export function assertLayoutInvariants() {
  const nodes = nodeLands();
  assert.equal(nodes.length, 6);

  for (let index = 0; index < nodes.length; index += 2) {
    const expected = rotate180(nodes[index]);
    assert.deepEqual(
      { x: nodes[index + 1].x, y: nodes[index + 1].y },
      expected,
      `${nodes[index].key} nodes lost rotational symmetry`,
    );
  }

  for (const arm of [0, 1]) {
    const samples = armSamples(arm);
    assert.ok(samples.length >= 100, `arm ${arm} has too few stamps`);
    assert.ok(distance(samples[0], ARM_ATTACHMENTS[arm]) <= 1.5);
    assert.ok(distance(samples[0], HOME_CENTERS[arm]) < 9);
    assert.ok(distance(samples.at(-1), CENTER) <= END_RADIUS + 1);
    for (let index = 1; index < samples.length; index += 1) {
      assert.ok(
        distance(samples[index - 1], samples[index]) <= ARM_STAMP_SIZE,
        `arm ${arm} is discontinuous at sample ${index}`,
      );
    }
  }

  const armA = armSamples(0).map(({ x, y }) => ({ x, y }));
  const armB = armSamples(1).map(({ x, y }) => ({ x, y }));
  assert.deepEqual(
    armB,
    armA.map(rotate180),
    "spiral arms lost exact 180-degree symmetry",
  );

  for (const gate of allGatePairs()) {
    assert.equal(gate.lines.length, 2);
    assert.deepEqual(
      gate.lines[1].map(({ x, y }) => ({ x, y })),
      gate.lines[0].map(rotate180),
      `${gate.key} gates lost rotational symmetry`,
    );
    assert.ok(distance(gate.endpointA, gate.endpointB) >= 9);
    assert.ok(distance(gate.endpointA, gate.endpointB) <= 15);
  }

  assert.equal(
    TIDE_STATES.reduce((total, state) => total + state.chance, 0),
    100,
    "tide-state chances must total 100 percent",
  );
}

assertLayoutInvariants();
