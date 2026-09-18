#!/usr/bin/env node
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync,spawnSync} from "node:child_process";
import {chmodSync,mkdirSync,mkdtempSync,readFileSync,readlinkSync,realpathSync,symlinkSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {gzipSync} from "node:zlib";

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,"../.."),operator=path.join(here,"deploy-the-bot-landing"),packager=path.join(here,"package-release.mjs");
const source=execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim(),deployment=`landing-${source}-20260918010101`;
const sha=body=>createHash("sha256").update(body).digest("hex");
const run=(command,args,options={})=>spawnSync(command,args,{cwd:root,encoding:"utf8",...options});
function tarHeader(name,type="0",size=0){
  const header=Buffer.alloc(512);Buffer.from(name).copy(header,0);const octal=(offset,length,value)=>Buffer.from(`${value.toString(8).padStart(length-1,"0")}\0`).copy(header,offset);
  octal(100,8,type==="5"?0o755:0o644);octal(108,8,0);octal(116,8,0);octal(124,12,size);octal(136,12,0);header.fill(0x20,148,156);header[156]=type.charCodeAt(0);Buffer.from("ustar\0").copy(header,257);Buffer.from("00").copy(header,263);
  const checksum=header.reduce((sum,byte)=>sum+byte,0);Buffer.from(`${checksum.toString(8).padStart(6,"0")}\0 `).copy(header,148);return header;
}
function hostileArchive(name,type="0"){
  const body=Buffer.from("x"),padding=Buffer.alloc(511);
  return gzipSync(Buffer.concat([tarHeader("site/","5"),tarHeader("site/index.html","0",1),body,padding,tarHeader(name,type),Buffer.alloc(1024)]),{level:9});
}

const operatorSource=readFileSync(operator,"utf8"),installer=readFileSync(path.join(here,"install-operator.sh"),"utf8"),sudoers=readFileSync(path.join(here,"sudoers-auth-deploy-landing"),"utf8");
for(const token of ["SUDO_USER-} == auth-deploy","/var/www/the-bot-landing","/home/auth-deploy/uploads","f17b0bed053548f13e4e96f6c8e51d83e5d93f1eddcc404b26e4c0a9aab1615d","--quoting-style=escape -tvzf","archive_type","mv -Tf","flock -x","caddy validate","systemctl reload caddy","https://the-bot.ru/auth","https://avito.the-bot.ru/healthz","deploy_postcheck_rolled_back","caddy_routing_rolled_back"])assert.ok(operatorSource.includes(token),token);
assert.match(sudoers,/^auth-deploy ALL=\(root\) NOPASSWD: \/usr\/local\/sbin\/deploy-the-bot-landing \*$/m);
assert.match(installer,/sha256sum -c operator-checksums\.sha256/);assert.match(installer,/visudo -cf/);assert.match(installer,/trap 'rollback' ERR/);

const buildA=realpathSync(mkdtempSync(path.join(tmpdir(),"landing-package-a-"))),buildB=realpathSync(mkdtempSync(path.join(tmpdir(),"landing-package-b-")));
for(const output of [buildA,buildB]){const result=run(process.execPath,[packager,output,source,deployment]);assert.equal(result.status,0,result.stderr)}
const name=`the-bot-landing-${deployment}.tar.gz`,archiveA=path.join(buildA,name),archiveB=path.join(buildB,name),bodyA=readFileSync(archiveA),bodyB=readFileSync(archiveB);
assert.deepEqual(bodyA,bodyB);assert.equal(readFileSync(`${archiveA}.sha256`,"utf8"),`${sha(bodyA)}  ${name}\n`);
const entries=execFileSync("tar",["-tzf",archiveA],{encoding:"utf8"});
for(const required of ["site/index.html","site/schools/index.html","site/site.webmanifest","site/assets/brand/favicon.ico"])assert.match(entries,new RegExp(`^${required.replaceAll(".","\\.")}$`,"m"));
assert.doesNotMatch(entries,/deployment|AGENTS|check-site\.mjs|\.governance/);

