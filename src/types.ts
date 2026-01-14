// Core data models and interfaces for the battle engine.

export type StatName =
	| "hp"
	| "atk"
	| "def"
	| "spa"
	| "spd"
	| "spe"
	| "acc"
	| "eva";

export type Stats = Record<Exclude<StatName, "acc" | "eva">, number> & {
	acc?: number;
	eva?: number;
};

export type StatStages = Record<StatName, number>; // -6..+6

export type TypeName =
	| "Normal"
	| "Fire"
	| "Water"
	| "Electric"
	| "Grass"
	| "Ice"
	| "Fighting"
	| "Poison"
	| "Ground"
	| "Flying"
	| "Psychic"
	| "Bug"
	| "Rock"
	| "Ghost"
	| "Dragon"
	| "Dark"
	| "Steel"
	| "Fairy";

export type Category = "Physical" | "Special" | "Status";

export interface Move {
	id: string;
	name: string;
	type: TypeName;
	category: Category;
	power?: number; // undefined for Status
	accuracy?: number; // 1..100, undefined means cannot miss
	priority?: number; // default 0
	critRatio?: number; // 0=1/24, 1=1/8, 2=1/2, 3+=always
	multiHit?: number | [number, number]; // exact or range (e.g., [2,5])
	pp?: number; // base PP; if undefined, default used by engine
	onUse?: MoveEffect; // effect logic
	switchesUserOut?: boolean; // e.g., U-turn, Volt Switch
}

export interface StatusEffectSpec {
	id: string;
	name: string;
	// hooks: applied on tick and various phases
	onAttackStatMultiplier?: (pokemon: Pokemon, state: BattleState) => number; // e.g., Burn halves physical
	onEndOfTurn?: (pokemon: Pokemon, state: BattleState, log: LogSink) => void; // residual dmg/heal
}

export type NonVolatileStatusId =
	| "burn"
	| "poison"
	| "toxic"
	| "paralysis"
	| "sleep"
	| "freeze"
	| "none";

export interface Pokemon {
	id: string;
	name: string;
	nickname?: string; // optional nickname to display in UI without confusing species name
	level: number;
	types: TypeName[];
	baseStats: Stats;
	currentHP: number;
	maxHP: number;
	stages: StatStages; // -6..+6
	status: NonVolatileStatusId;
	volatile: Record<string, any>; // confusion, etc.
	ability?: string; // id
	item?: string; // id
	moves: Move[];
}

export interface Player {
	id: string;
	name: string;
	trainerSprite?: string; // optional trainer avatar/sprite identifier or URL
	background?: string; // optional background/arena identifier or URL
	team: Pokemon[];
	activeIndex: number; // index into team
	// Side conditions (hazards etc.)
	sideHazards?: {
		stealthRock?: boolean;
			spikesLayers?: number; // 1..3
			toxicSpikesLayers?: number; // 1..2
			stickyWeb?: boolean;
	};
		// Side conditions with timers (simplified)
		sideConditions?: {
			tailwindTurns?: number; // doubles speed while > 0
			reflectTurns?: number; // halves physical damage while > 0
			lightScreenTurns?: number; // halves special damage while > 0
		};
}

export type ActionType = "move" | "switch" | "team" | "auto";

export interface ActionBase {
	actorPlayerId: string;
	type: ActionType;
}

export interface MoveAction extends ActionBase {
	type: "move";
	pokemonId: string; // acting pokemon
	moveId: string;
	targetPlayerId: string; // simple single-target for now
	targetPokemonId: string;
}

export interface SwitchAction extends ActionBase {
	type: "switch";
	pokemonId: string; // acting pokemon
	toIndex: number; // index on bench
}

export interface TeamAction extends ActionBase {
	type: "team";
	order: number[]; // 1-based indices for team order
}

export interface AutoAction extends ActionBase {
	type: "auto";
}

// Actions that can be used in battle (have pokemonId)
export type BattleAction = MoveAction | SwitchAction;

// All action types
export type Action = MoveAction | SwitchAction | TeamAction | AutoAction;

export type WeatherId = "none" | "sun" | "rain" | "sandstorm" | "hail" | "snow"; // simplified
export type TerrainId = "none" | "electric" | "grassy" | "misty" | "psychic";
export type RoomId = "none" | "trick_room"; // Trick Room
export type MagicRoomId = "none" | "magic_room";
export type WonderRoomId = "none" | "wonder_room";

export interface TimedFieldEffect<T extends string> {
	id: T;
	turnsLeft: number; // 0 = none
}

export interface FieldState {
	weather: TimedFieldEffect<WeatherId>;
	terrain: TimedFieldEffect<TerrainId>;
	room: TimedFieldEffect<RoomId>;
	magicRoom: TimedFieldEffect<MagicRoomId>;
	wonderRoom: TimedFieldEffect<WonderRoomId>;
}

export interface BattleState {
	turn: number;
	rngSeed?: number;
	players: Player[]; // 2 for singles
	field: FieldState;
	log: string[]; // basic text log
	coinFlipWinner?: string; // playerId that moves first (pokemon battle mode)
}

export interface TurnResult {
	state: BattleState;
	events: string[]; // emitted descriptions for this turn
	anim?: AnimationEvent[]; // animation cues for UI
}

// Event hook types
export type MoveEffect = (ctx: MoveContext) => void;

export interface MoveContext {
	state: BattleState;
	user: Pokemon;
	target: Pokemon;
	move: Move;
	log: LogSink;
	utils: EngineUtils;
}

export type LogSink = (msg: string) => void;

export interface EngineUtils {
	// basic helpers used in effects
	dealDamage: (pokemon: Pokemon, amount: number) => number; // returns actual damage dealt
	heal: (pokemon: Pokemon, amount: number) => number; // returns actual HP restored
	applyStatus: (pokemon: Pokemon, status: NonVolatileStatusId) => void;
	modifyStatStages: (pokemon: Pokemon, changes: Partial<Record<StatName, number>>) => void;
	getEffectiveSpeed: (pokemon: Pokemon) => number;
	getEffectiveAttack: (pokemon: Pokemon, category: Category) => number;
	emitAnim: (event: AnimationEvent) => void;
	// RNG access for chance-based effects
	rng: () => number;
}

// Ruleset interface with event subscriptions
export interface BattleRuleset {
	initializeBattle(players: Player[], options?: { seed?: number }): BattleState;
	processTurn(actions: Action[]): TurnResult;

	onMoveExecute(handler: (move: Move, user: Pokemon, target: Pokemon, state: BattleState, log: LogSink) => void): void;
	onStatusTick(handler: (pokemon: Pokemon, status: NonVolatileStatusId, state: BattleState, log: LogSink) => void): void;
	onSwitchIn(handler: (pokemon: Pokemon, state: BattleState, log: LogSink) => void): void;
}

// Utility: stage multipliers (Showdown-like)
export const stageMultiplier = (stage: number, positiveBase = 2, negativeBase = 2) => {
	const s = Math.max(-6, Math.min(6, stage));
	if (s >= 0) return (positiveBase + s) / positiveBase; // e.g. (2+s)/2 => +1 -> 1.5
	return negativeBase / (negativeBase + -s); // e.g. 2/(2+1) => -1 -> 0.666...
};

export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

// Animation event primitive for frontends to drive visuals.
export interface AnimationEvent {
	type: string; // e.g., "move:start", "move:hit", "status:burn:tick", "weather:sandstorm:start"
	payload?: any;
}

