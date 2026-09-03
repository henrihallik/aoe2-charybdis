import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ARM_STAMP_SIZE,
  CENTER,
  GATE_PAIRS,
  HOME_CENTERS,
  MAP_SIZE,
  NODE_PAIRS,
  RESOURCE_CONTRACT,
  TIDE_STATES,
  allGatePairs,
  armSamples,
  mapToMinimap,
  nodeLands,
} from "./layout.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rmsPath = resolve(projectRoot, "Charybdis.rms");
const svgPath = resolve(projectRoot, "docs/layout-reference.svg");
const checkOnly = process.argv.includes("--check");

function indent(text, spaces = 4) {
  const prefix = " ".repeat(spaces);
  return text.trim().split("\n").map((line) => line ? `${prefix}${line}` : "").join("\n");
}

function fixedLand({
  terrain,
  x,
  y,
  baseSize,
  numberOfTiles = 0,
  zone,
  landId,
  extra = "",
  borderPadding,
}) {
  const padding = borderPadding ?? Math.ceil(baseSize / 2) + 1;
  const left = Math.max(0, Math.floor(x - padding));
  const right = Math.max(0, Math.floor(100 - x - padding));
  const top = Math.max(0, Math.floor(y - padding));
  const bottom = Math.max(0, Math.floor(100 - y - padding));
  return `create_land {
    terrain_type ${terrain}
    number_of_tiles ${numberOfTiles}
    base_size ${baseSize}
    land_position ${x} ${y}
    left_border ${left}
    right_border ${right}
    top_border ${top}
    bottom_border ${bottom}
    border_fuzziness 100
    clumping_factor 100
    other_zone_avoidance_distance 0
${zone ? `    zone ${zone}\n` : ""}${landId ? `    land_id ${landId}\n` : ""}${extra ? `${indent(extra)}\n` : ""}}`;
}

function homeLand(home, index) {
  const southwest = index === 0;
  const assignment = southwest
    ? `if PLAYER_ONE_SOUTHWEST
    assign_to_player 1
else
    assign_to_player 2
endif`
    : `if PLAYER_ONE_SOUTHWEST
    assign_to_player 2
else
    assign_to_player 1
endif`;

  return fixedLand({
    terrain: "HOME_GROUND",
    x: home.x,
    y: home.y,
    baseSize: 15,
    numberOfTiles: 820,
    zone: home.zone,
    borderPadding: 13,
    extra: `set_circular_base\n${assignment}`,
  });
}

function armLandBlocks() {
  return [0, 1].map((arm) => {
    const zone = arm === 0 ? "ARM_A_ZONE" : "ARM_B_ZONE";
    const blocks = armSamples(arm).map((point, index) => {
      const block = fixedLand({
        terrain: "ARM_GROUND",
        x: point.x,
        y: point.y,
        baseSize: ARM_STAMP_SIZE,
        zone,
      });
      return `/* ARM_${arm === 0 ? "A" : "B"}_STAMP ${index + 1} */\n${block}`;
    });
    return `/* Spiral arm ${arm === 0 ? "A" : "B"}: ${blocks.length} exact stamps. */\n${blocks.join("\n\n")}`;
  }).join("\n\n");
}

function nodeLandBlocks() {
  return nodeLands().map((node) => fixedLand({
    terrain: node.terrain,
    x: node.x,
    y: node.y,
    baseSize: Math.ceil(node.size / 2),
    numberOfTiles: node.size === 11 ? 90 : 64,
    zone: "OBJECTIVE_ZONE",
    landId: node.idName,
    borderPadding: 6,
  })).join("\n\n");
}