const fixture=realpathSync(mkdtempSync(path.join(tmpdir(),"landing-operator-"))),www=path.join(fixture,"www"),uploads=path.join(fixture,"uploads"),state=path.join(fixture,"state"),mockbin=path.join(fixture,"bin");
for(const directory of [www,path.join(www,"releases"),path.join(www,"deployments"),uploads,state,mockbin]){mkdirSync(directory,{recursive:true,mode:0o700});chmodSync(directory,0o700)}
const previous=path.join(www,"releases","previous-release");mkdirSync(path.join(previous,"schools"),{recursive:true,mode:0o755});
writeFileSync(path.join(previous,"index.html"),'<a href="https://the-bot.ru/auth">Войти</a>\n');writeFileSync(path.join(previous,"schools","index.html"),"Платформа для управления репетиторским центром\n");symlinkSync(previous,path.join(www,"current"));
const caddy=`the-bot.ru {\n  @landing path / /index.html /privacy.html /terms.html /contacts.html /legal.css /release.html /logo.png /icon.png /problem-rules.png\n  handle @landing {\n    root * /var/www/the-bot-landing/current\n    file_server\n  }\n  reverse_proxy 127.0.0.1:3001\n}\n`;
const caddyPath=path.join(fixture,"Caddyfile");writeFileSync(caddyPath,caddy,{mode:0o644});
const copy=path.join(uploads,name);writeFileSync(copy,bodyA,{mode:0o600});chmodSync(copy,0o600);
writeFileSync(path.join(mockbin,"sha256sum"),`#!/bin/sh\n/usr/bin/shasum -a 256 "$1"\n`,{mode:0o755});
writeFileSync(path.join(mockbin,"caddy"),`#!/bin/sh\nprintf 'caddy %s\\n' "$*" >>"${fixture}/calls"\nexit "\${MOCK_CADDY_STATUS:-0}"\n`,{mode:0o755});
writeFileSync(path.join(mockbin,"systemctl"),`#!/bin/sh\nprintf 'systemctl %s\\n' "$*" >>"${fixture}/calls"\nexit "\${MOCK_SYSTEMCTL_STATUS:-0}"\n`,{mode:0o755});
writeFileSync(path.join(mockbin,"curl"),`#!/bin/sh\nurl=''; for value in "$@"; do url=$value; done\nprintf 'curl %s\\n' "$url" >>"${fixture}/calls"\nif [ "\${MOCK_PUBLIC_FAIL:-0}" = 1 ] && [ "$url" = 'https://the-bot.ru/' ]; then exit 22; fi\ncase "$url" in\n  https://the-bot.ru/) printf '<a href="https://the-bot.ru/auth">Войти</a>\\n';;\n  https://the-bot.ru/schools/) printf 'Платформа для управления репетиторским центром\\n';;\nesac\n`,{mode:0o755});
writeFileSync(path.join(mockbin,"flock"),"#!/bin/sh\nexit 0\n",{mode:0o755});

const harness=path.join(fixture,"harness.sh");
writeFileSync(harness,`#!/usr/bin/env bash\nset -euo pipefail\nexport THE_BOT_LANDING_TEST_ROOT=${JSON.stringify(fixture)}\nexport THE_BOT_LANDING_TEST_CADDY_SHA=${sha(Buffer.from(caddy))}\nexport PATH=${JSON.stringify(`${mockbin}:${process.env.PATH}`)}\nsource ${JSON.stringify(operator)}\naction=$1; shift\ncase "$action" in prepare) prepare_release "$@";; routing) apply_routing "$@";; deploy) activate_release "$@";; rollback) rollback_release "$@";; esac\n`,{mode:0o755});
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
console.log("PASS: deterministic landing package and guarded operator fixtures");
