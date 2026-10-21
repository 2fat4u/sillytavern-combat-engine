import fs from 'node:fs/promises';
const manifest = JSON.parse(await fs.readFile(new URL('./manifest.json', import.meta.url), 'utf8'));
await fs.writeFile(new URL('./version.js', import.meta.url), '// Generated from manifest.json by build-version.mjs.\nexport const VERSION = ' + JSON.stringify(manifest.version) + ';\n');
// Version every local module edge together: a new index must not mix an old UI
// or reaction helper from browser cache with a new manifest/version module.
for(const file of await fs.readdir(new URL('./',import.meta.url))){
    if(!file.endsWith('.js'))continue;
    const path=new URL(file,import.meta.url),source=await fs.readFile(path,'utf8');
    const next=source.replace(/^(import[^\r\n]*from\s+['"]\.\/[^'"?]+\.js)(?:\?v=[^'"]*)?(['"])/gm,'$1?v='+encodeURIComponent(manifest.version)+'$2');
    if(next!==source)await fs.writeFile(path,next);
}
