# Pokémon TTRPG Battle Engine (Backend)

A modular, event-driven battle engine inspired by Pokémon Showdown. This repo ships a strict TypeScript engine, a small Express + Socket.IO match server (rooms, chat, replays), and optional runtime loaders for Showdown-like data files. Mechanics include weather, terrains, and rooms (Trick/Magic/Wonder) with extensive tests and deterministic RNG.

## Quick start (Windows PowerShell)

1) Install deps, build, and run the demo CLI

```
npm install
npm run build
npm start
```

2) Run the WebSocket match server (default port 3000)

```
npm run build
npm run start:server
```

Optional: change the port

```
$env:PORT = 3100; npm run start:server
```

Dev mode (no build, ts-node):

```
npm run dev       # demo
npm run dev:server
```

3) Run tests (all green)

```
npm test
```

## How to connect (client guide)

The server exposes a tiny REST API for discovery plus a Socket.IO channel for realtime battles.

REST

- GET /api/rooms → `[ { id, name, players, spectCount, started } ]`
- GET /api/rooms/:id → `{ id, name, players: [{id, username}], spectCount, started }`
- GET /api/replays → list replays `[ { id, size } ]`
- GET /api/replay/:id → download full replay JSON
- GET /api/rooms/:id/snapshot → spectator snapshot `{ state, replay, phase, needsSwitch, deadline, rooms }`

Socket.IO events

- identify `{ username? }` → identified `{ id, username }`
- createRoom `{ name? }` → roomCreated `{ id, name }`, roomUpdate
- joinRoom `{ roomId, role: "player" | "spectator" }` → roomUpdate; if spectating an active match, `spectate_start { state, replay, phase, needsSwitch, deadline }`
- startBattle `{ roomId, players: Player[], seed? }` → battleStarted `{ state }`
- sendAction `{ roomId, playerId, action }` → turn resolution → battleUpdate `{ result, needsSwitch? }`
- sendChat `{ roomId, text }` → chatMessage broadcast

Minimal browser client (conceptual)

```ts
import { io } from "https://cdn.socket.io/4.7.5/socket.io.esm.min.js";
const socket = io("http://localhost:3000", { transports: ["websocket"] });

socket.emit("identify", { username: "Alice" });
socket.on("identified", me => console.log("You are", me));

socket.emit("createRoom", { name: "Test Room" });
socket.on("roomCreated", ({ id }) => {
	socket.emit("joinRoom", { roomId: id, role: "player" });
	// Build players payload (see Player JSON below), then:
	socket.emit("startBattle", { roomId: id, players, seed: 123 });
});

socket.on("battleStarted", ({ state }) => console.log("Battle started", state));
socket.on("battleUpdate", ({ result, needsSwitch }) => {
	console.log("Turn", result.state.turn, result.events);
	if (!needsSwitch?.length) {
		// Decide next action and emit
		// socket.emit("sendAction", { roomId, playerId, action });
	}
});
```

Tip: While `startBattle` accepts internal `Player[]`, you can build it from your own JSON using the simple adapter pattern shown in `src/adapters/pokedex-adapter.ts` (see schema below). For browser clients, mirror that adapter or pre-convert on a trusted backend.

## Custom Pokémon data (JSON you can send/share)

There are two layers you might use:

1) External Dex format (simplified, easy to author)
2) Internal Engine format (`Player[]`) required by `startBattle`

### 1) External Dex JSON (authoring/sync)

ExternalDexData shape (see `src/adapters/pokedex-adapter.ts`):

```jsonc
{
	"species": {
		"eevee": {
			"id": "eevee",
			"name": "Eevee",
			"types": ["Normal"],
			"baseStats": { "hp": 90, "atk": 55, "def": 50, "spa": 45, "spd": 65, "spe": 55 },
			"moves": ["tackle", "quick-attack"]
		},
		"charmander": {
			"id": "charmander",
			"name": "Charmander",
			"types": ["Fire"],
			"baseStats": { "hp": 88, "atk": 52, "def": 43, "spa": 60, "spd": 50, "spe": 65 },
			"moves": ["ember", "tackle"]
		}
	},
	"moves": {
		"tackle": { "id": "tackle", "name": "Tackle", "type": "Normal", "category": "Physical", "basePower": 40 },
		"quick-attack": { "id": "quick-attack", "name": "Quick Attack", "type": "Normal", "category": "Physical", "basePower": 40, "priority": 1 },
		"ember": { "id": "ember", "name": "Ember", "type": "Fire", "category": "Special", "basePower": 40 }
	}
}
```

