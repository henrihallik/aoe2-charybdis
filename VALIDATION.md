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

## Runtime Boundary

No static parser simulates Definitive Edition's terrain painting, pathfinder,
object placer, AI, or runtime stability. Those claims remain pending until the
matrix in `RUNTIME-TEST.md` is completed in the game.
