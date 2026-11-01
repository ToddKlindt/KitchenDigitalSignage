import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {validate} from '../web/config.js';

export function createSettingsStore(directory) {
 const file=path.join(directory,'settings.json');let current={revision:0,settings:null},queue=Promise.resolve();
 const ready=(async()=>{try{const saved=JSON.parse(await readFile(file,'utf8'));if(!Number.isSafeInteger(saved.revision)||saved.revision<1)throw Error();current={revision:saved.revision,settings:validate(saved.settings)};}catch(e){if(e.code!=='ENOENT')throw Error('Saved settings could not be loaded. Restore the settings file before saving.');}})();
 ready.catch(()=>{}); // Keep serving data if a corrupt settings file needs manual recovery.
 return {
  async get(){await ready;await queue.catch(()=>{});return structuredClone(current);},
  save(settings,expectedRevision){const operation=queue.catch(()=>{}).then(async()=>{
   await ready;
   if(!Number.isSafeInteger(expectedRevision)||expectedRevision!==current.revision){const e=Error('Settings changed on another device. Reload this page before saving.');e.status=409;throw e;}
   if(!settings||typeof settings!=='object'||Array.isArray(settings))throw Error('Invalid settings');
   const next={revision:current.revision+1,settings:validate(settings)};
   await mkdir(directory,{recursive:true,mode:0o700});
   await writeFile(file+'.tmp',JSON.stringify(next,null,2),{mode:0o600});await rename(file+'.tmp',file);current=next;
   return structuredClone(current);
  });queue=operation;return operation;}
 };
}
