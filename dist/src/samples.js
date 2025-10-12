"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.samplePlayers = exports.sampleMon = exports.defaultStats = exports.BURN_STATUS = exports.GRASSY_TERRAIN_MOVE = exports.SANDSTORM_MOVE = exports.EMBER = exports.QUICK_ATTACK = exports.TACKLE = void 0;
// Simple sample dataset
exports.TACKLE = {
    id: "tackle",
    name: "Tackle",
    type: "Normal",
    category: "Physical",
    power: 40,
};
exports.QUICK_ATTACK = {
    id: "quick-attack",
    name: "Quick Attack",
    type: "Normal",
    category: "Physical",
    power: 40,
    priority: 1,
};
exports.EMBER = {
    id: "ember",
    name: "Ember",
    type: "Fire",
    category: "Special",
    power: 40,
};
exports.SANDSTORM_MOVE = {
    id: "sandstorm",
    name: "Sandstorm",
    type: "Rock",
    category: "Status",
    onUse: ({ state, log, utils }) => {
        state.field.weather = { id: "sandstorm", turnsLeft: Math.max(1, (state.field.weather.turnsLeft || 0)) + 5 };
        log(`A sandstorm kicked up!`);
        utils.emitAnim?.({ type: "weather:sandstorm:start", payload: {} });
    },
};
exports.GRASSY_TERRAIN_MOVE = {
    id: "grassy-terrain",
    name: "Grassy Terrain",
    type: "Grass",
    category: "Status",
    onUse: ({ state, log, utils }) => {
        state.field.terrain = { id: "grassy", turnsLeft: Math.max(1, (state.field.terrain.turnsLeft || 0)) + 5 };
        log(`The battlefield got covered in grass!`);
        utils.emitAnim?.({ type: "terrain:grassy:start", payload: {} });
    },
};
exports.BURN_STATUS = {
    id: "burn",
    name: "Burn",
    onAttackStatMultiplier: () => 0.5, // handled elsewhere too, sample only
    onEndOfTurn: (pokemon, _state, log) => {
        const dmg = Math.max(1, Math.floor(pokemon.maxHP / 16));
        pokemon.currentHP = Math.max(0, pokemon.currentHP - dmg);
        log(`${pokemon.name} is hurt by its burn! (${dmg})`);
    },
};
const defaultStats = (overrides = {}) => ({
    hp: 100,
    atk: 50,
    def: 50,
    spa: 50,
    spd: 50,
    spe: 50,
    ...overrides,
});
exports.defaultStats = defaultStats;
const sampleMon = (id, name, types, stats, moves) => ({
    id,
    name,
    level: 50,
    types,
    baseStats: stats,
    currentHP: stats.hp,
    maxHP: stats.hp,
    stages: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 },
    status: "none",
    volatile: {},
    moves,
});
exports.sampleMon = sampleMon;
const samplePlayers = () => {
    const p1mon = (0, exports.sampleMon)("p1-1", "Eevee", ["Normal"], (0, exports.defaultStats)({ atk: 55, spe: 55, hp: 90 }), [
        exports.TACKLE,
        exports.QUICK_ATTACK,
    ]);
    const p2mon = (0, exports.sampleMon)("p2-1", "Charmander", ["Fire"], (0, exports.defaultStats)({ spa: 65, spe: 65, hp: 88 }), [
        exports.EMBER,
        exports.TACKLE,
    ]);
    const p1 = { id: "p1", name: "Player 1", team: [p1mon], activeIndex: 0 };
    const p2 = { id: "p2", name: "Player 2", team: [p2mon], activeIndex: 0 };
    return [p1, p2];
};
exports.samplePlayers = samplePlayers;
//# sourceMappingURL=samples.js.map