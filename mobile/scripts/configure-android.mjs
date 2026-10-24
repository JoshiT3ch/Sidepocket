import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const mobile=fileURLToPath(new URL('../',import.meta.url));
const root=path.join(mobile,'android'),manifest=path.join(root,'app/src/main/AndroidManifest.xml');
let xml;
try{xml=await readFile(manifest,'utf8');}catch{throw new Error('Android project is missing. Run npm run android:init first.');}
if(!xml.includes('android.permission.CAMERA'))xml=xml.replace('</manifest>','    <uses-permission android:name="android.permission.CAMERA" />\n    <uses-feature android:name="android.hardware.camera" android:required="false" />\n</manifest>');
// A prototype uses a private callback scheme. Verified HTTPS app links are a release step.
if(!xml.includes('android:scheme="com.sideout.valencia"'))xml=xml.replace('</activity>',`    <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="com.sideout.valencia" android:host="auth" android:path="/callback" />
            </intent-filter>
        </activity>`);
// Prevent Android backup from copying app login tokens to another installation.
xml=xml.replace('android:allowBackup="true"','android:allowBackup="false"');
await writeFile(manifest,xml);
const strings=path.join(root,'app/src/main/res/values/strings.xml');
let values=await readFile(strings,'utf8');
values=values.replace(/(<string name="app_name">)[^<]*(<\/string>)/,'$1Sideout$2');
await writeFile(strings,values);
// A density-independent PNG reuses our existing authored icon for the prototype.
const drawable=path.join(root,'app/src/main/res/drawable');await mkdir(drawable,{recursive:true});
await copyFile(path.join(mobile,'../dist/icons/sideout-maskable-512.png'),path.join(drawable,'sideout_icon.png'));
xml=xml.replace(/android:icon="[^"]+"/,'android:icon="@drawable/sideout_icon"').replace(/android:roundIcon="[^"]+"/,'android:roundIcon="@drawable/sideout_icon"');
await writeFile(manifest,xml);
console.log('Android callback, camera permission, backup settings, and Sideout icon configured.');
