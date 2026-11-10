/* 三更灯 · 工程自检 CLI
 * 用法：node tools/selftest.cjs [--seeds 200] [--json out.json] [--demo]
 * 纯 Node 运行，不依赖浏览器；输出可直接作为创作手记的「运行记录」。
 */
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
['core', 'director', 'npc', 'game', 'agent'].forEach(f => require(path.join(ROOT, 'js', f + '.js')));
const SD = globalThis.SD;

const args = process.argv.slice(2);
function arg(name, def) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; }
const N = parseInt(arg('--seeds', '200'), 10);
const jsonOut = arg('--json', '');

const t0 = Date.now();
const report = SD.Agent.selftest({ seeds: N });
report.generatedAt = new Date().toISOString();
report.elapsedMs = Date.now() - t0;
report.runtime = 'node ' + process.version;

if (arg('--demo', '') !== '' || args.includes('--demo')) {
  report.defectDemo = SD.Agent.defectDemo('DEFECT_F01');
  const tr = SD.Agent.run('DEMO_TRACE', 3);
  report.demoTrace = {
    seed: tr.seed, night: tr.night, initialState: tr.initialState,
    actions: tr.actions, correct: tr.correct, steps: tr.steps
  };
}

console.log('\n=== 三更灯 · 工程自检 ===');
console.log('随机种子组:', report.seeds, '| 耗时:', report.elapsedMs, 'ms |', report.runtime);
report.cases.forEach(c => {
  console.log((c.pass ? '  PASS  ' : '  FAIL  ') + c.name);
  console.log('         ' + JSON.stringify(c.detail).slice(0, 260));
});
console.log('---');
console.log('汇总:', JSON.stringify(report.summary));
if (report.defectDemo) console.log('缺陷复现 F-01 reproduced =', report.defectDemo.reproduced);
if (jsonOut) {
  fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2), 'utf8');
  console.log('已写出:', jsonOut);
}
process.exit(report.summary.allPass ? 0 : 1);
