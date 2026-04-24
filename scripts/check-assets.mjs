import fs from 'fs';
import path from 'path';

const targetDir = process.cwd();
const srcDir = path.join(targetDir, 'src');

// 게임이니까 public이나 db, assets 등 다양한 루트 폴더가 존재할 수 있습니다.
const publicDir = path.join(targetDir, 'public');
const assetsDir = path.join(targetDir, 'assets');

function findFilesByExt(dir, extList) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(findFilesByExt(filePath, extList));
    } else {
      if (extList.some(ext => file.endsWith(ext))) results.push(filePath);
    }
  }
  return results;
}

const tsFiles = findFilesByExt(srcDir, ['.ts', '.tsx']);
// 코드 내에서 불리는 미디어 에셋 패턴
const assetRegex = /['"]([^'"]+\.(png|jpg|jpeg|gif|webp|mp3|wav|ogg))['"]/ig;

let hasError = false;
console.log('🔍 Checking asset references across Sin Eater code...');

tsFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = assetRegex.exec(content)) !== null) {
      const assetString = match[1]; 
      
      const cleanPath = assetString.startsWith('/') ? assetString.slice(1) : assetString;
      
      const existsInPublic = fs.existsSync(path.join(publicDir, cleanPath));
      const existsInAssetsDir = fs.existsSync(path.join(assetsDir, cleanPath));
      const existsInRoot = fs.existsSync(path.join(targetDir, cleanPath));
      const existsInSrc = fs.existsSync(path.join(srcDir, cleanPath));
      
      if (!existsInPublic && !existsInRoot && !existsInSrc && !existsInAssetsDir) {
         console.error(`❌ [Error]: Asset '${assetString}' is referenced in [${path.basename(file)}], but actual file is missing!`);
         hasError = true;
      } else {
         console.log(`✅ Asset '${assetString}' verified.`);
      }
  }
});

if (hasError) {
  console.error('\n🚨 Cannot commit: Missing game assets detected! Check your paths or typos.');
  process.exit(1);
} else {
  console.log('\n🎉 All references point to existing game assets!');
  process.exit(0);
}
