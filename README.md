# Pokémon TTRPG Battle Engine (Backend)

A modular, event-driven battle engine inspired by Pokémon Showdown. This repo contains a minimal TypeScript backend skeleton with pluggable rules, moves, statuses, and field effects.

## Features
- Event-driven hooks: onMoveExecute, onStatusTick, onSwitchIn
- Turn processing with priority and speed ordering
- Simple utilities for damage, status application, and stat stage changes
- Lightweight demo with sample Pokémon and moves

## Getting started

1. Install dependencies
2. Build
3. Run the demo

### Commands (PowerShell)

```
npm install
npm run build
npm start
```

Or run with ts-node during development:

```
npm run dev
```

## Tests

Run unit tests with Vitest:

```
npm test
```

## Project structure

- `src/types.ts` – Shared types and interfaces
- `src/engine.ts` – Engine implementation (ruleset, events, turn processing)
- `src/samples.ts` – Sample data (moves, Pokémon, status behavior)
- `src/demo.ts` – Demo script executing two turns and printing a log

## Notes

This is a simplified starting point. Damage formulas, abilities, weather/terrain, and edge cases should be expanded to fully match Showdown mechanics over time.

