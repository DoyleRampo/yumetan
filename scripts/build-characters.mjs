// Preserve generated masters; only resize/encode delivery copies, without cropping or retouching.
import fs from "node:fs/promises";
import sharp from "sharp";
import { CHARACTER_SETS } from "../public/core/characters.js";
const selection = process.argv[2] || "all";
const sets = CHARACTER_SETS.filter(
  (set) => selection === "all" || set.id === selection,
);
if (!sets.length) throw new Error("Choose human, animal, or all.");
for (const set of sets) {
  const characters = Object.values(set.characters);
  for (const character of characters) {
    const collection = character.image.split("/")[2];
    await sharp(`assets/characters/${collection}/originals/${character.id}.png`)
      .resize({
        width: 768,
        height: 768,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 86, effort: 6 })
      .toFile(`public/${character.image}`);
  }
  const sizes = await Promise.all(
    characters.map(async (c) => (await fs.stat(`public/${c.image}`)).size),
  );
  console.log(
    `${set.id}: ${sizes.length} images (${Math.round(sizes.reduce((a, b) => a + b, 0) / 1024)} KiB).`,
  );
}
