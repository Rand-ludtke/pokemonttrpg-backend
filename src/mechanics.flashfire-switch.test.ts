import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, MoveAction, SwitchAction } from "./types";
import { defaultStats, sampleMon, EMBER, TACKLE } from "./samples";

describe("Flash Fire clears on switch-out", () => {
  it("Flash Fire boost volatile is reset when the boosted mon switches out", () => {
    // Attacker has two mons; Defender has Flash Fire mon that will switch out
    const atk1 = sampleMon("p1-1", "A1", ["Normal"], defaultStats({ spa: 80 }), [EMBER]);
    const atk2 = sampleMon("p1-2", "A2", ["Normal"], defaultStats({ spa: 80 }), [EMBER]);
  const def1 = sampleMon("p2-1", "B1", ["Normal"], defaultStats({ hp: 220, spd: 80 }), [EMBER]);
    def1.ability = "flash_fire";
    const def2 = sampleMon("p2-2", "B2", ["Normal"], defaultStats({ hp: 220, spd: 80 }), [TACKLE]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [atk1, atk2] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [def1, def2] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });

    // Hit Flash Fire target with Ember to grant its boost (negates damage)
    engine.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: atk1.id, moveId: EMBER.id, targetPlayerId: p2.id, targetPokemonId: def1.id } as MoveAction]);
    expect((def1.volatile as any).flashFireBoost).toBe(true);

    // Have the boosted mon attack back to confirm boosted damage exists
    const hpBeforeBoosted = atk1.currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: p2.id, pokemonId: def1.id, moveId: EMBER.id, targetPlayerId: p1.id, targetPokemonId: atk1.id } as MoveAction]);
    const dmgBoosted = hpBeforeBoosted - atk1.currentHP;
    expect(dmgBoosted).toBeGreaterThan(0);

    // Switch out the boosted mon
    engine.processTurn([{ type: "switch", actorPlayerId: p2.id, pokemonId: def1.id, toIndex: 1 } as SwitchAction]);
    // Switch back in the original mon (it should have lost the boost)
    engine.processTurn([{ type: "switch", actorPlayerId: p2.id, pokemonId: def2.id, toIndex: 0 } as SwitchAction]);
    const back = p2.team[p2.activeIndex];
    expect((back.volatile as any).flashFireBoost).toBeFalsy();

    // Attack again with Ember; damage should be lower than the boosted hit
    const hpBeforeNormal = atk1.currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: p2.id, pokemonId: back.id, moveId: EMBER.id, targetPlayerId: p1.id, targetPokemonId: atk1.id } as MoveAction]);
    const dmgNormal = hpBeforeNormal - atk1.currentHP;
    expect(dmgNormal).toBeLessThan(dmgBoosted);
  });
});
