import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldServerMetrics, formatWorldServerMetrics } from '../../server/WorldServerObservability';

test('world server metrics render gauges and operational counters', () => {
    const metrics = createWorldServerMetrics();
    metrics.actionRejectedTotal = 3;
    metrics.saveConflictsTotal = 2;
    metrics.shutdownForcedRaidResultsTotal = 1;
    metrics.worldTickDurationMs = 7;

    const output = formatWorldServerMetrics(metrics, {
        serverStartedAtMs: 1_000,
        sessions: 4,
        activePlayers: 5,
        websocketClients: 6,
    }, 3_500);

    assert.match(output, /darksaber_world_uptime_seconds 2\.500/);
    assert.match(output, /darksaber_world_sessions 4/);
    assert.match(output, /darksaber_world_active_players 5/);
    assert.match(output, /darksaber_world_websocket_clients 6/);
    assert.match(output, /darksaber_world_tick_duration_ms 7/);
    assert.match(output, /darksaber_world_action_rejected_total 3/);
    assert.match(output, /darksaber_world_save_conflicts_total 2/);
    assert.match(output, /darksaber_world_shutdown_forced_raid_results_total 1/);
});
