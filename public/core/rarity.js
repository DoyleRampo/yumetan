// How common each of the 16 dream types is among people worldwide, in percent.
// These are Yumetan's own estimates, not counts of quiz results: there are not
// yet enough members to measure. They follow what dream surveys report:
// being chased is the most widely reported dream theme; most adults have
// recurring dreams, mostly of familiar places and people; déjà rêvé and vague
// unease are common; frequent sleep-paralysis-like dreams, dreams felt to come
// true, and fully controlled lucid dreams are rare. Replace them with real
// figures once enough results exist. The sixteen add up to 100.0.
export const RARITY = {
  chase: 11.8,
  place: 10.4,
  person: 8.9,
  emotion: 8.1,
  loss: 7.6,
  deja: 7.2,
  story: 6.5,
  intuition: 6.1,
  collapse: 5.8,
  aware: 5.3,
  observer: 4.6,
  bound: 4.2,
  future: 3.9,
  symbol: 3.6,
  challenge: 3.4,
  lucid: 2.6,
};
// Most common first.
export const RARITY_RANKING = Object.entries(RARITY)
  .sort((a, b) => b[1] - a[1])
  .map(([id, percent], i) => ({ id, percent, rank: i + 1 }));
export const rarityOf = (id) => RARITY_RANKING.find((r) => r.id === id);
// Five tiers, from "common" (1) to "very rare" (5).
export function rarityTier(percent) {
  if (percent >= 9) return 1;
  if (percent >= 6) return 2;
  if (percent >= 4.5) return 3;
  if (percent >= 3.5) return 4;
  return 5;
}
