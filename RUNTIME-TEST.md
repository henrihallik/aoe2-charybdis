# Charybdis Runtime Test

Static validation is complete. These checks require Age of Empires II:
Definitive Edition and must be performed before a stable release.

## Test Setup

- Random Map, Custom map style, `Charybdis`
- Exactly two players on Tiny
- Standard resources and Normal reveal unless a row specifies otherwise
- One human player and one Standard AI for the main pass
- Record the displayed map seed where possible

Generate enough maps to observe all three locked positions: outer, middle, and
inner. The dark mangrove bridge pair identifies the active lock.

## Acceptance Matrix

| Test | Acceptance condition | Result |
| --- | --- | --- |
| Load | Lobby starts the match without an error | Pending |
| Stability | Ten minutes of scrolling, selecting, moving, building, and fighting without a crash | Pending |
| Starts | Each side has 1 TC, 6 villagers, 2 houses, 1 scout, and 1 transport | Pending |
| Base space | TC area has room for houses, production buildings, farms, and a dock | Pending |
| Home economy | Both players receive all listed food, mines, forests, stragglers, and fish | Pending |
| Mine access | No gold or stone group is trapped in trees, another mine, or the shoreline | Pending |
| Primary land route | A land unit can travel from either base along its coil to the center | Pending |
| Water route | A ship can navigate the open channels around the spiral | Pending |
| Open shortcuts | Land units and ships can cross both shallow shortcut pairs | Pending |
| Closed shortcut | The mangrove pair blocks passage before chopping | Pending |
| Chopped shortcut | After a narrow tree corridor is cut, land units and ships can cross it | Pending |
| Docks | A dock can be placed on several points of both home shorelines | Pending |
| Fish | Fish are distributed through home and neutral water without tile overlap | Pending |
| Objectives | Both salvage, provision, and shrine pairs contain equal resources | Pending |
| Relics | Exactly 5 relics appear: 1 on each shrine and 3 in the eye | Pending |
| AI | Standard AI develops its base, uses the land route, and attacks | Pending |
| Regicide | Each player receives exactly one King | Pending |
| Revealed map | All Visible starts and runs without a crash | Pending |
| Editor | Generate New Map and Test both run without a crash | Pending |

## Seed Record

| Locked pair | Seed | Result | Notes |
| --- | --- | --- | --- |
| Outer |  | Pending |  |
| Middle |  | Pending |  |
| Inner |  | Pending |  |
