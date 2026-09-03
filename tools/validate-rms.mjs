import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ARM_STAMP_SIZE,
  CENTER,
  HOME_CENTERS,
  MAP_SIZE,
  RESOURCE_CONTRACT,
  TIDE_STATES,
  allGatePairs,
  armSamples,
  distance,
  nodeLands,
  rotate180,
} from "./layout.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rmsPath = resolve(root, "Charybdis.rms");
const source = readFileSync(rmsPath, "utf8");
const uncommented = source.replace(/\/\*[\s\S]*?\*\//g, "");
const checks = [];

function check(label, callback) {
  callback();
  checks.push(label);
}

function directive(body, name) {
  const match = body.match(new RegExp(`(?:^|\\n)\\s*${name}(?:\\s+([^\\s]+))?`, "m"));
  return match?.[1];
}

function numericDirective(body, name, fallback = 1) {
  const value = directive(body, name);
  return value === undefined ? fallback : Number(value);
}

function hasDirective(body, name) {
  return new RegExp(`(?:^|\\n)\\s*${name}(?:\\s|$)`, "m").test(body);
}

function blocks(kind) {
  const expression = kind === "land"
    ? /create_land\s*\{([\s\S]*?)\n\s*\}/g
    : new RegExp(`create_${kind}\\s+([A-Z0-9_]+)\\s*\\{([\\s\\S]*?)\\n\\s*\\}`, "g");
  return [...source.matchAll(expression)].map((match) => ({
    name: kind === "land" ? undefined : match[1],
    body: kind === "land" ? match[1] : match[2],
    text: match[0],
    index: match.index,
  }));
}

const lands = blocks("land");
const terrains = blocks("terrain");
const objects = blocks("object");

function objectQuantity(block) {
  return numericDirective(block.body, "number_of_objects")
    * numericDirective(block.body, "number_of_groups");
}

function perPlayerQuantity(name) {
  return objects
    .filter((block) => block.name === name && hasDirective(block.body, "set_place_for_every_player"))
    .reduce((total, block) => total + objectQuantity(block), 0);
}

function neutralQuantity(name) {
  return objects
    .filter((block) => block.name === name && !hasDirective(block.body, "set_place_for_every_player"))
    .reduce((total, block) => total + objectQuantity(block), 0);
}

check("balanced braces", () => {
  let depth = 0;
  for (const character of uncommented) {
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    assert.ok(depth >= 0, "a closing brace appears before its opening brace");
  }
  assert.equal(depth, 0, "unclosed brace in RMS");
});

check("balanced conditionals", () => {
  const stack = [];
  for (const [index, rawLine] of uncommented.split("\n").entries()) {
    const line = rawLine.trim();
    if (/^if\s+/.test(line)) stack.push({ line: index + 1, sawElse: false });
    if (/^elseif\s+/.test(line)) {
      assert.ok(stack.length, `orphan elseif at line ${index + 1}`);
      assert.equal(stack.at(-1).sawElse, false, `elseif after else at line ${index + 1}`);
    }
    if (line === "else") {
      assert.ok(stack.length, `orphan else at line ${index + 1}`);
      assert.equal(stack.at(-1).sawElse, false, `duplicate else at line ${index + 1}`);
      stack.at(-1).sawElse = true;
    }
    if (line === "endif") {
      assert.ok(stack.length, `orphan endif at line ${index + 1}`);
      stack.pop();
    }
  }
  assert.deepEqual(stack, [], "unclosed conditional in RMS");
});

check("canonical section order", () => {
  const sections = [
    "<PLAYER_SETUP>",
    "<LAND_GENERATION>",
    "<ELEVATION_GENERATION>",
    "<TERRAIN_GENERATION>",
    "<CONNECTION_GENERATION>",
    "<OBJECTS_GENERATION>",
  ];
  let previous = -1;
  for (const section of sections) {
    assert.equal(source.split(section).length - 1, 1, `${section} must occur exactly once`);
    const current = source.indexOf(section);
    assert.ok(current > previous, `${section} is out of order`);
    previous = current;
  }
});

check("unique constant names", () => {
  const names = [...source.matchAll(/^#const\s+([A-Z0-9_]+)\s+\d+\s*$/gm)].map((match) => match[1]);
  assert.equal(new Set(names).size, names.length, "a #const name is redefined");
});

check("safe DE feature surface", () => {
  const aliases = new Map([
    ["SEA_WATER", 1],
    ["OPEN_GATE", 4],
    ["HOME_FOREST", 10],
    ["PROVISION_GROUND", 11],
    ["HOME_GROUND", 12],
    ["TIDE_LOCK", 55],
    ["ARM_GROUND", 24],
    ["ARM_DETAIL", 25],
    ["HOME_SELECTOR", 38],
    ["HOME_FINISHED", 39],
    ["SHRINE_GROUND", 45],
    ["EYE_GROUND", 45],
    ["SALVAGE_GROUND", 70],
    ["START_HERDABLE", 594],
    ["START_LUREABLE", 48],
    ["START_HUNTABLE", 65],
    ["START_TREE", 349],
    ["HARBOR_FISH", 457],
    ["START_TRANSPORT", 545],
    ["CENTER_BONFIRE", 304],
  ]);

  assert.match(source, /\bdirect_placement\b/);
  assert.match(source, /\bbehavior_version\s+2\b/);
  assert.match(source, new RegExp(`\\boverride_map_size\\s+${MAP_SIZE}\\b`));
  assert.match(source, /\bai_info_map_type\s+RIVERS\s+0\s+0\s+0\b/);
  for (const [name, value] of aliases) {
    assert.match(
      source,
      new RegExp(`^#const\\s+${name}\\s+${value}\\s*$`, "m"),
      `${name} must retain its verified Definitive Edition ID`,
    );
  }
  for (const forbidden of [
    /#include\b/,
    /\beffect_amount\b/,
    /\bcreate_elevation\b/,
    /\bbase_elevation\b/,
    /\bguard_state\b/,
    /\bterrain_state\b/,
    /<CLIFF_GENERATION>/,
  ]) {
    assert.doesNotMatch(uncommented, forbidden);
  }
});

check("random branches total 100 percent", () => {
  const randoms = [...source.matchAll(/start_random([\s\S]*?)end_random/g)];
  assert.equal(randoms.length, 2, "expected tide and side randomizers");
  for (const random of randoms) {
    const chances = [...random[1].matchAll(/percent_chance\s+(\d+)/g)].map((match) => Number(match[1]));
    assert.equal(chances.reduce((sum, chance) => sum + chance, 0), 100);
  }
  for (const state of TIDE_STATES) {
    assert.match(randoms[0][1], new RegExp(`percent_chance\\s+${state.chance}\\s+#define\\s+${state.define}`));
  }
});

check("spiral stamps match generated geometry", () => {
  const markerPattern = /\/\* ARM_([AB])_STAMP (\d+) \*\/\s*create_land \{([\s\S]*?)\n\s*\}/g;
  const found = [...source.matchAll(markerPattern)];
  for (const [armIndex, armName] of ["A", "B"].entries()) {
    const actual = found.filter((match) => match[1] === armName);
    const expected = armSamples(armIndex);
    assert.equal(actual.length, expected.length, `arm ${armName} stamp count changed`);
    actual.forEach((match, index) => {
      assert.equal(Number(match[2]), index + 1, `arm ${armName} marker sequence changed`);
      assert.equal(directive(match[3], "terrain_type"), "ARM_GROUND");
      assert.equal(Number(directive(match[3], "base_size")), ARM_STAMP_SIZE);
      const position = match[3].match(/land_position\s+(\d+)\s+(\d+)/);
      assert.deepEqual(position?.slice(1).map(Number), [expected[index].x, expected[index].y]);
    });
  }
});

check("home islands are mirrored, assigned, and ID-free", () => {
  const homes = lands.filter((land) => directive(land.body, "terrain_type") === "HOME_GROUND");
  assert.equal(homes.length, 2);
  homes.forEach((home, index) => {
    const position = home.body.match(/land_position\s+(\d+)\s+(\d+)/)?.slice(1).map(Number);
    assert.deepEqual(position, [HOME_CENTERS[index].x, HOME_CENTERS[index].y]);
    assert.doesNotMatch(home.body, /\bland_id\b/);
    assert.match(home.body, /\bassign_to_player\s+[12]\b/);
    assert.equal(numericDirective(home.body, "number_of_tiles"), 820);
  });
  assert.deepEqual(rotate180(HOME_CENTERS[0]), { x: HOME_CENTERS[1].x, y: HOME_CENTERS[1].y });
});

check("objective lands match mirrored contract", () => {
  for (const node of nodeLands()) {
    const land = lands.find((candidate) => directive(candidate.body, "land_id") === node.idName);
    assert.ok(land, `missing ${node.idName}`);
    assert.equal(directive(land.body, "terrain_type"), node.terrain);
    const position = land.body.match(/land_position\s+(\d+)\s+(\d+)/)?.slice(1).map(Number);
    assert.deepEqual(position, [node.x, node.y]);
  }
  const eye = lands.find((land) => directive(land.body, "land_id") === "EYE_ID");
  assert.ok(eye, "missing central eye land");
  assert.match(eye.body, new RegExp(`land_position\\s+${CENTER.x}\\s+${CENTER.y}`));
});

check("all gate pairs have locked and open versions", () => {
  const gateMarkers = [...source.matchAll(/\/\* GATE_([A-Z0-9_]+) \*\/\s*create_land \{([\s\S]*?)\n\s*\}/g)];
  for (const gate of allGatePairs()) {
    gate.lines.forEach((line, sideIndex) => line.forEach((point, index) => {
      const label = `${gate.key}_${sideIndex === 0 ? "A" : "B"}_${index + 1}`;
      const matches = gateMarkers.filter((match) => match[1] === label);
      assert.equal(matches.length, 2, `${label} must occur in both conditional branches`);
      assert.deepEqual(
        new Set(matches.map((match) => directive(match[2], "terrain_type"))),
        new Set(["TIDE_LOCK", "OPEN_GATE"]),
      );
      for (const match of matches) {
        const position = match[2].match(/land_position\s+(\d+)\s+(\d+)/)?.slice(1).map(Number);
        assert.deepEqual(position, [point.x, point.y]);
      }
    }));
    assert.match(source, new RegExp(`if\\s+${gate.lockedBy}`));
  }
});

check("home bases do not touch the wrong spiral coil", () => {
  const homeRadius = Math.sqrt(820 / Math.PI) / (MAP_SIZE / 100);
  const roadRadius = ARM_STAMP_SIZE / 2 / (MAP_SIZE / 100);
  for (const [homeIndex, home] of HOME_CENTERS.entries()) {
    const otherArm = armSamples(homeIndex === 0 ? 1 : 0);
    const nearest = Math.min(...otherArm.map((point) => distance(home, point)));
    assert.ok(nearest - homeRadius - roadRadius > 3, `home ${homeIndex} may touch the wrong arm`);
  }
});

check("equal three-clump home forests", () => {
  const forests = terrains.filter((terrain) => terrain.name === "HOME_FOREST");
  assert.equal(forests.length, 2);
  for (const forest of forests) {
    assert.equal(numericDirective(forest.body, "number_of_tiles"), RESOURCE_CONTRACT.homeForestTiles);
    assert.equal(numericDirective(forest.body, "number_of_clumps"), RESOURCE_CONTRACT.homeForestClumps);
    assert.equal(directive(forest.body, "base_terrain"), "HOME_SELECTOR");
    assert.equal(numericDirective(forest.body, "set_avoid_player_start_areas", 0), 12);
  }
});

check("per-player start and resource counts", () => {
  const expected = new Map([
    ["TOWN_CENTER", 1],
    ["VILLAGER", RESOURCE_CONTRACT.villagers],
    ["HOUSE", RESOURCE_CONTRACT.houses],
    ["SCOUT", RESOURCE_CONTRACT.scouts],
    ["START_TRANSPORT", RESOURCE_CONTRACT.transports],
    ["START_HERDABLE", RESOURCE_CONTRACT.herdables],
    ["START_LUREABLE", RESOURCE_CONTRACT.lureables],
    ["START_HUNTABLE", RESOURCE_CONTRACT.huntables],
    ["FORAGE", RESOURCE_CONTRACT.forage],
    ["GOLD", RESOURCE_CONTRACT.homeGold],
    ["STONE", RESOURCE_CONTRACT.homeStone],
    ["SHORE_FISH", RESOURCE_CONTRACT.homeShoreFish],
    ["HARBOR_FISH", RESOURCE_CONTRACT.homeDeepFish],
    ["START_TREE", RESOURCE_CONTRACT.extraStragglers + 1],
  ]);
  for (const [name, quantity] of expected) {
    assert.equal(perPlayerQuantity(name), quantity, `${name} per-player quantity changed`);
  }
});

check("home placement constraints leave usable space", () => {
  for (const object of objects.filter((block) => hasDirective(block.body, "set_place_for_every_player"))) {
    const min = directive(object.body, "min_distance_to_players");
    const max = directive(object.body, "max_distance_to_players");
    if (min !== undefined && max !== undefined) assert.ok(Number(min) <= Number(max));
  }
  const nearSheep = objects.find((block) => block.name === "START_HERDABLE"
    && directive(block.body, "max_distance_to_players") === "7");
  assert.ok(nearSheep, "missing near sheep group");
  assert.doesNotMatch(nearSheep.body, /avoid_actor_area\s+(TC_AREA|VILLAGER_AREA)/);

  const mines = objects.filter((block) => ["GOLD", "STONE"].includes(block.name)
    && hasDirective(block.body, "set_place_for_every_player"));
  assert.equal(mines.length, 5);
  for (const mine of mines) {
    assert.equal(directive(mine.body, "avoid_forest_zone"), "2");
    assert.match(mine.body, /avoid_actor_area\s+BERRIES_AREA/);
  }
});

check("neutral rewards and relic count", () => {
  assert.equal(neutralQuantity("HARBOR_FISH"), RESOURCE_CONTRACT.neutralDeepFish);
  assert.equal(neutralQuantity("RELIC"), RESOURCE_CONTRACT.relics);
  assert.equal(neutralQuantity("GOLD"), 22);
  assert.equal(neutralQuantity("STONE"), 12);
  assert.equal(neutralQuantity("FORAGE"), 12);
  assert.equal(neutralQuantity("START_HUNTABLE"), 8);
});

check("fish schools are singleton and spaced", () => {
  for (const fish of objects.filter((block) => ["SHORE_FISH", "HARBOR_FISH"].includes(block.name))) {
    assert.equal(numericDirective(fish.body, "number_of_objects"), 1);
    assert.ok(numericDirective(fish.body, "temp_min_distance_group_placement", 0) >= 4);
    assert.equal(directive(fish.body, "terrain_to_place_on"), "SEA_WATER");
  }
});

check("player placement never targets a fixed land ID", () => {
  for (const object of objects.filter((block) => hasDirective(block.body, "set_place_for_every_player"))) {
    assert.doesNotMatch(object.body, /\bplace_on_specific_land_id\b/);
    assert.match(object.body, /\bforce_placement\b/);
  }
});

check("ASCII and generated-file hygiene", () => {
  assert.doesNotMatch(source, /[^\x00-\x7F]/);
  assert.ok(source.endsWith("\n"));
  assert.doesNotMatch(source, /[ \t]+$/m);
});

console.log(`Charybdis validation passed (${checks.length} checks).`);
for (const label of checks) console.log(`  PASS ${label}`);
console.log("  RUNTIME PENDING: load and play generated seeds in AoE2 DE.");
