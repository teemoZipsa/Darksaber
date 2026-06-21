import { mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outfile = resolve(rootDir, 'server-dist/server/index.js');

rmSync(resolve(rootDir, 'server-dist'), { recursive: true, force: true });
mkdirSync(dirname(outfile), { recursive: true });

await esbuild.build({
    absWorkingDir: rootDir,
    entryPoints: ['server/index.ts'],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    sourcemap: true,
    target: 'node20',
    tsconfig: 'tsconfig.server.json',
    logLevel: 'info',
});

console.log(`Built ${outfile}`);
