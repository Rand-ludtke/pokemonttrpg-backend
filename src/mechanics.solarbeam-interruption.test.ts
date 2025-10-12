import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, MoveAction } from "./types";
import { defaultStats, sampleMon, SOLAR_BEAM, TACKLE } from "./samples";

// This test verifies that Solar Beam's two-turn behavior persists across a skipped turn and only spends PP on the initial charge.
// We'll simulate a skipped turn by putting the user to sleep between charge and fire.

describe("Solar Beam charge interruption and PP consumption", () => {
  it("charges, skips a turn due to sleep, then fires next turn without extra PP", () => {
    const user = sampleMon("p1-1", "Solar", ["Grass"], defaultStats({ spa: 120 }), [SOLAR_BEAM, TACKLE]);
    const foe = sampleMon("p2-1", "Dummy", ["Normal"], defaultStats({ hp: 400, spd: 100 }), [TACKLE]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [user] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [foe] };
    const eng = new Engine({ seed: 42 });
    eng.initializeBattle([p1, p2], { seed: 42 });

    // Ensure clear weather to force two-turn Solar Beam
    eng["state"].field.weather.id = "none" as any;
    eng["state"].field.weather.turnsLeft = 0;

    // Initialize PP store and set SOLAR_BEAM PP to 2 for this test
    user.volatile = user.volatile || {} as any;
    (user.volatile as any).pp = (user.volatile as any).pp || {};
    (user.volatile as any).pp[SOLAR_BEAM.id] = SOLAR_BEAM.pp ?? 10;

    // Turn 1: use Solar Beam -> charges, consumes 1 PP
    eng.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: user.id, moveId: SOLAR_BEAM.id, targetPlayerId: p2.id, targetPokemonId: foe.id } as MoveAction]);
    const afterChargePP = (user.volatile as any).pp[SOLAR_BEAM.id];
    expect(afterChargePP).toBe((SOLAR_BEAM.pp ?? 10) - 1);

    // Before firing: inflict sleep so that Turn 2 is skipped
  user.status = "sleep";
  user.volatile = user.volatile || {} as any;
  (user.volatile as any).sleepTurns = 2; // set to 2 so that after decrement it remains asleep this turn

    // Turn 2: user tries Solar Beam but is asleep -> no firing; PP remains the same and charging persists
    const hpBeforeSkip = foe.currentHP;
    eng.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: user.id, moveId: SOLAR_BEAM.id, targetPlayerId: p2.id, targetPokemonId: foe.id } as MoveAction]);
    expect(foe.currentHP).toBe(hpBeforeSkip);
    // Charging flag should still be set
    expect((user.volatile as any).solarBeamCharging).toBe(true);
    // PP should not have changed during the skipped turn
    expect((user.volatile as any).pp[SOLAR_BEAM.id]).toBe(afterChargePP);

    // Turn 3: user uses Solar Beam again, now awake -> fires; PP should NOT be consumed this turn due to skipPPThisAction logic
    const hpBeforeFire = foe.currentHP;
    eng.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: user.id, moveId: SOLAR_BEAM.id, targetPlayerId: p2.id, targetPokemonId: foe.id } as MoveAction]);
    expect(foe.currentHP).toBeLessThan(hpBeforeFire);
    // PP unchanged on the firing turn
    expect((user.volatile as any).pp[SOLAR_BEAM.id]).toBe(afterChargePP);
  });
});
