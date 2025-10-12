import { Ability } from "../abilities";
import { Item } from "../items";

// Normalize ID formats: showdown uses id, with/without dashes/underscores; map to lowercase with dashes
const norm = (s: string) => (s || "").toLowerCase().replace(/\s+/g, "").replace(/[_ ]/g, "").replace(/[^a-z0-9]/g, "");

// Curated ability behaviors we can implement in this engine
const abilityImpls: Record<string, Partial<Ability>> = {
  intimidate: {
    onSwitchIn: (pokemon, state, log) => {
      const foeSide = state.players.find((p) => !p.team.some((m) => m.id === pokemon.id));
      if (!foeSide) return;
      const foe = foeSide.team[foeSide.activeIndex];
      foe.stages.atk = Math.max(-6, Math.min(6, (foe.stages.atk ?? 0) - 1));
      log(`${foe.name}'s Attack fell due to Intimidate!`);
    },
  },
  sturdy: { },
  levitate: { },
  noguard: { id: "no_guard", name: "No Guard" },
  swiftswim: { id: "swift_swim", name: "Swift Swim" },
  chlorophyll: { },
  blaze: { },
  torrent: { },
  overgrow: { },
  guts: { },
  hugepower: { onModifyAtk: (p, atk, cat) => (cat === "Physical" ? atk * 2 : atk) },
};

export function convertShowdownAbilities(raw: Record<string, any>): Record<string, Ability> {
  const out: Record<string, Ability> = {};
  for (const [key, val] of Object.entries(raw || {})) {
    const id = norm(key);
    const name = val?.name || val?.id || key;
    const base: Ability = {
      id,
      name,
    } as Ability;
    const impl = abilityImpls[id];
    out[id] = { ...base, ...(impl || {}) } as Ability;
  }
  return out;
}

const itemImpls: Record<string, Partial<Item>> = {
  leftovers: {
    onEndOfTurn: (pokemon, _state, log) => {
      if (pokemon.currentHP <= 0) return;
      const heal = Math.max(1, Math.floor(pokemon.maxHP / 16));
      const before = pokemon.currentHP;
      pokemon.currentHP = Math.min(pokemon.maxHP, pokemon.currentHP + heal);
      const delta = pokemon.currentHP - before;
      if (delta > 0) log(`${pokemon.name} restored ${delta} HP with Leftovers.`);
    },
  },
  lifeorb: {
    onModifyDamage: (_pokemon, damage) => Math.floor(damage * 1.3),
    onEndOfTurn: (pokemon, _state, log) => {
      if (pokemon.currentHP <= 0) return;
      const recoil = Math.max(1, Math.floor(pokemon.maxHP / 10));
      const before = pokemon.currentHP;
      pokemon.currentHP = Math.max(0, pokemon.currentHP - recoil);
      const delta = before - pokemon.currentHP;
      if (delta > 0) log(`${pokemon.name} is hurt by Life Orb! (-${delta})`);
    },
  },
  choiceband: { onModifyAtk: (p, atk, cat) => (cat === "Physical" ? Math.floor(atk * 1.5) : atk) },
  choicespecs: { onModifyAtk: (p, atk, cat) => (cat === "Special" ? Math.floor(atk * 1.5) : atk) },
  choicescarf: { onModifySpeed: (_p, speed) => Math.floor(speed * 1.5) },
  focussash: {},
};

export function convertShowdownItems(raw: Record<string, any>): Record<string, Item> {
  const out: Record<string, Item> = {};
  for (const [key, val] of Object.entries(raw || {})) {
    const id = norm(key);
    const name = val?.name || val?.id || key;
    const base: Item = {
      id,
      name,
    } as Item;
    const impl = itemImpls[id];
    out[id] = { ...base, ...(impl || {}) } as Item;
  }
  return out;
}
