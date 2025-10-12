"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PokedexRegistry = void 0;
exports.mergeSpecies = mergeSpecies;
exports.getSpecies = getSpecies;
exports.PokedexRegistry = {};
function mergeSpecies(map) {
    for (const [k, v] of Object.entries(map)) {
        exports.PokedexRegistry[k] = v;
    }
}
function getSpecies(id) {
    return exports.PokedexRegistry[id.toLowerCase()];
}
//# sourceMappingURL=pokedex-registry.js.map