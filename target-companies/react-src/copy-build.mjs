import {readdir,cp} from 'node:fs/promises';
for(const entry of await readdir(new URL('../react-build/',import.meta.url),{withFileTypes:true}))await cp(new URL('../react-build/'+entry.name,import.meta.url),new URL('../'+entry.name,import.meta.url),{recursive:true});
console.log('Updated local preview HTML and bundled assets.');

await cp(new URL('../resource.html',import.meta.url),new URL('../index.html',import.meta.url));
