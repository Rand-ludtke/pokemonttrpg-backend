"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapAnimationEventToEssentials = mapAnimationEventToEssentials;
// Very rough starter mapping to Pokémon Essentials-style animation keys.
// Frontend can use this to choose which animation to play.
function mapAnimationEventToEssentials(ev) {
    switch (ev.type) {
        case "move:start": {
            const moveId = ev.payload?.moveId;
            if (!moveId)
                return { key: "Moves/Unknown" };
            // Title-case common IDs and map to a folder namespace
            const name = moveId.replace(/(^|[-_\s])([a-z])/g, (_, s, c) => s + c.toUpperCase());
            return { key: `Moves/${name}`, params: { userId: ev.payload?.userId } };
        }
        case "move:hit":
            return { key: "Hit/Default", params: { targetId: ev.payload?.targetId, damage: ev.payload?.damage } };
        case "pokemon:faint":
            return { key: "Pokemon/Faint", params: { pokemonId: ev.payload?.pokemonId } };
        case "switch":
            return { key: "Pokemon/SendOut", params: { playerId: ev.payload?.playerId, pokemonId: ev.payload?.pokemonId } };
        case "weather:sandstorm:tick":
            return { key: "Weather/SandstormTick", params: { pokemonId: ev.payload?.pokemonId, damage: ev.payload?.damage } };
        case "weather:sandstorm:start":
            return { key: "Weather/SandstormStart" };
        case "weather:sandstorm:end":
            return { key: "Weather/SandstormEnd" };
        case "terrain:grassy:heal":
            return { key: "Terrain/GrassyHeal", params: { pokemonId: ev.payload?.pokemonId, heal: ev.payload?.heal } };
        case "terrain:grassy:start":
            return { key: "Terrain/GrassyStart" };
        case "terrain:grassy:end":
            return { key: "Terrain/GrassyEnd" };
        case "survive:focus-sash":
            return { key: "Items/FocusSash", params: { pokemonId: ev.payload?.pokemonId } };
        case "survive:sturdy":
            return { key: "Abilities/Sturdy", params: { pokemonId: ev.payload?.pokemonId } };
        default:
            return null;
    }
}
//# sourceMappingURL=essentials-map.js.map