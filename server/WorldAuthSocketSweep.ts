export interface RevokedSocketBinding {
    sessionId: string;
}

export interface RevokedSocketSession {
    revokedAt: string | null;
    expiresAt: string;
}

export async function sweepRevokedSockets<TSocket>(options: {
    bindings: Iterable<readonly [TSocket, RevokedSocketBinding]>;
    getSession: (sessionId: string) => Promise<RevokedSocketSession | null>;
    revokeSocket: (socket: TSocket) => void;
    onError: (error: unknown, sessionId: string) => void;
    now?: number;
}): Promise<void> {
    const now = options.now ?? Date.now();
    for (const [socket, binding] of options.bindings) {
        try {
            const session = await options.getSession(binding.sessionId);
            if (session && !session.revokedAt && Date.parse(session.expiresAt) > now) continue;
            options.revokeSocket(socket);
        } catch (error) {
            // A transient auth-store failure must not become an unhandled rejection
            // or prevent the remaining connected clients from being checked.
            options.onError(error, binding.sessionId);
        }
    }
}
