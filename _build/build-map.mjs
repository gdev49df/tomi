// строит статичную svg-карту евразии с подсветкой нужных стран
import fs from 'fs';
import { feature } from 'topojson-client';
import { geoMercator, geoPath } from 'd3-geo';

const topo = JSON.parse(fs.readFileSync('node_modules/world-atlas/countries-110m.json', 'utf8'));
const countries = feature(topo, topo.objects.countries).features;

const W = 1000, H = 640;
const proj = geoMercator().fitExtent([[0, 0], [W, H]], {
  type: 'MultiPoint', coordinates: [[16, 13], [148, 13], [16, 58], [148, 58]]
});
proj.clipExtent([[-20, -20], [W + 20, H + 20]]);
const path = geoPath(proj).digits(1);

const tags = { '398': 'home', '792': 'tr', '784': 'ae', '156': 'cn', '392': 'jp' };
let out = '';
for (const f of countries) {
  const d = path(f);
  if (!d) continue;
  const t = tags[f.id];
  out += t ? `<path d="${d}" class="land dest" data-c="${t}"/>` : `<path d="${d}" class="land"/>`;
}

const cities = {
  home: [71.43, 51.17], tr: [28.98, 41.01], ae: [55.27, 25.2], cn: [116.4, 39.9], jp: [139.69, 35.69]
};
const pts = Object.fromEntries(Object.entries(cities).map(([k, c]) => [k, proj(c).map(v => +v.toFixed(1))]));
fs.writeFileSync('map-out.json', JSON.stringify({ W, H, svg: out, pts }));
console.log('bytes', out.length, pts);
