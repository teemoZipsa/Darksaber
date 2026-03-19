/**
 * main.ts — Application entry point.
 * Initializes the GameEngine and starts the game loop.
 */

import { GameEngine } from './engine/GameEngine';

function init(): void {
    const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    if (!canvas) {
        console.error('Canvas element #gameCanvas not found!');
        return;
    }

    const engine = new GameEngine(canvas);
    engine.start();

    console.log('🎮 Darksaber Engine started');
}

// Wait for DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
