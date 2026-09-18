#!/usr/bin/env node
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync,spawnSync} from "node:child_process";
import {chmodSync,lstatSync,mkdirSync,mkdtempSync,readdirSync,readFileSync,readlinkSync,realpathSync,rmSync,symlinkSync,truncateSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {gzipSync} from "node:zlib";

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,"../.."),operator=path.join(here,"deploy-the-bot-landing"),packager=path.join(here,"package-release.mjs");
const source=execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim(),deployment=`landing-${source}-20260918010101`;
const sha=body=>createHash("sha256").update(body).digest("hex");
const run=(command,args,options={})=>spawnSync(command,args,{cwd:root,encoding:"utf8",...options});
const temporaryRoot=realpathSync(tmpdir()),temporaryDirectories=[];
function temporaryDirectory(prefix){
  const created=mkdtempSync(path.join(temporaryRoot,prefix));temporaryDirectories.push(created);
  const canonical=realpathSync(created),metadata=lstatSync(canonical);
  assert.equal(path.dirname(canonical),temporaryRoot);assert.ok(metadata.isDirectory());assert.ok(!metadata.isSymbolicLink());assert.equal(metadata.uid,process.getuid());
  return canonical;
}
function makeTemporaryDirectoryRemovable(entry){
  const metadata=lstatSync(entry);if(metadata.isSymbolicLink())return;
  if(metadata.isDirectory()){chmodSync(entry,0o700);for(const child of readdirSync(entry))makeTemporaryDirectoryRemovable(path.join(entry,child));return;}
  assert.ok(metadata.isFile());chmodSync(entry,0o600);
}
function cleanupTemporaryDirectories(){
  for(const directory of temporaryDirectories.reverse()){
    const metadata=lstatSync(directory);assert.equal(path.dirname(directory),temporaryRoot);assert.ok(metadata.isDirectory());assert.ok(!metadata.isSymbolicLink());assert.equal(metadata.uid,process.getuid());
    makeTemporaryDirectoryRemovable(directory);
    rmSync(directory,{recursive:true,force:true});
  }
}
function tarHeader(name,type="0",size=0){
  const header=Buffer.alloc(512);Buffer.from(name).copy(header,0);const octal=(offset,length,value)=>Buffer.from(`${value.toString(8).padStart(length-1,"0")}\0`).copy(header,offset);
  octal(100,8,type==="5"?0o755:0o644);octal(108,8,0);octal(116,8,0);octal(124,12,size);octal(136,12,0);header.fill(0x20,148,156);header[156]=type.charCodeAt(0);Buffer.from("ustar\0").copy(header,257);Buffer.from("00").copy(header,263);
  const checksum=header.reduce((sum,byte)=>sum+byte,0);Buffer.from(`${checksum.toString(8).padStart(6,"0")}\0 `).copy(header,148);return header;
}
function hostileArchive(name,type="0"){
  const body=Buffer.from("x"),padding=Buffer.alloc(511);
  return gzipSync(Buffer.concat([tarHeader("site/","5"),tarHeader("site/index.html","0",1),body,padding,tarHeader(name,type),Buffer.alloc(1024)]),{level:9});
}

