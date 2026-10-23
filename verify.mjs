import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [source, fixture, work, output] = process.argv.slice(2, 6).map(p => path.resolve(p));
const safeMode = process.argv.includes('--safe');
assert(work !== fixture && work !== source && !fixture.startsWith(work + path.sep) && !source.startsWith(work + path.sep), 'Use a separate new work directory');
await fs.mkdir(work); // Never reset an existing checkout.
const load = p => import(pathToFileURL(path.join(source,p)).href);
const { GlobalConfig } = await load('lib/config/global.ts');
const git = await load('lib/util/git/index.ts');
const { updateArtifacts } = await load('lib/modules/manager/mise/artifacts.ts');
const { updateLockedDependency } = await load('lib/modules/manager/mise/update-locked.ts');
const { Toml } = await load('lib/util/schema-utils/index.ts');
const digest = text => createHash('sha256').update(text).digest('hex');

GlobalConfig.set({localDir:work,cacheDir:process.env.RENOVATE_REPRO_CACHE ?? path.join(work, '.cache'),binarySource:'global',platform:'github',allowedUnsafeExecutions:safeMode ? [] : ['mise'],exposeAllEnv:true,executionTimeout:5});
await git.initRepo({url:fixture,defaultBranch:'main',currentBranch:'main'});
await git.syncGit();
const config = await fs.readFile(path.join(work,'mise.toml'),'utf8');
const originalLock = await fs.readFile(path.join(work,'mise.lock'),'utf8');
const original = Toml.parse(originalLock);
const cowsay = original.tools['pypi:cowsay'];
const cowsayFiles = {};
for (const name of ['pyproject.toml','uv.lock']) {
  const relative = `${cowsay[0].uv.path}/${name}`;
  cowsayFiles[relative] = digest(await fs.readFile(path.join(work,relative)));
}
const updated = updateLockedDependency({packageFile:'mise.toml',lockFile:'mise.lock',lockFileContent:originalLock,packageFileContent:config,depName:'ansible',currentVersion:'14.4.0',newVersion:'14.5.0'});
assert.equal(updated.status,'updated');
const results = await updateArtifacts({packageFileName:'mise.toml',updatedDeps:[{depName:'ansible',datasource:'pypi',currentVersion:'14.4.0',newVersion:'14.5.0',newValue:'latest'}],newPackageFileContent:config,newLockFileContent:updated.files['mise.lock'],config:{}});
const after = Toml.parse(await fs.readFile(path.join(work,'mise.lock'),'utf8'));
const receipt={source,work,results:results?.map(r => r.file ? {type:r.file.type,path:r.file.path,sha256:r.file.contents?digest(r.file.contents):null} : r),ansibleVersion:after.tools.ansible[0].version,configUnchanged:config===await fs.readFile(path.join(work,'mise.toml'),'utf8'),unrelatedEntryUnchanged:JSON.stringify(cowsay)===JSON.stringify(after.tools['pypi:cowsay']),unrelatedFilesUnchanged:true};
for (const [relative,hash] of Object.entries(cowsayFiles)) {
  receipt.unrelatedFilesUnchanged &&= hash===digest(await fs.readFile(path.join(work,relative)));
}
await fs.writeFile(output,JSON.stringify(receipt,null,2)+'\n');
assert(!results?.some(r => r.artifactError), 'Artifact generation failed; see receipt');
assert(results?.some(r => r.file?.path.endsWith('/uv.lock')), 'Python sidecar must be returned');
assert(results?.some(r => r.file?.path==='mise.lock'), 'Main lockfile must be returned');
assert(receipt.configUnchanged && receipt.unrelatedEntryUnchanged && receipt.unrelatedFilesUnchanged);
assert.equal(receipt.ansibleVersion,'14.5.0');
console.log(JSON.stringify(receipt,null,2));

