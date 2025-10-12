"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Engine = void 0;
const types_1 = require("./types");
const damage_1 = require("./damage");
const abilities_1 = require("./data/abilities");
const items_1 = require("./data/items");
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
            this.emitSwitchIn(active);
        }
        return this.state;
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
                const move = actor.moves.find((m) => m.id === ma.moveId);
                const target = this.getPokemonById(ma.targetPokemonId);
                if (!move || !target)
                    continue;
                log(`${actor.name} used ${move.name}!`);
                anim.push({ type: "move:start", payload: { userId: actor.id, moveId: move.id } });
                this.executeMove(move, actor, target, log);
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
            // Accuracy check incl. acc/eva stages and No Guard
            if (move.accuracy != null) {
                const noGuard = (user.ability === "no_guard") || (target.ability === "no_guard");
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
                // Levitate immunity (simplified)
                if (target.ability === "levitate" && move.type === "Ground") {
                    log(`${target.name} is unaffected due to Levitate!`);
                    effectivenessSeen = 0;
                    continue;
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
                // Survival effects (Focus Sash/Sturdy)
                finalDamage = this.applySurvivalEffects(target, user, finalDamage, log);
                const dealt = this.utils(log).dealDamage(target, finalDamage);
                if (dealt > 0)
                    this._pushAnim?.({ type: "move:hit", payload: { targetId: target.id, damage: dealt } });
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
        }
    }
    emitStatusTick(pokemon, status, log = (m) => this.state.log.push(m)) {
        for (const h of this.statusTickHandlers)
            h(pokemon, status, this.state, log);
    }
    emitSwitchIn(pokemon, log = (m) => this.state.log.push(m)) {
        for (const h of this.switchInHandlers)
            h(pokemon, this.state, log);
    }
    utils(log) {
        return {
            dealDamage: (pokemon, amount) => {
                const before = pokemon.currentHP;
                pokemon.currentHP = (0, types_1.clamp)(pokemon.currentHP - Math.max(0, Math.floor(amount)), 0, pokemon.maxHP);
                return before - pokemon.currentHP;
            },
            applyStatus: (pokemon, status) => {
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
        };
    }
    getEffectiveSpeed(p) {
        const base = p.baseStats.spe;
        let mult = (0, types_1.stageMultiplier)(p.stages.spe ?? 0);
        if (p.status === "paralysis")
            mult *= 0.5; // simplified
        // Weather speed abilities
        if (this.state.field.weather.id === "rain" && p.ability === "swift_swim")
            mult *= 2;
        if (this.state.field.weather.id === "sun" && p.ability === "chlorophyll")
            mult *= 2;
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
}
exports.Engine = Engine;
exports.default = Engine;
//# sourceMappingURL=engine.js.map