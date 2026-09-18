#!/usr/bin/env node
import {createHash} from "node:crypto";
import {gzipSync} from "node:zlib";
import {execFileSync} from "node:child_process";
import {basename,dirname,resolve} from "node:path";
import {chmodSync,mkdirSync,renameSync,writeFileSync} from "node:fs";

const staticFiles=[
  "Screencust.mp4","assets/brand/apple-touch-icon.png","assets/brand/favicon-16-dark.png",
  "assets/brand/favicon-16-light.png","assets/brand/favicon-32-dark.png","assets/brand/favicon-32-light.png",
  "assets/brand/favicon-48-dark.png","assets/brand/favicon-48-light.png","assets/brand/favicon.ico",
  "assets/brand/pwa-192.png","assets/brand/pwa-512.png","assets/brand/pwa-maskable-192.png",
  "assets/brand/pwa-maskable-512.png","assets/brand/social-card-1200.png","assets/brand/source-dark.png",
  "assets/brand/source-light.png","assets/brand/source-social.png","contacts.html","hero-screencast-poster.png",
  "icon-white.png","icon.png","index.html","legal.css","logo.png","privacy.html","problem-rules.png",
  "problem-spreadsheets.png","problem-student-risk.png","release.html","schools/index.html",
  "schools/site.webmanifest","site.webmanifest","skyeng-white-base.png","terms.html",
].sort();

function stop(message){console.error(message);process.exit(1)}
function git(args,encoding="utf8"){return execFileSync("git",args,{cwd:resolve(import.meta.dirname,"../.."),encoding,maxBuffer:32*1024*1024})}
function writeString(buffer,offset,length,value){Buffer.from(value).copy(buffer,offset,0,length)}
function writeOctal(buffer,offset,length,value){writeString(buffer,offset,length,`${value.toString(8).padStart(length-1,"0")}\0`)}
function header(name,{directory=false,size=0}={}){
  if(Buffer.byteLength(name)>100)throw Error(`tar path too long: ${name}`);
  const value=Buffer.alloc(512,0);
  writeString(value,0,100,name);writeOctal(value,100,8,directory?0o755:0o644);writeOctal(value,108,8,0);
  writeOctal(value,116,8,0);writeOctal(value,124,12,size);writeOctal(value,136,12,0);
  value.fill(0x20,148,156);value[156]=directory?0x35:0x30;writeString(value,257,6,"ustar\0");
  writeString(value,263,2,"00");writeString(value,265,32,"root");writeString(value,297,32,"root");
  const sum=value.reduce((total,byte)=>total+byte,0),checksum=`${sum.toString(8).padStart(6,"0")}\0 `;
  writeString(value,148,8,checksum);return value;
}
function tarEntry(name,body){const padding=Buffer.alloc((512-(body.length%512))%512);return Buffer.concat([header(name,{size:body.length}),body,padding])}
function archive(source){
  const dirs=new Set(["site/"]);
  for(const file of staticFiles){let current=dirname(file);while(current!=="."){dirs.add(`site/${current}/`);current=dirname(current)}}
  const chunks=[...dirs].sort().map(name=>header(name,{directory:true}));
  for(const file of staticFiles){
    try{git(["cat-file","-e",`${source}:${file}`])}catch{throw Error(`missing release file: ${file}`)}
    chunks.push(tarEntry(`site/${file}`,git(["show",`${source}:${file}`],null)));
  }
  chunks.push(Buffer.alloc(1024));return gzipSync(Buffer.concat(chunks),{level:9,mtime:0});
}

const [outputArg,source,deploymentId,...extra]=process.argv.slice(2);
if(extra.length||!outputArg||!source||!deploymentId)stop("usage: package-release.mjs OUTPUT_DIR SOURCE_SHA DEPLOYMENT_ID");
if(!/^[0-9a-f]{40}$/.test(source)||!new RegExp(`^landing-${source}-[0-9]{14}$`).test(deploymentId))stop("invalid release identity");
let resolved;try{resolved=git(["rev-parse",`${source}^{commit}`]).trim()}catch{stop("source commit unavailable")}
if(resolved!==source)stop("source SHA must be exact");
const output=resolve(outputArg),name=`the-bot-landing-${deploymentId}.tar.gz`,target=resolve(output,name);
if(basename(target)!==name||dirname(target)!==output)stop("invalid output path");
mkdirSync(output,{recursive:true,mode:0o700});
const body=archive(source),digest=createHash("sha256").update(body).digest("hex"),temporary=`${target}.tmp-${process.pid}`;
writeFileSync(temporary,body,{mode:0o600,flag:"wx"});renameSync(temporary,target);chmodSync(target,0o600);
writeFileSync(`${target}.sha256`,`${digest}  ${name}\n`,{mode:0o600,flag:"wx"});
writeFileSync(`${target}.json`,`${JSON.stringify({version:1,sourceSha:source,deploymentId,archive:name,archiveSha256:digest})}\n`,{mode:0o600,flag:"wx"});
console.log(`LANDING_PACKAGE_READY source=${source} deployment=${deploymentId} archive=${target} sha256=${digest}`);

export {staticFiles};
