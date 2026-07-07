import { readFileSync } from 'fs';
const d = JSON.parse(readFileSync('data/raids.json', 'utf8'));
const raid = d.Raid;
for (const [stage, obj] of Object.entries(raid)) {
  const keys = Object.keys(obj);
  console.log('Stage ' + stage + ': ' + keys.length + ' keys');
  const first = obj[keys[0]];
  if (first !== null && typeof first === 'object' && !Array.isArray(first)) {
    console.log('  inner: ' + Object.keys(first).join(', '));
  } else if (Array.isArray(first)) {
    console.log('  array[' + first.length + ']');
  }
  if (stage === '0' && first) console.log('  sample: ' + JSON.stringify(first).slice(0, 600));
}
