"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Engine = void 0;
const types_1 = require("./types");
const damage_1 = require("./damage");
const abilities_1 = require("./data/abilities");
const items_1 = require("./data/items");
const type_chart_1 = require("./data/type-chart");
class Engine {
    constructor(options) {
        this.options = options;
        // Event handlers
        this.moveHandlers = [];
        this.statusTickHandlers = [];
        this.switchInHandlers = [];
    }
    initializeBattle(players, options) {
        this.state = {
            turn: 0,
            rngSeed: options?.seed ?? this.options?.seed,
            players,
            field: {
                weather: { id: "none", turnsLeft: 0 },
                terrain: { id: "none", turnsLeft: 0 },
            },
            log: [],
        };
        // Trigger switch-in handlers for initial actives
        for (const p of this.state.players) {
            const active = p.team[p.activeIndex];
            // Initialize PP store per mon
            active.volatile = active.volatile || {};
            active.volatile.pp = active.volatile.pp || {};
            this.emitSwitchIn(active);
        }
        return this.state;
    }
    // Allow the server to perform a forced switch outside of a normal turn.
    // Does not advance the turn or process end-of-turn effects.
    forceSwitch(playerId, toIndex) {
        if (!this.state)
            throw new Error("Engine not initialized");
        const events = [];
        const anim = [];
        const log = (msg) => {
            this.state.log.push(msg);
            events.push(msg);
        };
        const player = this.state.players.find((p) => p.id === playerId);
        if (!player)
            throw new Error("player not found");
        const idx = Math.max(0, Math.min(player.team.length - 1, toIndex));
        player.activeIndex = idx;
        const active = player.team[player.activeIndex];
        log(`${player.name} switched to ${active.name}!`);
        this.emitSwitchIn(active, log);
        anim.push({ type: "switch", payload: { playerId: player.id, pokemonId: active.id } });
        return { state: this.state, events, anim };
    }
    processTurn(actions) {
        if (!this.state)
            throw new Error("Engine not initialized");
        this.state.turn += 1;
        const events = [];
        const anim = [];
        // temporary binding so inner helpers can emit animations without threading a param everywhere
        this._pushAnim = (ev) => { anim.push(ev); };
        const log = (msg) => {
            this.state.log.push(msg);
            events.push(msg);
        };
        // Filter fainted actors and illegal actions
        const legalActions = actions.filter((a) => this.getPokemonById(a.pokemonId)?.currentHP > 0);
        // Sort by priority then speed
        const sorted = [...legalActions].sort((a, b) => this.compareActions(a, b));
        // Execute
        for (const action of sorted) {
            const actor = this.getPokemonById(action.pokemonId);
            if (!actor || actor.currentHP <= 0)
                continue; // fainted already
            if (action.type === "move") {
                const ma = action;
                // Encore enforcement: if actor is encored, force the selected moveId
                if ((actor.volatile?.encoreTurns ?? 0) > 0 && actor.volatile?.encoreMoveId) {
                    const forcedId = actor.volatile.encoreMoveId;
                    if (ma.moveId !== forcedId) {
                        ma.moveId = forcedId;
                    }
                }
                let move = actor.moves.find((m) => m.id === ma.moveId);
                const target = this.getPokemonById(ma.targetPokemonId);
                if (!target)
                    continue;
                actor.volatile = actor.volatile || {};
                actor.volatile.pp = actor.volatile.pp || {};
                const ppStore = actor.volatile.pp;
                // If the chosen move is missing or no PP on any move, use Struggle
                const hasAnyPP = actor.moves.some(m => (ppStore[m.id] ?? (m.pp ?? 10)) > 0);
                let usingStruggle = false;
                if (!move || !hasAnyPP) {
                    move = { id: "__struggle", name: "Struggle", type: "Normal", category: "Physical", power: 50 };
                    usingStruggle = true;
                }
                if (!move)
                    continue;
                // PP check (skip for Struggle): default 10 if not provided
                const basePP = move.pp ?? 10;
                const remaining = ppStore[move.id] ?? basePP;
                if (!usingStruggle && remaining <= 0) {
                    log(`${actor.name} has no PP left for ${move.name}!`);
                    continue;
                }
                log(`${actor.name} used ${move.name}!`);
                anim.push({ type: "move:start", payload: { userId: actor.id, moveId: move.id } });
                // Taunt: block Status-category moves while taunted (skip for Struggle)
                if (!usingStruggle && (actor.volatile?.tauntTurns ?? 0) > 0 && move.category === "Status") {
                    log(`${actor.name} can't use status moves due to Taunt!`);
                    anim.push({ type: "status:taunt:block", payload: { userId: actor.id, moveId: move.id } });
                    continue;
                }
                // Disable: if this specific move is disabled, block it (skip for Struggle)
                if (!usingStruggle && (actor.volatile?.disabledTurns ?? 0) > 0 && actor.volatile?.disabledMoveId === move.id) {
                    log(`${actor.name} can't use ${move.name} due to Disable!`);
                    anim.push({ type: "status:disable:block", payload: { userId: actor.id, moveId: move.id } });
                    continue;
                }
                // Torment: cannot use the same move twice in a row (skip for Struggle)
                if (!usingStruggle && (actor.volatile?.tormentTurns ?? 0) > 0 && (actor.volatile?.lastMoveId === move.id)) {
                    log(`${actor.name} can't use ${move.name} twice in a row due to Torment!`);
                    anim.push({ type: "status:torment:block", payload: { userId: actor.id, moveId: move.id } });
                    continue;
                }
                // Track last used move for mechanics like Encore/Disable source
                actor.volatile = actor.volatile || {};
                actor.volatile.lastMoveId = move.id;
                this.executeMove(move, actor, target, log);
                // Decrement PP only on successful execution (skip for Struggle). Pressure causes -2 per use.
                if (!usingStruggle) {
                    let dec = 1;
                    const targetHasPressure = (target.ability === "pressure");
                    if (targetHasPressure)
                        dec = 2;
                    ppStore[move.id] = Math.max(0, (ppStore[move.id] ?? basePP) - dec);
                }
                if (target.currentHP <= 0) {
                    log(`${target.name} fainted!`);
                    anim.push({ type: "pokemon:faint", payload: { pokemonId: target.id } });
                }
            }
            else if (action.type === "switch") {
                // Basic switch: change active index
                const player = this.state.players.find((p) => p.id === action.actorPlayerId);
                if (!player)
                    continue;
                // Clear substitute on the outgoing mon (substitute doesn't persist on switch)
                const outgoing = player.team[player.activeIndex];
                if (outgoing?.volatile)
                    outgoing.volatile.substituteHP = 0;
                player.activeIndex = Math.max(0, Math.min(player.team.length - 1, action.toIndex));
                const active = player.team[player.activeIndex];
                log(`${player.name} switched to ${active.name}!`);
                this.emitSwitchIn(active, log);
                anim.push({ type: "switch", payload: { playerId: player.id, pokemonId: active.id } });
            }
        }
        // End-of-turn effects (statuses, items, weather, terrain)
        for (const p of this.state.players) {
            const mon = p.team[p.activeIndex];
            if (mon.currentHP > 0)
                this.emitStatusTick(mon, mon.status, log);
            if (mon.item && items_1.Items[mon.item]?.onEndOfTurn)
                items_1.Items[mon.item].onEndOfTurn(mon, this.state, log);
            // Clear one-turn volatiles like Protect
            if (mon.volatile) {
                if (mon.volatile.protect) {
                    mon.volatile.protect = false;
                }
                else if (mon.volatile.protectChain) {
                    // If Protect wasn't used successfully this turn, reset the chain
                    mon.volatile.protectChain = 0;
                }
                // Magnet Rise duration
                if (mon.volatile.magnetRiseTurns && mon.volatile.magnetRiseTurns > 0) {
                    mon.volatile.magnetRiseTurns -= 1;
                    if (mon.volatile.magnetRiseTurns === 0) {
                        log(`${mon.name} came back down to the ground.`);
                        anim.push({ type: "status:magnetrise:end", payload: { pokemonId: mon.id } });
                    }
                }
                // Taunt duration
                if (mon.volatile.tauntTurns && mon.volatile.tauntTurns > 0) {
                    mon.volatile.tauntTurns -= 1;
                    if (mon.volatile.tauntTurns === 0) {
                        log(`${mon.name} is no longer taunted.`);
                        anim.push({ type: "status:taunt:end", payload: { pokemonId: mon.id } });
                    }
                }
                // Encore duration
                if (mon.volatile.encoreTurns && mon.volatile.encoreTurns > 0) {
                    mon.volatile.encoreTurns -= 1;
                    if (mon.volatile.encoreTurns === 0) {
                        log(`${mon.name}'s Encore ended!`);
                        anim.push({ type: "status:encore:end", payload: { pokemonId: mon.id } });
                    }
                }
                // Disable duration
                if (mon.volatile.disabledTurns && mon.volatile.disabledTurns > 0) {
                    mon.volatile.disabledTurns -= 1;
                    if (mon.volatile.disabledTurns === 0) {
                        log(`${mon.name}'s Disable wore off!`);
                        mon.volatile.disabledMoveId = undefined;
                        anim.push({ type: "status:disable:end", payload: { pokemonId: mon.id } });
                    }
                }
                // Torment duration
                if (mon.volatile.tormentTurns && mon.volatile.tormentTurns > 0) {
                    mon.volatile.tormentTurns -= 1;
                    if (mon.volatile.tormentTurns === 0) {
                        log(`${mon.name} is no longer tormented.`);
                        anim.push({ type: "status:torment:end", payload: { pokemonId: mon.id } });
                    }
                }
            }
        }
        // Weather residuals (very simplified)
        if (this.state.field.weather.id === "sandstorm") {
            for (const pl of this.state.players) {
                const mon = pl.team[pl.activeIndex];
                if (mon.currentHP <= 0)
                    continue;
                // Rock/Ground/Steel immune
                if (mon.types.some((t) => t === "Rock" || t === "Ground" || t === "Steel"))
                    continue;
                const dmg = Math.max(1, Math.floor(mon.maxHP / 16));
                mon.currentHP = Math.max(0, mon.currentHP - dmg);
                log(`${mon.name} is buffeted by the sandstorm! (${dmg})`);
                anim.push({ type: "weather:sandstorm:tick", payload: { pokemonId: mon.id, damage: dmg } });
            }
        }
        // Terrain residuals (Grassy Terrain heal simplified)
        if (this.state.field.terrain.id === "grassy") {
            for (const pl of this.state.players) {
                const mon = pl.team[pl.activeIndex];
                if (mon.currentHP <= 0)
                    continue;
                const heal = Math.max(1, Math.floor(mon.maxHP / 16));
                const before = mon.currentHP;
                mon.currentHP = Math.min(mon.maxHP, mon.currentHP + heal);
                const delta = mon.currentHP - before;
                if (delta > 0)
                    log(`${mon.name} is healed by the grassy terrain. (+${delta})`);
                if (delta > 0)
                    anim.push({ type: "terrain:grassy:heal", payload: { pokemonId: mon.id, heal: delta } });
            }
        }
        // Decrement durations with end notifications
        const prevWeather = { ...this.state.field.weather };
        const prevTerrain = { ...this.state.field.terrain };
        if (this.state.field.weather.turnsLeft > 0)
            this.state.field.weather.turnsLeft -= 1;
        if (this.state.field.terrain.turnsLeft > 0)
            this.state.field.terrain.turnsLeft -= 1;
        if (prevWeather.id !== "none" && prevWeather.turnsLeft === 1) {
            // ended now
            log(`${prevWeather.id} weather subsided.`);
            anim.push({ type: `weather:${prevWeather.id}:end`, payload: {} });
            this.state.field.weather.id = "none";
        }
        if (prevTerrain.id !== "none" && prevTerrain.turnsLeft === 1) {
            log(`The ${prevTerrain.id} terrain faded.`);
            anim.push({ type: `terrain:${prevTerrain.id}:end`, payload: {} });
            this.state.field.terrain.id = "none";
        }
        // Side conditions timers: Tailwind, Reflect, Light Screen
        for (const pl of this.state.players) {
            if (!pl.sideConditions)
                continue;
            const before = { t: pl.sideConditions.tailwindTurns ?? 0, r: pl.sideConditions.reflectTurns ?? 0, l: pl.sideConditions.lightScreenTurns ?? 0 };
            if ((pl.sideConditions.tailwindTurns ?? 0) > 0)
                pl.sideConditions.tailwindTurns--;
            if ((pl.sideConditions.reflectTurns ?? 0) > 0)
                pl.sideConditions.reflectTurns--;
            if ((pl.sideConditions.lightScreenTurns ?? 0) > 0)
                pl.sideConditions.lightScreenTurns--;
            if (before.t === 1 && (pl.sideConditions.tailwindTurns ?? 0) === 0) {
                log(`Tailwind petered out for ${pl.name}'s side.`);
                anim.push({ type: "side:tailwind:end", payload: { playerId: pl.id } });
            }
            if (before.r === 1 && (pl.sideConditions.reflectTurns ?? 0) === 0) {
                log(`Reflect wore off on ${pl.name}'s side.`);
                anim.push({ type: "side:reflect:end", payload: { playerId: pl.id } });
            }
            if (before.l === 1 && (pl.sideConditions.lightScreenTurns ?? 0) === 0) {
                log(`Light Screen wore off on ${pl.name}'s side.`);
                anim.push({ type: "side:lightscreen:end", payload: { playerId: pl.id } });
            }
        }
        const result = { state: this.state, events, anim };
        // cleanup binding
        this._pushAnim = undefined;
        return result;
    }
    // Event subscriptions
    onMoveExecute(handler) {
        this.moveHandlers.push(handler);
    }
    onStatusTick(handler) {
        this.statusTickHandlers.push(handler);
    }
    onSwitchIn(handler) {
        this.switchInHandlers.push(handler);
    }
    // Internals
    rng() {
        // Simple LCG for deterministic ties/tests if seed provided
        if (this.state.rngSeed == null)
            return Math.random();
        let seed = this.state.rngSeed;
        seed = (seed * 1664525 + 1013904223) % 0xffffffff;
        this.state.rngSeed = seed;
        return (seed & 0xfffffff) / 0xfffffff;
    }
    getPokemonById(id) {
        for (const pl of this.state.players) {
            for (const mon of pl.team)
                if (mon.id === id)
                    return mon;
        }
        return undefined;
    }
    isGrounded(p) {
        // Flying-types are not grounded
        if (p.types.includes("Flying"))
            return false;
        // Magnet Rise volatile effect
        if ((p.volatile?.magnetRiseTurns ?? 0) > 0)
            return false;
        // Air Balloon item
        const item = (p.item ?? "").toLowerCase();
        if (["air_balloon", "airballoon", "air-balloon"].includes(item))
            return false;
        return true;
    }
    compareActions(a, b) {
        // Switches generally happen before moves in Pokémon; we keep it simple: switch priority = 6
        const priorityA = a.type === "switch" ? 6 : this.actionPriority(a);
        const priorityB = b.type === "switch" ? 6 : this.actionPriority(b);
        if (priorityA !== priorityB)
            return priorityB - priorityA; // higher first
        // Speed tiebreaker
        const speA = this.actionSpeed(a);
        const speB = this.actionSpeed(b);
        if (speA !== speB)
            return speB - speA; // faster first
        // Random tie-break
        return this.rng() < 0.5 ? -1 : 1;
    }
    actionPriority(a) {
        if (a.type === "move") {
            const actor = this.getPokemonById(a.pokemonId);
            const move = actor?.moves.find((m) => m.id === a.moveId);
            return move?.priority ?? 0;
        }
        return 0;
    }
    actionSpeed(a) {
        const actor = this.getPokemonById(a.pokemonId);
        return actor ? this.getEffectiveSpeed(actor) : 0;
    }
    executeMove(move, user, target, log) {
        // broadcast to external listeners first
        for (const h of this.moveHandlers)
            h(move, user, target, this.state, log);
        // Default handling: if move has onUse, call it; otherwise do a damage calc with STAB/type chart
        if (move.onUse) {
            move.onUse({ state: this.state, user, target, move, log, utils: this.utils(log) });
        }
        else if (move.power && move.category !== "Status") {
            // Protect check (volatile flag set by move effects)
            if (target.volatile?.protect) {
                log(`${target.name} protected itself!`);
                this._pushAnim?.({ type: "move:blocked", payload: { targetId: target.id } });
                return;
            }
            // Accuracy check incl. acc/eva stages and No Guard
            if (move.accuracy != null) {
                const noGuard = (["no_guard", "noguard"].includes(user.ability ?? "")) || (["no_guard", "noguard"].includes(target.ability ?? ""));
                if (!noGuard) {
                    const accStage = user.stages.acc ?? 0;
                    const evaStage = target.stages.eva ?? 0;
                    const accMult = (0, types_1.stageMultiplier)(accStage, 3, 3);
                    const evaMult = (0, types_1.stageMultiplier)(evaStage, 3, 3);
                    let effectiveAcc = move.accuracy * (accMult / evaMult);
                    effectiveAcc = this.modifyAccuracy(user, effectiveAcc);
                    effectiveAcc = Math.max(1, Math.min(100, Math.floor(effectiveAcc)));
                    const roll = this.rng() * 100;
                    if (roll >= effectiveAcc) {
                        log(`${user.name}'s attack missed!`);
                        return;
                    }
                }
            }
            const hits = this.getMultiHit(move);
            let totalDealt = 0;
            let effectivenessSeen = null;
            let critHappened = false;
            for (let i = 0; i < hits; i++) {
                if (user.currentHP <= 0 || target.currentHP <= 0)
                    break;
                const atk = this.modifyAttack(user, this.getEffectiveAttack(user, move.category), move.category);
                const def = this.modifyDefense(target, (0, damage_1.chooseDefenseStat)(target, move.category), move.category);
                const crit = this.rollCrit(move.critRatio ?? 0);
                // Ground immunity via Levitate/Magnet Rise/Air Balloon (Flying handled by type chart)
                if (move.type === "Ground") {
                    const hasLevitate = target.ability === "levitate";
                    const hasMagnetRise = (target.volatile?.magnetRiseTurns ?? 0) > 0;
                    const hasBalloon = ["air_balloon", "airballoon", "air-balloon"].includes((target.item ?? "").toLowerCase());
                    if (hasLevitate || hasMagnetRise || hasBalloon) {
                        log(`${target.name} is unaffected by Ground moves!`);
                        effectivenessSeen = 0;
                        continue;
                    }
                }
                const { damage, effectiveness, stab } = (0, damage_1.calcDamage)(user, target, move, atk, def, { rng: () => this.rng() });
                effectivenessSeen = effectivenessSeen ?? effectiveness;
                let finalDamage = damage;
                if (crit) {
                    finalDamage = Math.floor(finalDamage * 1.5);
                    critHappened = true;
                }
                // Ability/item damage mods hooks
                finalDamage = this.modifyDamage(user, target, finalDamage);
                // Field modifiers: weather/terrain simplified + conditional ability boosts
                finalDamage = this.applyFieldDamageMods(finalDamage, move, user);
                // Side conditions: Reflect/Light Screen on the target's side (ignored on critical hits)
                const targetOwner = this.state.players.find(pl => pl.team.some(m => m.id === target.id));
                if (!crit && targetOwner?.sideConditions) {
                    if (move.category === "Physical" && (targetOwner.sideConditions.reflectTurns ?? 0) > 0) {
                        finalDamage = Math.floor(finalDamage * 0.5);
                    }
                    if (move.category === "Special" && (targetOwner.sideConditions.lightScreenTurns ?? 0) > 0) {
                        finalDamage = Math.floor(finalDamage * 0.5);
                    }
                }
                // Survival effects (Focus Sash/Sturdy)
                finalDamage = this.applySurvivalEffects(target, user, finalDamage, log);
                // Substitute redirection: if target has a substitute, damage the sub instead
                let dealt;
                if (target.volatile?.substituteHP && target.volatile.substituteHP > 0) {
                    const subHP = target.volatile.substituteHP;
                    const dmgToSub = Math.min(subHP, finalDamage);
                    target.volatile.substituteHP = subHP - dmgToSub;
                    dealt = dmgToSub;
                    this._pushAnim?.({ type: "substitute:hit", payload: { targetId: target.id, damage: dmgToSub } });
                    if (target.volatile.substituteHP === 0) {
                        log(`${target.name}'s substitute faded!`);
                        this._pushAnim?.({ type: "substitute:break", payload: { pokemonId: target.id } });
                    }
                }
                else {
                    dealt = this.utils(log).dealDamage(target, finalDamage);
                }
                if (dealt > 0)
                    this._pushAnim?.({ type: "move:hit", payload: { targetId: target.id, damage: dealt } });
                // Pop Air Balloon if present and took damage
                if (dealt > 0 && ["air_balloon", "airballoon", "air-balloon"].includes((target.item ?? "").toLowerCase())) {
                    log(`${target.name}'s Air Balloon popped!`);
                    this._pushAnim?.({ type: "item:air-balloon:pop", payload: { pokemonId: target.id } });
                    target.item = undefined;
                }
                totalDealt += dealt;
            }
            if (effectivenessSeen === 0) {
                log(`It doesn't affect ${target.name}...`);
                return;
            }
            log(`It dealt ${totalDealt} damage${hits > 1 ? ` in ${hits} hits` : ""}.`);
            if (critHappened)
                log("A critical hit!");
            if (effectivenessSeen > 1)
                log("It's super effective!");
            else if (effectivenessSeen < 1)
                log("It's not very effective...");
            // Post-damage switch for pivoting moves (U-turn / Volt Switch simplified)
            if (move.switchesUserOut) {
                const owner = this.state.players.find(pl => pl.team.some(m => m.id === user.id));
                if (owner && user.currentHP > 0) {
                    // pick first healthy bench mon different from current active
                    const currentIdx = owner.team.findIndex(m => m.id === user.id);
                    const nextIdx = owner.team.findIndex((m, idx) => idx !== currentIdx && m.currentHP > 0);
                    if (nextIdx >= 0) {
                        owner.activeIndex = nextIdx;
                        const next = owner.team[nextIdx];
                        log(`${owner.name} pivoted out to ${next.name}!`);
                        this.emitSwitchIn(next, log);
                        this._pushAnim?.({ type: "switch", payload: { playerId: owner.id, pokemonId: next.id } });
                    }
                }
            }
        }
    }
    emitStatusTick(pokemon, status, log = (m) => this.state.log.push(m)) {
        for (const h of this.statusTickHandlers)
            h(pokemon, status, this.state, log);
    }
    emitSwitchIn(pokemon, log = (m) => this.state.log.push(m)) {
        for (const h of this.switchInHandlers)
            h(pokemon, this.state, log);
        // Hazards: Stealth Rock (stored on the side the Pokémon belongs to)
        const owner = this.state.players.find(p => p.team.some(m => m.id === pokemon.id));
        // Initialize PP store
        pokemon.volatile = pokemon.volatile || {};
        pokemon.volatile.pp = pokemon.volatile.pp || {};
        // Clear substitute on switch-in (cannot persist)
        if (pokemon.volatile)
            pokemon.volatile.substituteHP = 0;
        // Heavy-Duty Boots: ignore all hazard effects (including absorption)
        const hasBoots = ["heavy-duty-boots", "heavy_duty_boots", "heavydutyboots"].includes(pokemon.item ?? "");
        if (hasBoots)
            return;
        if (owner?.sideHazards?.stealthRock) {
            const mult = (0, type_chart_1.typeEffectiveness)("Rock", pokemon.types);
            const frac = (1 / 8) * mult; // simplified scaling by effectiveness
            const dmg = Math.max(1, Math.floor(pokemon.maxHP * frac));
            pokemon.currentHP = Math.max(0, pokemon.currentHP - dmg);
            log(`${pokemon.name} is hurt by Stealth Rock! (-${dmg})`);
            this._pushAnim?.({ type: "hazard:stealth-rock", payload: { pokemonId: pokemon.id, damage: dmg } });
        }
        // Hazards: Spikes (grounded only)
        if (owner?.sideHazards?.spikesLayers && this.isGrounded(pokemon)) {
            const layers = Math.max(1, Math.min(3, owner.sideHazards.spikesLayers));
            const frac = layers === 1 ? 1 / 8 : layers === 2 ? 1 / 6 : 1 / 4;
            const dmg = Math.max(1, Math.floor(pokemon.maxHP * frac));
            pokemon.currentHP = Math.max(0, pokemon.currentHP - dmg);
            log(`${pokemon.name} is hurt by Spikes! (-${dmg})`);
            this._pushAnim?.({ type: "hazard:spikes", payload: { pokemonId: pokemon.id, layers, damage: dmg } });
        }
        // Hazards: Toxic Spikes (grounded only): 1 layer = poison, 2 layers = bad poison; Poison-type absorbs
        if (owner?.sideHazards?.toxicSpikesLayers && this.isGrounded(pokemon)) {
            if (pokemon.types.includes("Poison")) {
                // Absorb and clear
                owner.sideHazards.toxicSpikesLayers = 0;
                log(`${pokemon.name} absorbed the Toxic Spikes!`);
                this._pushAnim?.({ type: "hazard:toxicspikes:absorb", payload: { pokemonId: pokemon.id } });
            }
            else if (pokemon.status === "none") {
                const layers = Math.max(1, Math.min(2, owner.sideHazards.toxicSpikesLayers));
                pokemon.status = layers >= 2 ? "toxic" : "poison";
                log(`${pokemon.name} was poisoned by Toxic Spikes!`);
                this._pushAnim?.({ type: "hazard:toxicspikes", payload: { pokemonId: pokemon.id, layers } });
            }
        }
        // Hazards: Sticky Web (grounded only) -> drop speed stage by 1
        if (owner?.sideHazards?.stickyWeb && this.isGrounded(pokemon)) {
            pokemon.stages.spe = Math.max(-6, (pokemon.stages.spe ?? 0) - 1);
            log(`${pokemon.name}'s Speed was lowered by Sticky Web!`);
            this._pushAnim?.({ type: "hazard:stickyweb", payload: { pokemonId: pokemon.id } });
        }
    }
    utils(log) {
        return {
            dealDamage: (pokemon, amount) => {
                const before = pokemon.currentHP;
                pokemon.currentHP = (0, types_1.clamp)(pokemon.currentHP - Math.max(0, Math.floor(amount)), 0, pokemon.maxHP);
                return before - pokemon.currentHP;
            },
            heal: (pokemon, amount) => {
                const before = pokemon.currentHP;
                pokemon.currentHP = (0, types_1.clamp)(pokemon.currentHP + Math.max(0, Math.floor(amount)), 0, pokemon.maxHP);
                const healed = pokemon.currentHP - before;
                if (healed > 0)
                    this._pushAnim?.({ type: "heal", payload: { pokemonId: pokemon.id, heal: healed } });
                return healed;
            },
            applyStatus: (pokemon, status) => {
                // Block status application if a Substitute is active
                if ((pokemon.volatile?.substituteHP ?? 0) > 0)
                    return;
                if (pokemon.status === "none") {
                    pokemon.status = status;
                    log(`${pokemon.name} is now ${status}!`);
                }
            },
            modifyStatStages: (pokemon, changes) => {
                for (const [k, v] of Object.entries(changes)) {
                    const key = k;
                    const current = pokemon.stages[key] ?? 0;
                    const next = Math.max(-6, Math.min(6, current + (v ?? 0)));
                    pokemon.stages[key] = next;
                }
            },
            getEffectiveSpeed: (pokemon) => this.getEffectiveSpeed(pokemon),
            getEffectiveAttack: (pokemon, category) => this.getEffectiveAttack(pokemon, category),
            emitAnim: (event) => (this._pushAnim?.(event)),
            rng: () => this.rng(),
        };
    }
    getEffectiveSpeed(p) {
        const base = p.baseStats.spe;
        let mult = (0, types_1.stageMultiplier)(p.stages.spe ?? 0);
        if (p.status === "paralysis")
            mult *= 0.5; // simplified
        // Weather speed abilities
        if (this.state.field.weather.id === "rain" && ["swift_swim", "swiftswim"].includes(p.ability ?? ""))
            mult *= 2;
        if (this.state.field.weather.id === "sun" && p.ability === "chlorophyll")
            mult *= 2;
        // Tailwind on owner's side doubles speed
        const owner = this.state.players.find(pl => pl.team.some(m => m.id === p.id));
        if (owner?.sideConditions?.tailwindTurns && owner.sideConditions.tailwindTurns > 0) {
            mult *= 2;
        }
        let speed = Math.floor(base * mult);
        // Ability/item hooks
        if (p.ability && abilities_1.Abilities[p.ability]?.onModifySpeed)
            speed = abilities_1.Abilities[p.ability].onModifySpeed(p, speed);
        if (p.item && items_1.Items[p.item]?.onModifySpeed)
            speed = items_1.Items[p.item].onModifySpeed(p, speed);
        return speed;
    }
    getEffectiveAttack(p, category) {
        const isPhysical = category === "Physical";
        const base = isPhysical ? p.baseStats.atk : p.baseStats.spa;
        const stage = isPhysical ? (p.stages.atk ?? 0) : (p.stages.spa ?? 0);
        let mult = (0, types_1.stageMultiplier)(stage);
        if (isPhysical && p.status === "burn")
            mult *= 0.5; // simplified burn halving
        return Math.floor(base * mult);
    }
    applyFieldDamageMods(damage, move, user) {
        const weather = this.state.field.weather.id;
        const terrain = this.state.field.terrain.id;
        let d = damage;
        // Weather
        if (weather === "sun") {
            if (move.type === "Fire")
                d = Math.floor(d * 1.5);
            if (move.type === "Water")
                d = Math.floor(d * 0.5);
        }
        if (weather === "rain") {
            if (move.type === "Water")
                d = Math.floor(d * 1.5);
            if (move.type === "Fire")
                d = Math.floor(d * 0.5);
        }
        if (weather === "snow" || weather === "hail") {
            if (move.type === "Ice")
                d = Math.floor(d * 1.5);
        }
        // Terrain (subset)
        if (terrain === "grassy") {
            if (move.type === "Grass")
                d = Math.floor(d * 1.3);
        }
        // Conditional abilities at low HP
        if (user.currentHP <= Math.floor(user.maxHP / 3)) {
            if (user.ability === "blaze" && move.type === "Fire")
                d = Math.floor(d * 1.5);
            if (user.ability === "torrent" && move.type === "Water")
                d = Math.floor(d * 1.5);
            if (user.ability === "overgrow" && move.type === "Grass")
                d = Math.floor(d * 1.5);
        }
        return d;
    }
    applySurvivalEffects(target, user, damage, log) {
        if (damage < target.currentHP)
            return damage;
        if (target.currentHP <= 1)
            return damage;
        // Only from full HP
        if (target.currentHP === target.maxHP) {
            if (target.item === "focus_sash") {
                const reduced = target.currentHP - 1;
                log(`${target.name} hung on using its Focus Sash!`);
                this._pushAnim?.({ type: "survive:focus-sash", payload: { pokemonId: target.id } });
                // consume item
                target.item = undefined;
                return reduced;
            }
            if (target.ability === "sturdy") {
                const reduced = target.currentHP - 1;
                log(`${target.name} endured the hit with Sturdy!`);
                this._pushAnim?.({ type: "survive:sturdy", payload: { pokemonId: target.id } });
                return reduced;
            }
        }
        return damage;
    }
    // Accuracy modifications via abilities/items (simplified)
    modifyAccuracy(user, acc) {
        if (user.ability && abilities_1.Abilities[user.ability]?.onModifyAccuracy)
            acc = abilities_1.Abilities[user.ability].onModifyAccuracy(user, acc);
        return Math.max(1, Math.min(100, acc));
    }
    modifyAttack(user, atk, category) {
        if (user.ability && abilities_1.Abilities[user.ability]?.onModifyAtk)
            atk = abilities_1.Abilities[user.ability].onModifyAtk(user, atk, category);
        if (user.item && items_1.Items[user.item]?.onModifyAtk)
            atk = items_1.Items[user.item].onModifyAtk(user, atk, category);
        return atk;
    }
    modifyDefense(target, def, category) {
        if (target.ability && abilities_1.Abilities[target.ability]?.onModifyDef)
            def = abilities_1.Abilities[target.ability].onModifyDef(target, def, category);
        if (target.item && items_1.Items[target.item]?.onModifyDef)
            def = items_1.Items[target.item].onModifyDef(target, def, category);
        return def;
    }
    modifyDamage(user, target, damage) {
        if (user.ability && abilities_1.Abilities[user.ability]?.onModifyDamage)
            damage = abilities_1.Abilities[user.ability].onModifyDamage(user, target, damage);
        if (user.item && items_1.Items[user.item]?.onModifyDamage)
            damage = items_1.Items[user.item].onModifyDamage(user, damage);
        return damage;
    }
    rollCrit(critRatio) {
        // Showdown-ish tiers: 0 => 1/24, 1 => 1/8, 2 => 1/2, 3+ => 1
        const p = critRatio >= 3 ? 1 : critRatio === 2 ? 0.5 : critRatio === 1 ? 1 / 8 : 1 / 24;
        return this.rng() < p;
    }
    getMultiHit(move) {
        if (!move.multiHit)
            return 1;
        if (typeof move.multiHit === "number")
            return move.multiHit;
        const [min, max] = move.multiHit;
        const r = this.rng();
        return min + Math.floor(r * (max - min + 1));
    }
    // Simple helper to set/unset Protect on a Pokémon for this turn
    setProtect(pokemon, enabled) {
        pokemon.volatile = pokemon.volatile || {};
        pokemon.volatile.protect = enabled;
    }
}
exports.Engine = Engine;
exports.default = Engine;
//# sourceMappingURL=engine.js.map