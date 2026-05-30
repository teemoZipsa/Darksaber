import { TileType } from './Tile';
import type { TilePoint } from './WorldMap';

export const BURGOS_CASTLE_HMAP_SIZE = 138;
const BURGOS_CASTLE_HMAP_HALF = Math.floor(BURGOS_CASTLE_HMAP_SIZE / 2);

// Generated from original client MAP/01hmap.BMP (Burgos Castle), reduced to terrain symbols.
const BURGOS_CASTLE_HMAP_RLE = [
    '15f2st6st5st107w',
    '4ft10ft2ft4s2ft4sr107w',
    '5ft13f3s4f4st107w',
    't5ft12ftst4ft2st108w',
    '4fgt5ft5f3t2s2f3t2st108w',
    '2ftr2t5ft3ft2rt4s2rt2st109w',
    '2f3t3ft3ft2ftst5s2ts2t110w',
    '7ft5ftf2st8st9w6tr6tr34tr17t36w',
    '4ft4f5t2s2ft6sr10wts7ts3tr3ts3ts5ts6ts6ts9ts2ts7trtst36w',
    'ft3ft2f5t2st3ft3s2t10w2tsrtr2t2r3trt2r6tr6tr2tr3t2r5t2r2tr9trtr3tr3t35w',
    '6ft3f2t2st4ft3st11wr2trt2rt2r2s2tr9tr6tr16tr6ts5t2r5t35w',
    '3f3t4ft4stf3t3st11w3t2r5trs12tr6tr16tr6tsr5tr6t34w',
    '2ftrt3f2t6strt4st11wr10tr7t2x8tx6tx17tx2r9ts2t34w',
    'f4t3ft8st5s12wts8txtx4t7x3t4xtxt3x4t3x6t6xtx5tx4t35w',
    '7ft14st12w3t62x3t35w',
    '5f2t14st13wr2t8xt6xt2xt6xt6xt6xt6xt6xt8xts2t34w',
    '5f14s3t13wtst62xtst35w',
    '4ft14s2t14wrs15t3r28t3r17t35w',
    'tft2stft10st16w3tr6tr2tr2tr3tr2trtr2tr3trtr2trtrt3r2tr4trtr2tr2trtr7t34w',
    '5s3ft8s2t16wrstr2t3rt3rt3r3t3rtrtr2t3rt2rtrtrtrtrtr6t14rts2t34w',
    '4st4ft6st18wtst5rtr2tr3tr7trtrtr2tr4trtr2trt2r2tr3tr16t35w',
    '3sft4ft5st19w4trt3r3trtrt34r3tr2trtrtr2tr4t35w',
    '2s3fstrt5s2t19wr2tr2t3r3trx3t5r25tr2trtr5tr2tr7t34w',
    'sftf4t5s2t20w3trtr3t3rsrt6r7tr10tr6t3rt3r3t2rt2rt2r2tsr35w',
    's5f6st13wr5tr5trtrt2r3t2s2r2t3r4tr2tr2t6r2tr2t2r3t2rtr2trs2t2r2trt2r12t20w2t2w2t',
    'stf3t7s3t10w3ts2trts3tr5trt3rsr4tr4tr5t2r2tr5t3r3t2r2trt2rtr5tr6t3s2ts2t17wtrt2s2t2s',
    '2s2trt9st9wr11trtrt2rtrt4rtrt3r2trtr6tr2tr7trtrtrt2r2t3r2tr2t3rtr8tr3t16wt8s',
    '16s9w3trtr2tr2tr2tr2trt5rtr3t2r3t2rtr4t2rtr4trt2r3t2r2t6rt3r2tr3tr4tr2tr2t15wt9s',
    '15st9wr2trtrtrtrtrtrtrtr2trt4rt2rt2r3tr5tr3t2r5tr4t2r4t4r3trtr3tr5tr6t15wt8s',
    '11st2st10w5trtr2tr3tr2trtrt5r2trtrtr23t3rtrt2rtrtrtrtrtr2tr12t14wt9s',
    '9s6t10w15tr3tr6tr3t28r3tr5tr4tr6t3x3trst15wt9s',
    '9s16w3t10xrt3rt2rtrtrtrt33rtrtrtrtrt2rt2r10x3t15wt9s',
    '8sr16wr2t10xtr6tr3tr2tr3tr2tr4tr8trt2rt4r3tr2tr2tr3tr3t8xtx4t14w2t8s',
    '4tr3t16w3tr10x3tr2tr2trtrtr2trtr4trtrtr3trtr3t8r2tr2tr3trtr2tr2t10xts2t14wt9s',
    '25w14t2rt2rtrt2rtrtrtr2t2rtrtrtrt4rtrt2rt2rs3r2trtrtrt2rtrtrt3r11tst15wt9s',
    '25w3t2s2trtrtrtrtrtrtrtrtrt2rtrtrtrt2rtrtr2tr2trtrtrt3r2srtrt2rt2rtrtrtrt9r2ts5t12w3tr2st5s',
    '25w3t2srtrtrtrtrtrtrtrtrtr2trtrtrtr2tr2trtr3t3rtr2tr4s2rtrtr2tr2trtrt4r4trtr2srts2t11w2t2s2t2rt4s',
    '24w4t2s33tr2t3rtr6tr2s2r16t2rtr4trtsr3t12wt12s',
    't24w3t9rt15rt10rt10rtr5t2rt13rt7rt2r2ts2t9w2tr12s',
    'st23w11tr7tr3tr2tr3tr6t3r3t4r3tr3tr2tr3tr11tr6tr5ts2t8w2tsr2s2r8s',
    '2s22w4trtrtrtr2trtr2trtr4tr6trtr2trt3r2tr4tr2tr3trtr6tr2trtr2tr3trtr2tr4tst9wt3s3tr8s',
    '2st2wt3wt14w2ts2tr3trtr2trtr4trtr2trtrtr2trtr2trtrtr2trtr2tr3tr4trtr2tr2tr3tr2trtr2tr3tr5t8wt16s',
    '2s3ts5tr4w2t3strs6trtrtrtrtr2trtrtrtrtrtrtrtrtrtrtrtrtrtrtr2tr3t2rtrtrtr2trt2r2trtrtrtrtr2t3rtr6t7st16s',
    '12st3w10trt2rt2rtrtrt2rt2rt2rt2rtrtrtr3trtr2tr3tr2tr2trtr2trtrtrt2rtrt2rtrtrt2rtr3t2r2tr2tr2trts3ts2t16s',
    '12st3w2trt2r2t2r29t23rtrt2r28t2r9t16s',
    '12st2wrt2r2trtr2tr74tr7tr12t16s',
    '13st2s40t2s2ts2t2sts3ts2ts3ts2t2s29tr5tx4t6st9s',
    '16str13tr3tr2tr6tr3tr2tr30tr6tr9tr3tr2tr6t6x2t3sr2t2rt7s',
    '16s2t4xt4xtr4tr4tr2tr44tr6tr3tr9trtrt9x2t3sr2srt3r5s',
    '16st5xt4x3tr5tr3tr3tr2tr3tr33tr5tr3tr3trtr3tr3trt4xt2xt2xt3s2trtr4t4s',
    '16s2t10x3tr17tr7t2x2t2x2tx2t2xt2x2t2xtx4tr6tr9tr10t10xt16s',
    '17s12t3rt2r2tr2t2r2trtrtr2trt2rt27x4r2t4rtrtrt3rt2r2tr2tr4t6x2t16s',
    '16s2ts29trtr5t27x30t2s3ts3t16s',
    's2t13s2t2s31tr4t7xt6xt6xt5x32tr2t2srt16s',
    '3ft12s2tsr35t28x28t5r2t2srt16s',
    '4ft11s49tr6trtr36t2rs3r6t15s',
    't3ft2s10tr4tr88t2r2s2r3tr7t10s',
    't5fs104t5sr11t10s',
    'f2t4f29tr2trtrtr50trtr2tr2t2r8t3sr12t10s',
    '2ft4fr2tr23t5rt5r5tr18tr23t4rt6r19tr4t10s',
    '3f7tr2tr20t2r8tr4t2r42tr8t2r19tr4t10s',
    '7fr2tr3tr19t2r3tr3t2r4t2r18trtr21t2r3tr3t2r6tr2tr9tr4t10s',
    '7fr5tr11tr8t2r3tr4tr17ts24tr5tr3tr5tr24t10s',
    '7fr2trtr21t2r8tr44tr3tr8t2r19tr4t10s',
    '7f3tr3tr19tr9tr16t3r29trtr6tr20tr4t10s',
    '7fr2tr23tr9tr14t2rs3r28tr9tr24t10s',
    '3ft3fr2tr2trtr18tr9tr14t3r2s2r27tr9tr19tr4t10s',
    '6ftr2tr2tr20tr7trtr14tr4sr28tr7trtr19tr4t10s',
    '4f2tf27t2rtr6tr15t3sr29tr6tr2tr16tr7t10s',
    '5ftf27t2r8tr48tr9tr24t10s',
    '5ftf27t2r8tr12trtr8tr3trtr3tr3tr10tr9tr9tr14t10s',
    '4f30t2r8tr21tr2tr23tr6tr2tr6tr17t10s',
    '4ft2ftg4t2g19t2r8tr10tr3tr2tr3tr2tr2t2r2tr2t2r12tr9tr19t15s',
    '2ftf2t3f2t2f2ts7tr10t2r8tr10trt2rtrt2rtrtrt2rtr3t2rtrtr11tr9tr11t2r5t16s',
    '2ft5f8s8tr9t2r6trtr11trtrtr2t2rtrtrtrtrt2rt2rtrtr10tr9tr11t2r5t16s',
    'f2t4ft8s6t4r8tr9tr6tr41tr6tr2tr11tr4trt16s',
    '2t4f2t8s7t3r8tr5tr3trtr8trt2rt4rtrtrtrt3r5t3r11tr4tr4tr18t16s',
    '4ft11s7t2r9tr9tr10tr3tr4twt2rtr4trt2s2r2tr10tr9tr18t6st9s',
    '4ft11s18t2r8tr15tr9tr2trtr2st2r12tr7trt3r16t3srst2rt7s',
    '5f11s2t2r9tr4t2rt2rt2r2tr9tr11t2r9ts3tr11tr2t2rtrt4r14tr2t3sr2srt3r5s',
    '5ft10stsrts3tstststx3t2r3tr4tr8ts2t2ststs2t2s2t3s2t2s3t2srts10t2r8t2rtrxts2ts2ts3tr2t3sr2sr3tr2sr2s',
    '6f6tf2s4tr14t3r6t2r9tr2ts9trts4ts2ts3tr11t3r5trtr3tx14t3srt3r2srt3rs',
    '15f7trt3rtstxtrt12r6trtr4tr2tr2t2rt2rs2tr3tr3trt2r2tr5t11r3tx3trt2r2t2r3t16s',
    '15f3t2r6tr3tx4trtrt2rt2r9tr5tr2tr6t2s9t2r2tr9t4rtr2tr4tx9trtr2t16s',
    '9ts3ts7t3x3tr2tx14tr23t2r5tx30tx2tr4t2x6t15s',
    'r4tr8tr6t3x3tr2tx7tr3tr6tr5txt2x10tx2t2xt4x11tr2tr6tr6tx7t2x21t',
    '15wt8xt2x3txtrt2rt2rtrtrt2rt2rtrt34xtrt2r2trtrtrt2rtrtr2txtst11xt15w',
    '15wt11x3tx21t4xt13xt2xt10xtx21tx3t11xt15w',
    '28w2tx4tr2tr3tr2tr3tr2t34xtr2tr6tr2tr3tr2tx2t28w',
    '28wsr4t2r2tr3tr2tr3tr22t8x7trt2r2t2r2tr6tr3trt28w',
    '26w5t2rt2rtr13trtrtrtr2tr3trtr2tr11tr2tr3tr3tr3tr3tr6trts2t26w',
    '25w5t8r3trtrtrtrtr3tr4trtrtr2trtr2trtrtr3trtrtr2tr3tr2tr5tr2trtrtr6t26w',
    '25w2tf3t7rt2rtrt2rtrtrtrtrt2rtrtr2t2rtrtrt2rtrt2rtrtrtrt2rt2rtrt2r2t2rtrtrtr2tr3t2ft25w',
    '25wt2f3t3rs2rtr2trtrtr2t2rtrt2r2t3rt2rtrtrt2r2t2r2trtrtr2trtr2trtrtrt2rtrt2rt5r3t2ft25w',
    '25wtsf3t3r2s2rtr4tr3tr2tr3trtr2tr2tr3tr6tr4trtr2trtrtr2trtr2trtr5t3rtrt2f2t24w',
    '24w2ts5t4s3r2t2rtr3trtrtrt3rsrt2rtrtrt3r2t2rt3rt2rtrtrtrt2rtrtrtrtrtrxrt4r3t2fst24w',
    '25wt2f4trts2rtr3tr2trtrtrtrtr3trs2r2t2rtr2t3rtr2trtrt2rs3rtrtr2trtr2t2rs3r8tft25w',
    '25w2tf3tr6t3rs3trtrtrtrtrtrtrsr2tr2trtrt4rtrtr2trtr3sr2trtrtrtrtrtr2s2r2ts2trt2f2t23wt',
    '25wtsftr2tr2tr2t4rtr2trtrtr2trtrt4r2trtr3t3r2tr2trtrt4rtrtr2trtrtr2t3r2tr2sr3t2fst22wrs',
    '24w3tfs6trtrt5rtr5tr2trt5r2tr2t3rt3r2tr2trt6r2tr3tr2trt5r2t2sr3t2ft22wt2s',
    'w2t2w2t18wtf4trt3r2t6rt3rt2rt2r2t5rtrt11rt2rt6r3t3rt2r2t8rt3r3tft17wtw2twt2s',
    't7sr16wtsf3t3sr3trt2rt2r3tr2trtr2trt3rtr5t3r3tr6t4rtr4trtr3trt3r8t2f2t15w3t6s',
    '9s15w2ts4trstr3tr4t2rtr2tr3trtr5tr17tr5t2r2trtrtr2tr13t2fst15wt8s',
    '9st2wt12wt2fstr4t2rt2rtr6tr10t3rt2r2tr2tr3tr2trt2rtrtr9tr3tr2t5rtr2t2ft15wt9s',
    '9s6t10w9ts2tstr4txrtr2tr5txtstr2st2st2s3tst2st2s3tstrx4trtr2trtxtstr2tst2sts3t13wtrt5sf3s',
    '15st10w16tr13tx24tr3tx7tr3tx14t13w2t6s3f2s',
    '16s11wt4r2tr3trt2rtx12txr3t2r2t2r4tr3t2r4t2r2tx11txtr2tr2t2rtr2t14wt6s4fts',
    '16sr10wt2rt2r5t2r3t2x4tr2tr3tx2t2rtr3trtrtrtr3t2rt3rtr2x2tr3tr4tx3trtr2tr2trt14wr6s4fgs',
    '16s2t9wtr6t2xtrtr2t2x6tr4tx6t2x8t2xtr8tx3tr7tx6t2x5t14wr2srt3s3t2s',
    '16sr10w6txt2x6t2x11tx6t2x8t2x9t2x11tx3t2xt2x5t14wr3tr3s3t2s',
    '16s3wt8wxtxt2xt3x5t2x4tr2tr3tx5t3x3txtx2t3x3tx2txt2x2tr2trtrtrtx2txt5x2txt14wt12s',
    '16sr2ts2t5wt14xtx3tr10t25x2tx11tx2t10xt12w2t7sr2sr2s',
    'str3t16st5w5twt4w3tr14trtwtwt2w2t3wtw2twt4w20tw2t4w3t12wr9srt3rs',
    '2rstrt2r15s19w7tr4trtrt25w5tr6tr3t23w16s',
    'r3trtr3t13st18w5tr2trtr3trt26wr3tr4tr6t20wtr16s',
    'f4t2r16st18w16t26w14t2r19wt10s2ft5s',
    '2gt20st18wr15t26w11tr2trt18wt10s3ft5s',
    'fgf20s19w4tr4trtr2trt26w3trtr3tr5t19wt9st4ft4s',
    'fg2f3str2sr11s2tr16w16t26wr15t18wt3srstr3stf2t5s',
    'g2fgft2s2t3r13s16w12tr2t27w9trtr2trt18wt3s2t3r3strt2s2rt',
    'g3f2gt4st14sr15w5tr8trt26wr3tr2tr7t19wt14strtrt',
    'fg2f2gf19st2wtrt10w14trt26w11tr4t13wtwtr2t14s2trsr',
    '8ft23st9w16t26w9tr4t2r12wr12sr2s2r2st2rsrt',
    'g2fg2f3gt23s9wr2trtrtrtrtr2trt26w7tr3tr2tr12wt11st2rtrt5rtrtr',
    'fg2f2g2fgf23st8w12trtrt26w9tr6t11wt10strtrsr4trsr3t',
    'fg2fg3fg2f3str2sr14s2tr6w19tstw4tsrwr2t2srw3t3wr14tr9w2t9s2ft2rsr2tstrs3tst',
    'g2fg2f2g2fgft2s2t3r16sr5w3tr2trt2r2tr3t22st3w2trtrtrtr2tr2trt8wr10s3ft3rtrt4rtrt2r',
    'g2fg7fgft22st3wtw15t24sr2w15t3wt2wt2wt9st3f2t6rs2rt3rt',
    'fg2f2g2fg2f2gf23stw2tr15t25stw16tw7t10s4f4tstrsrts2trsr',
    '15ft27s14t26s15tr21s2trtrsr4trstrsrt',
    'g2fg2f2g2fg2f3gt26s14t27s15t21s4t5rt4rtr2t',
    'fg2f2g2fg2f2g2fgft105srtrtr4trt2rsr',
    'fg2fg6fg7ftft87s2ft2srt7s2rsr2tstrsr2tst',
    'g2fg2f2g2fg2f2g2fg2fg2f39st2f2t2ft2ft35st2f4t2r2trt3rtrtr2trtrtr2tr',
    'g20f2gt37st12f34s5f2str2t4rs2rt3rt2rtrtrt',
    'fg2f2g2fg2f2g2fg2f2g2f2g37st13f30stsrt2f2t2s3r2strsrt2strs2rs2trsr',
    '21f2gt36st14fts2t2s2t21s4trtrt3st2rtr2tr6trtr2trtrt',
    'g2fg2f2g2fg2f2g2fg2f2gft36st22ft24s4t4s6r2t3rt2rt3rt2rt',
 ] as const;

