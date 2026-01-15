/**
 * Synchronous Pokemon Showdown Battle Engine
 * 
 * This provides a synchronous interface to the PS BattleStream by running
 * the battle simulation synchronously (PS simulator supports this mode).
 */

import {
	BattleState,
	BattleAction,
	MoveAction,
	SwitchAction,
	TurnResult,
	AnimationEvent,
	Player,
	Pokemon,
	NonVolatileStatusId,
} from "./types";

// Import Pokemon Showdown simulator
const ps = require("pokemon-showdown");
const { Battle: PSBattle, Teams, PRNG, Dex } = ps;

interface PSRequest {
	rqid?: number;
	teamPreview?: boolean;
	forceSwitch?: boolean[];
	wait?: boolean;
	active?: Array<{
		moves: Array<{
			id: string;
			name: string;
			pp: number;
			maxpp: number;
			disabled?: boolean;
			target: string;
		}>;
		trapped?: boolean;
		canMegaEvo?: boolean;
	}>;
	side?: {
		name: string;
		id: string;
		pokemon: Array<{
			ident: string;
			details: string;
			condition: string;
			active: boolean;
			stats: { atk: number; def: number; spa: number; spd: number; spe: number };
			moves: string[];
			baseAbility: string;
			item: string;
			pokeball: string;
			ability?: string;
		}>;
	};
}

/**
 * SyncPSEngine provides a synchronous interface to Pokemon Showdown's battle simulation.
 * It uses PS's Battle class directly (not the stream) for synchronous operation.
 */
export class SyncPSEngine {
	private battle: InstanceType<typeof PSBattle> | null = null;
	private state!: BattleState;
	private playerIdToSide: Map<string, "p1" | "p2"> = new Map();
	private sideToPlayerId: Map<"p1" | "p2", string> = new Map();
	private format: string;

	constructor(private readonly options?: { format?: string; seed?: number | number[] }) {
		this.format = options?.format || "gen9customgame";
	}

	/**
	 * Initialize a battle with the given players.
	 * Teams should be in our Pokemon format - they will be converted to PS packed format.
	 */
	initializeBattle(players: Player[], options?: { seed?: number | number[] }): BattleState {
		const seed = options?.seed || this.options?.seed;
		const seedArray = Array.isArray(seed) ? seed : seed ? [seed, seed, seed, seed] : PRNG.generateSeed();

		// Map player IDs to sides
		this.playerIdToSide.set(players[0].id, "p1");
		this.playerIdToSide.set(players[1].id, "p2");
		this.sideToPlayerId.set("p1", players[0].id);
		this.sideToPlayerId.set("p2", players[1].id);

		// Convert our teams to PS packed format
		const p1Team = this.convertTeamToPacked(players[0].team);
		const p2Team = this.convertTeamToPacked(players[1].team);

		// Create the battle directly (synchronous)
		this.battle = new PSBattle({
			formatid: this.format as any,
			seed: seedArray,
			p1: { name: players[0].name, team: p1Team },
			p2: { name: players[1].name, team: p2Team },
		});

		// Initialize our state mirror
		this.state = {
			turn: 0,
			rngSeed: seedArray[0],
			players: players.map((p, idx) => ({
				...p,
				team: p.team.map((mon) => ({ ...mon })),
			})),
			field: {
				weather: { id: "none", turnsLeft: 0 },
				terrain: { id: "none", turnsLeft: 0 },
				room: { id: "none", turnsLeft: 0 },
				magicRoom: { id: "none", turnsLeft: 0 },
				wonderRoom: { id: "none", turnsLeft: 0 },
			},
			log: [],
			coinFlipWinner: undefined,
		};

		// Sync initial state
		this.syncStateFromPS();

		return this.state;
	}

	/**
	 * Convert our Pokemon team to PS packed format
	 */
	private convertTeamToPacked(team: Pokemon[]): string {
		const sets = team.map((mon) => ({
			name: mon.nickname || mon.name,
			species: mon.name,
			item: mon.item || "",
			ability: mon.ability || "",
			moves: mon.moves.map((m) => m.name || m.id),
			nature: "Hardy",
			evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
			ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
			level: mon.level,
			shiny: false,
			gender: "",
		}));
		return Teams.pack(sets);
	}

	/**
	 * Get the current request for a player
	 */
	getRequest(playerId: string): PSRequest | null {
		if (!this.battle) return null;
		const side = this.playerIdToSide.get(playerId);
		if (!side) return null;
		
		const psSide = this.battle.sides.find((s: any) => s.id === side);
		return psSide?.activeRequest || null;
	}

	/**
	 * Check if a player needs to make a force switch
	 */
	needsForceSwitch(playerId: string): boolean {
		const req = this.getRequest(playerId);
		return !!(req?.forceSwitch?.some((f: boolean) => f));
	}

