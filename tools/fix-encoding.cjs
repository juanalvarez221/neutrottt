const fs=require('fs'),p=require('path');
const roots=process.argv.slice(1);
function walk(d){
  const st=fs.statSync(d);
  if(st.isDirectory()){for(const f of fs.readdirSync(d))walk(p.join(d,f));return;}
  const b=fs.readFileSync(d);
  if(b.length>3&&b[1]===0&&b[3]===0&&b[0]!==0){
    fs.writeFileSync(d,Buffer.from(b.toString('utf16le'),'utf8'));
    console.log('utf8-fixed:',d);
  }
}
for(const r of roots) if(fs.existsSync(r)) walk(r);