import {spawnSync} from 'node:child_process';
import {access,copyFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const mobile=fileURLToPath(new URL('../',import.meta.url)),android=path.join(mobile,'android');
const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT;
if(!sdk)throw new Error('Set ANDROID_HOME to the installed Android SDK directory.');
await access(path.join(sdk,'platform-tools',process.platform==='win32'?'adb.exe':'adb'));
const args=['--no-daemon','assembleDebug'];
const result=process.platform==='win32'
  ?spawnSync('cmd.exe',['/d','/c','gradlew.bat',...args],{cwd:android,stdio:'inherit',env:process.env})
  :spawnSync('./gradlew',args,{cwd:android,stdio:'inherit',env:process.env});
if(result.error)throw result.error;
if(result.status!==0)process.exit(result.status||1);
const output=path.join(mobile,'artifacts');await mkdir(output,{recursive:true});
await copyFile(path.join(android,'app/build/outputs/apk/debug/app-debug.apk'),path.join(output,'Sideout-debug.apk'));
console.log('Installable development APK: mobile/artifacts/Sideout-debug.apk');
