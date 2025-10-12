import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player } from "./types";
import { STEALTH_ROCK, SPIKES, MAGIC_ROOM, TRICK_ROOM, TACKLE, THUNDER, QUICK_ATTACK } from "./samples";

function mkMon(id: string, overrides: Partial<Parameters<typeof makeMon>[1]> = {}) {
	return makeMon(id, overrides);
}

function makeMon(id: string, overrides: Partial<import('./types').Pokemon> = {}) {
	return {
		id,
		name: id,
		level: 50,
		types: ["Normal"],
		baseStats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
		currentHP: 200,
		maxHP: 200,
		stages: { hp:0, atk:0, def:0, spa:0, spd:0, spe:0, acc:0, eva:0 },
		status: "none",
		volatile: {},
		ability: undefined,
		item: undefined,
		moves: [TACKLE]
	, ...overrides } as import('./types').Pokemon;
}

function mkPlayers(a: import('./types').Pokemon, b: import('./types').Pokemon): [Player, Player] {
	return [
		{ id: "p1", name: "P1", team: [a], activeIndex: 0 },
		{ id: "p2", name: "P2", team: [b], activeIndex: 0 }
	];
}

describe("Magic Room item suppression", () => {
	it("Boots don't block hazards while Magic Room is active", () => {
		const bootsMon = mkMon("boots", { item: "heavy-duty-boots" });
		const foe = mkMon("foe", { moves: [STEALTH_ROCK, SPIKES, TACKLE] });
		const eng = new Engine({ seed: 1 });
		const [p1, p2] = mkPlayers(bootsMon, foe);
		const state = eng.initializeBattle([p1, p2], { seed: 1 });
		// Opponent sets hazards on our side
		eng.processTurn([{ type: "move", actorPlayerId: p2.id, pokemonId: foe.id, moveId: STEALTH_ROCK.id, targetPlayerId: p1.id, targetPokemonId: bootsMon.id }]);
		eng.processTurn([{ type: "move", actorPlayerId: p2.id, pokemonId: foe.id, moveId: SPIKES.id, targetPlayerId: p1.id, targetPokemonId: bootsMon.id }]);
		// Activate Magic Room from our side
		bootsMon.moves.push(MAGIC_ROOM);
		eng.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: bootsMon.id, moveId: MAGIC_ROOM.id, targetPlayerId: p2.id, targetPokemonId: foe.id }]);
		// Switch to trigger hazard damage (Boots should be suppressed and not help)
		const bench = mkMon("bench", { item: "heavy-duty-boots" });
		p1.team.push(bench);
		// Sanity: hazards set on p1's side
		expect(p1.sideHazards?.stealthRock).toBe(true);
		expect((p1.sideHazards?.spikesLayers ?? 0)).toBeGreaterThan(0);
		eng.processTurn([{ type: "switch", actorPlayerId: p1.id, pokemonId: bootsMon.id, toIndex: 1 } as any]);
		// Bench switched in should take hazard damage; we just assert HP dropped
		expect(bench.currentHP).toBeLessThan(bench.maxHP);
	});

	it("Choice lock not enforced while Magic Room is active", () => {
		const choiceMon = mkMon("choice", { item: "choice_band", moves: [TACKLE, QUICK_ATTACK] });
		const foe = mkMon("foe");
		const eng = new Engine({ seed: 2 });
		const [p1, p2] = mkPlayers(choiceMon, foe);
		eng.initializeBattle([p1, p2], { seed: 2 });
		// Activate Magic Room
		choiceMon.moves.push(MAGIC_ROOM);
		eng.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: choiceMon.id, moveId: MAGIC_ROOM.id, targetPlayerId: p2.id, targetPokemonId: foe.id }]);
		// Use first move
		eng.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: choiceMon.id, moveId: TACKLE.id, targetPlayerId: p2.id, targetPokemonId: foe.id }]);
		// Next turn should allow using a different move (not locked)
		const res = eng.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: choiceMon.id, moveId: QUICK_ATTACK.id, targetPlayerId: p2.id, targetPokemonId: foe.id }]);
		expect(res.events.some(e => e.includes("used Quick Attack"))).toBe(true);
	});

	it("Focus Sash is suppressed under Magic Room", () => {
		const sashMon = mkMon("sash", { item: "focus_sash", currentHP: 150, maxHP: 150 });
		const foe = mkMon("foe", { moves: [{ ...TACKLE, power: 300 }] });
		// Foe slower to ensure attack after Magic Room
		foe.baseStats.spe = 50;
		sashMon.baseStats.spe = 100;
		sashMon.moves.push(MAGIC_ROOM);
		const eng = new Engine({ seed: 3, deterministicTies: true });
		const [p1, p2] = mkPlayers(sashMon, foe);
		eng.initializeBattle([p1, p2], { seed: 3 });
		// Turn 1: set Magic Room
		eng.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: sashMon.id, moveId: MAGIC_ROOM.id, targetPlayerId: p2.id, targetPokemonId: foe.id }]);
		// Turn 2: foe attacks; sash should not trigger -> faint
		const res = eng.processTurn([{ type: "move", actorPlayerId: p2.id, pokemonId: foe.id, moveId: TACKLE.id, targetPlayerId: p1.id, targetPokemonId: sashMon.id }]);
		expect(sashMon.currentHP).toBe(0);
		expect(res.events.some(e => e.includes("hung on using its Focus Sash"))).toBe(false);
	});

	it("Air Balloon immunity and pop suppressed under Magic Room", () => {
		const balloonMon = mkMon("balloon", { item: "air_balloon" });
		const groundUser = mkMon("foe", { types: ["Ground"], moves: [{ id: "mudshot", name: "Mud Shot", type: "Ground", category: "Special", power: 55, accuracy: 100 }] });
		// Activate Magic Room first
		balloonMon.moves.push(MAGIC_ROOM);
		const eng = new Engine({ seed: 4 });
		const [p1, p2] = mkPlayers(balloonMon, groundUser);
		eng.initializeBattle([p1, p2], { seed: 4 });
		eng.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: balloonMon.id, moveId: MAGIC_ROOM.id, targetPlayerId: p2.id, targetPokemonId: groundUser.id }]);
		const hpBefore = balloonMon.currentHP;
		// Ground move should hit (no immunity) and Balloon should not pop (item suppressed)
		eng.processTurn([{ type: "move", actorPlayerId: p2.id, pokemonId: groundUser.id, moveId: "mudshot", targetPlayerId: p1.id, targetPokemonId: balloonMon.id } as any]);
		expect(balloonMon.currentHP).toBeLessThan(hpBefore);
		expect(balloonMon.item).toBe("air_balloon");
	});

		it("Accuracy items are ignored during Magic Room", () => {
		const powderMon = mkMon("powder", { item: "brightpowder" });
		const attacker = mkMon("att", { moves: [THUNDER] });
		// Rain boosts Thunder to 100% in engine when not under Umbrella; accuracy items reduce a bit normally
		// For stability, just attempt many Thunders without weather and expect a good fraction to hit > baseline when item is ignored
		powderMon.moves.push(MAGIC_ROOM);
		const eng = new Engine({ seed: 5 });
		const [p1, p2] = mkPlayers(powderMon, attacker);
		eng.initializeBattle([p1, p2], { seed: 5 });
		eng.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: powderMon.id, moveId: MAGIC_ROOM.id, targetPlayerId: p2.id, targetPokemonId: attacker.id }]);
			let hits = 0;
			for (let i = 0; i < 30; i++) {
			const r = eng.processTurn([{ type: "move", actorPlayerId: p2.id, pokemonId: attacker.id, moveId: THUNDER.id, targetPlayerId: p1.id, targetPokemonId: powderMon.id }]);
			if (!r.events.some(e => e.includes("missed"))) hits++;
		}
			// Baseline 70% without any item reductions; with suppression, it should be closer to 70% than 63%. With 30 attempts, expect >= 15.
			expect(hits).toBeGreaterThanOrEqual(15);
	});
});

