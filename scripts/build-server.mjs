import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outdir = resolve(rootDir, 'server-dist/server');

rmSync(resolve(rootDir, 'server-dist'), { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

await esbuild.build({
    absWorkingDir: rootDir,
    entryPoints: {
        index: 'server/index.ts',
        'migrate-db': 'server/migrate-db.ts',
    },
    outdir,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    sourcemap: true,
    target: 'node20',
    tsconfig: 'tsconfig.server.json',
    logLevel: 'info',
});

console.log(`Built server entries in ${outdir}`);
