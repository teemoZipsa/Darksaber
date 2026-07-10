import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const DEFAULT_ROOT = 'C:\\Users\\Seonkyu\\Downloads\\saver200010_extracted\\Saver_Files\\Saver';
const DEFAULT_OUT = 'outputs\\original_arc_unpacked';
const ARC_SIGNATURE = '0901';
const TABLE_OFFSET = 5;
const ENTRY_SIZE = 36;
const TEXT_MEMBER_RE = /\.(ai|dee|deo|evt|srf|txt|atr)$/i;

function usage() {
  return [
    'Usage: node scripts/extract-original-arc.mjs [sourceRootOrArc] [outDir] [--all] [--manifest-only] [--match=.evt,.deo]',
    '',
    `Default source: ${DEFAULT_ROOT}`,
    `Default out:    ${DEFAULT_OUT}`,
  ].join('\n');
}

function readAscii(bytes, offset, length) {
  let result = '';
  for (let index = 0; index < length; index++) {
    const value = bytes[offset + index];
    if (value === 0) break;
    result += String.fromCharCode(value);
  }
  return result;
}

function readUint32(bytes, offset) {
  return bytes.readUInt32LE(offset);
}

function parseArcArchive(path) {
  const bytes = readFileSync(path);
  if (bytes.length < TABLE_OFFSET || readAscii(bytes, 1, 4) !== ARC_SIGNATURE) {
    throw new Error(`Invalid original ARC archive: ${path}`);
  }

  const entries = [];
  for (let offset = TABLE_OFFSET; offset + ENTRY_SIZE <= bytes.length; offset += ENTRY_SIZE) {
    const nameLength = bytes[offset];
    if (nameLength <= 0 || nameLength > 15) break;

    const name = readAscii(bytes, offset + 1, nameLength);
    if (name === 'HEADEND') break;
    if (name.length !== nameLength) break;

    entries.push({
      name,
      checksum: readUint32(bytes, offset + 16),
      unpackedSize: readUint32(bytes, offset + 20),
      packedSize: readUint32(bytes, offset + 24),
      startOffset: readUint32(bytes, offset + 28),
      endOffset: readUint32(bytes, offset + 32),
    });
  }

  return {
    arc: path,
    byteLength: bytes.length,
    entries,
  };
}

function collectDefaultArcs(source) {
  const stat = statSync(source);
  if (stat.isFile()) return [source];

  const arcs = [];
  const dutyArc = join(source, 'gameres', 'duty.arc');
  if (existsSync(dutyArc)) arcs.push(dutyArc);

  const mapDir = join(source, 'MAP');
  if (existsSync(mapDir)) {
    for (const name of readdirSync(mapDir).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
      if (/^\d+set\.arc$/i.test(name)) arcs.push(join(mapDir, name));
    }
  }
  return arcs;
}

