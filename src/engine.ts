import {
	Action,
	BattleRuleset,
	BattleState,
	Category,
	LogSink,
	Move,
	MoveAction,
	Pokemon,
	TurnResult,
	clamp,
	stageMultiplier,
	EngineUtils,
	NonVolatileStatusId,
	Player,
} from "./types";
	import { calcDamage, chooseDefenseStat } from "./damage";
	import { Abilities } from "./data/abilities";
	import { Items } from "./data/items";

type Handler<T extends any[]> = (...args: T) => void;

export class Engine implements BattleRuleset {
	private state!: BattleState;

	// Event handlers
	private moveHandlers: Handler<[Move, Pokemon, Pokemon, BattleState, LogSink]>[] = [];
	private statusTickHandlers: Handler<[
		Pokemon,
		NonVolatileStatusId,
		BattleState,
		LogSink
	]>[] = [];
	private switchInHandlers: Handler<[Pokemon, BattleState, LogSink]>[] = [];

	constructor(private readonly options?: { seed?: number; deterministicTies?: boolean }) {}

	initializeBattle(players: Player[], options?: { seed?: number }): BattleState {
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

	processTurn(actions: Action[]): TurnResult {
		if (!this.state) throw new Error("Engine not initialized");
		this.state.turn += 1;
		const events: string[] = [];
		const log: LogSink = (msg) => {
			this.state.log.push(msg);
			events.push(msg);
		};

		// Filter fainted actors and illegal actions
		const legalActions = actions.filter((a) => this.getPokemonById(a.pokemonId)?.currentHP! > 0);

		// Sort by priority then speed
		const sorted = [...legalActions].sort((a, b) => this.compareActions(a, b));

		// Execute
		for (const action of sorted) {
			const actor = this.getPokemonById(action.pokemonId);
			if (!actor || actor.currentHP <= 0) continue; // fainted already
			if (action.type === "move") {
				const ma = action as MoveAction;
				const move = actor.moves.find((m) => m.id === ma.moveId);
				const target = this.getPokemonById(ma.targetPokemonId);
				if (!move || !target) continue;
				log(`${actor.name} used ${move.name}!`);
				this.executeMove(move, actor, target, log);
				if (target.currentHP <= 0) {
					log(`${target.name} fainted!`);
				}
			} else if (action.type === "switch") {
				// Basic switch: change active index
				const player = this.state.players.find((p) => p.id === action.actorPlayerId);
				if (!player) continue;
				player.activeIndex = Math.max(0, Math.min(player.team.length - 1, action.toIndex));
				const active = player.team[player.activeIndex];
				log(`${player.name} switched to ${active.name}!`);
				this.emitSwitchIn(active, log);
			}
		}

			// End-of-turn effects (statuses, items, weather, terrain)
		for (const p of this.state.players) {
			const mon = p.team[p.activeIndex];
			if (mon.currentHP > 0) this.emitStatusTick(mon, mon.status, log);
				if (mon.item && Items[mon.item]?.onEndOfTurn) Items[mon.item].onEndOfTurn!(mon, this.state, log);
		}

			// Weather residuals (very simplified)
			if (this.state.field.weather.id === "sandstorm") {
				for (const pl of this.state.players) {
					const mon = pl.team[pl.activeIndex];
					if (mon.currentHP <= 0) continue;
					// Rock/Ground/Steel immune
					if (mon.types.some((t) => t === "Rock" || t === "Ground" || t === "Steel")) continue;
					const dmg = Math.max(1, Math.floor(mon.maxHP / 16));
					mon.currentHP = Math.max(0, mon.currentHP - dmg);
					log(`${mon.name} is buffeted by the sandstorm! (${dmg})`);
				}
			}

			// Terrain residuals (Grassy Terrain heal simplified)
			if (this.state.field.terrain.id === "grassy") {
				for (const pl of this.state.players) {
					const mon = pl.team[pl.activeIndex];
					if (mon.currentHP <= 0) continue;
					const heal = Math.max(1, Math.floor(mon.maxHP / 16));
					const before = mon.currentHP;
					mon.currentHP = Math.min(mon.maxHP, mon.currentHP + heal);
					const delta = mon.currentHP - before;
					if (delta > 0) log(`${mon.name} is healed by the grassy terrain. (+${delta})`);
				}
			}

			// Decrement durations
			if (this.state.field.weather.turnsLeft > 0) this.state.field.weather.turnsLeft -= 1;
			if (this.state.field.weather.turnsLeft === 0) this.state.field.weather.id = "none";
			if (this.state.field.terrain.turnsLeft > 0) this.state.field.terrain.turnsLeft -= 1;
			if (this.state.field.terrain.turnsLeft === 0) this.state.field.terrain.id = "none";

		return { state: this.state, events };
	}

	// Event subscriptions
	onMoveExecute(handler: Handler<[Move, Pokemon, Pokemon, BattleState, LogSink]>): void {
		this.moveHandlers.push(handler);
	}
	onStatusTick(handler: Handler<[Pokemon, NonVolatileStatusId, BattleState, LogSink]>): void {
		this.statusTickHandlers.push(handler);
	}
	onSwitchIn(handler: Handler<[Pokemon, BattleState, LogSink]>): void {
		this.switchInHandlers.push(handler);
	}

	// Internals
	private rng() {
		// Simple LCG for deterministic ties/tests if seed provided
		if (this.state.rngSeed == null) return Math.random();
		let seed = this.state.rngSeed;
		seed = (seed * 1664525 + 1013904223) % 0xffffffff;
		this.state.rngSeed = seed;
		return (seed & 0xfffffff) / 0xfffffff;
	}

	private getPokemonById(id: string): Pokemon | undefined {
		for (const pl of this.state.players) {
			for (const mon of pl.team) if (mon.id === id) return mon;
		}
		return undefined;
	}

	private compareActions(a: Action, b: Action): number {
		// Switches generally happen before moves in Pokémon; we keep it simple: switch priority = 6
		const priorityA = a.type === "switch" ? 6 : this.actionPriority(a);
		const priorityB = b.type === "switch" ? 6 : this.actionPriority(b);
		if (priorityA !== priorityB) return priorityB - priorityA; // higher first

		// Speed tiebreaker
		const speA = this.actionSpeed(a);
		const speB = this.actionSpeed(b);
		if (speA !== speB) return speB - speA; // faster first

		// Random tie-break
		return this.rng() < 0.5 ? -1 : 1;
	}

	private actionPriority(a: Action): number {
		if (a.type === "move") {
			const actor = this.getPokemonById(a.pokemonId);
			const move = actor?.moves.find((m) => m.id === a.moveId);
			return move?.priority ?? 0;
		}
		return 0;
	}

	private actionSpeed(a: Action): number {
		const actor = this.getPokemonById(a.pokemonId);
		return actor ? this.getEffectiveSpeed(actor) : 0;
	}

		private executeMove(move: Move, user: Pokemon, target: Pokemon, log: LogSink) {
		// broadcast to external listeners first
		for (const h of this.moveHandlers) h(move, user, target, this.state, log);

			// Default handling: if move has onUse, call it; otherwise do a damage calc with STAB/type chart
		if (move.onUse) {
			move.onUse({ state: this.state, user, target, move, log, utils: this.utils(log) });
		} else if (move.power && move.category !== "Status") {
				// Accuracy check
				if (move.accuracy != null) {
					const acc = this.modifyAccuracy(user, move.accuracy);
					const roll = this.rng() * 100;
					if (roll >= acc) {
						log(`${user.name}'s attack missed!`);
						return;
					}
				}

				const hits = this.getMultiHit(move);
				let totalDealt = 0;
				let effectivenessSeen: number | null = null;
				let critHappened = false;
				for (let i = 0; i < hits; i++) {
					if (user.currentHP <= 0 || target.currentHP <= 0) break;

					const atk = this.modifyAttack(user, this.getEffectiveAttack(user, move.category), move.category);
					const def = this.modifyDefense(target, chooseDefenseStat(target, move.category), move.category);
					const crit = this.rollCrit(move.critRatio ?? 0);
					const { damage, effectiveness, stab } = calcDamage(user, target, move, atk, def, { rng: () => this.rng() });
					effectivenessSeen = effectivenessSeen ?? effectiveness;
					let finalDamage = damage;
					if (crit) {
						finalDamage = Math.floor(finalDamage * 1.5);
						critHappened = true;
					}
					// Ability/item damage mods hooks
					finalDamage = this.modifyDamage(user, target, finalDamage);

					const dealt = this.utils(log).dealDamage(target, finalDamage);
					totalDealt += dealt;
				}

				if (effectivenessSeen === 0) {
					log(`It doesn't affect ${target.name}...`);
					return;
				}
				log(`It dealt ${totalDealt} damage${hits > 1 ? ` in ${hits} hits` : ""}.`);
				if (critHappened) log("A critical hit!");
				if (effectivenessSeen! > 1) log("It's super effective!");
				else if (effectivenessSeen! < 1) log("It's not very effective...");
		}
	}

	private emitStatusTick(pokemon: Pokemon, status: NonVolatileStatusId, log: LogSink = (m) => this.state.log.push(m)) {
		for (const h of this.statusTickHandlers) h(pokemon, status, this.state, log);
	}

	private emitSwitchIn(pokemon: Pokemon, log: LogSink = (m) => this.state.log.push(m)) {
		for (const h of this.switchInHandlers) h(pokemon, this.state, log);
	}

	private utils(log: LogSink): EngineUtils {
		return {
			dealDamage: (pokemon, amount) => {
				const before = pokemon.currentHP;
				pokemon.currentHP = clamp(pokemon.currentHP - Math.max(0, Math.floor(amount)), 0, pokemon.maxHP);
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
							const key = k as keyof typeof pokemon.stages;
							const current = (pokemon.stages as any)[key] ?? 0;
							const next = Math.max(-6, Math.min(6, current + (v ?? 0)));
							(pokemon.stages as any)[key] = next;
						}
					},
			getEffectiveSpeed: (pokemon) => this.getEffectiveSpeed(pokemon),
			getEffectiveAttack: (pokemon, category) => this.getEffectiveAttack(pokemon, category),
		};
	}

