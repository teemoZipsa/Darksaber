export interface WorldServerMetrics {
    wsConnectionsTotal: number;
    malformedMessagesTotal: number;
    oversizedPayloadsTotal: number;
    rateLimitedSocketsTotal: number;
    authFailuresTotal: number;
    resumeFailuresTotal: number;
    actionRejectedTotal: number;
    saveConflictsTotal: number;
    saveFailuresTotal: number;
    saveSpoolFailuresTotal: number;
    rejectedJoinsDuringShutdownTotal: number;
    shutdownForcedRaidResultsTotal: number;
    shutdownsTotal: number;
    worldTickDurationMs: number;
}

export interface WorldServerMetricGauges {
    serverStartedAtMs: number;
    sessions: number;
    activePlayers: number;
    websocketClients: number;
}

export function createWorldServerMetrics(): WorldServerMetrics {
    return {
        wsConnectionsTotal: 0,
        malformedMessagesTotal: 0,
        oversizedPayloadsTotal: 0,
        rateLimitedSocketsTotal: 0,
        authFailuresTotal: 0,
        resumeFailuresTotal: 0,
        actionRejectedTotal: 0,
        saveConflictsTotal: 0,
        saveFailuresTotal: 0,
        saveSpoolFailuresTotal: 0,
        rejectedJoinsDuringShutdownTotal: 0,
        shutdownForcedRaidResultsTotal: 0,
        shutdownsTotal: 0,
        worldTickDurationMs: 0,
    };
}

export function formatWorldServerMetrics(metrics: WorldServerMetrics, gauges: WorldServerMetricGauges, nowMs: number = Date.now()): string {
    const uptimeSeconds = Math.max(0, (nowMs - gauges.serverStartedAtMs) / 1000);
    const lines = [
        '# HELP darksaber_world_uptime_seconds World server process uptime in seconds.',
        '# TYPE darksaber_world_uptime_seconds gauge',
        `darksaber_world_uptime_seconds ${uptimeSeconds.toFixed(3)}`,
        '# HELP darksaber_world_sessions Active in-memory world sessions.',
        '# TYPE darksaber_world_sessions gauge',
        `darksaber_world_sessions ${gauges.sessions}`,
        '# HELP darksaber_world_active_players Active players across world sessions.',
        '# TYPE darksaber_world_active_players gauge',
        `darksaber_world_active_players ${gauges.activePlayers}`,
        '# HELP darksaber_world_websocket_clients Current WebSocket clients.',
        '# TYPE darksaber_world_websocket_clients gauge',
        `darksaber_world_websocket_clients ${gauges.websocketClients}`,
        '# HELP darksaber_world_tick_duration_ms Last world tick duration in milliseconds.',
        '# TYPE darksaber_world_tick_duration_ms gauge',
        `darksaber_world_tick_duration_ms ${metrics.worldTickDurationMs}`,
        '# HELP darksaber_world_ws_connections_total Total accepted WebSocket connection attempts.',
        '# TYPE darksaber_world_ws_connections_total counter',
        `darksaber_world_ws_connections_total ${metrics.wsConnectionsTotal}`,
        '# HELP darksaber_world_malformed_messages_total Total malformed WebSocket messages rejected.',
        '# TYPE darksaber_world_malformed_messages_total counter',
        `darksaber_world_malformed_messages_total ${metrics.malformedMessagesTotal}`,
        '# HELP darksaber_world_oversized_payloads_total Total oversized WebSocket payloads rejected.',
        '# TYPE darksaber_world_oversized_payloads_total counter',
        `darksaber_world_oversized_payloads_total ${metrics.oversizedPayloadsTotal}`,
        '# HELP darksaber_world_rate_limited_sockets_total Total sockets closed by WebSocket rate limiting.',
        '# TYPE darksaber_world_rate_limited_sockets_total counter',
        `darksaber_world_rate_limited_sockets_total ${metrics.rateLimitedSocketsTotal}`,
        '# HELP darksaber_world_auth_failures_total Total authentication failures.',
        '# TYPE darksaber_world_auth_failures_total counter',
        `darksaber_world_auth_failures_total ${metrics.authFailuresTotal}`,
        '# HELP darksaber_world_resume_failures_total Total failed reconnect attempts.',
        '# TYPE darksaber_world_resume_failures_total counter',
        `darksaber_world_resume_failures_total ${metrics.resumeFailuresTotal}`,
        '# HELP darksaber_world_action_rejected_total Total authoritative gameplay actions rejected.',
        '# TYPE darksaber_world_action_rejected_total counter',
        `darksaber_world_action_rejected_total ${metrics.actionRejectedTotal}`,
        '# HELP darksaber_world_save_conflicts_total Total character save revision conflicts.',
        '# TYPE darksaber_world_save_conflicts_total counter',
        `darksaber_world_save_conflicts_total ${metrics.saveConflictsTotal}`,
        '# HELP darksaber_world_save_failures_total Total character save flush failures.',
        '# TYPE darksaber_world_save_failures_total counter',
        `darksaber_world_save_failures_total ${metrics.saveFailuresTotal}`,
        '# HELP darksaber_world_save_spool_failures_total Total pending save spool failures.',
        '# TYPE darksaber_world_save_spool_failures_total counter',
        `darksaber_world_save_spool_failures_total ${metrics.saveSpoolFailuresTotal}`,
        '# HELP darksaber_world_rejected_joins_during_shutdown_total Total world joins rejected during shutdown.',
        '# TYPE darksaber_world_rejected_joins_during_shutdown_total counter',
        `darksaber_world_rejected_joins_during_shutdown_total ${metrics.rejectedJoinsDuringShutdownTotal}`,
        '# HELP darksaber_world_shutdown_forced_raid_results_total Total active raids converted to LEFT during shutdown.',
        '# TYPE darksaber_world_shutdown_forced_raid_results_total counter',
        `darksaber_world_shutdown_forced_raid_results_total ${metrics.shutdownForcedRaidResultsTotal}`,
        '# HELP darksaber_world_shutdowns_total Total graceful shutdowns started.',
        '# TYPE darksaber_world_shutdowns_total counter',
        `darksaber_world_shutdowns_total ${metrics.shutdownsTotal}`,
    ];
    return `${lines.join('\n')}\n`;
}

export function logServerEvent(level: 'info' | 'warn' | 'error', event: string, fields: Record<string, unknown> = {}): void {
    const payload = JSON.stringify({ level, event, time: new Date().toISOString(), ...fields });
    if (level === 'error') console.error(payload);
    else if (level === 'warn') console.warn(payload);
    else console.log(payload);
}
