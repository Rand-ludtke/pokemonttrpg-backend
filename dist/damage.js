"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calcDamage = calcDamage;
exports.chooseDefenseStat = chooseDefenseStat;
const type_chart_1 = require("./data/type-chart");
// Very simplified damage formula inspired by Showdown (not exact parity yet)
function calcDamage(user, target, move, atk, def, env) {
    const level = user.level;
    const power = move.power ?? 0;
    // Base damage skeleton: (((2L/5+2) * P * A / D) / 50) + 2
    const base = Math.floor((((2 * level) / 5 + 2) * power * atk) / Math.max(1, def) / 50) + 2;
    const stab = user.types.includes(move.type) ? 1.5 : 1;
    const eff = (0, type_chart_1.typeEffectiveness)(move.type, target.types);
    if (eff === 0) {
        return { damage: 0, effectiveness: eff, stab, roll: 1 };
    }
    const roll = 0.85 + env.rng() * 0.15; // 0.85..1.0
    const dmg = Math.max(1, Math.floor(base * stab * eff * roll));
    return { damage: dmg, effectiveness: eff, stab, roll };
}
function chooseDefenseStat(target, category) {
    return category === "Physical" ? target.baseStats.def : target.baseStats.spd;
}
//# sourceMappingURL=damage.js.map