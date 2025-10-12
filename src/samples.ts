import { Move, Pokemon, Player, Stats, StatusEffectSpec, TypeName } from "./types";
import Engine from "./engine";

// Simple sample dataset

export const TACKLE: Move = {
	id: "tackle",
	name: "Tackle",
	type: "Normal",
	category: "Physical",
	power: 40,
};

export const QUICK_ATTACK: Move = {
	id: "quick-attack",
	name: "Quick Attack",
	type: "Normal",
	category: "Physical",
	power: 40,
	priority: 1,
};

export const EMBER: Move = {
	id: "ember",
	name: "Ember",
	type: "Fire",
	category: "Special",
	power: 40,
};

export const SANDSTORM_MOVE: Move = {
	id: "sandstorm",
	name: "Sandstorm",
	type: "Rock",
	category: "Status",
	onUse: ({ state, log }) => {
		state.field.weather = { id: "sandstorm", turnsLeft: Math.max(1, (state.field.weather.turnsLeft || 0)) + 5 } as any;
		log(`A sandstorm kicked up!`);
	},
};

export const GRASSY_TERRAIN_MOVE: Move = {
	id: "grassy-terrain",
	name: "Grassy Terrain",
	type: "Grass",
	category: "Status",
	onUse: ({ state, log }) => {
		state.field.terrain = { id: "grassy", turnsLeft: Math.max(1, (state.field.terrain.turnsLeft || 0)) + 5 } as any;
		log(`The battlefield got covered in grass!`);
	},
};

export const BURN_STATUS: StatusEffectSpec = {
	id: "burn",
	name: "Burn",
	onAttackStatMultiplier: () => 0.5, // handled elsewhere too, sample only
	onEndOfTurn: (pokemon, _state, log) => {
		const dmg = Math.max(1, Math.floor(pokemon.maxHP / 16));
		pokemon.currentHP = Math.max(0, pokemon.currentHP - dmg);
		log(`${pokemon.name} is hurt by its burn! (${dmg})`);
	},
};

export const defaultStats = (overrides: Partial<Stats> = {}): Stats => ({
	hp: 100,
	atk: 50,
	def: 50,
	spa: 50,
	spd: 50,
	spe: 50,
	...overrides,
});

export const sampleMon = (
	id: string,
	name: string,
	types: TypeName[],
	stats: Stats,
	moves: Move[]
): Pokemon => ({
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

export const samplePlayers = (): Player[] => {
	const p1mon = sampleMon("p1-1", "Eevee", ["Normal"], defaultStats({ atk: 55, spe: 55, hp: 90 }), [
		TACKLE,
		QUICK_ATTACK,
	]);
	const p2mon = sampleMon("p2-1", "Charmander", ["Fire"], defaultStats({ spa: 65, spe: 65, hp: 88 }), [
			EMBER,
		TACKLE,
	]);

	const p1: Player = { id: "p1", name: "Player 1", team: [p1mon], activeIndex: 0 };
	const p2: Player = { id: "p2", name: "Player 2", team: [p2mon], activeIndex: 0 };
	return [p1, p2];
};

