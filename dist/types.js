"use strict";
// Core data models and interfaces for the battle engine.
Object.defineProperty(exports, "__esModule", { value: true });
exports.clamp = exports.stageMultiplier = void 0;
// Utility: stage multipliers (Showdown-like)
const stageMultiplier = (stage, positiveBase = 2, negativeBase = 2) => {
    const s = Math.max(-6, Math.min(6, stage));
    if (s >= 0)
        return (positiveBase + s) / positiveBase; // e.g. (2+s)/2 => +1 -> 1.5
    return negativeBase / (negativeBase + -s); // e.g. 2/(2+1) => -1 -> 0.666...
};
exports.stageMultiplier = stageMultiplier;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
exports.clamp = clamp;
//# sourceMappingURL=types.js.map