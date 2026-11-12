/* 三更灯 · 工程自检 CLI
 * 用法：node tools/selftest.cjs [--seeds 200] [--json out.json] [--demo]
 * 纯 Node 运行，不依赖浏览器；输出可直接作为创作手记的「运行记录」。
 */
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
['core', 'difficulty', 'logic', 'director', 'npc', 'game', 'agent'].forEach(f => require(path.join(ROOT, 'js', f + '.js')));
const SD = globalThis.SD;

const args = process.argv.slice(2);
function arg(name, def) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; }
const N = parseInt(arg('--seeds', '200'), 10);
const jsonOut = arg('--json', '');

const t0 = Date.now();
const report = SD.Agent.selftest({ seeds: N });

// 逻辑层不变量（P1 追加，不改动既有 T1–T6 口径）：跨档位 × 夜次，标准解必须唯一
(function () {
  const D = SD.Difficulty;
  const tiers = D ? D.IDS : ['basic'];
  const per = Math.min(N, 60);
  let checked = 0, bad = 0, firstBad = null;
  for (const tier of tiers) {
    for (let s = 0; s < per; s++) {
      for (let night = 1; night <= 3; night++) {
        const cs = SD.Director.generate('L' + s, night, tier);
        checked++;
        const ok = !!(cs.logic && cs.logic.unique === true && cs.logicSolvable === true);
        if (!ok) { bad++; if (!firstBad) firstBad = { tier, night, seed: 'L' + s, winners: cs.logic && cs.logic.winners }; }
      }
    }
  }
  const pass = bad === 0;
  report.cases.push({ name: 'T7 逻辑标准解唯一（四档 × 三夜）', pass, detail: { checked, bad, firstBad } });
  report.summary.total += 1;
  if (pass) report.summary.passed += 1;
  report.summary.allPass = report.summary.passed === report.summary.total;
})();
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
