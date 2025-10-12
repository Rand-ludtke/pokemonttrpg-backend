import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player } from "./types";
import { WONDER_ROOM, TACKLE, EMBER } from "./samples";

function makeMon(id: string, overrides: Partial<import('./types').Pokemon> = {}) {
	return {
		id,
		name: id,
		level: 50,
		types: ["Normal"],
		baseStats: { hp: 100, atk: 100, def: 50, spa: 100, spd: 150, spe: 100 },
		currentHP: 200,
		maxHP: 200,
		stages: { hp:0, atk:0, def:0, spa:0, spd:0, spe:0, acc:0, eva:0 },
		status: "none",
		volatile: {},
		ability: undefined,
		item: undefined,
		moves: [TACKLE, EMBER, WONDER_ROOM],
		...overrides
	} as import('./types').Pokemon;
}

function mkPlayers(a: import('./types').Pokemon, b: import('./types').Pokemon): [Player, Player] {
	return [
		{ id: "p1", name: "P1", team: [a], activeIndex: 0 },
		{ id: "p2", name: "P2", team: [b], activeIndex: 0 }
	];
}

describe("Wonder Room defense swap", () => {
	it("Physical uses SpD; Special uses Def while active", () => {
		// Target has Def=50, SpD=150; Attacker has average stats
		const attacker = makeMon("att");
		const target = makeMon("tgt");
		// Ensure attacker acts first to apply damage immediately after setting room
		attacker.baseStats.spe = 120;
		const eng = new Engine({ seed: 7 });
		const [p1, p2] = mkPlayers(attacker, target);
		eng.initializeBattle([p1, p2], { seed: 7 });
		// Set Wonder Room
		eng.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: attacker.id, moveId: WONDER_ROOM.id, targetPlayerId: p2.id, targetPokemonId: target.id }]);
		// Physical TACKLE should face SpD=150 (reduced damage)
		const hpBefore1 = target.currentHP;
		eng.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: attacker.id, moveId: TACKLE.id, targetPlayerId: p2.id, targetPokemonId: target.id }]);
		const dealtPhysical = hpBefore1 - target.currentHP;
		// Special EMBER should face Def=50 (increased damage relative to physical)
		const hpBefore2 = target.currentHP;
		eng.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: attacker.id, moveId: EMBER.id, targetPlayerId: p2.id, targetPokemonId: target.id }]);
		const dealtSpecial = hpBefore2 - target.currentHP;
		expect(dealtSpecial).toBeGreaterThan(dealtPhysical);
	});

	it("Reverts after expiration (5 turns)", () => {
		const attacker = makeMon("att");
		const target = makeMon("tgt");
		const eng = new Engine({ seed: 8 });
		const [p1, p2] = mkPlayers(attacker, target);
		eng.initializeBattle([p1, p2], { seed: 8 });
		// Set Wonder Room
		eng.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: attacker.id, moveId: WONDER_ROOM.id, targetPlayerId: p2.id, targetPokemonId: target.id }]);
		// Burn 5 turns with harmless actions to expire
		for (let i = 0; i < 5; i++) {
			eng.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: attacker.id, moveId: TACKLE.id, targetPlayerId: p2.id, targetPokemonId: target.id }]);
		}
		// After expiry, Physical should use Def=50 and hit harder than Special (which uses SpD=150)
		const hpSBefore = target.currentHP;
		eng.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: attacker.id, moveId: EMBER.id, targetPlayerId: p2.id, targetPokemonId: target.id }]);
		const dealtSpecial = hpSBefore - target.currentHP;
		const hpPBefore = target.currentHP;
		eng.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: attacker.id, moveId: TACKLE.id, targetPlayerId: p2.id, targetPokemonId: target.id }]);
		const dealtPhysical = hpPBefore - target.currentHP;
		expect(dealtPhysical).toBeGreaterThan(dealtSpecial);
	});
});