function gateLandBlocks() {
  return allGatePairs().map((gate) => {
    const stamps = gate.lines.flatMap((line, sideIndex) => line.map((point, index) => ({
      ...point,
      label: `${gate.key}_${sideIndex === 0 ? "A" : "B"}_${index + 1}`,
    })));
    const render = (terrain) => stamps.map((stamp) => `/* GATE_${stamp.label} */\n${fixedLand({
      terrain,
      x: stamp.x,
      y: stamp.y,
      baseSize: 3,
      zone: "TIDE_GATE_ZONE",
    })}`).join("\n\n");

    return `/* ${gate.key}: one rotationally mirrored shortcut pair. */
if ${gate.lockedBy}
${indent(render("TIDE_LOCK"))}
else
${indent(render("OPEN_GATE"))}
endif`;
  }).join("\n\n");
}

function tideRandom() {
  return `start_random
${TIDE_STATES.map((state) => `    percent_chance ${state.chance} #define ${state.define}`).join("\n")}
end_random`;
}

function constants() {
  const nodeIds = nodeLands().map((node) => `#const ${node.idName} ${node.id}`).join("\n");
  return `/* Stable Definitive Edition terrain aliases. Mangrove forest is 55 in DE. */
#const SEA_WATER 1
#const OPEN_GATE 4
#const HOME_FOREST 10
#const PROVISION_GROUND 11
#const HOME_GROUND 12
#const TIDE_LOCK 55
#const ARM_GROUND 24
#const ARM_DETAIL 25
#const HOME_SELECTOR 38
#const HOME_FINISHED 39
#const SHRINE_GROUND 45
#const EYE_GROUND 45
#const SALVAGE_GROUND 70

/* Object aliases. */
#const START_HERDABLE 594
#const START_LUREABLE 48
#const START_HUNTABLE 65
#const START_TREE 349
#const HARBOR_FISH 457
#const START_TRANSPORT 545
#const CENTER_BONFIRE 304

/* Zones and fixed land identifiers. */
#const SOUTHWEST_HOME_ZONE 10
#const NORTHEAST_HOME_ZONE 11
#const ARM_A_ZONE 21
#const ARM_B_ZONE 22
#const OBJECTIVE_ZONE 30
#const TIDE_GATE_ZONE 40
#const EYE_ID 500
${nodeIds}

/* Per-player actor areas reserve non-overlapping start resources. */
#const TC_AREA 1000
#const VILLAGER_AREA 1010
#const NEAR_SHEEP_AREA 1020
#const FAR_SHEEP_AREA 1030
#const BERRIES_AREA 1100
#const PRIMARY_GOLD_AREA 1110
#const SECONDARY_GOLD_AREA 1120
#const TERTIARY_GOLD_AREA 1130
#const PRIMARY_STONE_AREA 1140
#const SECONDARY_STONE_AREA 1150
#const NEAR_BOAR_AREA 1160
#const FAR_BOAR_AREA 1170
#const DEER_AREA 1180`;
}

function forestCarpet() {
  const selectOneHome = (slot) => `/* Home forest slot ${slot}. */
create_terrain HOME_SELECTOR {
    base_terrain HOME_GROUND
    land_percent 100
    number_of_clumps 1
}
create_terrain HOME_FOREST {
    base_terrain HOME_SELECTOR
    number_of_tiles ${RESOURCE_CONTRACT.homeForestTiles}
    number_of_clumps ${RESOURCE_CONTRACT.homeForestClumps}
    clumping_factor 24
    spacing_to_other_terrain_types 1
    set_avoid_player_start_areas 12
}
${Array.from({ length: 4 }, () => `create_terrain HOME_FINISHED {
    base_terrain HOME_SELECTOR
    land_percent 100
    number_of_clumps 9320
}`).join("\n")}`;

  const restore = Array.from({ length: 4 }, () => `create_terrain HOME_GROUND {
    base_terrain HOME_FINISHED
    land_percent 100
    number_of_clumps 9320
}`).join("\n");

  return `/* Each disconnected home receives the same three-clump forest budget. */
${selectOneHome(1)}

${selectOneHome(2)}

/* Restore temporary carpet terrain to normal buildable home ground. */
${restore}`;
}

