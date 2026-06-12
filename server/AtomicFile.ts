import { copyFileSync, existsSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

export interface AtomicWriteFileOptions {
    backupPath?: string;
    encoding?: BufferEncoding;
}

export function writeFileAtomically(
    persistPath: string,
    contents: string,
    options: AtomicWriteFileOptions = {}
): void {
    const tmpPath = `${persistPath}.tmp-${process.pid}-${Date.now()}-${randomBytes(4).toString('hex')}`;
    try {
        writeFileSync(tmpPath, contents, options.encoding ?? 'utf8');
        if (options.backupPath && existsSync(persistPath)) {
            try {
                copyFileSync(persistPath, options.backupPath);
            } catch {
                // Backup is best-effort; the rename below is the authoritative write.
            }
        }
        renameSync(tmpPath, persistPath);
    } finally {
        rmSync(tmpPath, { force: true });
    }
}