try {
const operatorSource=readFileSync(operator,"utf8"),installer=readFileSync(path.join(here,"install-operator.sh"),"utf8"),sudoers=readFileSync(path.join(here,"sudoers-auth-deploy-landing"),"utf8");
for(const token of ["SUDO_USER-} == auth-deploy","/var/www/the-bot-landing","/home/auth-deploy/uploads","f17b0bed053548f13e4e96f6c8e51d83e5d93f1eddcc404b26e4c0a9aab1615d","--quoting-style=escape -tvzf","archive_declared_size","write_journal","fsync_path","mv -Tf","flock -x","caddy validate","systemctl reload caddy","--write-out '%{http_code}'","id=\"auth-heading\">ВХОД</h1>","\"status\":\"ok\"","deploy_postcheck_rolled_back","caddy_routing_rolled_back"])assert.ok(operatorSource.includes(token),token);
assert.match(sudoers,/^auth-deploy ALL=\(root\) NOPASSWD: \/usr\/local\/sbin\/deploy-the-bot-landing \*$/m);
assert.match(installer,/sha256sum -c operator-checksums\.sha256/);assert.match(installer,/visudo -cf/);assert.match(installer,/trap 'rollback' ERR/);

const buildA=temporaryDirectory("landing-package-a-"),buildB=temporaryDirectory("landing-package-b-");
if(process.env.THE_BOT_LANDING_CLEANUP_ASSERTION_PROBE==="1")assert.fail("cleanup assertion probe");
for(const output of [buildA,buildB]){const result=run(process.execPath,[packager,output,source,deployment]);assert.equal(result.status,0,result.stderr)}
const name=`the-bot-landing-${deployment}.tar.gz`,archiveA=path.join(buildA,name),archiveB=path.join(buildB,name),bodyA=readFileSync(archiveA),bodyB=readFileSync(archiveB);
assert.deepEqual(bodyA,bodyB);assert.equal(readFileSync(`${archiveA}.sha256`,"utf8"),`${sha(bodyA)}  ${name}\n`);
const entries=execFileSync("tar",["-tzf",archiveA],{encoding:"utf8"});
for(const required of ["site/index.html","site/schools/index.html","site/site.webmanifest","site/assets/brand/favicon.ico"])assert.match(entries,new RegExp(`^${required.replaceAll(".","\\.")}$`,"m"));
assert.doesNotMatch(entries,/deployment|AGENTS|check-site\.mjs|\.governance/);

const caddy=`the-bot.ru {\n  @landing path / /index.html /privacy.html /terms.html /contacts.html /legal.css /release.html /logo.png /icon.png /problem-rules.png\n  handle @landing {\n    root * /var/www/the-bot-landing/current\n    file_server\n  }\n  reverse_proxy 127.0.0.1:3001\n}\n`;
function makeFixture(label,archiveBody=bodyA,chosenDeployment=deployment){
  const fixture=temporaryDirectory(`landing-operator-${label}-`),www=path.join(fixture,"www"),uploads=path.join(fixture,"uploads"),state=path.join(fixture,"state"),mockbin=path.join(fixture,"bin");
  for(const directory of [www,path.join(www,"releases"),path.join(www,"deployments"),uploads,state,mockbin]){mkdirSync(directory,{recursive:true,mode:0o700});chmodSync(directory,0o700)}
  const previous=path.join(www,"releases","previous-release");mkdirSync(path.join(previous,"schools"),{recursive:true,mode:0o755});
  writeFileSync(path.join(previous,"index.html"),'<a href="https://the-bot.ru/auth">Войти</a>\n');writeFileSync(path.join(previous,"schools","index.html"),"Платформа для управления репетиторским центром\n");symlinkSync(previous,path.join(www,"current"));
  const caddyPath=path.join(fixture,"Caddyfile");writeFileSync(caddyPath,caddy,{mode:0o644});
  const archiveName=`the-bot-landing-${chosenDeployment}.tar.gz`,copy=path.join(uploads,archiveName);writeFileSync(copy,archiveBody,{mode:0o600});chmodSync(copy,0o600);
  writeFileSync(path.join(mockbin,"sha256sum"),`#!/bin/sh\n/usr/bin/shasum -a 256 "$@"\n`,{mode:0o755});
  writeFileSync(path.join(mockbin,"caddy"),`#!/bin/sh\nprintf 'caddy %s\\n' "$*" >>"${fixture}/calls"\nexit "\${MOCK_CADDY_STATUS:-0}"\n`,{mode:0o755});
  writeFileSync(path.join(mockbin,"systemctl"),`#!/bin/sh\nprintf 'systemctl %s\\n' "$*" >>"${fixture}/calls"\nexit "\${MOCK_SYSTEMCTL_STATUS:-0}"\n`,{mode:0o755});
  writeFileSync(path.join(mockbin,"curl"),`#!/bin/sh
output=''; url=''; while [ "$#" -gt 0 ]; do case "$1" in --output) output=$2; shift 2;; --write-out) shift 2;; --*) shift;; *) url=$1; shift;; esac; done
printf 'curl %s\\n' "$url" >>"${fixture}/calls"
if [ "\${MOCK_PUBLIC_FAIL:-0}" = 1 ] && [ "$url" = 'https://the-bot.ru/' ]; then exit 22; fi
status=200; [ "\${MOCK_REDIRECT_URL:-}" != "$url" ] || status=302
case "$url" in
  https://the-bot.ru/) body='<a href="https://the-bot.ru/auth">Войти</a>';;
  https://the-bot.ru/schools/) body='Платформа для управления репетиторским центром';;
  https://the-bot.ru/auth) body='<h1 id="auth-heading">ВХОД</h1>';;
  https://avito.the-bot.ru/healthz) body='{"status":"ok","mode":"read-only"}' ;;
  *) body='asset';;
esac
printf '%s' "$body" >"$output"; printf '%s' "$status"
`,{mode:0o755});
  writeFileSync(path.join(mockbin,"flock"),"#!/bin/sh\nexit 0\n",{mode:0o755});
  const harness=path.join(fixture,"harness.sh");
  writeFileSync(harness,`#!/usr/bin/env bash\nset -euo pipefail\nexport THE_BOT_LANDING_TEST_ROOT=${JSON.stringify(fixture)}\nexport THE_BOT_LANDING_TEST_CADDY_SHA=${sha(Buffer.from(caddy))}\nexport PATH=${JSON.stringify(`${mockbin}:${process.env.PATH}`)}\nsource ${JSON.stringify(operator)}\naction=$1; shift\ncase "$action" in prepare) prepare_release "$@";; routing) apply_routing "$@";; deploy) activate_release "$@";; rollback) rollback_release "$@";; check) public_full_check;; esac\n`,{mode:0o755});
  return {fixture,www,uploads,state,previous,caddyPath,copy,harness,deployment:chosenDeployment,digest:sha(archiveBody)};
}
const act=(f,action,args=[],env={})=>run("bash",[f.harness,action,...args],{env:{...process.env,...env}});
const fixtureData=makeFixture("main"),{fixture,www,uploads,state,previous,caddyPath,copy,harness}=fixtureData;
let result=run("bash",[harness,"prepare",copy,source,sha(bodyA),deployment]);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/LANDING_RELEASE_PREPARED/);
const record=path.join(www,"deployments",`${deployment}.record`);assert.match(readFileSync(record,"utf8"),/state=prepared/);
result=run("bash",[harness,"routing",deployment],{env:{...process.env,MOCK_PUBLIC_FAIL:"1"}});assert.notEqual(result.status,0);assert.equal(readFileSync(caddyPath,"utf8"),caddy,"failed routing must restore exact Caddy bytes");assert.match(readFileSync(record,"utf8"),/state=prepared/);
result=run("bash",[harness,"routing",deployment]);assert.equal(result.status,0,result.stderr);assert.match(readFileSync(caddyPath,"utf8"),/\/site\.webmanifest \/assets\/brand\/\* \/schools \/schools\/\*/);assert.match(readFileSync(record,"utf8"),/state=routing-ready/);
result=run("bash",[harness,"deploy",deployment]);assert.equal(result.status,0,result.stderr);assert.equal(readlinkSync(path.join(www,"current")),path.join(www,"releases",deployment));assert.match(readFileSync(record,"utf8"),/state=active/);
result=run("bash",[harness,"rollback",deployment]);assert.equal(result.status,0,result.stderr);assert.equal(readlinkSync(path.join(www,"current")),previous);assert.match(readFileSync(record,"utf8"),/state=rolled-back/);
const nextDeployment=deployment.replace(/01$/,"05"),nextArchive=path.join(uploads,`the-bot-landing-${nextDeployment}.tar.gz`);writeFileSync(nextArchive,bodyA,{mode:0o600});chmodSync(nextArchive,0o600);
result=run("bash",[harness,"prepare",nextArchive,source,sha(bodyA),nextDeployment]);assert.equal(result.status,0,result.stderr);
result=run("bash",[harness,"routing",nextDeployment]);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/LANDING_ROUTING_REUSED/);assert.match(readFileSync(path.join(www,"deployments",`${nextDeployment}.record`),"utf8"),/state=routing-ready/);