function startObjects() {
  return `/* Civilizations keep their normal economic bonuses and starting stockpiles. */
create_object TOWN_CENTER {
    set_place_for_every_player
    min_distance_to_players 0
    max_distance_to_players 0
    find_closest
    force_placement
    terrain_to_place_on HOME_GROUND
    actor_area TC_AREA
    actor_area_radius 8
}

create_object START_TREE {
    number_of_objects 1
    set_gaia_object_only
    set_place_for_every_player
    min_distance_to_players 5
    max_distance_to_players 6
    find_closest
    force_placement
    terrain_to_place_on HOME_GROUND
    actor_area VILLAGER_AREA
    actor_area_radius 5
}

create_object VILLAGER {
    number_of_objects ${RESOURCE_CONTRACT.villagers}
    set_place_for_every_player
    actor_area_to_place_in VILLAGER_AREA
    force_placement
}

create_object HOUSE {
    number_of_objects ${RESOURCE_CONTRACT.houses}
    set_place_for_every_player
    min_distance_to_players 6
    max_distance_to_players 10
    find_closest
    force_placement
    terrain_to_place_on HOME_GROUND
    avoid_actor_area TC_AREA
    avoid_actor_area VILLAGER_AREA
    temp_min_distance_group_placement 3
}

create_object SCOUT {
    number_of_objects ${RESOURCE_CONTRACT.scouts}
    set_place_for_every_player
    min_distance_to_players 5
    max_distance_to_players 9
    find_closest
    force_placement
    terrain_to_place_on HOME_GROUND
}

if REGICIDE
    create_object KING {
        set_place_for_every_player
        min_distance_to_players 4
        max_distance_to_players 7
        find_closest
        force_placement
        terrain_to_place_on HOME_GROUND
    }
endif

create_object START_TRANSPORT {
    number_of_objects ${RESOURCE_CONTRACT.transports}
    set_place_for_every_player
    min_distance_to_players 15
    max_distance_to_players 28
    find_closest
    force_placement
    terrain_to_place_on SEA_WATER
}`;
}

