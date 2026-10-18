// Generate a complete native shell without deleting tracked native customizations.
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname,'..');
const app = path.join(root,'apps/web');
const native = path.join(app,'android');
if (!existsSync(path.join(native,'gradlew'))) {
  const temporary = await mkdtemp(path.join(tmpdir(),'checksquare-android-'));
  try {
    const config = JSON.parse(await readFile(path.join(app,'capacitor.config.json'),'utf8'));
    await writeFile(path.join(temporary,'package.json'),JSON.stringify({name:'checksquare-native',version:'1.0.0'}));
    await writeFile(path.join(temporary,'capacitor.config.json'),JSON.stringify({...config,webDir:path.join(root,'dist/apps/web')}));
    // CLI resolves @capacitor/android relative to the temporary package.
    const { symlink }=await import('node:fs/promises');
    await symlink(path.join(root,'node_modules'),path.join(temporary,'node_modules'),'dir');
    execFileSync(process.execPath,[path.join(root,'node_modules/@capacitor/cli/bin/capacitor'),'add','android'],{cwd:temporary,stdio:'inherit'});
    await cp(path.join(temporary,'android'),native,{recursive:true,force:false});
  } finally {
    await rm(temporary,{recursive:true,force:true});
  }
}

const manifestPath=path.join(native,'app/src/main/AndroidManifest.xml');
const manifest=await readFile(manifestPath,'utf8');
const launcherFilter=`            <intent-filter>\n                <action android:name="android.intent.action.MAIN" />\n                <category android:name="android.intent.category.LAUNCHER" />\n            </intent-filter>`;
const callbackFilter=`\n\n            <intent-filter>\n                <action android:name="android.intent.action.VIEW" />\n                <category android:name="android.intent.category.DEFAULT" />\n                <category android:name="android.intent.category.BROWSABLE" />\n                <data android:scheme="com.bhupathi.checksquare.connected" android:host="auth" android:path="/callback" />\n            </intent-filter>`;
if (!manifest.includes('android:scheme="com.bhupathi.checksquare.connected"')) {
  if (!manifest.includes(launcherFilter)) throw new Error('Could not register the CheckSquare OAuth deep link in the Android manifest.');
  await writeFile(manifestPath,manifest.replace(launcherFilter,`${launcherFilter}${callbackFilter}`));
}
console.log('Android shell ready with CheckSquare OAuth deep link.');
