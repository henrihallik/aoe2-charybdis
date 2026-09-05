# Static Validation

## Map-Specific Validator

Command:

```bash
node tools/validate-rms.mjs
```

Result: 18 checks pass. They cover balanced braces and conditionals, section
order, pinned DE terrain and object aliases, random-branch totals, generated
spiral and gate coordinates, home separation, objective IDs, forests, object
quantities, fish spacing, and ASCII hygiene.

## aoe2-rms-parser 2.0.1

Command from the parent workspace's retained validator directory:

```bash
npm run parse -- ../../charybdis/Charybdis.rms
```

Result: **0 parse errors** and 14 lint notices. Twelve notices flag deliberately
repeated terrain-carpet conversion passes; those repetitions are required to
propagate terrain replacement reliably. Two notices flag the intentionally
empty elevation and connection sections.

Repository: <https://github.com/austinhardy318/aoe2-rms-parser>

## tree-sitter-aoe2-rms

Command from the parent workspace's retained validator directory:

```bash
bash run-tree-sitter.sh ../../charybdis/Charybdis.rms
```

Result: **1 successful parse, 0 failed parses**.

Repository: <https://github.com/twestura/tree-sitter-aoe2-rms>

## Age of RMS 0.4.1 Preflight

The map was generated at its fixed 120x120 size for seeds 1 through 12. The
three tide configurations are represented by the retained previews:

- [seed 1, inner lock](./docs/age-of-rms-previews/Charybdis-corrected-seed-1.png)
- [seed 4, middle lock](./docs/age-of-rms-previews/Charybdis-corrected-seed-4.png)
- [seed 5, outer lock](./docs/age-of-rms-previews/Charybdis-corrected-seed-5.png)

Each representative seed produced two mirrored player markers, 232 simulated
objects, five relics, 60 fish, two transports, 52 gold tiles, and 30 stone
tiles. The generated spiral arms remain separate, leaving water between every
coil. Age of RMS reports zero parser diagnostics and zero failure marks.

The preview omits the villagers because version 0.4.1 skips actor-area
bookkeeping after an ungrouped anchor placement. This is an identified preview
limitation, not treated as an RMS pass or failure. Its other placement notices
are likewise retained as approximation diagnostics rather than counted as
independent map defects.

Repository: <https://github.com/Alchemy-AOE-Community/age-of-rms>

## Runtime Boundary

No static parser simulates Definitive Edition's terrain painting, pathfinder,
object placer, AI, or runtime stability. Those claims remain pending until the
matrix in `RUNTIME-TEST.md` is completed in the game.