function homeResources() {
  const sharedAvoid = [
    "TC_AREA",
    "VILLAGER_AREA",
    "BERRIES_AREA",
  ];
  const avoidLines = (areas) => areas.map((area) => `    avoid_actor_area ${area}`).join("\n");

  const group = ({
    object,
    count,
    min,
    max,
    radius,
    actor,
    actorRadius = 4,
    avoid = [],
    loose = false,
    closest = false,
    spacing,
    avoidForest,
  }) => `create_object ${object} {
    number_of_objects ${count}
    number_of_groups 1
    group_placement_radius ${radius}
    ${loose ? "set_loose_grouping" : "set_tight_grouping"}
    set_gaia_object_only
    set_place_for_every_player
    min_distance_to_players ${min}
    max_distance_to_players ${max}
${closest ? "    find_closest\n" : ""}    force_placement
    terrain_to_place_on HOME_GROUND
${avoidForest ? `    avoid_forest_zone ${avoidForest}\n` : ""}
${avoidLines(avoid)}
${actor ? `    actor_area ${actor}\n    actor_area_radius ${actorRadius}\n` : ""}${spacing ? `    temp_min_distance_group_placement ${spacing}\n` : ""}}`;

  const sections = [
    group({
      object: "START_HERDABLE", count: 4, min: 3, max: 7, radius: 2,
      actor: "NEAR_SHEEP_AREA", closest: true,
    }),
    group({
      object: "START_HERDABLE", count: 4, min: 7, max: 11, radius: 3,
      actor: "FAR_SHEEP_AREA", avoid: ["NEAR_SHEEP_AREA"], spacing: 4,
    }),
    group({
      object: "FORAGE", count: RESOURCE_CONTRACT.forage, min: 7, max: 12, radius: 2,
      actor: "BERRIES_AREA", avoid: ["TC_AREA", "VILLAGER_AREA"], closest: true, avoidForest: 1,
    }),
    group({
      object: "START_LUREABLE", count: 1, min: 10, max: 14, radius: 1,
      actor: "NEAR_BOAR_AREA", actorRadius: 3, avoid: ["TC_AREA", "VILLAGER_AREA", "BERRIES_AREA"],
    }),
    group({
      object: "START_LUREABLE", count: 1, min: 12, max: 16, radius: 1,
      actor: "FAR_BOAR_AREA", actorRadius: 3, avoid: ["TC_AREA", "VILLAGER_AREA", "BERRIES_AREA", "NEAR_BOAR_AREA"], spacing: 5,
    }),
    group({
      object: "START_HUNTABLE", count: RESOURCE_CONTRACT.huntables, min: 9, max: 15, radius: 3,
      actor: "DEER_AREA", avoid: ["TC_AREA", "VILLAGER_AREA", "BERRIES_AREA"], loose: true,
    }),
    group({
      object: "GOLD", count: 7, min: 7, max: 11, radius: 3,
      actor: "PRIMARY_GOLD_AREA", avoid: sharedAvoid, closest: true, avoidForest: 2,
    }),
    group({
      object: "GOLD", count: 4, min: 10, max: 14, radius: 2,
      actor: "SECONDARY_GOLD_AREA", avoid: [...sharedAvoid, "PRIMARY_GOLD_AREA"], spacing: 5, avoidForest: 2,
    }),
    group({
      object: "GOLD", count: 4, min: 12, max: 16, radius: 2,
      actor: "TERTIARY_GOLD_AREA", avoid: [...sharedAvoid, "PRIMARY_GOLD_AREA", "SECONDARY_GOLD_AREA"], spacing: 5, avoidForest: 2,
    }),
    group({
      object: "STONE", count: 5, min: 9, max: 13, radius: 2,
      actor: "PRIMARY_STONE_AREA", avoid: [...sharedAvoid, "PRIMARY_GOLD_AREA", "SECONDARY_GOLD_AREA", "TERTIARY_GOLD_AREA"], closest: true, avoidForest: 2,
    }),
    group({
      object: "STONE", count: 4, min: 12, max: 16, radius: 2,
      actor: "SECONDARY_STONE_AREA", avoid: [...sharedAvoid, "PRIMARY_GOLD_AREA", "SECONDARY_GOLD_AREA", "TERTIARY_GOLD_AREA", "PRIMARY_STONE_AREA"], spacing: 5, avoidForest: 2,
    }),
  ];

  sections.push(`create_object START_TREE {
    number_of_objects 1
    number_of_groups ${RESOURCE_CONTRACT.extraStragglers}
    group_placement_radius 1
    set_gaia_object_only
    set_place_for_every_player
    min_distance_to_players 4
    max_distance_to_players 13
    force_placement
    terrain_to_place_on HOME_GROUND
    avoid_actor_area TC_AREA
    avoid_actor_area VILLAGER_AREA
    temp_min_distance_group_placement 2
}`);

  return `/* Exact per-player food and mine counts; actor areas keep deposits separate. */
${sections.join("\n\n")}`;
}

function fishObjects() {
  return `/* Singleton schools and explicit spacing prevent stacked fish tiles. */
create_object SHORE_FISH {
    number_of_objects 1
    number_of_groups ${RESOURCE_CONTRACT.homeShoreFish}
    group_placement_radius 1
    set_loose_grouping
    set_gaia_object_only
    set_place_for_every_player
    min_distance_to_players 15
    max_distance_to_players 30
    force_placement
    terrain_to_place_on SEA_WATER
    temp_min_distance_group_placement 4
}

create_object HARBOR_FISH {
    number_of_objects 1
    number_of_groups ${RESOURCE_CONTRACT.homeDeepFish}
    group_placement_radius 1
    set_loose_grouping
    set_gaia_object_only
    set_place_for_every_player
    min_distance_to_players 20
    max_distance_to_players 36
    force_placement
    terrain_to_place_on SEA_WATER
    temp_min_distance_group_placement 5
}

create_object HARBOR_FISH {
    number_of_objects 1
    number_of_groups ${RESOURCE_CONTRACT.neutralDeepFish}
    group_placement_radius 1
    set_loose_grouping
    set_gaia_object_only
    min_distance_to_players 28
    force_placement
    terrain_to_place_on SEA_WATER
    temp_min_distance_group_placement 5
}`;
}

