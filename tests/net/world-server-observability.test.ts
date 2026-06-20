import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldServerMetrics, formatServerLogEvent, formatWorldServerMetrics } from '../../server/WorldServerObservability';

test('world server metrics render gauges and operational counters', () => {
    const metrics = createWorldServerMetrics();
    metrics.actionRejectedTotal = 3;
    metrics.saveConflictsTotal = 2;
    metrics.saveSpoolReplayAppliedTotal = 9;
    metrics.saveSpoolReplayFailedTotal = 1;
    metrics.sessionSnapshotSaveFailuresTotal = 1;
    metrics.sessionSnapshotRestoreAppliedTotal = 2;
    metrics.sessionSnapshotRestoreFailedTotal = 3;
    metrics.sessionLeaseAcquireFailuresTotal = 4;
    metrics.sessionLeaseLostTotal = 5;
    metrics.shutdownForcedRaidResultsTotal = 1;
    metrics.worldTickDurationMs = 7;

    const output = formatWorldServerMetrics(metrics, {
        serverStartedAtMs: 1_000,
        sessions: 4,
        activePlayers: 5,
        websocketClients: 6,
        pendingSaveSpoolEntries: 7,
        pendingSessionSnapshotEntries: 2,
        dirtySaveTrackers: 8,
        savingSaveTrackers: 1,
    }, 3_500);

    assert.match(output, /darksaber_world_uptime_seconds 2\.500/);
    assert.match(output, /darksaber_world_sessions 4/);
    assert.match(output, /darksaber_world_active_players 5/);
    assert.match(output, /darksaber_world_websocket_clients 6/);
    assert.match(output, /darksaber_world_pending_save_spool_entries 7/);
    assert.match(output, /darksaber_world_pending_session_snapshot_entries 2/);
    assert.match(output, /darksaber_world_dirty_save_trackers 8/);
    assert.match(output, /darksaber_world_saving_save_trackers 1/);
    assert.match(output, /darksaber_world_tick_duration_ms 7/);
    assert.match(output, /darksaber_world_action_rejected_total 3/);
    assert.match(output, /darksaber_world_save_conflicts_total 2/);
    assert.match(output, /darksaber_world_save_spool_replay_applied_total 9/);
    assert.match(output, /darksaber_world_save_spool_replay_failed_total 1/);
    assert.match(output, /darksaber_world_session_snapshot_save_failures_total 1/);
    assert.match(output, /darksaber_world_session_snapshot_restore_applied_total 2/);
    assert.match(output, /darksaber_world_session_snapshot_restore_failed_total 3/);
    assert.match(output, /darksaber_world_session_lease_acquire_failures_total 4/);
    assert.match(output, /darksaber_world_session_lease_lost_total 5/);
    assert.match(output, /darksaber_world_shutdown_forced_raid_results_total 1/);
});

test('world server structured logs include level, event, time, fields, and errors', () => {
    const output = formatServerLogEvent('error', 'world_session_snapshot_save_failed', {
        sessionKey: 'mortal:raid:party-1',
        reason: 'tick',
        error: new Error('disk full'),
    }, new Date('2026-01-02T03:04:05.000Z'));
    const parsed = JSON.parse(output) as {
        level: string;
        event: string;
        time: string;
        sessionKey: string;
        reason: string;
        error: { name: string; message: string };
    };

    assert.equal(parsed.level, 'error');
    assert.equal(parsed.event, 'world_session_snapshot_save_failed');
    assert.equal(parsed.time, '2026-01-02T03:04:05.000Z');
    assert.equal(parsed.sessionKey, 'mortal:raid:party-1');
    assert.equal(parsed.reason, 'tick');
    assert.equal(parsed.error.name, 'Error');
    assert.equal(parsed.error.message, 'disk full');
});
