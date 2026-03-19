# Architecture Document

## 1. Client Engine Architecture
- **Rendering**: HTML5 Canvas Application. We will use `requestAnimationFrame` for a smooth game loop decoupled from game logic ticks.
- **Map Streaming (Chunk System)**:
  - The world is divided into chunks (e.g., 20x20 or 50x50 tiles per chunk).
  - The client keeps exactly a `3x3` chunk grid loaded in memory centered around the player's current chunk.
  - As the player steps over a chunk boundary, old furthest chunks are garbage collected and new ones are requested from the server/storage.

## 2. Server Architecture (Phase 4)
- **Node.js**: The central lightweight game server.
- **WebSockets (Socket.io)**: Crucial for real-time grid positioning, chat, and Action Point synchronization without HTTP overhead.
- **Authoritative Server**: The server independently verifies pathfinding, line-of-sight, and combat formulas to prevent client-side memory manipulation or cheating.

## 3. Core Data Structures
- `Player Entity`: `{ id, x, y, hp, ap, class, inventory }`
- `Chunk Header`: `{ id (x_y), tilesMatrix, staticCollisionMap }`
- `Event Queue`: Client will maintain an event queue to process turn animations smoothly without desyncing from absolute server states.
