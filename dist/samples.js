"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.samplePlayers = exports.sampleMon = exports.defaultStats = exports.BURN_STATUS = exports.LIGHT_SCREEN = exports.REFLECT = exports.TAILWIND = exports.TORMENT = exports.DISABLE = exports.WILL_O_WISP = exports.SUBSTITUTE = exports.RECOVER = exports.ENCORE = exports.TAUNT = exports.MAGNET_RISE = exports.WONDER_ROOM = exports.MAGIC_ROOM = exports.TRICK_ROOM = exports.CALM_MIND = exports.NASTY_PLOT = exports.SWORDS_DANCE = exports.ROCK_THROW = exports.VOLT_SWITCH = exports.U_TURN = exports.DEFOG = exports.RAPID_SPIN = exports.STICKY_WEB = exports.TOXIC_SPIKES = exports.SPIKES = exports.STEALTH_ROCK = exports.PROTECT = exports.GRASSY_TERRAIN_MOVE = exports.SNOWSCAPE = exports.SUNNY_DAY = exports.RAIN_DANCE = exports.SANDSTORM_MOVE = exports.HYDRO_STEAM = exports.SOLAR_BEAM = exports.WEATHER_BALL = exports.EARTHQUAKE = exports.HURRICANE = exports.THUNDER = exports.THUNDERSHOCK = exports.WATER_GUN = exports.EMBER = exports.QUICK_ATTACK = exports.TACKLE = void 0;
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
exports.WATER_GUN = {
    id: "watergun",
    name: "Water Gun",
    type: "Water",
    category: "Special",
    power: 40,
};
exports.THUNDERSHOCK = {
    id: "thundershock",
    name: "Thundershock",
    type: "Electric",
    category: "Special",
    power: 40,
};
exports.THUNDER = {
    id: "thunder",
    name: "Thunder",
    type: "Electric",
    category: "Special",
    power: 110,
    accuracy: 70,
};
exports.HURRICANE = {
    id: "hurricane",
    name: "Hurricane",
    type: "Flying",
    category: "Special",
    power: 110,
    accuracy: 70,
};
exports.EARTHQUAKE = {
    id: "earthquake",
    name: "Earthquake",
    type: "Ground",
    category: "Physical",
    power: 100,
    accuracy: 100,
};
// Weather Ball: changes type with weather and doubles power in weather
// Note: Engine applies move-specific handling for Weather Ball so we keep base definition simple here
exports.WEATHER_BALL = {
    id: "weather_ball",
    name: "Weather Ball",
    type: "Normal",
    category: "Special",
    power: 50,
    accuracy: 100,
};
// Solar Beam: two-turn normally, but we simplify to a single turn and just apply the rain/sand/hail power penalty (and ignore sun's no-charge effect)
exports.SOLAR_BEAM = {
    id: "solar_beam",
    name: "Solar Beam",
    type: "Grass",
    category: "Special",
    power: 120,
    accuracy: 100,
};
// Hydro Steam: Water move that is boosted by sun instead of reduced; implemented via engine special-case in damage mods
exports.HYDRO_STEAM = {
    id: "hydro_steam",
    name: "Hydro Steam",
    type: "Water",
    category: "Special",
    power: 80,
    accuracy: 100,
};
exports.SANDSTORM_MOVE = {
    id: "sandstorm",
    name: "Sandstorm",
    type: "Rock",
    category: "Status",
    onUse: ({ state, log, utils }) => {
        // Set/refresh to 5 turns, extend to 8 with Smooth Rock
        const user = (state.players[0].team.concat(state.players[1].team)).find(m => m.id); // not ideal; context doesn't pass user here in sample signature, so we keep 5
        state.field.weather = { id: "sandstorm", turnsLeft: Math.max(1, (state.field.weather.turnsLeft || 0)) + 5 };
        log(`A sandstorm kicked up!`);
        utils.emitAnim?.({ type: "weather:sandstorm:start", payload: {} });
    },
};
exports.RAIN_DANCE = {
    id: "raindance",
    name: "Rain Dance",
    type: "Water",
    category: "Status",
    onUse: ({ state, user, log, utils }) => {
        let turns = 5;
        const item = (user.item ?? "").toLowerCase();
        if (["damp_rock", "damprock", "damp-rock"].includes(item))
            turns = 8;
        state.field.weather = { id: "rain", turnsLeft: Math.max(1, (state.field.weather.turnsLeft || 0)) + turns };
        log(`It started to rain!`);
        utils.emitAnim?.({ type: "weather:rain:start", payload: {} });
    },
};
exports.SUNNY_DAY = {
    id: "sunnyday",
    name: "Sunny Day",
    type: "Fire",
    category: "Status",
    onUse: ({ state, user, log, utils }) => {
        let turns = 5;
        const item = (user.item ?? "").toLowerCase();
        if (["heat_rock", "heatrock", "heat-rock"].includes(item))
            turns = 8;
        state.field.weather = { id: "sun", turnsLeft: Math.max(1, (state.field.weather.turnsLeft || 0)) + turns };
        log(`The sunlight turned harsh!`);
        utils.emitAnim?.({ type: "weather:sun:start", payload: {} });
    },
};
exports.SNOWSCAPE = {
    id: "snowscape",
    name: "Snowscape",
    type: "Ice",
    category: "Status",
    onUse: ({ state, user, log, utils }) => {
        let turns = 5;
        const item = (user.item ?? "").toLowerCase();
        if (["icy_rock", "icyrock", "icy-rock"].includes(item))
            turns = 8;
        state.field.weather = { id: "snow", turnsLeft: Math.max(1, (state.field.weather.turnsLeft || 0)) + turns };
        log(`It started to snow!`);
        utils.emitAnim?.({ type: "weather:snow:start", payload: {} });
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
exports.PROTECT = {
    id: "protect",
    name: "Protect",
    type: "Normal",
    category: "Status",
    onUse: ({ user, log, utils }) => {
        // Consecutive-use success decay: 100%, 33%, 11%, 3%, ...
        user.volatile = user.volatile || {};
        const chain = Math.max(0, (user.volatile.protectChain ?? 0));
        const chances = [1, 1 / 3, 1 / 9, 1 / 27];
        const p = chain < chances.length ? chances[chain] : Math.max(0.01, chances[chances.length - 1] / Math.pow(3, chain - (chances.length - 1)));
        if (utils.rng() <= p) {
            user.volatile.protect = true;
            user.volatile.protectChain = chain + 1;
            log(`${user.name} braced itself!`);
            utils.emitAnim?.({ type: "move:status", payload: { userId: user.id, moveId: "protect" } });
        }
        else {
            // Failed Protect resets the chain
            user.volatile.protect = false;
            user.volatile.protectChain = 0;
            log(`${user.name} failed to Protect!`);
        }
    },
};
exports.STEALTH_ROCK = {
    id: "stealth-rock",
    name: "Stealth Rock",
    type: "Rock",
    category: "Status",
    onUse: ({ state, target, log, utils }) => {
        // Set hazard on target's side
        const side = state.players.find(p => p.team.some(m => m.id === target.id));
        if (!side)
            return;
        side.sideHazards = side.sideHazards || {};
        side.sideHazards.stealthRock = true;
        log(`Pointed stones float in the air around the opposing team!`);
        utils.emitAnim?.({ type: "hazard:stealth-rock:set", payload: {} });
    },
};
exports.SPIKES = {
    id: "spikes",
    name: "Spikes",
    type: "Ground",
    category: "Status",
    onUse: ({ state, target, log, utils }) => {
        const side = state.players.find(p => p.team.some(m => m.id === target.id));
        if (!side)
            return;
        side.sideHazards = side.sideHazards || {};
        side.sideHazards.spikesLayers = Math.max(1, Math.min(3, (side.sideHazards.spikesLayers ?? 0) + 1));
        log(`Spikes were scattered all around the opposing team's feet!`);
        utils.emitAnim?.({ type: "hazard:spikes:set", payload: { layers: side.sideHazards.spikesLayers } });
    },
};
exports.TOXIC_SPIKES = {
    id: "toxic-spikes",
    name: "Toxic Spikes",
    type: "Poison",
    category: "Status",
    onUse: ({ state, target, log, utils }) => {
        const side = state.players.find(p => p.team.some(m => m.id === target.id));
        if (!side)
            return;
        side.sideHazards = side.sideHazards || {};
        side.sideHazards.toxicSpikesLayers = Math.max(1, Math.min(2, (side.sideHazards.toxicSpikesLayers ?? 0) + 1));
        log(`Poison spikes were scattered all around the opposing team's feet!`);
        utils.emitAnim?.({ type: "hazard:toxicspikes:set", payload: { layers: side.sideHazards.toxicSpikesLayers } });
    },
};
exports.STICKY_WEB = {
    id: "sticky-web",
    name: "Sticky Web",
    type: "Bug",
    category: "Status",
    onUse: ({ state, target, log, utils }) => {
        const side = state.players.find(p => p.team.some(m => m.id === target.id));
        if (!side)
            return;
        side.sideHazards = side.sideHazards || {};
        side.sideHazards.stickyWeb = true;
        log(`A sticky web was laid out under the opposing team!`);
        utils.emitAnim?.({ type: "hazard:stickyweb:set", payload: {} });
    },
};
exports.RAPID_SPIN = {
    id: "rapid-spin",
    name: "Rapid Spin",
    type: "Normal",
    category: "Status",
    onUse: ({ state, user, log, utils }) => {
        const side = state.players.find(p => p.team.some(m => m.id === user.id));
        if (!side)
            return;
        if (side.sideHazards) {
            side.sideHazards.stealthRock = false;
            side.sideHazards.spikesLayers = 0;
            side.sideHazards.toxicSpikesLayers = 0;
            side.sideHazards.stickyWeb = false;
        }
        log(`${user.name} blew away the hazards with Rapid Spin!`);
        utils.emitAnim?.({ type: "hazard:clear", payload: { side: "self" } });
    },
};
exports.DEFOG = {
    id: "defog",
    name: "Defog",
    type: "Flying",
    category: "Status",
    onUse: ({ state, log, utils }) => {
        for (const side of state.players) {
            if (!side.sideHazards)
                continue;
            side.sideHazards.stealthRock = false;
            side.sideHazards.spikesLayers = 0;
            side.sideHazards.toxicSpikesLayers = 0;
            side.sideHazards.stickyWeb = false;
        }
        log(`The battlefield was cleared of hazards!`);
        utils.emitAnim?.({ type: "hazard:clear", payload: { side: "both" } });
    },
};
exports.U_TURN = {
    id: "u-turn",
    name: "U-turn",
    type: "Bug",
    category: "Physical",
    power: 70,
    accuracy: 100,
    switchesUserOut: true,
};
exports.VOLT_SWITCH = {
    id: "voltswitch",
    name: "Volt Switch",
    type: "Electric",
    category: "Special",
    power: 70,
    accuracy: 100,
    switchesUserOut: true,
};
exports.ROCK_THROW = {
    id: "rockthrow",
    name: "Rock Throw",
    type: "Rock",
    category: "Physical",
    power: 50,
    accuracy: 90,
};
exports.SWORDS_DANCE = {
    id: "swordsdance",
    name: "Swords Dance",
    type: "Normal",
    category: "Status",
    onUse: ({ user, log, utils }) => {
        utils.modifyStatStages(user, { atk: 2 });
        log(`${user.name}'s Attack sharply rose!`);
        utils.emitAnim?.({ type: "stat:atk:up2", payload: { pokemonId: user.id } });
    },
};
exports.NASTY_PLOT = {
    id: "nastyplot",
    name: "Nasty Plot",
    type: "Dark",
    category: "Status",
    onUse: ({ user, log, utils }) => {
        utils.modifyStatStages(user, { spa: 2 });
        log(`${user.name}'s Sp. Atk sharply rose!`);
        utils.emitAnim?.({ type: "stat:spa:up2", payload: { pokemonId: user.id } });
    },
};
exports.CALM_MIND = {
    id: "calmmind",
    name: "Calm Mind",
    type: "Psychic",
    category: "Status",
    onUse: ({ user, log, utils }) => {
        utils.modifyStatStages(user, { spa: 1, spd: 1 });
        log(`${user.name}'s Sp. Atk and Sp. Def rose!`);
        utils.emitAnim?.({ type: "stat:spa_spd:up1", payload: { pokemonId: user.id } });
    },
};
exports.TRICK_ROOM = {
    id: "trick-room",
    name: "Trick Room",
    type: "Psychic",
    category: "Status",
    priority: -7,
    onUse: ({ state, log, utils }) => {
        const active = state.field.room.id === "trick_room";
        if (active) {
            state.field.room.turnsLeft = 0;
            state.field.room.id = "none";
            log(`The twisted dimensions returned to normal!`);
            utils.emitAnim?.({ type: "room:trick_room:end", payload: {} });
            return;
        }
        state.field.room.id = "trick_room";
        // Standard duration 5 turns
        state.field.room.turnsLeft = 5;
        log(`Trick Room twisted the dimensions!`);
        utils.emitAnim?.({ type: "room:trick_room:start", payload: {} });
    },
};
exports.MAGIC_ROOM = {
    id: "magic-room",
    name: "Magic Room",
    type: "Psychic",
    category: "Status",
    priority: -7,
    onUse: ({ state, log, utils }) => {
        const active = state.field.magicRoom.id === "magic_room";
        if (active) {
            state.field.magicRoom.turnsLeft = 0;
            state.field.magicRoom.id = "none";
            log(`Magic Room's strange space faded! Items work again.`);
            utils.emitAnim?.({ type: "room:magic_room:end", payload: {} });
            return;
        }
        state.field.magicRoom.id = "magic_room";
        state.field.magicRoom.turnsLeft = 5;
        log(`Magic Room created a bizarre area where items lose their effects!`);
        utils.emitAnim?.({ type: "room:magic_room:start", payload: {} });
    }
};
exports.WONDER_ROOM = {
    id: "wonder-room",
    name: "Wonder Room",
    type: "Psychic",
    category: "Status",
    priority: -7,
    onUse: ({ state, log, utils }) => {
        const active = state.field.wonderRoom.id === "wonder_room";
        if (active) {
            state.field.wonderRoom.turnsLeft = 0;
            state.field.wonderRoom.id = "none";
            log(`Wonder Room's bizarre area disappeared!`);
            utils.emitAnim?.({ type: "room:wonder_room:end", payload: {} });
            return;
        }
        state.field.wonderRoom.id = "wonder_room";
        state.field.wonderRoom.turnsLeft = 5;
        log(`Wonder Room created a bizarre area where defenses are swapped!`);
        utils.emitAnim?.({ type: "room:wonder_room:start", payload: {} });
    }
};
exports.MAGNET_RISE = {
    id: "magnetrise",
    name: "Magnet Rise",
    type: "Electric",
    category: "Status",
    onUse: ({ user, log, utils }) => {
        user.volatile = user.volatile || {};
        // Set to exactly 5 turns (refresh if used again while active)
        user.volatile.magnetRiseTurns = 5;
        log(`${user.name} levitated with electromagnetism!`);
        utils.emitAnim?.({ type: "status:magnetrise:start", payload: { pokemonId: user.id } });
    },
};
exports.TAUNT = {
    id: "taunt",
    name: "Taunt",
    type: "Dark",
    category: "Status",
    onUse: ({ target, log, utils }) => {
        target.volatile = target.volatile || {};
        // Refresh to 3 turns (decremented at end of each turn)
        target.volatile.tauntTurns = 3;
        log(`${target.name} fell for the Taunt!`);
        utils.emitAnim?.({ type: "status:taunt:start", payload: { pokemonId: target.id } });
    },
};
exports.ENCORE = {
    id: "encore",
    name: "Encore",
    type: "Normal",
    category: "Status",
    onUse: ({ target, log, utils }) => {
        target.volatile = target.volatile || {};
        const last = target.volatile.lastMoveId;
        if (!last) {
            log(`${target.name} has nothing to encore!`);
            return;
        }
        target.volatile.encoreMoveId = last;
        target.volatile.encoreTurns = 3;
        log(`${target.name} received an Encore!`);
        utils.emitAnim?.({ type: "status:encore:start", payload: { pokemonId: target.id, moveId: last } });
    },
};
exports.RECOVER = {
    id: "recover",
    name: "Recover",
    type: "Normal",
    category: "Status",
    onUse: ({ user, log, utils }) => {
        const amount = Math.floor(user.maxHP / 2);
        const healed = utils.heal(user, amount);
        if (healed > 0) {
            log(`${user.name} recovered health! (+${healed})`);
        }
        else {
            log(`${user.name}'s HP is full!`);
        }
    },
};
exports.SUBSTITUTE = {
    id: "substitute",
    name: "Substitute",
    type: "Normal",
    category: "Status",
    onUse: ({ user, log, utils }) => {
        user.volatile = user.volatile || {};
        if ((user.volatile.substituteHP ?? 0) > 0) {
            log(`${user.name} already has a substitute!`);
            return;
        }
        const cost = Math.max(1, Math.floor(user.maxHP / 4));
        if (user.currentHP <= cost) {
            log(`${user.name} doesn't have enough HP to make a substitute!`);
            return;
        }
        const dealt = utils.dealDamage(user, cost);
        user.volatile.substituteHP = cost;
        log(`${user.name} put up a substitute! (-${dealt})`);
        utils.emitAnim?.({ type: "substitute:start", payload: { pokemonId: user.id, hp: cost } });
    },
};
exports.WILL_O_WISP = {
    id: "willowisp",
    name: "Will-O-Wisp",
    type: "Fire",
    category: "Status",
    onUse: ({ target, utils }) => {
        utils.applyStatus(target, "burn");
    },
};
exports.DISABLE = {
    id: "disable",
    name: "Disable",
    type: "Normal",
    category: "Status",
    onUse: ({ target, log, utils }) => {
        target.volatile = target.volatile || {};
        const last = target.lastMoveId || target.volatile.lastMoveId;
        if (!last) {
            log(`${target.name} has nothing to disable!`);
            return;
        }
        target.volatile.disabledMoveId = last;
        target.volatile.disabledTurns = 3;
        log(`${target.name}'s ${last} was disabled!`);
        utils.emitAnim?.({ type: "status:disable:start", payload: { pokemonId: target.id, moveId: last } });
    },
};
exports.TORMENT = {
    id: "torment",
    name: "Torment",
    type: "Dark",
    category: "Status",
    onUse: ({ target, log, utils }) => {
        target.volatile = target.volatile || {};
        target.volatile.tormentTurns = 3;
        log(`${target.name} was subjected to Torment!`);
        utils.emitAnim?.({ type: "status:torment:start", payload: { pokemonId: target.id } });
    },
};
exports.TAILWIND = {
    id: "tailwind",
    name: "Tailwind",
    type: "Flying",
    category: "Status",
    onUse: ({ state, user, log, utils }) => {
        const side = state.players.find(p => p.team.some(m => m.id === user.id));
        if (!side)
            return;
        side.sideConditions = side.sideConditions || {};
        side.sideConditions.tailwindTurns = Math.max(1, (side.sideConditions.tailwindTurns ?? 0)) + 4;
        log(`A tailwind began blowing behind ${side.name}'s team!`);
        utils.emitAnim?.({ type: "side:tailwind:start", payload: { playerId: side.id } });
    },
};
exports.REFLECT = {
    id: "reflect",
    name: "Reflect",
    type: "Psychic",
    category: "Status",
    onUse: ({ state, user, log, utils }) => {
        const side = state.players.find(p => p.team.some(m => m.id === user.id));
        if (!side)
            return;
        side.sideConditions = side.sideConditions || {};
        const hasLightClay = ["light_clay", "lightclay"].includes((user.item ?? "").toLowerCase());
        const add = hasLightClay ? 8 : 5;
        side.sideConditions.reflectTurns = Math.max(1, (side.sideConditions.reflectTurns ?? 0)) + add;
        log(`${side.name}'s team set up Reflect!`);
        utils.emitAnim?.({ type: "side:reflect:start", payload: { playerId: side.id } });
    },
};
exports.LIGHT_SCREEN = {
    id: "lightscreen",
    name: "Light Screen",
    type: "Psychic",
    category: "Status",
    onUse: ({ state, user, log, utils }) => {
        const side = state.players.find(p => p.team.some(m => m.id === user.id));
        if (!side)
            return;
        side.sideConditions = side.sideConditions || {};
        const hasLightClay = ["light_clay", "lightclay"].includes((user.item ?? "").toLowerCase());
        const add = hasLightClay ? 8 : 5;
        side.sideConditions.lightScreenTurns = Math.max(1, (side.sideConditions.lightScreenTurns ?? 0)) + add;
        log(`${side.name}'s team put up a Light Screen!`);
        utils.emitAnim?.({ type: "side:lightscreen:start", payload: { playerId: side.id } });
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