function findCompressDll(source) {
  let current = statSync(source).isDirectory() ? source : dirname(source);
  while (true) {
    const candidate = join(current, 'Compress.dll');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function sanitizeArcFolder(root, arcPath) {
  const relativePath = relative(root, arcPath);
  if (relativePath && !relativePath.startsWith('..')) {
    return relativePath.replace(/\.arc$/i, '').replace(/[\\/]/g, '_');
  }
  return basename(arcPath, extname(arcPath));
}

function parseArgs(argv) {
  const options = {
    source: DEFAULT_ROOT,
    outDir: DEFAULT_OUT,
    all: false,
    manifestOnly: false,
    matchExts: null,
  };
  const positionals = [];

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else if (arg === '--all') {
      options.all = true;
    } else if (arg === '--manifest-only') {
      options.manifestOnly = true;
    } else if (arg.startsWith('--match=')) {
      options.matchExts = new Set(arg.slice('--match='.length).split(',').map((value) => value.trim().toLowerCase()).filter(Boolean));
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positionals.push(arg);
    }
  }

  if (positionals[0]) options.source = positionals[0];
  if (positionals[1]) options.outDir = positionals[1];
  return options;
}

function shouldExtract(name, options) {
  if (options.all) return true;
  if (options.matchExts) return options.matchExts.has(extname(name).toLowerCase());
  return TEXT_MEMBER_RE.test(name);
}

function createNativeExtractorScript(dllPath) {
  const escapedDll = dllPath.replace(/\\/g, '\\\\');
  return `
param(
  [Parameter(Mandatory=$true)][string]$ArcPath,
  [Parameter(Mandatory=$true)][string]$OutDir,
  [Parameter(Mandatory=$true)][string]$NamesJson
)
$ErrorActionPreference = 'Stop'
$code = @"
using System;
using System.Runtime.InteropServices;
public static class OriginalArcNative {
  [DllImport("${escapedDll}", CallingConvention=CallingConvention.Cdecl, CharSet=CharSet.Ansi)] public static extern byte OpenArcFile(string path);
  [DllImport("${escapedDll}", CallingConvention=CallingConvention.Cdecl, CharSet=CharSet.Ansi)] public static extern byte UnpackAFile(string name);
  [DllImport("${escapedDll}", CallingConvention=CallingConvention.Cdecl)] public static extern IntPtr GetPointer();
  [DllImport("${escapedDll}", CallingConvention=CallingConvention.Cdecl)] public static extern int GetBuf2Size();
  [DllImport("${escapedDll}", CallingConvention=CallingConvention.Cdecl)] public static extern void CloseArcFile();
}
"@
Add-Type $code
$names = Get-Content -Raw -LiteralPath $NamesJson | ConvertFrom-Json
[IO.Directory]::CreateDirectory($OutDir) | Out-Null
$opened = [OriginalArcNative]::OpenArcFile($ArcPath)
if ($opened -ne 1) { throw "OpenArcFile failed: $ArcPath" }
try {
  foreach ($name in $names) {
    $unpacked = [OriginalArcNative]::UnpackAFile([string]$name)
    if ($unpacked -ne 1) { throw "UnpackAFile failed: $name" }
    $size = [OriginalArcNative]::GetBuf2Size()
    $pointer = [OriginalArcNative]::GetPointer()
    if ($size -lt 0 -or $pointer -eq [IntPtr]::Zero) { throw "Invalid unpacked buffer: $name" }
    $bytes = New-Object byte[] $size
    [Runtime.InteropServices.Marshal]::Copy($pointer, $bytes, 0, $size)
    [IO.File]::WriteAllBytes((Join-Path $OutDir ([string]$name)), $bytes)
  }
} finally {
  [OriginalArcNative]::CloseArcFile()
}
Write-Output ("extracted=" + $names.Count)
`;
}

function runNativeExtraction({ arcPath, outDir, names, dllPath }) {
  if (names.length === 0) return 0;

  const powershell32 = 'C:\\Windows\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe';
  if (!existsSync(powershell32)) {
    throw new Error('32-bit PowerShell was not found; Compress.dll is a 32-bit DLL and cannot be loaded by 64-bit PowerShell.');
  }

  const tempBase = join(tmpdir(), `darksaber-arc-${process.pid}-${Date.now()}`);
  mkdirSync(tempBase, { recursive: true });
  const scriptPath = join(tempBase, 'extract.ps1');
  const namesPath = join(tempBase, 'names.json');
  writeFileSync(scriptPath, createNativeExtractorScript(dllPath), 'utf8');
  writeFileSync(namesPath, JSON.stringify(names), 'utf8');

  try {
    const result = spawnSync(powershell32, [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      '-ArcPath',
      arcPath,
      '-OutDir',
      outDir,
      '-NamesJson',
      namesPath,
    ], { encoding: 'utf8' });

    if (result.status !== 0) {
      const stderr = result.stderr.trim();
      throw new Error(stderr || `native extraction failed for ${arcPath}`);
    }
  } finally {
    rmSync(tempBase, { recursive: true, force: true });
  }

  return names.length;
}

const options = parseArgs(process.argv.slice(2));
const source = resolve(options.source);
const outDir = resolve(options.outDir);
if (!existsSync(source)) throw new Error(`Source not found: ${source}`);

const sourceRoot = statSync(source).isDirectory() ? source : dirname(source);
const arcs = collectDefaultArcs(source);
const manifests = arcs.map((arcPath) => {
  const parsed = parseArcArchive(arcPath);
  const selectedEntries = parsed.entries.filter((entry) => shouldExtract(entry.name, options));
  return {
    arc: relative(sourceRoot, arcPath) || basename(arcPath),
    byteLength: parsed.byteLength,
    entryCount: parsed.entries.length,
    selectedCount: selectedEntries.length,
    entries: parsed.entries,
  };
});

if (options.manifestOnly) {
  console.log(JSON.stringify({ source: sourceRoot, arcs: manifests }, null, 2));
  process.exit(0);
}

const dllPath = findCompressDll(source);
if (!dllPath) throw new Error(`Compress.dll was not found near ${source}`);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify({ source: sourceRoot, arcs: manifests }, null, 2), 'utf8');

let extractedCount = 0;
for (const arcPath of arcs) {
  const parsed = parseArcArchive(arcPath);
  const names = parsed.entries.filter((entry) => shouldExtract(entry.name, options)).map((entry) => entry.name);
  const arcOutDir = join(outDir, sanitizeArcFolder(sourceRoot, arcPath));
  extractedCount += runNativeExtraction({ arcPath, outDir: arcOutDir, names, dllPath });
}

console.log(`Extracted ${extractedCount} files from ${arcs.length} archive(s) to ${outDir}`);
console.log(`Manifest written to ${join(outDir, 'manifest.json')}`);
