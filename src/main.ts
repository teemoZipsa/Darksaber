import { GameEngine } from './engine/GameEngine';

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    if (canvas) {
        const engine = new GameEngine(canvas);
        engine.start();
        
        // Temporary UI logic for binding
        const posText = document.getElementById('player-pos');
        if(posText) posText.innerText = "Engine Started";
    }
});