Match/Team payloads against that dex:

```jsonc
{
	"playerId": "p1",
	"name": "Player 1",
	"party": [ { "speciesId": "eevee", "level": 50, "nickname": "Eevee", "moves": ["quick-attack", "tackle"] } ]
}
```

You can convert `[ExternalTeam, ExternalTeam] + ExternalDexData` to `Player[]` using the adapter as a build step, then call `startBattle` with the result.

Where to put files for server-side runtime loading (optional):

- Place Showdown-like files under `data/` (e.g., `data/pokedex.ts`, `data/moves.ts`, `data/items.ts`, `data/abilities.ts`). On startup, the server will attempt to import and convert what it finds.

Note: A direct “sync” endpoint (POST upload) isn’t wired yet. If you need live sync, easy next steps are to add `POST /api/custom-dex` to store JSON under `data/` and hot-merge or add a Socket.IO `uploadDex` event. Until then, pre-bake data files or convert client-side using the adapter pattern.

### 2) Internal Player JSON (what `startBattle` expects)

Use this if you convert client-side and send directly to the server. Optional cosmetic fields:

- `trainerSprite`: string identifier or URL for the trainer avatar
- `background`: string identifier or URL for the battle backdrop/arena
- `pokemon.nickname`: alternate display name shown in the UI (species `name` still powers mechanics)

**Data flow with custom metadata**

1. Client builds a `Player` payload per battler. Any extra fields (e.g., `trainerSprite`, `background`, `themeMusic`, custom flags) can be attached as long as the required engine fields remain intact.
2. When `createChallenge` or `respondChallenge` runs, the backend clones and stores the entire `Player` object. It only overwrites `id`, `name`, and `activeIndex` for safety; all other properties are preserved.
3. Once both sides accept, the server launches a new battle room and emits `battleStarted { state }` to **all** sockets in that room (both battlers + spectators). The `state.players` array contains the normalized `Player` objects that include every custom field you attached.
4. Subsequent `battleUpdate` payloads continue to include those fields in `result.state.players`, so UIs can keep rendering the same metadata without additional messages.

Because of that flow, you can extend the payload whenever you need new cosmetics or per-side session flags without touching the backend—just update your client types to mirror the extra properties.

```jsonc
[
	{
		"id": "p1",
		"name": "Player 1",
		"trainerSprite": "trainer-alice",
		"background": "arena-forest",
		"activeIndex": 0,
		"team": [
			{
				"id": "p1-1",
				"name": "Eevee",
				"nickname": "Spiffy",
				"level": 50,
				"types": ["Normal"],
				"baseStats": { "hp": 90, "atk": 55, "def": 50, "spa": 45, "spd": 65, "spe": 55 },
				"currentHP": 90,
				"maxHP": 90,
				"stages": { "hp": 0, "atk": 0, "def": 0, "spa": 0, "spd": 0, "spe": 0, "acc": 0, "eva": 0 },
				"status": "none",
				"volatile": {},
				"ability": "",
				"item": "",
				"moves": [
					{ "id": "quick-attack", "name": "Quick Attack", "type": "Normal", "category": "Physical", "power": 40, "accuracy": 100, "priority": 1 },
					{ "id": "tackle", "name": "Tackle", "type": "Normal", "category": "Physical", "power": 40, "accuracy": 100 }
				]
			}
		]
	},
	{
		"id": "p2",
		"name": "Player 2",
		"trainerSprite": "trainer-bob",
		"background": "arena-volcano",
		"activeIndex": 0,
		"team": [
			{
				"id": "p2-1",
				"name": "Charmander",
				"nickname": "Blaze",
				"level": 50,
				"types": ["Fire"],
				"baseStats": { "hp": 88, "atk": 52, "def": 43, "spa": 60, "spd": 50, "spe": 65 },
				"currentHP": 88,
				"maxHP": 88,
				"stages": { "hp": 0, "atk": 0, "def": 0, "spa": 0, "spd": 0, "spe": 0, "acc": 0, "eva": 0 },
				"status": "none",
				"volatile": {},
				"moves": [
					{ "id": "ember", "name": "Ember", "type": "Fire", "category": "Special", "power": 40, "accuracy": 100 },
					{ "id": "tackle", "name": "Tackle", "type": "Normal", "category": "Physical", "power": 40, "accuracy": 100 }
				]
			}
		]
	}
]
```

