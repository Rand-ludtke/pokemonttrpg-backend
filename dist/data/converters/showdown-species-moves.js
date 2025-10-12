"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertShowdownSpecies = convertShowdownSpecies;
exports.convertShowdownMoves = convertShowdownMoves;
const pokedex_registry_1 = require("../pokedex-registry");
const norm = (s) => (s || "").toLowerCase().replace(/\s+/g, "").replace(/[_ ]/g, "").replace(/[^a-z0-9]/g, "");
function mapTypes(ts) {
    const arr = Array.isArray(ts) ? ts : ts ? [ts] : [];
    return arr.map((t) => (t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()));
}
function mapStats(bs) {
    return {
        hp: bs?.hp ?? 50,
        atk: bs?.atk ?? 50,
        def: bs?.def ?? 50,
        spa: bs?.spa ?? bs?.spA ?? 50,
        spd: bs?.spd ?? bs?.spD ?? 50,
        spe: bs?.spe ?? 50,
    };
}
function convertShowdownSpecies(raw) {
    const out = {};
    for (const [k, v] of Object.entries(raw || {})) {
        const id = norm(k);
        const name = v?.name || k;
        out[id] = {
            id,
            name,
            types: mapTypes(v?.types || v?.type),
            baseStats: mapStats(v?.baseStats || {}),
            abilities: Object.values(v?.abilities || {}).map((a) => norm(String(a))),
        };
    }
    (0, pokedex_registry_1.mergeSpecies)(out);
    return out;
}
function convertShowdownMoves(raw) {
    const out = {};
    for (const [k, v] of Object.entries(raw || {})) {
        const id = norm(k);
        const cat = String(v?.category || "Physical");
        const move = {
            id,
            name: v?.name || k,
            type: (v?.type || "Normal"),
            category: cat === "Status" ? "Status" : cat === "Special" ? "Special" : "Physical",
            power: typeof v?.basePower === "number" ? v?.basePower : undefined,
            accuracy: typeof v?.accuracy === "number" ? v?.accuracy : undefined,
            priority: v?.priority ?? 0,
            pp: typeof v?.pp === "number" ? v?.pp : undefined,
        };
        // Attach curated onUse for a few common status moves
        if (id === "protect") {
            move.onUse = ({ user, log, utils }) => {
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
                    user.volatile.protect = false;
                    user.volatile.protectChain = 0;
                    log(`${user.name} failed to Protect!`);
                }
            };
        }
        if (id === "uturn" || id === "voltswitch") {
            move.switchesUserOut = true;
        }
        if (id === "swordsdance") {
            move.onUse = ({ user, log, utils }) => {
                utils.modifyStatStages(user, { atk: 2 });
                log(`${user.name}'s Attack sharply rose!`);
                utils.emitAnim?.({ type: "stat:atk:up2", payload: { pokemonId: user.id } });
            };
        }
        if (id === "nastyplot") {
            move.onUse = ({ user, log, utils }) => {
                utils.modifyStatStages(user, { spa: 2 });
                log(`${user.name}'s Sp. Atk sharply rose!`);
                utils.emitAnim?.({ type: "stat:spa:up2", payload: { pokemonId: user.id } });
            };
        }
        if (id === "calmmind") {
            move.onUse = ({ user, log, utils }) => {
                utils.modifyStatStages(user, { spa: 1, spd: 1 });
                log(`${user.name}'s Sp. Atk and Sp. Def rose!`);
                utils.emitAnim?.({ type: "stat:spa_spd:up1", payload: { pokemonId: user.id } });
            };
        }
        if (id === "stealthrock") {
            move.onUse = ({ state, target, log, utils }) => {
                const side = state.players.find(p => p.team.some(m => m.id === target.id));
                if (!side)
                    return;
                side.sideHazards = side.sideHazards || {};
                side.sideHazards.stealthRock = true;
                log(`Pointed stones float in the air around the opposing team!`);
                utils.emitAnim?.({ type: "hazard:stealth-rock:set", payload: {} });
            };
        }
        if (id === "willowisp" || id === "willowisp") {
            move.onUse = ({ target, log, utils }) => {
                utils.applyStatus(target, "burn");
            };
        }
        if (id === "thunderwave") {
            move.onUse = ({ target, log, utils }) => {
                utils.applyStatus(target, "paralysis");
            };
        }
        if (id === "taunt") {
            move.onUse = ({ target, log, utils }) => {
                target.volatile = target.volatile || {};
                // Refresh to 3 turns instead of stacking
                target.volatile.tauntTurns = 3;
                log(`${target.name} fell for the Taunt!`);
                utils.emitAnim?.({ type: "status:taunt:start", payload: { pokemonId: target.id } });
            };
        }
        if (id === "spikes") {
            move.onUse = ({ state, target, log, utils }) => {
                const side = state.players.find(p => p.team.some(m => m.id === target.id));
                if (!side)
                    return;
                side.sideHazards = side.sideHazards || {};
                side.sideHazards.spikesLayers = Math.max(1, Math.min(3, (side.sideHazards.spikesLayers ?? 0) + 1));
                log(`Spikes were scattered all around the opposing team's feet!`);
                utils.emitAnim?.({ type: "hazard:spikes:set", payload: { layers: side.sideHazards.spikesLayers } });
            };
        }
        if (id === "toxicspikes") {
            move.onUse = ({ state, target, log, utils }) => {
                const side = state.players.find(p => p.team.some(m => m.id === target.id));
                if (!side)
                    return;
                side.sideHazards = side.sideHazards || {};
                side.sideHazards.toxicSpikesLayers = Math.max(1, Math.min(2, (side.sideHazards.toxicSpikesLayers ?? 0) + 1));
                log(`Poison spikes were scattered all around the opposing team's feet!`);
                utils.emitAnim?.({ type: "hazard:toxicspikes:set", payload: { layers: side.sideHazards.toxicSpikesLayers } });
            };
        }
        if (id === "stickyweb") {
            move.onUse = ({ state, target, log, utils }) => {
                const side = state.players.find(p => p.team.some(m => m.id === target.id));
                if (!side)
                    return;
                side.sideHazards = side.sideHazards || {};
                side.sideHazards.stickyWeb = true;
                log(`A sticky web was laid out under the opposing team!`);
                utils.emitAnim?.({ type: "hazard:stickyweb:set", payload: {} });
            };
        }
        if (id === "rapidspin") {
            move.onUse = ({ state, user, log, utils }) => {
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
            };
        }
        if (id === "defog") {
            move.onUse = ({ state, log, utils }) => {
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
            };
        }
        if (id === "tailwind") {
            move.onUse = ({ state, user, log, utils }) => {
                const side = state.players.find(p => p.team.some(m => m.id === user.id));
                if (!side)
                    return;
                side.sideConditions = side.sideConditions || {};
                side.sideConditions.tailwindTurns = Math.max(1, (side.sideConditions.tailwindTurns ?? 0)) + 4;
                log(`A tailwind began blowing behind ${side.name}'s team!`);
                utils.emitAnim?.({ type: "side:tailwind:start", payload: { playerId: side.id } });
            };
        }
        if (id === "reflect") {
            move.onUse = ({ state, user, log, utils }) => {
                const side = state.players.find(p => p.team.some(m => m.id === user.id));
                if (!side)
                    return;
                side.sideConditions = side.sideConditions || {};
                const hasLightClay = ["light_clay", "lightclay"].includes((user.item ?? "").toLowerCase());
                const add = hasLightClay ? 8 : 5;
                side.sideConditions.reflectTurns = Math.max(1, (side.sideConditions.reflectTurns ?? 0)) + add;
                log(`${side.name}'s team set up Reflect!`);
                utils.emitAnim?.({ type: "side:reflect:start", payload: { playerId: side.id } });
            };
        }
        if (id === "lightscreen") {
            move.onUse = ({ state, user, log, utils }) => {
                const side = state.players.find(p => p.team.some(m => m.id === user.id));
                if (!side)
                    return;
                side.sideConditions = side.sideConditions || {};
                const hasLightClay = ["light_clay", "lightclay"].includes((user.item ?? "").toLowerCase());
                const add = hasLightClay ? 8 : 5;
                side.sideConditions.lightScreenTurns = Math.max(1, (side.sideConditions.lightScreenTurns ?? 0)) + add;
                log(`${side.name}'s team put up a Light Screen!`);
                utils.emitAnim?.({ type: "side:lightscreen:start", payload: { playerId: side.id } });
            };
        }
        if (id === "encore") {
            move.onUse = ({ target, log, utils }) => {
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
            };
        }
        if (id === "recover") {
            move.onUse = ({ user, log, utils }) => {
                const healed = utils.heal(user, Math.floor(user.maxHP / 2));
                if (healed > 0)
                    log(`${user.name} recovered health! (+${healed})`);
                else
                    log(`${user.name}'s HP is full!`);
            };
        }
        if (id === "substitute") {
            move.onUse = ({ user, log, utils }) => {
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
            };
        }
        if (id === "disable") {
            move.onUse = ({ target, log, utils }) => {
                target.volatile = target.volatile || {};
                const last = target.volatile.lastMoveId;
                if (!last) {
                    log(`${target.name} has nothing to disable!`);
                    return;
                }
                target.volatile.disabledMoveId = last;
                target.volatile.disabledTurns = 3;
                log(`${target.name}'s ${last} was disabled!`);
                utils.emitAnim?.({ type: "status:disable:start", payload: { pokemonId: target.id, moveId: last } });
            };
        }
        if (id === "torment") {
            move.onUse = ({ target, log, utils }) => {
                target.volatile = target.volatile || {};
                target.volatile.tormentTurns = 3;
                log(`${target.name} was subjected to Torment!`);
                utils.emitAnim?.({ type: "status:torment:start", payload: { pokemonId: target.id } });
            };
        }
        out[id] = move;
    }
    return out;
}
//# sourceMappingURL=showdown-species-moves.js.map