import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_STYLE, lockedChoice, readStyle, styleSwaps } from "../src/viewer/island-style.ts";
import { C } from "../src/viewer/palette.ts";

test("an island style keeps only known choices, and falls back to the defaults", () => {
  const style = readStyle({ shape: 42, turf: "autumn", stone: "lava", crystal: "<script>", light: "noon", extra: 1 }, 7);
  assert.deepEqual(style, { ...DEFAULT_STYLE, shape: 42, turf: "autumn" });
  assert.equal(readStyle(null, 7).shape, 7);
  assert.equal(readStyle({ shape: -3 }, 7).shape, 7);
  assert.equal(readStyle({ shape: 1.5 }, 7).shape, 7);
});

test("rank-locked choices open at their tier's floor", () => {
  const sapphire = readStyle({ crystal: "sapphire" }, 1);
  assert.deepEqual(lockedChoice(sapphire, 1199), { group: "Core crystal", name: "Sapphire", tier: "Chrome" });
  assert.equal(lockedChoice(sapphire, 1200), null);
  assert.equal(lockedChoice(readStyle({}, 1), 0), null, "the default island is open to everyone");
});

test("a style never recolours anything that carries meaning on the map", () => {
  const meaningful = [C.lime, C.joint, C.kerb, C.concrete, C.concrete2, C.water, C.water2, C.jade, C.brass, C.bronze];
  for (const turf of ["meadow", "autumn", "heather", "frost"]) for (const stone of ["slate", "sandstone", "basalt", "marble"]) for (const plinth of ["walnut", "oak", "ebony"]) {
    const swaps = styleSwaps(readStyle({ turf, stone, plinth }, 1));
    for (const c of meaningful) assert.ok(!swaps.has(c), `${turf}/${stone}/${plinth} recolours ${c}`);
  }
});
