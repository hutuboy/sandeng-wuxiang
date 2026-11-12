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

// ---- T7 / T8 / T9：逻辑层不变量（P4 重写，不改动既有 T1–T6 口径）
const D = SD.Difficulty;
const L = SD.Logic;
const TIERS = D ? D.IDS : ['basic'];
const PER = Math.min(N, 60);

// T7 「满足当夜破绽判定者唯一」——四档 × 三夜，且破绽类型 / 算子必须与档位计划一致
(function () {
  let checked = 0, bad = 0, firstBad = null;
  const kindHist = {};
  for (const tier of TIERS) {
    for (let s = 0; s < PER; s++) {
      for (let night = 1; night <= 3; night++) {
        const cs = SD.Director.generate('L' + s, night, tier);
        checked++;
        const plan = L.planFor(tier);
        const flaw = L.flawOf(tier);
        const uniq = cs.logic && cs.logic.expr ? L.uniqueFor(cs, cs.logic.expr) : { unique: false, winners: [] };
        const sol = L.solution(cs);
        const kindOk = !!(cs.flaw && cs.flaw.kind === flaw.kind && cs.flaw.tier === tier);
        const opOk = !!(cs.logic && cs.logic.op === plan.op && cs.logic.op === flaw.op && cs.logic.plan === plan);
        const ok = uniq.unique && sol.unique && cs.logic.unique === true && cs.logicSolvable === true
          && cs.flaw.unique === true && kindOk && opOk;
        if (cs.flaw) kindHist[cs.flaw.kind] = (kindHist[cs.flaw.kind] || 0) + 1;
        if (!ok) {
          bad++;
          if (!firstBad) firstBad = { tier, night, seed: 'L' + s, kind: cs.flaw && cs.flaw.kind, op: cs.logic && cs.logic.op, kindOk, opOk, winners: uniq.winners };
        }
      }
    }
  }
  const pass = bad === 0;
  report.cases.push({
    name: 'T7 破绽判定命中唯一（四档 × 三夜，破绽类型与档位一致）',
    pass, detail: { checked, bad, firstBad, kindHist }
  });
  report.summary.total += 1;
  if (pass) report.summary.passed += 1;
  report.summary.allPass = report.summary.passed === report.summary.total;
})();

// T8 「破绽类型区分度」——残卷说的性质不是装饰：
//    换值档：两处都要（∧）时无人命中 → 只能靠「至少一处」
//    累积档：「至少一处」（∨）会连只错一条的诱饵一起网进来
//    否定档：全错（∧）会指错那两位清白客
//    恰一档：∧ / ∨ / ¬ 全都不唯一
(function () {
  const checks = [];
  const MODE = {
    substitute: cs => ({ op: 'AND', want: 'winners', wantVal: 0, note: '∧ 竟然有人' }),
    cumulative: cs => ({ op: 'OR', want: 'min', wantVal: 2, note: '∨ 没网进诱饵' }),
    negative: cs => ({ op: 'AND', want: 'notUnique', note: '∧ 竟然唯一' }),
    quantify: cs => ({ op: ['AND', 'OR', 'NAND'], want: 'notUnique', note: '另有算子也唯一' })
  };
  const agg = {};
  for (const tier of TIERS) {
    const kind = L.flawOf(tier).kind;
    agg[tier] = { kind, bad: 0, checked: 0, firstBad: null };
    for (let s = 0; s < PER; s++) {
      for (let night = 1; night <= 3; night++) {
        const cs = SD.Director.generate('K' + s, night, tier);
        const rule = MODE[kind];
        const spec = rule(cs);
        const ops = Array.isArray(spec.op) ? spec.op : [spec.op];
        let ok = true, note = '';
        for (const op of ops) {
          const r = L.uniqueFor(cs, L.buildFormula(cs, op));
          if (spec.want === 'winners' && r.winners.length !== spec.wantVal) { ok = false; note = spec.note + '(' + r.winners.length + ')'; }
          if (spec.want === 'min' && r.winners.length < spec.wantVal) { ok = false; note = spec.note + '(' + r.winners.length + ')'; }
          if (spec.want === 'notUnique' && r.unique) { ok = false; note = op + ' ' + spec.note; }
        }
        if (kind === 'cumulative') {
          const decoy = cs.guests.some(q => !q.isImpostor && q.devSet.length > 0);
          if (!decoy) { ok = false; note = '无结构诱饵'; }
        }
        agg[tier].checked++;
        if (!ok) { agg[tier].bad++; if (!agg[tier].firstBad) agg[tier].firstBad = { night, seed: 'K' + s, note }; }
      }
    }
    checks.push({ tier, kind, bad: agg[tier].bad, checked: agg[tier].checked, pass: agg[tier].bad === 0, firstBad: agg[tier].firstBad });
  }
  const pass = checks.every(c => c.pass);
  report.cases.push({
    name: 'T8 破绽类型区分度：用错判定会指错人 / 筛空 / 命中两人',
    pass,
    detail: {
      tiers: checks.map(c => c.tier + '(' + c.kind + '):' + (c.pass ? 'ok' : c.bad + '/' + c.checked)),
      firstBad: checks.filter(c => !c.pass)[0] || null
    }
  });
  report.summary.total += 1;
  if (pass) report.summary.passed += 1;
  report.summary.allPass = report.summary.passed === report.summary.total;
})();

