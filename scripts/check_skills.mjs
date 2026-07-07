import { readFileSync } from 'fs';
const d = JSON.parse(readFileSync('data/raids.json', 'utf8'));
const rs = d.RaidSkills;
let withDuration = 0, withEffects = 0, withRadius = 0;
for (const [k, s] of Object.entries(rs)) {
  if (s.Duration && s.Duration > 0) withDuration++;
  if (s.Effects && s.Effects.length > 0) withEffects++;
  if (s.Radius) withRadius++;
}
console.log('Total RaidSkills: ' + Object.keys(rs).length);
console.log('With Duration: ' + withDuration);
console.log('With Effects: ' + withEffects);
console.log('With Radius: ' + withRadius);
let shown = 0;
for (const [k, s] of Object.entries(rs)) {
  if ((s.Duration && s.Duration > 0) || (s.Effects && s.Effects.length > 0)) {
    console.log(k + ': ' + s.Name + ' Dur=' + s.Duration + ' Effects=' + (s.Effects ? s.Effects.length : 0));
    if (s.Effects) s.Effects.forEach(e => console.log('  Effect: Type=' + e.Type + ' Target=' + JSON.stringify(e.Target)));
    shown++;
    if (shown >= 6) break;
  }
}
