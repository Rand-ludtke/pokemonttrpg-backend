import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, MoveAction, SwitchAction } from "./types";
import { defaultStats, sampleMon, WEATHER_BALL, SUNNY_DAY, TACKLE } from "./samples";

// Validate that switch priority happens before moves and Cloud Nine suppression applies in the same turn.

describe("Cloud Nine switch-in ordering suppresses weather before moves", () => {
  it("Switching in a Ghost with Cloud Nine before Weather Ball causes it to remain Normal (0 dmg vs Ghost)", () => {
    // Battle A: P2 switches into a Ghost-type with Cloud Nine on the same turn attacker uses Weather Ball in sun
    const attackerA = sampleMon("p1-1","Caster", ["Normal"], defaultStats({ spa: 120 }), [SUNNY_DAY, WEATHER_BALL]);
    const targetStartA = sampleMon("p2-1","Start", ["Normal"], defaultStats({ hp: 300, spd: 80 }), [TACKLE]);
    const ghostCloudNine = sampleMon("p2-2","GhostCN", ["Ghost"], defaultStats({ hp: 300, spd: 80 }), [TACKLE]);
    (ghostCloudNine as any).ability = "cloud_nine";
    const p1A: Player = { id: "p1", name: "P1", activeIndex: 0, team: [attackerA] };
    const p2A: Player = { id: "p2", name: "P2", activeIndex: 0, team: [targetStartA, ghostCloudNine] };
    const engA = new Engine({ seed: 91 }); engA.initializeBattle([p1A, p2A], { seed: 91 });
    // Set sun
    engA["state"].field.weather.id = "sun" as any; engA["state"].field.weather.turnsLeft = 5;
    // Turn 1: align state
    engA.processTurn([{ type: "move", actorPlayerId: p1A.id, pokemonId: attackerA.id, moveId: TACKLE.id, targetPlayerId: p2A.id, targetPokemonId: p2A.team[0].id } as MoveAction]);
    // Turn 2: P2 switches to Ghost Cloud Nine; P1 uses Weather Ball
    const actions: (MoveAction|SwitchAction)[] = [
      { type: "switch", actorPlayerId: p2A.id, pokemonId: p2A.team[0].id, toIndex: 1 },
      { type: "move", actorPlayerId: p1A.id, pokemonId: attackerA.id, moveId: WEATHER_BALL.id, targetPlayerId: p2A.id, targetPokemonId: p2A.team[0].id }
    ] as any;
    const ghostBefore = p2A.team[1].currentHP; // will be active after switch
    engA.processTurn(actions);
    const ghostAfter = p2A.team[p2A.activeIndex].currentHP;
    expect(ghostAfter).toBe(ghostBefore); // Normal-type Weather Ball should be immune on Ghost under Cloud Nine

    // Control Battle B: No Cloud Nine switch; Weather Ball should adapt in sun and hit Ghost (Fire vs Ghost)
    const attackerB = sampleMon("p1-1","CasterB", ["Normal"], defaultStats({ spa: 120 }), [SUNNY_DAY, WEATHER_BALL]);
    const ghostB = sampleMon("p2-1","GhostB", ["Ghost"], defaultStats({ hp: 300, spd: 80 }), [TACKLE]);
    const p1B: Player = { id: "p1", name: "P1", activeIndex: 0, team: [attackerB] };
    const p2B: Player = { id: "p2", name: "P2", activeIndex: 0, team: [ghostB] };
    const engB = new Engine({ seed: 92 }); engB.initializeBattle([p1B, p2B], { seed: 92 });
    engB["state"].field.weather.id = "sun" as any; engB["state"].field.weather.turnsLeft = 5;
    const gb = ghostB.currentHP;
    engB.processTurn([{ type: "move", actorPlayerId: p1B.id, pokemonId: attackerB.id, moveId: WEATHER_BALL.id, targetPlayerId: p2B.id, targetPokemonId: ghostB.id } as MoveAction]);
    expect(ghostB.currentHP).toBeLessThan(gb);
  });
});
