# Pokémon TTRPG Battle Engine (Backend)

A modular, event-driven battle engine inspired by Pokémon Showdown. This repo contains a TypeScript backend with pluggable rules, a simple match server, and optional runtime loading of Showdown-style data.

## Features
- Event-driven hooks: onMoveExecute, onStatusTick, onSwitchIn
- Turn processing with priority and speed ordering
- Simple utilities for damage, status application, and stat stage changes
- Lightweight demo with sample Pokémon and moves
- Express + WebSocket match server with rooms, chat, replays
- Forced-switch phase handling when a side must switch after a faint
- Optional runtime conversion of Showdown-style data files (abilities/items/species/moves)

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

### Run the server

Build then start the server (listens on :3000 by default):

```
npm run build
npm run start:server
```

During development you can run directly with ts-node:

```
npm run dev:server
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
- `src/server/index.ts` – Express + WebSocket server (rooms, actions, replays)

## Notes

This is a simplified starting point. Damage formulas, abilities, weather/terrain, and edge cases should be expanded to fully match Showdown mechanics over time.

## Server API

REST (JSON):

- `GET /api/rooms` – List rooms: `{ id, name, players: string[], spectCount, started }[]`
- `GET /api/rooms/:id` – Room details: `{ id, name, players: {id, username}[], spectCount, started }`
- `GET /api/replays` – List replays: `{ id, size }[]`
- `GET /api/replay/:id` – Download replay JSON
- `GET /api/replays/:id/meta` – Replay metadata: `{ id, room, createdAt, turns }`

WebSocket messages:

- Client → Server
	- `identify` `{ username? }`
	- `createRoom` `{ name? }`
	- `joinRoom` `{ roomId, role: "player" | "spectator" }`
	- `startBattle` `{ roomId, players: Player[], seed? }`
	- `sendAction` `{ roomId, playerId, action }` where `action` is `move` or `switch`
	- `sendChat` `{ roomId, text }`

- Server → Client
	- `identified` `{ id, username }`
	- `roomCreated` `{ id, name }`
	- `roomUpdate` `{ id, name, players, spectCount, battleStarted }`
	- `battleStarted` `{ state }`
	- `battleUpdate` `{ result, needsSwitch?: string[] }`
	- `phase` `{ phase: "normal" | "force-switch" }`
	- `battleEnd` `{ winner?, replayId }`
	- `promptAction` `{ waitingFor: number }`
	- `spectate_start` `{ state, replay }` (sent to new spectators of an active battle)
	- `chatMessage` `{ user, text, time }`
	- `error` `{ error }`

Forced-switch flow:

- After a turn where a side’s active fainted but has healthy bench, the server sends `battleUpdate` with `needsSwitch` and sets `phase: "force-switch"`.
- During `force-switch`, only required players may send `sendAction` with a `switch` action; actions are applied immediately via `engine.forceSwitch` and a `battleUpdate` is broadcast.
- When all required switches are done, the server sets `phase: "normal"` and resumes normal turns.

## External data loading (Showdown-style)

At startup the server attempts to import these (if present):

- `data/abilities.ts` – Converted with a curated map into the engine’s `Abilities` registry
- `data/items.ts` – Converted into the `Items` registry
- `data/pokedex.ts` – Species converted and 
- `data/moves.ts` – Moves converted

Note: These files are not compiled with this project. They are imported at runtime and translated; Showdown’s internal types are not required here.