## Desktop-first UI spec (React + Tailwind)

High-level layout

- App shell: header with connection status and username; left sidebar for Rooms; main content area for Lobby/Battle; right drawer for Chat/Replays (collapsible at smaller widths).
- Lobby page: create/join rooms, show players/spectators, start battle button when two players present.
- Battle page:
	- Top: field banner with Weather/Terrain/Room chips and turn counter.
	- Middle: two active Pokémon panels with HP bars, status icons, stat stage indicators; central log/animations area.
	- Bottom: Action bar with Move grid (shows PP, category icon, type), Switch tab (bench with HP/status), and contextual overlays for `force-switch` with visible countdown.
- Chat panel: room chat with timestamps; system messages (turn start/end) styled distinctly.
- Spectator mode: same view minus action bar; show `promptAction` for players only.

Realtime behavior

- On connect: emit `identify` and store `{ id, username }`.
- Rooms list: poll `/api/rooms` or subscribe to `roomUpdate` while in a room; allow spectate via `joinRoom { role: "spectator" }`.
- During battle: render `result.state`, append `result.events` to log, and play `result.anim` events → map to visuals (e.g., `weather:rain:start`, `room:magic_room:start/end`, `move:start`, `move:hit`, `status:*`).
- Force switch: when `phase === "force-switch"`, show modal with bench and countdown from `deadline`; only allow `switch` actions for players in `needsSwitch`.
- Disconnections: if a player disconnects, keep room; allow rejoin; optionally restrict new joins as players if slots full.

Animation cue mapping (Essentials-style)

- Weather: `weather:rain|sun|sandstorm|hail|snow:start|end`
- Rooms: `room:trick_room|magic_room|wonder_room:start|end`
- Moves: `move:start`, `move:hit`, `move:miss`, `move:crit`
- Status: `status:burn|poison|toxic|paralysis|sleep|freeze:apply|tick|heal`

## Running properly (end-to-end)

1) Start the server

```
npm run build
npm run start:server
```

2) Open your UI (local dev server) and connect to `ws://localhost:3000` via Socket.IO

3) Create/join a room, then either:

- Start with built Player JSON (see above) using `startBattle`, or
- Convert your External Dex + Teams to Player[] using the adapter pattern client-side.

4) Send actions per turn. If a side must switch (`needsSwitch`), switch immediately; otherwise pick moves and wait for `battleUpdate`.

5) Replays: after `battleEnd`, retrieve `/api/replays` and `/api/replay/:id` to display or download.

## Raspberry Pi notes

- Install Node 18+; clone repo; run `npm ci`, then `npm run build` and `npm run start:server`.
- Consider a process manager (PM2/systemd) and opening the port on your LAN.
- Place custom data under `data/` if you want the server to import it at startup.

## Roadmap for custom mon syncing

- Add `POST /api/custom-dex` to upload ExternalDexData JSON and hot-merge (server keeps a cache under `data/`).
- Add `POST /api/start` to accept `{ dex, teams, seed? }`, convert server-side via the adapter, and run without clients having to build internal `Player[]`.
- Add Socket.IO `uploadDex` for ad-hoc authoring sessions.

Until then, build `Player[]` client-side using the adapter contract shown above and pass it to `startBattle`.

