"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const engine_1 = __importDefault(require("./engine"));
const pokedex_adapter_1 = require("./adapters/pokedex-adapter");
const engine = new engine_1.default({ seed: 123, deterministicTies: true });
// Example: use the adapter with a tiny embedded dex + team data
const externalDex = {
    species: {
        eevee: { id: "eevee", name: "Eevee", types: ["Normal"], baseStats: { hp: 90, atk: 55, def: 50, spa: 45, spd: 65, spe: 55 }, moves: ["tackle", "quick-attack"] },
        charmander: { id: "charmander", name: "Charmander", types: ["Fire"], baseStats: { hp: 88, atk: 52, def: 43, spa: 60, spd: 50, spe: 65 }, moves: ["ember", "tackle"] },
    },
    moves: {
        tackle: { id: "tackle", name: "Tackle", type: "Normal", category: "Physical", basePower: 40 },
        "quick-attack": { id: "quick-attack", name: "Quick Attack", type: "Normal", category: "Physical", basePower: 40, priority: 1 },
        ember: { id: "ember", name: "Ember", type: "Fire", category: "Special", basePower: 40 },
    },
};
const team1 = { playerId: "p1", name: "Player 1", party: [{ speciesId: "eevee", moves: ["quick-attack", "tackle"], level: 50 }] };
const team2 = { playerId: "p2", name: "Player 2", party: [{ speciesId: "charmander", moves: ["ember", "tackle"], level: 50 }] };
const players = (0, pokedex_adapter_1.mapMatchToPlayers)([team1, team2], externalDex);
engine.initializeBattle(players, { seed: 123 });
// Register a simple burn tick via onStatusTick
engine.onStatusTick((pokemon, status, _state, log) => {
    if (status === "burn") {
        const dmg = Math.max(1, Math.floor(pokemon.maxHP / 16));
        pokemon.currentHP = Math.max(0, pokemon.currentHP - dmg);
        log(`${pokemon.name} is hurt by its burn! (${dmg})`);
    }
});
// Turn 1: Eevee uses Quick Attack, Charmander uses Ember
const eevee = players[0].team[players[0].activeIndex];
const charmander = players[1].team[players[1].activeIndex];
const turn1 = [
    {
        type: "move",
        actorPlayerId: "p1",
        pokemonId: eevee.id,
        moveId: eevee.moves[1].id, // Quick Attack
        targetPlayerId: "p2",
        targetPokemonId: charmander.id,
    },
    {
        type: "move",
        actorPlayerId: "p2",
        pokemonId: charmander.id,
        moveId: charmander.moves[0].id, // Ember
        targetPlayerId: "p1",
        targetPokemonId: eevee.id,
    },
];
const res1 = engine.processTurn(turn1);
console.log(`Turn ${res1.state.turn} events:`);
for (const e of res1.events)
    console.log(" -", e);
if (res1.anim?.length) {
    console.log(`Turn ${res1.state.turn} anim:`);
    for (const a of res1.anim)
        console.log(" *", a.type, a.payload ?? {});
}
// Turn 2: both use Tackle
const turn2 = [
    {
        type: "move",
        actorPlayerId: "p1",
        pokemonId: eevee.id,
        moveId: eevee.moves[0].id, // Tackle
        targetPlayerId: "p2",
        targetPokemonId: charmander.id,
    },
    {
        type: "move",
        actorPlayerId: "p2",
        pokemonId: charmander.id,
        moveId: charmander.moves[1].id, // Tackle
        targetPlayerId: "p1",
        targetPokemonId: eevee.id,
    },
];
const res2 = engine.processTurn(turn2);
console.log(`\nTurn ${res2.state.turn} events:`);
for (const e of res2.events)
    console.log(" -", e);
if (res2.anim?.length) {
    console.log(`Turn ${res2.state.turn} anim:`);
    for (const a of res2.anim)
        console.log(" *", a.type, a.payload ?? {});
}
//# sourceMappingURL=demo.js.map