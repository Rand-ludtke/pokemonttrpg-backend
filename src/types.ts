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
	onUse?: MoveEffect; // effect logic
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
	team: Pokemon[];
	activeIndex: number; // index into team
}

export type ActionType = "move" | "switch";

export interface ActionBase {
	actorPlayerId: string;
	pokemonId: string; // acting pokemon
	type: ActionType;
}

export interface MoveAction extends ActionBase {
	type: "move";
	moveId: string;
	targetPlayerId: string; // simple single-target for now
	targetPokemonId: string;
}

export interface SwitchAction extends ActionBase {
	type: "switch";
	toIndex: number; // index on bench
}

export type Action = MoveAction | SwitchAction;

export type WeatherId = "none" | "sun" | "rain" | "sandstorm" | "hail" | "snow"; // simplified
export type TerrainId = "none" | "electric" | "grassy" | "misty" | "psychic";

export interface TimedFieldEffect<T extends string> {
	id: T;
	turnsLeft: number; // 0 = none
}

export interface FieldState {
	weather: TimedFieldEffect<WeatherId>;
	terrain: TimedFieldEffect<TerrainId>;
}

export interface BattleState {
	turn: number;
	rngSeed?: number;
	players: Player[]; // 2 for singles
	field: FieldState;
	log: string[]; // basic text log
}

export interface TurnResult {
	state: BattleState;
	events: string[]; // emitted descriptions for this turn
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
	applyStatus: (pokemon: Pokemon, status: NonVolatileStatusId) => void;
	modifyStatStages: (pokemon: Pokemon, changes: Partial<Record<StatName, number>>) => void;
	getEffectiveSpeed: (pokemon: Pokemon) => number;
	getEffectiveAttack: (pokemon: Pokemon, category: Category) => number;
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