	private getEffectiveSpeed(p: Pokemon): number {
		const base = p.baseStats.spe;
		let mult = stageMultiplier(p.stages.spe ?? 0);
		if (p.status === "paralysis") mult *= 0.5; // simplified
		return Math.floor(base * mult);
	}

	private getEffectiveAttack(p: Pokemon, category: Category): number {
		const isPhysical = category === "Physical";
		const base = isPhysical ? p.baseStats.atk : p.baseStats.spa;
		const stage = isPhysical ? (p.stages.atk ?? 0) : (p.stages.spa ?? 0);
		let mult = stageMultiplier(stage);
		if (isPhysical && p.status === "burn") mult *= 0.5; // simplified burn halving
			return Math.floor(base * mult);
	}

		// Accuracy modifications via abilities/items (simplified)
		private modifyAccuracy(user: Pokemon, acc: number): number {
			if (user.ability && Abilities[user.ability]?.onModifyAccuracy)
				acc = Abilities[user.ability].onModifyAccuracy!(user, acc);
			return Math.max(1, Math.min(100, acc));
		}

		private modifyAttack(user: Pokemon, atk: number, category: Category): number {
			if (user.ability && Abilities[user.ability]?.onModifyAtk)
				atk = Abilities[user.ability].onModifyAtk!(user, atk, category);
			if (user.item && Items[user.item]?.onModifyAtk)
				atk = Items[user.item].onModifyAtk!(user, atk, category);
			return atk;
		}

		private modifyDefense(target: Pokemon, def: number, category: Category): number {
			if (target.ability && Abilities[target.ability]?.onModifyDef)
				def = Abilities[target.ability].onModifyDef!(target, def, category);
			if (target.item && Items[target.item]?.onModifyDef)
				def = Items[target.item].onModifyDef!(target, def, category);
			return def;
		}

		private modifyDamage(user: Pokemon, target: Pokemon, damage: number): number {
			if (user.ability && Abilities[user.ability]?.onModifyDamage)
				damage = Abilities[user.ability].onModifyDamage!(user, target, damage);
			return damage;
		}

		private rollCrit(critRatio: number): boolean {
			// Showdown-ish tiers: 0 => 1/24, 1 => 1/8, 2 => 1/2, 3+ => 1
			const p = critRatio >= 3 ? 1 : critRatio === 2 ? 0.5 : critRatio === 1 ? 1 / 8 : 1 / 24;
			return this.rng() < p;
		}

		private getMultiHit(move: Move): number {
			if (!move.multiHit) return 1;
			if (typeof move.multiHit === "number") return move.multiHit;
			const [min, max] = move.multiHit;
			const r = this.rng();
			return min + Math.floor(r * (max - min + 1));
		}
}

export default Engine;

