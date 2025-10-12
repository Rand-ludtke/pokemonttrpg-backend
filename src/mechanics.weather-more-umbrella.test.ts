import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, MoveAction } from "./types";
import { defaultStats, sampleMon, WEATHER_BALL, RAIN_DANCE, SUNNY_DAY, TACKLE } from "./samples";

describe("More Utility Umbrella checks", () => {
  it("Target's Umbrella cancels Weather Ball sun/rain damage boost but not typing", () => {
    // Sun: Weather Ball becomes Fire; target Umbrella cancels sun Fire boost but Fire typing remains
    const aSun = sampleMon("p1-1","WB", ["Normal"], defaultStats({ spa: 120 }), [WEATHER_BALL]);
    const bSun = sampleMon("p2-1","Tgt", ["Normal"], defaultStats({ hp: 400, spd: 100 }), [TACKLE]);
    (bSun as any).item = "utility_umbrella";
    const p1S: Player = { id: "p1S", name: "P1S", activeIndex: 0, team: [aSun] };
    const p2S: Player = { id: "p2S", name: "P2S", activeIndex: 0, team: [bSun] };
    const engS = new Engine({ seed: 1 });
    engS.initializeBattle([p1S, p2S], { seed: 1 });
    engS["state"].field.weather.id = "sun" as any; engS["state"].field.weather.turnsLeft = 3;
    const hpS = bSun.currentHP;
    engS.processTurn([{ type: "move", actorPlayerId: p1S.id, pokemonId: aSun.id, moveId: WEATHER_BALL.id, targetPlayerId: p2S.id, targetPokemonId: bSun.id } as MoveAction]);
    expect(bSun.currentHP).toBeLessThan(hpS);

    // Rain: typing Water; Umbrella cancels rain Water boost but still hits
    const aR = sampleMon("p1-2","WB2", ["Normal"], defaultStats({ spa: 120 }), [WEATHER_BALL]);
    const bR = sampleMon("p2-2","Tgt2", ["Normal"], defaultStats({ hp: 400, spd: 100 }), [TACKLE]);
    (bR as any).item = "utility_umbrella";
    const p1R: Player = { id: "p1R", name: "P1R", activeIndex: 0, team: [aR] };
    const p2R: Player = { id: "p2R", name: "P2R", activeIndex: 0, team: [bR] };
    const engR = new Engine({ seed: 1 });
    engR.initializeBattle([p1R, p2R], { seed: 1 });
    engR["state"].field.weather.id = "rain" as any; engR["state"].field.weather.turnsLeft = 3;
    const hpR = bR.currentHP;
    engR.processTurn([{ type: "move", actorPlayerId: p1R.id, pokemonId: aR.id, moveId: WEATHER_BALL.id, targetPlayerId: p2R.id, targetPokemonId: bR.id } as MoveAction]);
    expect(bR.currentHP).toBeLessThan(hpR);
  });
});
