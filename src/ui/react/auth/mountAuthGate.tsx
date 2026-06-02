import { createRoot } from 'react-dom/client';
import type { GameManager } from '../../../engine/GameManager';
import { AuthClient } from '../../../net/AuthClient';
import { AuthGate } from './AuthGate';
import '../../theme/darksaber-ui.css';

export function mountAuthGate(gameManager: GameManager): void {
    const element = document.getElementById('auth-overlay');
    if (!element) throw new Error('#auth-overlay element not found');
    const root = createRoot(element);
    root.render(<AuthGate client={new AuthClient()} gameManager={gameManager} />);
}