	/**
	 * Submit a force switch choice
	 */
	forceSwitch(playerId: string, toIndex: number): TurnResult {
		if (!this.battle) {
			return { state: this.state, events: [], anim: [] };
		}

		const side = this.playerIdToSide.get(playerId);
		if (!side) {
			return { state: this.state, events: [], anim: [] };
		}

		const events: string[] = [];
		const anim: AnimationEvent[] = [];

		// Submit the switch choice
		// PS uses 1-based indices for switches
		const success = this.battle.choose(side, `switch ${toIndex + 1}`);
		
		if (!success) {
			console.error(`[SyncPSEngine] forceSwitch failed for ${side}`);
		}

		// If all choices are done, the battle will auto-process
		// Collect log entries
		events.push(...this.collectNewLogEntries());
		anim.push(...this.parseLogToAnimations(events));

		// Sync state
		this.syncStateFromPS();

		return { state: this.state, events, anim };
	}

	/**
	 * Process a turn with the given actions
	 */
	processTurn(actions: BattleAction[]): TurnResult {
		if (!this.battle) {
			return { state: this.state, events: ["Battle not initialized"], anim: [] };
		}

		const events: string[] = [];
		const anim: AnimationEvent[] = [];

		// Group actions by player
		const actionsByPlayer = new Map<string, BattleAction>();
		for (const action of actions) {
			actionsByPlayer.set(action.actorPlayerId, action);
		}

		// Submit choices for each player
		for (const [playerId, action] of actionsByPlayer) {
			const side = this.playerIdToSide.get(playerId);
			if (!side) continue;

			const choice = this.actionToChoice(action, side);
			if (choice) {
				const success = this.battle.choose(side, choice);
				if (!success) {
					console.error(`[SyncPSEngine] Choice failed for ${side}: ${choice}`);
					// Try a default choice
					this.battle.choose(side, "default");
				}
			}
		}

		// Collect log entries after the turn processes
		events.push(...this.collectNewLogEntries());
		anim.push(...this.parseLogToAnimations(events));

		// Update our state
		this.syncStateFromPS();
		this.state.turn = this.battle.turn;

		return { state: this.state, events, anim };
	}

	/**
	 * Collect new log entries from PS battle
	 */
	private collectNewLogEntries(): string[] {
		if (!this.battle) return [];
		
		const log = this.battle.log || [];
		const newEntries: string[] = [];
		
		for (const entry of log) {
			if (!this.state.log.includes(entry)) {
				this.state.log.push(entry);
				newEntries.push(entry);
			}
		}
		
		return newEntries;
	}

	/**
	 * Parse log entries into animation events
	 */
	private parseLogToAnimations(lines: string[]): AnimationEvent[] {
		const anim: AnimationEvent[] = [];

		for (const line of lines) {
			if (!line.startsWith("|")) continue;
			
			const parts = line.slice(1).split("|");
			const cmd = parts[0];

			switch (cmd) {
				case "move": {
					const [, attacker, moveName, target] = parts;
					const attackerSide = this.extractSide(attacker);
					const playerId = attackerSide ? this.sideToPlayerId.get(attackerSide) || "" : "";
					anim.push({
						type: "move",
						payload: {
							playerId,
							moveName: moveName || "",
							pokemonId: this.extractPokemonName(attacker),
							targetId: this.extractPokemonName(target),
						},
					});
					break;
				}
				case "switch":
				case "drag": {
					const [, ident] = parts;
					const side = this.extractSide(ident);
					const playerId = side ? this.sideToPlayerId.get(side) || "" : "";
					anim.push({
						type: "switch",
						payload: {
							playerId,
							pokemonId: this.extractPokemonName(ident),
						},
					});
					break;
				}
				case "-damage":
				case "-heal": {
					const [, ident, condition] = parts;
					const side = this.extractSide(ident);
					const playerId = side ? this.sideToPlayerId.get(side) || "" : "";
					const hpParts = (condition || "").split("/");
					const current = parseInt(hpParts[0]) || 0;
					const max = parseInt(hpParts[1]?.split(" ")[0]) || 100;
					anim.push({
						type: cmd === "-damage" ? "damage" : "heal",
						payload: {
							playerId,
							pokemonId: this.extractPokemonName(ident),
							hpAfter: current,
							maxHP: max,
						},
					});
					break;
				}
				case "faint": {
					const [, ident] = parts;
					const side = this.extractSide(ident);
					const playerId = side ? this.sideToPlayerId.get(side) || "" : "";
					anim.push({
						type: "faint",
						payload: {
							playerId,
							pokemonId: this.extractPokemonName(ident),
						},
					});
					break;
				}
				case "-status": {
					const [, ident, status] = parts;
					const side = this.extractSide(ident);
					const playerId = side ? this.sideToPlayerId.get(side) || "" : "";
					anim.push({
						type: "status",
						payload: {
							playerId,
							pokemonId: this.extractPokemonName(ident),
							status: status || "",
						},
					});
					break;
				}
			}
		}

		return anim;
	}

	/**
	 * Extract side from PS ident like "p1a: Pikachu"
	 */
	private extractSide(ident: string | undefined): "p1" | "p2" | null {
		if (!ident) return null;
		const match = ident.match(/^(p[12])/);
		return match ? (match[1] as "p1" | "p2") : null;
	}

