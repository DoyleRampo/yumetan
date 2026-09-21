import {
  CHARACTERS as humans,
  COLLECTION as humanNames,
} from "../assets/characters/dreamwalkers-v1/catalog.js";
import {
  CHARACTERS as animals,
  COLLECTION as animalNames,
} from "../assets/characters/moonkeepers-v1/catalog.js";

// Animals are the free collection and the default. The human collection is a
// paid extra: see allowedCharacterSet() and plans.js.
export const DEFAULT_CHARACTER_SET = "animal";
export const CHARACTER_SETS = [
  {
    id: "animal",
    names: animalNames,
    label: ["動物キャラクター", "동물 캐릭터", "动物角色", "Animal companions"],
    eyebrow: "MOONKEEPERS / 16 COMPANIONS",
    characters: animals,
    paid: false,
  },
  {
    id: "human",
    names: humanNames,
    label: ["人間キャラクター", "사람 캐릭터", "人类角色", "Human characters"],
    eyebrow: "DREAMWALKERS / 16 CHARACTERS",
    characters: humans,
    paid: true,
  },
];
export const normalizeCharacterSet = (id) =>
  CHARACTER_SETS.some((set) => set.id === id) ? id : DEFAULT_CHARACTER_SET;
export const characterSetById = (id) =>
  CHARACTER_SETS.find((set) => set.id === normalizeCharacterSet(id));
// The set a plan may display: paid collections fall back to the default on the free plan.
export const allowedCharacterSet = (id, plan = "free") => {
  const set = characterSetById(id);
  return set.paid && plan === "free" ? DEFAULT_CHARACTER_SET : set.id;
};
export const characterById = (id, setId = DEFAULT_CHARACTER_SET) => {
  const characters = characterSetById(setId).characters;
  return characters[id] || characters.chase;
};
