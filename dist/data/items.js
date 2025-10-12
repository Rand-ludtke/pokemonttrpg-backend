"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Items = void 0;
exports.mergeItems = mergeItems;
exports.Items = {
    choice_band: {
        id: "choice_band",
        name: "Choice Band",
        onModifyAtk: (pokemon, atk, category) => (category === "Physical" ? Math.floor(atk * 1.5) : atk),
    },
    leftovers: {
        id: "leftovers",
        name: "Leftovers",
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
    terrain_extender: {
        id: "terrain_extender",
        name: "Terrain Extender",
        onWeatherDuration: (_id, cur) => cur, // placeholder for parity; terrain handling will use a similar hook
    },
    focus_sash: {
        id: "focus_sash",
        name: "Focus Sash",
    },
    life_orb: {
        id: "life_orb",
        name: "Life Orb",
        onModifyDamage: (_pokemon, damage) => Math.floor(damage * 1.3),
        onEndOfTurn: (pokemon, _state, log) => {
            if (pokemon.currentHP <= 0)
                return;
            // recoil 10% max HP if it attacked; simplified to always apply when holding LO
            const recoil = Math.max(1, Math.floor(pokemon.maxHP / 10));
            const before = pokemon.currentHP;
            pokemon.currentHP = Math.max(0, pokemon.currentHP - recoil);
            const delta = before - pokemon.currentHP;
            if (delta > 0)
                log(`${pokemon.name} is hurt by Life Orb! (-${delta})`);
        },
    },
    choice_scarf: {
        id: "choice_scarf",
        name: "Choice Scarf",
        onModifySpeed: (_pokemon, speed) => Math.floor(speed * 1.5),
    },
    choice_specs: {
        id: "choice_specs",
        name: "Choice Specs",
        onModifyAtk: (pokemon, atk, category) => (category === "Special" ? Math.floor(atk * 1.5) : atk),
    },
    lum_berry: {
        id: "lum_berry",
        name: "Lum Berry",
        // Clearing status would need a hook on status apply; leaving interface for later
    },
    light_clay: {
        id: "light_clay",
        name: "Light Clay",
    },
};
function mergeItems(map) {
    for (const [k, v] of Object.entries(map)) {
        exports.Items[k] = v;
    }
}
//# sourceMappingURL=items.js.map