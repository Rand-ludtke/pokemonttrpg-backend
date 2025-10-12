"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertShowdownAbilities = convertShowdownAbilities;
exports.convertShowdownItems = convertShowdownItems;
// Normalize ID formats: showdown uses id, with/without dashes/underscores; map to lowercase with dashes
const norm = (s) => (s || "").toLowerCase().replace(/\s+/g, "").replace(/[_ ]/g, "").replace(/[^a-z0-9]/g, "");
// Curated ability behaviors we can implement in this engine
const abilityImpls = {
    intimidate: {
        onSwitchIn: (pokemon, state, log) => {
            const foeSide = state.players.find((p) => !p.team.some((m) => m.id === pokemon.id));
            if (!foeSide)
                return;
            const foe = foeSide.team[foeSide.activeIndex];
            foe.stages.atk = Math.max(-6, Math.min(6, (foe.stages.atk ?? 0) - 1));
            log(`${foe.name}'s Attack fell due to Intimidate!`);
        },
    },
    sturdy: {},
    levitate: {},
    noguard: { id: "no_guard", name: "No Guard" },
    swiftswim: { id: "swift_swim", name: "Swift Swim" },
    chlorophyll: {},
    blaze: {},
    torrent: {},
    overgrow: {},
    guts: {},
    hugepower: { onModifyAtk: (p, atk, cat) => (cat === "Physical" ? atk * 2 : atk) },
};
function convertShowdownAbilities(raw) {
    const out = {};
    for (const [key, val] of Object.entries(raw || {})) {
        const id = norm(key);
        const name = val?.name || val?.id || key;
        const base = {
            id,
            name,
        };
        const impl = abilityImpls[id];
        out[id] = { ...base, ...(impl || {}) };
    }
    return out;
}
const itemImpls = {
    leftovers: {
        onEndOfTurn: (pokemon, _state, log) => {
            if (pokemon.currentHP <= 0)
                return;
            const heal = Math.max(1, Math.floor(pokemon.maxHP / 16));
            const before = pokemon.currentHP;
            pokemon.currentHP = Math.min(pokemon.maxHP, pokemon.currentHP + heal);
            const delta = pokemon.currentHP - before;
            if (delta > 0)
                log(`${pokemon.name} restored ${delta} HP with Leftovers.`);
        },
    },
    lifeorb: {
        onModifyDamage: (_pokemon, damage) => Math.floor(damage * 1.3),
        onEndOfTurn: (pokemon, _state, log) => {
            if (pokemon.currentHP <= 0)
                return;
            const recoil = Math.max(1, Math.floor(pokemon.maxHP / 10));
            const before = pokemon.currentHP;
            pokemon.currentHP = Math.max(0, pokemon.currentHP - recoil);
            const delta = before - pokemon.currentHP;
            if (delta > 0)
                log(`${pokemon.name} is hurt by Life Orb! (-${delta})`);
        },
    },
    choiceband: { onModifyAtk: (p, atk, cat) => (cat === "Physical" ? Math.floor(atk * 1.5) : atk) },
    choicespecs: { onModifyAtk: (p, atk, cat) => (cat === "Special" ? Math.floor(atk * 1.5) : atk) },
    choicescarf: { onModifySpeed: (_p, speed) => Math.floor(speed * 1.5) },
    focussash: {},
};
function convertShowdownItems(raw) {
    const out = {};
    for (const [key, val] of Object.entries(raw || {})) {
        const id = norm(key);
        const name = val?.name || val?.id || key;
        const base = {
            id,
            name,
        };
        const impl = itemImpls[id];
        out[id] = { ...base, ...(impl || {}) };
    }
    return out;
}
//# sourceMappingURL=showdown-converter.js.map