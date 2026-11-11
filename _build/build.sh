set -e
cd "$(dirname "$0")"
node build-map.mjs >/dev/null
node -e "
const fs=require('fs');const m=require('./map-out.json');
let h=fs.readFileSync('src/index.src.html','utf8');
h=h.replace('<!--MAP-->',m.svg).replace('<!--MAPDATA-->',JSON.stringify(m.pts));
fs.writeFileSync('../index.html',h);"
npx esbuild src/heart.js --bundle --minify --format=iife --target=es2019 --outfile=../heart.js --log-level=warning
