import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const mobile=fileURLToPath(new URL('../',import.meta.url));
const source=path.resolve(mobile,'../dist'),target=path.join(mobile,'www');
// A separate copy keeps Capacitor and native-only CSP out of the public website.
await mkdir(target,{recursive:true});
await cp(source,target,{recursive:true});
const {build}=await import('esbuild');
await build({entryPoints:[path.join(mobile,'src/entry.js')],bundle:true,format:'iife',platform:'browser',target:['chrome108'],outfile:path.join(target,'native.js'),legalComments:'eof'});
await cp(path.join(mobile,'src/native.css'),path.join(target,'native.css'));
let html=await readFile(path.join(target,'index.html'),'utf8');
html=html.replace('<script src="/pwa.js" defer></script>','<script src="/native.js" defer></script>');
// The bundled shell does not install a service worker or show web installation controls.
html=html.replace('<title>','<link rel="stylesheet" href="/native.css"><title>');
html=html.replace("script-src 'self';","script-src 'self' 'unsafe-inline';");
// Capacitor injects its trusted bridge inline into the packaged document.
// Web-facing CSP remains unchanged; no remote scripts are permitted here.
html=html.replace('connect-src \'self\' https://pbfqudxyjklntneipjpq.supabase.co;',"connect-src 'self' https://pbfqudxyjklntneipjpq.supabase.co; media-src 'self' blob:;");
await writeFile(path.join(target,'index.html'),html);
console.log('Sideout mobile assets built in mobile/www.');
