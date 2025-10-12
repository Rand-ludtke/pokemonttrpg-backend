"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Abilities = void 0;
exports.mergeAbilities = mergeAbilities;
// A tiny sample registry; extend with more as needed
exports.Abilities = {
    // Intimidate: upon switch-in, lowers adjacent foes' Atk by 1 (simplified to active foe)
    intimidate: {
        id: "intimidate",
        name: "Intimidate",
        onSwitchIn: (pokemon, state, log) => {
            // Find opposing active mon
            const opponentSide = state.players.find((p) => !p.team.some((m) => m.id === pokemon.id));
            if (!opponentSide)
                return;
            const foe = opponentSide.team[opponentSide.activeIndex];
            foe.stages.atk = Math.max(-6, Math.min(6, (foe.stages.atk ?? 0) - 1));
            log(`${foe.name}'s Attack fell due to Intimidate!`);
        },
    },
    sturdy: {
        id: "sturdy",
        name: "Sturdy",
        // effect handled in engine.applySurvivalEffects when lethal damage from full HP
    },
    no_guard: {
        id: "no_guard",
        name: "No Guard",
        // Accuracy handled in engine (always hit)
    },
    levitate: {
        id: "levitate",
        name: "Levitate",
        // Ground immunity handled in engine before damage calc
    },
    blaze: {
        id: "blaze",
        name: "Blaze",
        onModifyDamage: (user, target, damage) => {
            if (user.currentHP <= Math.floor(user.maxHP / 3)) {
                // Only boost Fire-type moves; engine passes move context indirectly via user state; simplified handled in engine applyFieldDamageMods cannot see move type here.
                return damage; // actual per-move boost will be handled in engine for now
            }
            return damage;
        },
    },
    torrent: { id: "torrent", name: "Torrent" },
    overgrow: { id: "overgrow", name: "Overgrow" },
    swift_swim: {
        id: "swift_swim",
        name: "Swift Swim",
        onModifySpeed: (pokemon, speed) => speed, // doubled in rain handled in engine
    },
    chlorophyll: {
        id: "chlorophyll",
        name: "Chlorophyll",
        onModifySpeed: (pokemon, speed) => speed, // doubled in sun handled in engine
    },
    huge_power: {
        id: "huge_power",
        name: "Huge Power",
        onModifyAtk: (pokemon, atk, category) => (category === "Physical" ? atk * 2 : atk),
    },
    pressure: {
        id: "pressure",
        name: "Pressure",
        // PP drain handled in engine when target has Pressure
    },
    // Guts: increases Attack by 50% if statused (simplified applied in getEffectiveAttack)
};
function mergeAbilities(map) {
    for (const [k, v] of Object.entries(map)) {
        exports.Abilities[k] = v;
    }
}
//# sourceMappingURL=abilities.js.map