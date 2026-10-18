// Generate a complete native shell without deleting tracked native customizations.
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname,'..');
const app = path.join(root,'apps/web');
const native = path.join(app,'android');
if (existsSync(path.join(native,'gradlew'))) {console.log('Android shell already exists.');process.exit(0);}
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
  console.log('Android shell generated; existing custom native files preserved.');
} finally {await rm(temporary,{recursive:true,force:true});}
