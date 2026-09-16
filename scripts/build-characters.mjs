// Preserve generated masters; only resize/encode delivery copies, without cropping or retouching.
import fs from "node:fs/promises";
import sharp from "sharp";
import { CHARACTERS } from "../public/assets/characters/moonkeepers-v1/catalog.js";
const root = "assets/characters/moonkeepers-v1/originals";
for (const character of Object.values(CHARACTERS)) {
  await sharp(`${root}/${character.id}.png`)
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
  Object.values(CHARACTERS).map(
    async (c) => (await fs.stat(`public/${c.image}`)).size,
  ),
);
console.log(
  `Built ${sizes.length} character images (${Math.round(sizes.reduce((a, b) => a + b, 0) / 1024)} KiB total).`,
);