for(const [suffix,body,error] of [["02",hostileArchive("site/../escape"),/archive_path/],["03",hostileArchive("site/link","2"),/archive_type/]]){
  const hostileDeployment=deployment.replace(/01$/,suffix),hostilePath=path.join(uploads,`the-bot-landing-${hostileDeployment}.tar.gz`);writeFileSync(hostilePath,body,{mode:0o600});chmodSync(hostilePath,0o600);
  const rejected=run("bash",[harness,"prepare",hostilePath,source,sha(body),hostileDeployment]);assert.notEqual(rejected.status,0);assert.match(rejected.stderr,error);
}
const unsafeDeployment=deployment.replace(/01$/,"04"),unsafePath=path.join(uploads,`the-bot-landing-${unsafeDeployment}.tar.gz`);writeFileSync(unsafePath,bodyA,{mode:0o644});chmodSync(unsafePath,0o644);
const unsafe=run("bash",[harness,"prepare",unsafePath,source,sha(bodyA),unsafeDeployment]);assert.notEqual(unsafe.status,0);assert.match(unsafe.stderr,/upload_metadata/);

for(const url of ["https://the-bot.ru/","https://the-bot.ru/schools/","https://the-bot.ru/site.webmanifest","https://the-bot.ru/assets/brand/favicon.ico","https://the-bot.ru/auth","https://avito.the-bot.ru/healthz"]){
  const redirected=act(fixtureData,"check",[],{MOCK_REDIRECT_URL:url});assert.notEqual(redirected.status,0,`redirect must fail: ${url}`);assert.match(redirected.stderr,/http_status:302/);
}