type BurgosHmapSymbol = 'w' | 'f' | 'g' | 's' | 'r' | 'x' | 't';

const TILE_BY_SYMBOL: Record<BurgosHmapSymbol, TileType> = {
    w: TileType.WATER,
    f: TileType.FOREST,
    g: TileType.GRASS,
    s: TileType.SAND,
    r: TileType.ROAD,
    x: TileType.WALL,
    t: TileType.STONE,
};

function decodeRow(row: string): string {
    let decoded = '';
    let countText = '';
    for (const char of row) {
        if (char >= '0' && char <= '9') {
            countText += char;
            continue;
        }
        const count = countText ? Number(countText) : 1;
        decoded += char.repeat(count);
        countText = '';
    }
    if (decoded.length !== BURGOS_CASTLE_HMAP_SIZE) {
        throw new Error(`Invalid Burgos Castle hmap row width: ${decoded.length}`);
    }
    return decoded;
}

export const BURGOS_CASTLE_HMAP_ROWS = BURGOS_CASTLE_HMAP_RLE.map(decodeRow);

export function getBurgosCastleHmapTileAt(tx: number, ty: number, center: TilePoint): TileType | null {
    const localX = tx - center.x + BURGOS_CASTLE_HMAP_HALF;
    const localY = ty - center.y + BURGOS_CASTLE_HMAP_HALF;
    if (localX < 0 || localY < 0 || localX >= BURGOS_CASTLE_HMAP_SIZE || localY >= BURGOS_CASTLE_HMAP_SIZE) {
        return null;
    }

    if (localX === BURGOS_CASTLE_HMAP_HALF && localY === BURGOS_CASTLE_HMAP_HALF) {
        return TileType.DUNGEON_ENTRANCE;
    }

    const symbol = BURGOS_CASTLE_HMAP_ROWS[localY][localX] as BurgosHmapSymbol;
    return TILE_BY_SYMBOL[symbol];
}
