const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const posText = document.getElementById('player-pos');
const turnText = document.getElementById('turn-info');

// Resize canvas to fill window
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Constants
const TILE_SIZE = 48; // Size of each grid square in pixels
const MAP_WIDTH = 50; // In tiles
const MAP_HEIGHT = 50; // In tiles

// Camera
const camera = {
    x: 0,
    y: 0
};

// Player
const player = {
    x: Math.floor(MAP_WIDTH / 2),
    y: Math.floor(MAP_HEIGHT / 2),
    color: '#00adb5',
    actionPoints: 1
};

// Game State
let currentTurn = 'player'; // 'player' or 'enemy'

// Input handling
const keys = {};
window.addEventListener('keydown', (e) => {
    // Prevent default scrolling for arrow keys
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) {
        e.preventDefault();
    }
    keys[e.code] = true;
    
    if (currentTurn === 'player') {
        handlePlayerInput(e.code);
    }
});
window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
});

function handlePlayerInput(code) {
    let moved = false;
    let newX = player.x;
    let newY = player.y;

    if (code === 'ArrowUp') newY -= 1;
    else if (code === 'ArrowDown') newY += 1;
    else if (code === 'ArrowLeft') newX -= 1;
    else if (code === 'ArrowRight') newX += 1;
    else if (code === 'Space') moved = true; // Wait turn

    // Check bounds
    if (newX >= 0 && newX < MAP_WIDTH && newY >= 0 && newY < MAP_HEIGHT) {
        if (newX !== player.x || newY !== player.y) {
            player.x = newX;
            player.y = newY;
            moved = true;
        }
    }

    if (moved) {
        player.actionPoints -= 1;
        if (player.actionPoints <= 0) {
            endPlayerTurn();
        }
        updateUI();
    }
}

function endPlayerTurn() {
    currentTurn = 'enemy';
    turnText.innerText = "Turn: Enemy (Thinking...)";
    
    // Simulate enemy turn delay
    setTimeout(() => {
        // Here we will process enemies later
        // End enemy turn
        currentTurn = 'player';
        player.actionPoints = 1;
        turnText.innerText = "Turn: Player";
    }, 300);
}

function updateUI() {
    posText.innerText = `Pos: (${player.x}, ${player.y})`;
}

// Update camera to center on player
function updateCamera() {
    // Target camera position
    const targetX = (player.x * TILE_SIZE) + (TILE_SIZE / 2) - (canvas.width / 2);
    const targetY = (player.y * TILE_SIZE) + (TILE_SIZE / 2) - (canvas.height / 2);

    // Smooth camera interpolation (lerp)
    camera.x += (targetX - camera.x) * 0.1;
    camera.y += (targetY - camera.y) * 0.1;
}

// Render loop
function draw() {
    // Clear screen
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    updateCamera();

    // Calculate viewable area
    const startCol = Math.floor(camera.x / TILE_SIZE);
    const endCol = startCol + (canvas.width / TILE_SIZE) + 1;
    const startRow = Math.floor(camera.y / TILE_SIZE);
    const endRow = startRow + (canvas.height / TILE_SIZE) + 1;

    // Draw Grid and map bounds
    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // Basic map background
    ctx.fillStyle = '#1f4068';
    ctx.fillRect(0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE);

    // Draw grid lines
    ctx.strokeStyle = '#1b1b2f';
    ctx.lineWidth = 1;

    for(let r = Math.max(0, startRow); r <= Math.min(MAP_HEIGHT, endRow); r++) {
        ctx.beginPath();
        ctx.moveTo(Math.max(0, startCol) * TILE_SIZE, r * TILE_SIZE);
        ctx.lineTo(Math.min(MAP_WIDTH, endCol) * TILE_SIZE, r * TILE_SIZE);
        ctx.stroke();
    }
    for(let c = Math.max(0, startCol); c <= Math.min(MAP_WIDTH, endCol); c++) {
        ctx.beginPath();
        ctx.moveTo(c * TILE_SIZE, Math.max(0, startRow) * TILE_SIZE);
        ctx.lineTo(c * TILE_SIZE, Math.min(MAP_HEIGHT, endRow) * TILE_SIZE);
        ctx.stroke();
    }

    // Draw Player
    ctx.fillStyle = player.color;
    ctx.fillRect(player.x * TILE_SIZE + 4, player.y * TILE_SIZE + 4, TILE_SIZE - 8, TILE_SIZE - 8);

    ctx.restore();

    requestAnimationFrame(draw);
}

// Start game
updateUI();
requestAnimationFrame(draw);
