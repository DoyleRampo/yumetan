import {
  CHARACTERS as humans,
  COLLECTION as humanNames,
} from "../assets/characters/dreamwalkers-v1/catalog.js";
import {
  CHARACTERS as animals,
  COLLECTION as animalNames,
} from "../assets/characters/moonkeepers-v1/catalog.js";

export const DEFAULT_CHARACTER_SET = "human";
export const CHARACTER_SETS = [
  {
    id: "human",
    names: humanNames,
    label: ["人間キャラクター", "사람 캐릭터", "人类角色", "Human characters"],
    eyebrow: "DREAMWALKERS / 16 CHARACTERS",
    characters: humans,
  },
  {
    id: "animal",
    names: animalNames,
    label: ["動物キャラクター", "동물 캐릭터", "动物角色", "Animal companions"],
    eyebrow: "MOONKEEPERS / 16 COMPANIONS",
    characters: animals,
  },
];
export const normalizeCharacterSet = (id) =>
  CHARACTER_SETS.some((set) => set.id === id) ? id : DEFAULT_CHARACTER_SET;
export const characterSetById = (id) =>
  CHARACTER_SETS.find((set) => set.id === normalizeCharacterSet(id));
export const characterById = (id, setId = DEFAULT_CHARACTER_SET) => {
  const characters = characterSetById(setId).characters;
  return characters[id] || characters.chase;
};