// T9 「改口」只在第三夜的无相身上发生，且清白客人的证词恒等
//    （与 T3「重复提问证词一致」互补：T3 管清白客，T9 管无相的行为破绽）
(function () {
  let checked = 0, bad = 0, firstBad = null;
  const perNight = Math.min(PER, 40);
  for (const tier of TIERS) {
    for (let s = 0; s < perNight; s++) {
      for (let night = 1; night <= 3; night++) {
        const cs = SD.Director.generate('DR' + s, night, tier);
        checked++;
        const imp = cs.guests.filter(q => q.isImpostor)[0];
        const t = cs.drift ? cs.drift.topic : null;
        let ok = true, note = '';
        if (night >= 3) {
          if (!cs.drift || cs.drift.guestId !== cs.impostorId) { ok = false; note = '第三夜无改口标记'; }
          else {
            // 模拟两句证词：第一句照原口径，第二句换成别的值
            const base = imp.alibi[t];
            const alt = SD.Core.topic(t).values.filter(v => v !== base)[0];
            const st = [{ guestId: imp.id, topic: t, value: base }, { guestId: imp.id, topic: t, value: alt }];
            const drift = L.driftOf(cs, st);
            if (!(drift.length === 1 && drift[0] === imp.id)) { ok = false; note = 'driftOf 未识别无相'; }
            const j = L.judge(cs, st);
            if (!j.unique || j.byDrift !== imp.id) { ok = false; note = 'judge 未因改口收口'; }
            // 清白客两条一致时不许被标为改口
            const innocent = cs.guests.filter(q => !q.isImpostor)[0];
            const st2 = [{ guestId: innocent.id, topic: t, value: innocent.alibi[t] }, { guestId: innocent.id, topic: t, value: innocent.alibi[t] }];
            if (L.driftOf(cs, st2).length !== 0) { ok = false; note = '清白客被误判改口'; }
          }
        } else if (cs.drift) { ok = false; note = '非第三夜却有改口标记'; }
        if (!ok) { bad++; if (!firstBad) firstBad = { tier, night, seed: 'DR' + s, note }; }
      }
    }
  }
  const pass = bad === 0;
  report.cases.push({ name: 'T9 改口破绽：仅第三夜无相改口，清白客证词恒等', pass, detail: { checked, bad, firstBad } });
  report.summary.total += 1;
  if (pass) report.summary.passed += 1;
  report.summary.allPass = report.summary.passed === report.summary.total;
})();

