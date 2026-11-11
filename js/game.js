/* =====================================================================
 * 三更灯 · 无相客栈  |  game.js
 * 纯状态机：结构化状态 / 动作接口 / 胜负判定 / 计分 / 存档快照
 * 不含任何 DOM，可在 Node 中直接驱动（自动试玩 Agent 与工程自检依赖此层）
 * ===================================================================== */
(function (g) {
  'use strict';
  var SD = (g.SD = g.SD || {});
  var C = SD.Core, Director = SD.Director, NPC = SD.NPC;

  function create(seed, night, opts) {
    opts = opts || {};
    var cs = Director.generate(seed == null ? 'SANDENG' : String(seed), night || 1, opts.tierId);
    var game = {
      cs: cs,
      guests: C.deepClone(cs.guests),
      turn: 0,
      lamps: cs.lamps,
      lampsLeft: cs.lamps,
      phase: 'playing',
      statements: [],
      decisions: [],
      log: [],
      ending: null,
      result: null,
      seed: String(seed == null ? 'SANDENG' : seed),
      night: night || 1,
      auto: !!opts.auto
    };
    pushLog(game, 'system', '第 ' + game.night + ' 夜。三客投宿，一人为「无相」。灯只够点 ' + game.lamps + ' 回。');
    cs.clues.forEach(function (c) { pushLog(game, 'clue', c.title + '：' + c.text); });
    return game;
  }

  function pushLog(game, type, text) {
    game.log.push({ turn: game.turn, type: type, text: text });
  }

  function guest(game, id) {
    for (var i = 0; i < game.guests.length; i++) if (game.guests[i].id === id) return game.guests[i];
    return null;
  }

  /* ---- 结构化动作接口：供 Agent / 外部工具枚举与调用 ---- */
  function listActions(game) {
    if (game.phase !== 'playing') return [];
    var out = [];
    game.guests.forEach(function (q) {
      if (q.flags.left) return;
      C.TOPICS.forEach(function (t) {
        C.TONES.forEach(function (tone) {
          out.push({ type: 'ASK', guestId: q.id, topic: t.id, tone: tone.id });
        });
      });
    });
    out.push({ type: 'LISTEN' });
    game.guests.forEach(function (q) { out.push({ type: 'ACCUSE', guestId: q.id }); });
    return out;
  }

  function belief(game) {
    var b = {}, raw = {};
    game.guests.forEach(function (q) { b[q.id] = 0; raw[q.id] = 0; });
    game.cs.clues.forEach(function (clue) {
      var seen = {};
      game.statements.forEach(function (s) {
        if (s.topic !== clue.topic) return;
        var k = s.guestId + '|' + s.topic;
        if (seen[k]) return;
        seen[k] = 1;
        if (s.value !== clue.expect) raw[s.guestId] += 1;
      });
    });
    var total = 0;
    game.guests.forEach(function (q) { raw[q.id] += 0.12; total += raw[q.id]; });
    game.guests.forEach(function (q) { b[q.id] = C.round(raw[q.id] / total, 3); });
    return b;
  }

  function evidenceChain(game) {
    var n = 0;
    game.cs.clues.forEach(function (clue) {
      var seen = {};
      game.statements.forEach(function (s) {
        if (s.topic === clue.topic && !seen[s.guestId]) { seen[s.guestId] = 1; n++; }
      });
    });
    return n;
  }

  function dispatch(game, action, opts) {
    opts = opts || {};
    if (game.phase !== 'playing') return { ok: false, error: '本夜已结束' };
    var result = { ok: true, events: [], decision: null };

    if (action.type === 'ACCUSE') return accuse(game, action.guestId);

    if (action.type === 'LISTEN') {
      game.turn++; game.lampsLeft--;
      game.guests.forEach(function (q) {
        q.state.tension = C.clamp(q.state.tension - 12, 0, 100);
        q.state.trust = C.clamp(q.state.trust + 3, 0, 100);
        q.memory.push({ turn: game.turn, type: 'LISTEN', topic: null, npcAction: 'CALM', text: '掌柜添了一轮茶。' });
      });
      pushLog(game, 'system', '你添了一轮茶。灯影稳了些，众人紧绷的肩松下来。');
      result.events.push({ type: 'CALM', text: '全场张力 −12，信任 +3' });
      if (game.lampsLeft <= 0) conclude(game, 'lamps');
      return result;
    }

    if (action.type !== 'ASK') return { ok: false, error: '未知动作类型' };
    var q = guest(game, action.guestId);
    if (!q || q.flags.left) return { ok: false, error: '该客人已不在座' };
    if (!C.topic(action.topic) || !C.tone(action.tone)) return { ok: false, error: '非法的问话参数' };
    if (game.lampsLeft <= 0) return { ok: false, error: '灯已燃尽' };

    game.turn++; game.lampsLeft--;
    var decision = NPC.decide(game, action, { force: opts.forceNpcAction });
    decision.playerAction = { type: 'ASK', guestId: action.guestId, topic: action.topic, tone: action.tone };
    NPC.apply(game, action, decision);
    game.decisions.push(decision);

    if (decision.revealed) {
      game.statements.push(decision.revealed);
      result.events.push({ type: 'STATEMENT', data: decision.revealed });
    }
    result.decision = decision;
    result.events = result.events.concat(decision.effects.map(function (e) { return { type: 'EFFECT', text: e }; }));
    pushLog(game, 'ask', '【你】向 ' + q.name + ' ' + C.tone(action.tone).label + '「' + C.topic(action.topic).label + '」');
    pushLog(game, 'npc', '【' + q.name + '·' + decision.actionLabel + '】' + decision.text);

    if (decision.chosen === 'FLEE') {
      conclude(game, 'flee');
      result.events.push({ type: 'END', text: '无相趁夜遁走' });
    } else if (game.lampsLeft <= 0) {
      conclude(game, 'lamps');
    }
    return result;
  }

  function accuse(game, guestId) {
    var q = guest(game, guestId);
    if (!q) return { ok: false, error: '指认对象不存在' };
    var correct = guestId === game.cs.impostorId;
    var chain = evidenceChain(game);
    var avgTrust = game.guests.reduce(function (a, x) { return a + x.state.trust; }, 0) / game.guests.length;
    var leftCount = game.guests.filter(function (x) { return x.flags.left; }).length;

    var gain = 0;
    var diff = game.cs.difficulty;
    if (correct) {
      gain = 600 + game.lampsLeft * 40 + chain * 35 + Math.round((avgTrust - 45) * 2);
      if (chain < diff.chainMinForFullCredit) gain -= 120; // 没有证据链，靠蒙
      if (leftCount > 0) gain -= 80;
      gain = Math.max(120, gain);
    } else {
      gain = -120;
    }

    var ending;
    if (!correct) ending = '灯灭';
    else if (leftCount > 0) ending = '一灯独明';
    else if (chain >= game.cs.clues.length * 3 && avgTrust >= diff.endingBestTrust) ending = '灯下留名';
    else ending = '破晓';

    game.phase = 'ended';
    game.ending = ending;
    game.result = {
      correct: correct, accused: q.name, impostor: game.guests.filter(function (x) { return x.id === game.cs.impostorId; })[0].name,
      chain: chain, lampsLeft: game.lampsLeft, avgTrust: C.round(avgTrust, 1),
      score: gain, belief: belief(game), ending: ending,
      reveal: game.cs.clues.map(function (c) {
        return { clue: c.title, topic: C.topic(c.topic).label, expect: c.expect,
          words: game.guests.map(function (x) { return { name: x.name, value: x.alibi[c.topic] }; }) };
      })
    };
    pushLog(game, 'system', '你点了灯。' + (correct ? '无相现形。' : '灯下站着的，是个活人。') + '结局：' + ending);
    return { ok: true, events: [{ type: 'END', text: ending }], decision: null, result: game.result };
  }

  function conclude(game, reason) {
    if (game.phase === 'ended') return;
    if (reason === 'flee') {
      game.phase = 'ended'; game.ending = '空盏';
      game.result = { correct: false, accused: null, impostor: game.guests.filter(function (x) { return x.id === game.cs.impostorId; })[0].name,
        chain: evidenceChain(game), lampsLeft: 0, avgTrust: 0, score: 60, belief: belief(game), ending: '空盏', reason: 'flee', reveal: [] };
      pushLog(game, 'system', '座位空了，灯油还剩半盏。你没能留住他。结局：空盏');
      return;
    }
    // 灯尽：自动按当前信念结算（玩家未主动指认）
    var b = belief(game), best = null, bv = -1;
    Object.keys(b).forEach(function (k) { if (b[k] > bv) { bv = b[k]; best = k; } });
    game.phase = 'playing'; // 让 accuse 正常工作
    accuse(game, best);
  }

  /* ---- 快照：可复现、可导出，供创作手记「运行记录」使用 ---- */
  function snapshot(game) {
    return {
      schema: 'sandeng.state.v1', seed: game.seed, night: game.night, turn: game.turn,
      lampsLeft: game.lampsLeft, phase: game.phase, ending: game.ending,
      impostorId: game.cs.impostorId, lieTopic: game.cs.lieTopic,
      clues: game.cs.clues.map(function (c) { return { id: c.id, topic: c.topic, expect: c.expect }; }),
      guests: game.guests.map(function (q) {
        return { id: q.id, name: q.name, isImpostor: q.isImpostor, state: C.deepClone(q.state),
          memoryLen: q.memory.length, flags: C.deepClone(q.flags) };
      }),
      statements: C.deepClone(game.statements), belief: belief(game), result: C.deepClone(game.result)
    };
  }

  SD.Game = {
    create: create, dispatch: dispatch, listActions: listActions, accuse: accuse,
    belief: belief, evidenceChain: evidenceChain, snapshot: snapshot, guest: guest
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = SD;
})(typeof globalThis !== 'undefined' ? globalThis : this);
