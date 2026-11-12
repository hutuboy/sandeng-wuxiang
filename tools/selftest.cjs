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

// ---- T7 / T8：逻辑层不变量（P2 重写，不改动既有 T1–T6 口径）
const D = SD.Difficulty;
const L = SD.Logic;
const TIERS = D ? D.IDS : ['basic'];
const PER = Math.min(N, 60);

// T7 「满足残卷式 F 者唯一」——四档 × 三夜，且残卷的算子必须与档位计划一致
(function () {
  let checked = 0, bad = 0, firstBad = null;
  const opHist = {};
  for (const tier of TIERS) {
    for (let s = 0; s < PER; s++) {
      for (let night = 1; night <= 3; night++) {
        const cs = SD.Director.generate('L' + s, night, tier);
        checked++;
        const plan = L.planFor(tier);
        const uniq = cs.logic && cs.logic.expr ? L.uniqueFor(cs, cs.logic.expr) : { unique: false, winners: [] };
        const opOk = !!(cs.logic && cs.logic.op === plan.op && cs.logic.plan === plan);
        // 再独立跑一次「标准解」，确认生成期与求解期用的是同一套判定
        const sol = L.solution(cs);
        const ok = uniq.unique && sol.unique && cs.logic.unique === true && cs.logicSolvable === true && opOk;
        if (cs.logic) opHist[cs.logic.op] = (opHist[cs.logic.op] || 0) + 1;
        if (!ok) { bad++; if (!firstBad) firstBad = { tier, night, seed: 'L' + s, op: cs.logic && cs.logic.op, winners: uniq.winners }; }
      }
    }
  }
  const pass = bad === 0;
  report.cases.push({
    name: 'T7 残卷式 F 命中唯一（四档 × 三夜，含算子与档位一致）',
    pass, detail: { checked, bad, firstBad, opHist }
  });
  report.summary.total += 1;
  if (pass) report.summary.passed += 1;
  report.summary.allPass = report.summary.passed === report.summary.total;
})();

// T8 「算子区分度」——残卷上的算子不是装饰：
//    高级档只有 ⊕ 能唯一指到无相；中级档 ∧ / ∨ 都筛不出人（或指错人）；
//    初级档 ∧ 唯一而 ∨ 会连「只记岔一条」的清白客一起命中；基础档 ∧ 直接无人命中。
(function () {
  const checks = [];
  function countFor(cs, op) { return L.uniqueFor(cs, L.buildFormula(cs, op)); }
  const agg = {};
  for (const tier of TIERS) {
    agg[tier] = { bad: 0, checked: 0, firstBad: null };
    for (let s = 0; s < PER; s++) {
      for (let night = 1; night <= 3; night++) {
        const cs = SD.Director.generate('K' + s, night, tier);
        const clueCount = cs.clues.length;
        let ok = true, note = '';
        if (tier === 'advanced') {
          // ⊕ 之外三种算子都不许唯一命中无相
          for (const op of ['AND', 'OR', 'NAND']) {
            if (countFor(cs, op).unique) { ok = false; note = op + ' 也唯一'; }
          }
        } else if (tier === 'intermediate') {
          for (const op of ['AND', 'OR']) {
            if (countFor(cs, op).unique) { ok = false; note = op + ' 也唯一'; }
          }
        } else if (tier === 'basic') {
          if (countFor(cs, 'AND').winners.length !== 0) { ok = false; note = '∧ 竟然命中'; }
        } else if (tier === 'novice') {
          // 结构诱饵必须在场：至少一位清白客在物证上「记岔」
          const decoy = cs.guests.some(q => !q.isImpostor && q.devSet.length > 0);
          if (!decoy) { ok = false; note = '无结构诱饵'; }
          // 只有两件物证时，∨ 必然同时命中诱饵 → ∧ 的必要性可被观测
          if (clueCount === 2 && countFor(cs, 'OR').winners.length < 2) { ok = false; note = '∨ 未同时命中诱饵'; }
        }
        agg[tier].checked++;
        if (!ok) { agg[tier].bad++; if (!agg[tier].firstBad) agg[tier].firstBad = { night, seed: 'K' + s, note, clueCount }; }
      }
    }
    checks.push({ tier, ...agg[tier], pass: agg[tier].bad === 0 });
  }
  const pass = checks.every(c => c.pass);
  report.cases.push({
    name: 'T8 算子区分度：用错算子会指错人 / 筛空 / 命中两人',
    pass, detail: { tiers: checks.map(c => c.tier + ':' + (c.pass ? 'ok' : c.bad + '/' + c.checked + ' ' + c.firstBad.note)) , firstBad: checks.filter(c => !c.pass)[0] || null }
  });
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