// T10 「对簿」的信息经济与不变量（P5）
//   ① 一次对簿恰好耗 1 盏灯；② 至多开出「在座人数」条证词，且话题就是被对簿的那一件；
//   ③ 不制造假证词：同一人同一话题不得出现两种说法（第三夜无相的改口另算）；
//   ④ 在座不足两人 / 灯已燃尽时拒绝；
//   ⑤ 信息经济底线：一次对簿平均换回 ≥2 格，否则「一灯三格」的名头是假的。
(function () {
  let checked = 0, bad = 0, firstBad = null;
  const perNight = Math.min(PER, 24);
  const cellStat = {};
  for (const tier of TIERS) {
    let cells = 0, rounds = 0;
    for (let s = 0; s < perNight; s++) {
      for (let night = 1; night <= 3; night++) {
        checked++;
        const gm = SD.Game.create('CF' + s, night, { auto: true, tierId: tier });
        const topic = gm.cs.clues[0].topic;
        const present = gm.guests.filter(q => !q.flags.left).length;
        const lamps0 = gm.lampsLeft, st0 = gm.statements.length;
        const res = SD.Game.dispatch(gm, { type: 'CONFRONT', topic });
        const opened = gm.statements.length - st0;
        let note = '';
        if (!res.ok) note = '对簿被拒：' + res.error;
        else if (gm.lampsLeft !== lamps0 - 1) note = '灯数未恰好减一';
        else if (opened > present) note = '落格数超过在座人数';
        else {
          const fresh = gm.statements.slice(st0);
          /* 对簿问的是这一件，但「交付 / 交心」两条分支会主动摊开关键话题 —— 那是设计，不是越界。
             越界的定义收紧为：落进来的证词既不是被对簿的话题、也没有 byGift/byConfide 标记。 */
          const offTopic = fresh.filter(x => x.topic !== topic && !x.byGift && !x.byConfide);
          if (offTopic.length) note = '落入了别的话题（且非交付/交心）';
          if (fresh.some(x => !gm.cs.guests.some(q => q.id === x.guestId))) note = '证词主人不存在';
          const ev = res.events.filter(e => e.type === 'STATEMENTS')[0];
          if (!note && opened > 0 && (!ev || ev.data.length !== opened)) note = '事件与入簿条数不一致';
          const before = {};
          gm.statements.slice(0, st0).forEach(x => { if (x.topic === topic) before[x.guestId] = x.value; });
          const dup = fresh.filter(x => before[x.guestId] !== undefined && before[x.guestId] !== x.value);
          const driftOk = gm.cs.drift && dup.length > 0 && dup.every(x => x.guestId === gm.cs.drift.guestId);
          if (!note && dup.length && !driftOk) note = '同一人同一话题出现两种说法';
          if (!note) { cells += opened; rounds++; }
        }
        if (note) { bad++; if (!firstBad) firstBad = { tier, night, seed: 'CF' + s, note }; }
      }
    }
    cellStat[tier] = rounds ? +(cells / rounds).toFixed(2) : 0;
  }
  // ④ 边界：在座不足两人 / 灯已燃尽
  const gEdge = SD.Game.create('CFEDGE', 1, { auto: true, tierId: TIERS[0] });
  gEdge.guests[0].flags.left = true; gEdge.guests[1].flags.left = true;
  const rEdge = SD.Game.dispatch(gEdge, { type: 'CONFRONT', topic: gEdge.cs.clues[0].topic });
  if (rEdge.ok) { bad++; if (!firstBad) firstBad = { tier: TIERS[0], night: 1, seed: 'CFEDGE', note: '在座不足两人却允许对簿' }; }
  const gNo = SD.Game.create('CFNOLAMP', 1, { auto: true, tierId: TIERS[0] });
  gNo.lampsLeft = 0;
  const rNo = SD.Game.dispatch(gNo, { type: 'CONFRONT', topic: gNo.cs.clues[0].topic });
  if (rNo.ok) { bad++; if (!firstBad) firstBad = { tier: TIERS[0], night: 1, seed: 'CFNOLAMP', note: '灯已燃尽却允许对簿' }; }

  const thin = Object.keys(cellStat).filter(k => cellStat[k] < 2.0);
  const pass = bad === 0 && thin.length === 0;
  report.cases.push({
    name: 'T10 对簿：1 灯换至多三格、不造假证词、平均换回 ≥2 格',
    pass,
    detail: { checked, bad, firstBad, avgOpenedPerConfront: cellStat, thinTiers: thin }
  });
  report.summary.total += 1;
  if (pass) report.summary.passed += 1;
  report.summary.failed = report.summary.total - report.summary.passed;
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