let scenario=20;
const nextId=()=>`landing-${source}-20260918${String(200000+scenario++).padStart(6,"0")}`;
const prepareFixture=f=>act(f,"prepare",[f.copy,source,f.digest,f.deployment]);
for(const phase of ["prepare_after_freeze","prepare_before_release_move","prepare_after_release_move","prepare_before_record","prepare_after_record"]){
  const f=makeFixture(phase,bodyA,nextId()),interrupted=act(f,"prepare",[f.copy,source,f.digest,f.deployment],{THE_BOT_LANDING_FAIL_AT:phase});
  assert.notEqual(interrupted.status,0,phase);assert.match(interrupted.stderr,new RegExp(`injected:${phase}`));
  const retry=prepareFixture(f);assert.equal(retry.status,0,retry.stderr);assert.match(readFileSync(path.join(f.state,`prepare-${f.deployment}.journal`),"utf8"),/phase=done/);
}
for(const phase of ["routing_before_backup","routing_after_backup","routing_before_candidate","routing_after_candidate","routing_before_caddy","routing_after_caddy","routing_before_reload","routing_after_reload","routing_before_state","routing_after_state","routing_after_record"]){
  const f=makeFixture(phase,bodyA,nextId());assert.equal(prepareFixture(f).status,0);
  const interrupted=act(f,"routing",[f.deployment],{THE_BOT_LANDING_FAIL_AT:phase});assert.notEqual(interrupted.status,0,phase);
  const retry=act(f,"routing",[f.deployment]);assert.equal(retry.status,0,retry.stderr);assert.match(readFileSync(path.join(f.state,`routing-${f.deployment}.journal`),"utf8"),/phase=done/);
}
for(const phase of ["deploy_before_symlink","deploy_after_symlink","deploy_before_record","deploy_after_record"]){
  const f=makeFixture(phase,bodyA,nextId());assert.equal(prepareFixture(f).status,0);assert.equal(act(f,"routing",[f.deployment]).status,0);
  const interrupted=act(f,"deploy",[f.deployment],{THE_BOT_LANDING_FAIL_AT:phase});assert.notEqual(interrupted.status,0,phase);
  const retry=act(f,"deploy",[f.deployment]);assert.equal(retry.status,0,retry.stderr);assert.equal(readlinkSync(path.join(f.www,"current")),path.join(f.www,"releases",f.deployment));assert.match(readFileSync(path.join(f.state,`deploy-${f.deployment}.journal`),"utf8"),/phase=done/);
}
for(const phase of ["rollback_before_symlink","rollback_after_symlink","rollback_before_record","rollback_after_record"]){
  const f=makeFixture(phase,bodyA,nextId());assert.equal(prepareFixture(f).status,0);assert.equal(act(f,"routing",[f.deployment]).status,0);assert.equal(act(f,"deploy",[f.deployment]).status,0);
  const interrupted=act(f,"rollback",[f.deployment],{THE_BOT_LANDING_FAIL_AT:phase});assert.notEqual(interrupted.status,0,phase);
  const retry=act(f,"rollback",[f.deployment]);assert.equal(retry.status,0,retry.stderr);assert.equal(readlinkSync(path.join(f.www,"current")),f.previous);assert.match(readFileSync(path.join(f.state,`rollback-${f.deployment}.journal`),"utf8"),/phase=done/);
}

const bombSource=temporaryDirectory("landing-bomb-source-"),bombSite=path.join(bombSource,"site");mkdirSync(path.join(bombSite,"schools"),{recursive:true});
writeFileSync(path.join(bombSite,"index.html"),'<a href="https://the-bot.ru/auth">Войти</a>');writeFileSync(path.join(bombSite,"schools","index.html"),"Платформа для управления репетиторским центром");const huge=path.join(bombSite,"huge.bin");writeFileSync(huge,"");truncateSync(huge,104857601);
const bombTar=path.join(bombSource,"bomb.tar.gz");execFileSync("tar",["-czf",bombTar,"site"],{cwd:bombSource});const bombBody=readFileSync(bombTar),bomb=makeFixture("bomb",bombBody,nextId());
const bombResult=prepareFixture(bomb);assert.notEqual(bombResult.status,0);assert.match(bombResult.stderr,/archive_declared_size/);assert.equal(readFileSync(bomb.copy).byteLength,bombBody.byteLength);assert.equal(run("find",[bomb.www,"-maxdepth","1","-name",".prepare-*","-print"]).stdout,"","oversize archive must be rejected before extraction");
const cleanupNames=()=>readdirSync(temporaryRoot).filter(name=>/^landing-(?:operator|package-[ab]|bomb-source)-/.test(name)).sort();
const beforeCleanupProbe=cleanupNames(),cleanupProbe=run(process.execPath,[fileURLToPath(import.meta.url)],{env:{...process.env,THE_BOT_LANDING_CLEANUP_ASSERTION_PROBE:"1"}});assert.notEqual(cleanupProbe.status,0);assert.match(cleanupProbe.stderr,/cleanup assertion probe/);assert.deepEqual(cleanupNames(),beforeCleanupProbe);
console.log("PASS: deterministic landing package and guarded operator fixtures");
} finally {
  cleanupTemporaryDirectories();
}