	/**
	 * Extract pokemon name from PS ident like "p1a: Pikachu"
	 */
	private extractPokemonName(ident: string | undefined): string {
		if (!ident) return "";
		const match = ident.match(/^p[12][a-z]?: (.+)$/);
		return match ? match[1] : ident;
	}

	/**
	 * Convert our action to PS choice format
	 */
	private actionToChoice(action: BattleAction, side: "p1" | "p2"): string | null {
		if (action.type === "move") {
			const moveAction = action as MoveAction;
			const moveIndex = this.findMoveIndex(moveAction.moveId, side);
			return `move ${moveIndex}`;
		}

		if (action.type === "switch") {
			const switchAction = action as SwitchAction;
			// PS uses 1-based indices
			return `switch ${switchAction.toIndex + 1}`;
		}

		return "default";
	}

	/**
	 * Find the index of a move (1-based)
	 */
	private findMoveIndex(moveId: string, side: "p1" | "p2"): number {
		if (!this.battle) return 1;

		const psSide = this.battle.sides.find((s: any) => s.id === side);
		if (!psSide) return 1;

		const activePokemon = psSide.active[0];
		if (!activePokemon) return 1;

		const normalizedMoveId = moveId.toLowerCase().replace(/[^a-z0-9]/g, "");
		
		for (let i = 0; i < activePokemon.moves.length; i++) {
			const move = activePokemon.moves[i];
			const moveNormalized = (move || "").toLowerCase().replace(/[^a-z0-9]/g, "");
			if (moveNormalized === normalizedMoveId) {
				return i + 1;
			}
		}

		return 1;
	}

	/**
	 * Sync our state from PS's current state
	 */
	private syncStateFromPS() {
		if (!this.battle) return;

		for (let sideIdx = 0; sideIdx < 2; sideIdx++) {
			const psSide = this.battle.sides[sideIdx];
			const player = this.state.players[sideIdx];
			if (!psSide || !player) continue;

			// Find active index
			const activePos = psSide.active[0]?.position;
			if (typeof activePos === "number" && activePos >= 0) {
				player.activeIndex = activePos;
			}

			// Update each pokemon
			for (let i = 0; i < psSide.pokemon.length && i < player.team.length; i++) {
				const psMon = psSide.pokemon[i];
				const ourMon = player.team[i];
				if (!psMon) continue;

				// Update HP
				ourMon.currentHP = psMon.hp || 0;
				ourMon.maxHP = psMon.maxhp || ourMon.maxHP;

				// Update status
				if (psMon.status) {
					ourMon.status = this.parseStatus(psMon.status);
				} else if (psMon.fainted) {
					ourMon.status = "none";
					ourMon.currentHP = 0;
				}

				// Update stages/boosts
				if (psMon.boosts) {
					ourMon.stages = {
						hp: 0,
						atk: psMon.boosts.atk || 0,
						def: psMon.boosts.def || 0,
						spa: psMon.boosts.spa || 0,
						spd: psMon.boosts.spd || 0,
						spe: psMon.boosts.spe || 0,
						acc: psMon.boosts.accuracy || 0,
						eva: psMon.boosts.evasion || 0,
					};
				}
			}
		}

		// Update turn
		this.state.turn = this.battle.turn;

		// Update weather
		const weather = this.battle.field?.weather;
		if (weather && weather !== "none") {
			this.state.field.weather = {
				id: weather,
				turnsLeft: this.battle.field.weatherState?.duration || 0,
			};
		}

		// Update terrain
		const terrain = this.battle.field?.terrain;
		if (terrain && terrain !== "none") {
			this.state.field.terrain = {
				id: terrain,
				turnsLeft: this.battle.field.terrainState?.duration || 0,
			};
		}
	}

	/**
	 * Parse PS status to our format
	 */
	private parseStatus(status: string): NonVolatileStatusId {
		const map: Record<string, NonVolatileStatusId> = {
			par: "paralysis",
			brn: "burn",
			psn: "poison",
			tox: "toxic",
			slp: "sleep",
			frz: "freeze",
		};
		return map[status] || "none";
	}

	/**
	 * Check if battle has ended
	 */
	isEnded(): boolean {
		return this.battle?.ended || false;
	}

	/**
	 * Get winner's player ID
	 */
	getWinner(): string | null {
		if (!this.battle?.winner) return null;
		
		// Winner is the side ID or name
		const winnerSide = this.battle.winner;
		for (const [playerId, side] of this.playerIdToSide) {
			if (side === winnerSide) return playerId;
			const player = this.state.players.find((p) => p.id === playerId);
			if (player?.name === winnerSide) return playerId;
		}
		
		return null;
	}

	/**
	 * Get the full battle log
	 */
	getLog(): string[] {
		return this.state.log;
	}

	/**
	 * Get the current state
	 */
	getState(): BattleState {
		return this.state;
	}

	/**
	 * Access the internal PS battle for advanced usage
	 */
	getPSBattle(): any {
		return this.battle;
	}
}

export default SyncPSEngine;