function specificObject({
  object,
  count,
  groups = 1,
  radius = 2,
  landId,
  terrain,
  actor,
  actorRadius = 3,
  avoid = [],
  loose = false,
  spacing,
}) {
  return `create_object ${object} {
    number_of_objects ${count}
    number_of_groups ${groups}
    group_placement_radius ${radius}
    ${loose ? "set_loose_grouping" : "set_tight_grouping"}
    set_gaia_object_only
    place_on_specific_land_id ${landId}
    avoid_other_land_zones 0
    find_closest
    force_placement
    terrain_to_place_on ${terrain}
${avoid.map((area) => `    avoid_actor_area ${area}`).join("\n")}${avoid.length ? "\n" : ""}${actor ? `    actor_area ${actor}\n    actor_area_radius ${actorRadius}\n` : ""}${spacing ? `    temp_min_distance_group_placement ${spacing}\n` : ""}}`;
}

function objectiveObjects() {
  const blocks = [];
  for (const node of nodeLands()) {
    if (node.key === "SALVAGE") {
      blocks.push(specificObject({
        object: "GOLD", count: 4, landId: node.idName, terrain: node.terrain,
        actor: node.actorBase, actorRadius: 3,
      }));
      blocks.push(specificObject({
        object: "STONE", count: 4, landId: node.idName, terrain: node.terrain,
        actor: node.actorBase + 1, actorRadius: 3, avoid: [node.actorBase],
      }));
    } else if (node.key === "PROVISION") {
      blocks.push(specificObject({
        object: "FORAGE", count: 6, landId: node.idName, terrain: node.terrain,
        actor: node.actorBase, actorRadius: 3,
      }));
      blocks.push(specificObject({
        object: "START_HUNTABLE", count: 4, landId: node.idName, terrain: node.terrain,
        actor: node.actorBase + 1, actorRadius: 3, avoid: [node.actorBase], loose: true,
      }));
    } else if (node.key === "SHRINE") {
      blocks.push(specificObject({
        object: "GOLD", count: 4, landId: node.idName, terrain: node.terrain,
        actor: node.actorBase, actorRadius: 3,
      }));
      blocks.push(specificObject({
        object: "RELIC", count: 1, landId: node.idName, terrain: node.terrain,
        actor: node.actorBase + 1, actorRadius: 2, avoid: [node.actorBase],
      }));
    }
  }

  blocks.push(`create_object CENTER_BONFIRE {
    number_of_objects 1
    set_gaia_object_only
    place_on_specific_land_id EYE_ID
    avoid_other_land_zones 0
    find_closest
    force_placement
    terrain_to_place_on EYE_GROUND
    actor_area 9000
    actor_area_radius 3
}`);
  blocks.push(specificObject({
    object: "GOLD", count: 6, landId: "EYE_ID", terrain: "EYE_GROUND",
    actor: 9010, actorRadius: 4, avoid: [9000],
  }));
  blocks.push(specificObject({
    object: "STONE", count: 4, landId: "EYE_ID", terrain: "EYE_GROUND",
    actor: 9020, actorRadius: 3, avoid: [9000, 9010],
  }));
  blocks.push(specificObject({
    object: "RELIC", count: 1, groups: 3, radius: 1, landId: "EYE_ID",
    terrain: "EYE_GROUND", avoid: [9000, 9010, 9020], loose: true, spacing: 4,
  }));

  return `/* Mirrored coil rewards and the three-relic central eye. */
${blocks.join("\n\n")}`;
}

