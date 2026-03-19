# Game Design Document (GDD)
**Project Name**: Dark Saver Spiritual Successor (Codename: Grid RPG)
**Genre**: Grid-based Turn SRPG / MMORPG
**Platform**: Web Browser (Desktop / Mobile capable)

## 1. Core Mechanics
- **Grid Movement**: Characters move on a 2D grid. Each tile represents a specific distance.
- **Turn System**: Time freezes until an entity takes an action. In an online environment, we use an Action Point (AP) charging system. Everyone's AP charges over real time, and when full, they can take a turn independently.
- **Seamless World**: No loading screens. Map is streamed in chunks around the player seamlessly.

## 2. Character System
- **Stats**: STR (Strength), DEX (Dexterity), INT (Intelligence), CON (Constitution).
- **Classes**: Fighter, Mage, Thief, Priest. At certain levels (e.g., Lv 20), they branch out into advanced classes.
- **Skills**: Each class has a distinct skill tree. Magical attacks and AoE skills target specific grid patterns (e.g., 3x3 square, cross, straight line).

## 3. Engagement & Combat
- **Field Encounters**: Monsters roam the grid. Walking into their aggro range triggers combat seamlessly on the exact same field (no separate battle screen).
- **Line of Sight (LoS)**: Ranged attacks and spells are blocked by walls and obstacles on the grid.
