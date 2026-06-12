export interface OriginalArcEntry {
    name: string;
    checksum: number;
    unpackedSize: number;
    packedSize: number;
    startOffset: number;
    endOffset: number;
}

export interface OriginalArcManifest {
    byteLength: number;
    header: string;
    entries: OriginalArcEntry[];
}

const ARC_SIGNATURE = '0901';
const TABLE_OFFSET = 5;
const ENTRY_SIZE = 36;
const ENTRY_NAME_OFFSET = 1;
const ENTRY_NAME_CAPACITY = 15;
const ENTRY_VALUES_OFFSET = 16;
const HEAD_END = 'HEADEND';

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
    let result = '';
    for (let index = 0; index < length; index++) {
        const value = bytes[offset + index];
        if (value === 0) break;
        result += String.fromCharCode(value);
    }
    return result;
}

function readUint32(bytes: Uint8Array, offset: number): number {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 4);
    return view.getUint32(0, true);
}

function isPrintableAsciiName(name: string): boolean {
    return name.length > 0 && [...name].every((char) => {
        const code = char.charCodeAt(0);
        return code >= 0x20 && code <= 0x7e;
    });
}

export function isOriginalArcArchive(bytes: Uint8Array): boolean {
    return bytes.byteLength >= TABLE_OFFSET
        && readAscii(bytes, 1, 4) === ARC_SIGNATURE;
}

export function parseOriginalArcArchive(bytes: Uint8Array): OriginalArcManifest {
    if (!isOriginalArcArchive(bytes)) {
        throw new Error('Invalid original ARC archive: missing 0901 signature');
    }

    const entries: OriginalArcEntry[] = [];
    for (let offset = TABLE_OFFSET; offset + ENTRY_SIZE <= bytes.byteLength; offset += ENTRY_SIZE) {
        const nameLength = bytes[offset];
        if (nameLength <= 0 || nameLength > ENTRY_NAME_CAPACITY) break;

        const name = readAscii(bytes, offset + ENTRY_NAME_OFFSET, nameLength);
        if (name === HEAD_END) break;
        if (name.length !== nameLength || !isPrintableAsciiName(name)) break;

        const valuesOffset = offset + ENTRY_VALUES_OFFSET;
        entries.push({
            name,
            checksum: readUint32(bytes, valuesOffset),
            unpackedSize: readUint32(bytes, valuesOffset + 4),
            packedSize: readUint32(bytes, valuesOffset + 8),
            startOffset: readUint32(bytes, valuesOffset + 12),
            endOffset: readUint32(bytes, valuesOffset + 16),
        });
    }

    return {
        byteLength: bytes.byteLength,
        header: ARC_SIGNATURE,
        entries,
    };
}

export function isOriginalArcTextCandidate(name: string): boolean {
    return /\.(ai|dee|deo|evt|srf|txt|atr)$/i.test(name);
}