function makeSvg() {
  const origin = { x: 70, y: 78 };
  const scale = 3.58;
  const project = (point) => {
    const iso = mapToMinimap(point);
    return { x: origin.x + iso.x * scale, y: origin.y + iso.y * scale };
  };
  const circle = (point, radius, fill, stroke = "none", strokeWidth = 0) => {
    const p = project(point);
    return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${(radius * Math.SQRT2 * scale).toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  };
  const diamond = [
    project({ x: 0, y: 0 }),
    project({ x: 100, y: 0 }),
    project({ x: 100, y: 100 }),
    project({ x: 0, y: 100 }),
  ].map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");

  const arms = [0, 1].flatMap((arm) => armSamples(arm).map((point) => circle(point, 3.0, "#a49a7e"))).join("\n    ");
  const homes = HOME_CENTERS.map((home, index) => `${circle(home, 13.6, "#7c9b55", "#d9e6aa", 3)}
    ${circle(home, 2.2, index === 0 ? "#3478c4" : "#d34b3f", "#ffffff", 2)}`).join("\n    ");
  const nodeColors = { SALVAGE: "#d3a53c", PROVISION: "#78a867", SHRINE: "#a58ac6" };
  const nodes = nodeLands().map((node) => circle(node, node.size === 11 ? 5.2 : 4.3, nodeColors[node.key], "#eee8d5", 2)).join("\n    ");
  const center = circle(CENTER, 7.4, "#d8c353", "#fff4bd", 4);
  const gates = allGatePairs().map((gate) => gate.lines.flatMap((line) => line.map((point) => circle(
    point,
    1.45,
    gate.key === "MIDDLE" ? "#285f43" : "#9fd2c9",
    "#eaf6e9",
    1,
  ))).join("\n    ")).join("\n    ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900" viewBox="0 0 1400 900" role="img" aria-labelledby="title desc">
  <title id="title">Charybdis exact generated layout</title>
  <desc id="desc">Two rotationally symmetric stone spirals cross dockable water and meet at a central objective eye.</desc>
  <rect width="1400" height="900" fill="#14191c"/>
  <polygon points="${diamond}" fill="#176b87" stroke="#8bc2ce" stroke-width="4"/>
  <g>
    ${arms}
    ${homes}
    ${nodes}
    ${center}
    ${gates}
  </g>
  <g fill="#f2eee5" font-family="Arial, Helvetica, sans-serif">
    <text x="850" y="105" font-size="52" font-weight="700">CHARYBDIS</text>
    <text x="852" y="148" font-size="22" fill="#abc4cb">Exact generated geometry, middle-lock seed</text>
    <line x1="850" y1="180" x2="1325" y2="180" stroke="#46535a" stroke-width="2"/>
    <text x="850" y="232" font-size="24" font-weight="700">THE FIELD</text>
    <text x="850" y="274" font-size="20">Two complete spiral land routes</text>
    <text x="850" y="307" font-size="20">Dockable channels between every coil</text>
    <text x="850" y="340" font-size="20">Transport ship at each starting island</text>
    <text x="850" y="373" font-size="20">Five relics: one per shrine, three central</text>
    <text x="850" y="426" font-size="24" font-weight="700">CHANGING TIDE</text>
    <circle cx="865" cy="467" r="13" fill="#9fd2c9" stroke="#eaf6e9" stroke-width="2"/>
    <text x="894" y="474" font-size="20">Open shallow shortcut</text>
    <circle cx="865" cy="510" r="13" fill="#285f43" stroke="#eaf6e9" stroke-width="2"/>
    <text x="894" y="517" font-size="20">Mangrove lock; chop to open</text>
    <text x="850" y="559" font-size="18" fill="#abc4cb">Exactly one of the three mirrored pairs locks.</text>
    <text x="850" y="604" font-size="24" font-weight="700">OBJECTIVE PADS</text>
    <circle cx="865" cy="646" r="13" fill="#d3a53c"/><text x="894" y="653" font-size="20">Salvage: gold and stone</text>
    <circle cx="865" cy="689" r="13" fill="#78a867"/><text x="894" y="696" font-size="20">Provision: berries and deer</text>
    <circle cx="865" cy="732" r="13" fill="#a58ac6"/><text x="894" y="739" font-size="20">Shrine: gold and relic</text>
    <circle cx="865" cy="775" r="13" fill="#d8c353"/><text x="894" y="782" font-size="20">Eye: gold, stone, three relics</text>
    <text x="850" y="842" font-size="17" fill="#79898f">120 x 120 | 1v1 | flat elevation | 180-degree symmetry</text>
  </g>
</svg>
`;
}

function writeOrCheck(path, content) {
  if (!checkOnly) {
    writeFileSync(path, content);
    return;
  }
  const current = readFileSync(path, "utf8");
  if (current !== content) {
    throw new Error(`${path} is stale; run node tools/generate-map.mjs`);
  }
}

const rms = `${makeRms().trimEnd()}\n`;
const svg = makeSvg();
writeOrCheck(rmsPath, rms);
writeOrCheck(svgPath, svg);

console.log(checkOnly
  ? "Generated RMS and layout reference are current."
  : `Generated ${rmsPath}\nGenerated ${svgPath}`);

function makeRms() {
  return `/* Compatibility: Age of Empires II: Definitive Edition */
/*
    Charybdis v0.1.0

    A purpose-built 1v1 hybrid on a fixed ${MAP_SIZE} x ${MAP_SIZE} canvas.
    Two stone spirals form complete but winding land routes to the central eye.
    Navigable water fills every channel, and each player starts with a transport.

    Three mirrored shortcut pairs cross neighboring coils. Two pairs generate as
    open shallows; the third becomes a mangrove lock. Chopping a narrow route
    through that lock creates a new passage usable by land units and ships.

    Competitive contract:
      - exact 180-degree rotational geometry and identical resource rules;
      - color-to-side assignment swaps independently of the geometry;
      - ${RESOURCE_CONTRACT.villagers} villagers, ${RESOURCE_CONTRACT.houses} houses, one scout, and one transport per player;
      - standard unit, building, technology, and resource behavior;
      - five relics, mirrored neutral resource pads, dockable water, and fish;
      - no XS, triggers, includes, elevation, or object-attribute effects.

    Intended settings: exactly two players, Tiny map, Standard resources.
*/

${constants()}

/* Exactly one shortcut pair is forest-locked on each generated map. */
${tideRandom()}

/* Player colors do not determine which rotationally symmetric start they use. */
start_random
    percent_chance 50 #define PLAYER_ONE_SOUTHWEST
    percent_chance 50 #define PLAYER_TWO_SOUTHWEST
end_random


<PLAYER_SETUP>

direct_placement
behavior_version 2
override_map_size ${MAP_SIZE}
ai_info_map_type RIVERS 0 0 0


<LAND_GENERATION>

base_terrain SEA_WATER
enable_waves 0

/* Continuous primary routes are authored first. */
${armLandBlocks()}

/* Large ID-free starts preserve set_place_for_every_player behavior in DE. */
${HOME_CENTERS.map(homeLand).join("\n\n")}

/* Six paired objective pads and one central eye overwrite the route texture. */
${nodeLandBlocks()}

${fixedLand({
    terrain: "EYE_GROUND",
    x: CENTER.x,
    y: CENTER.y,
    baseSize: 9,
    numberOfTiles: 220,
    zone: "OBJECTIVE_ZONE",
    landId: "EYE_ID",
    borderPadding: 8,
  })}

/* Seed-dependent cross-coil shortcuts are the final geometry layer. */
${gateLandBlocks()}


<ELEVATION_GENERATION>

/* Intentionally flat: elevation is unnecessary for the route mechanic. */


<TERRAIN_GENERATION>

/* Broken paving adds close-camera detail without changing pathing. */
create_terrain ARM_DETAIL {
    base_terrain ARM_GROUND
    land_percent 18
    number_of_clumps 36
    clumping_factor 8
    spacing_to_other_terrain_types 1
    terrain_mask 1
}

${forestCarpet()}


<CONNECTION_GENERATION>

/* All intended land connections are explicit authored geometry. */


<OBJECTS_GENERATION>

${startObjects()}

${homeResources()}

${fishObjects()}

${objectiveObjects()}
`;
}
