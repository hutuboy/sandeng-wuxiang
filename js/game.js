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
      calmTurns: 0,
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
    /* 物证原文只在「柜上物证」条里看，不再灌进灯下对话（重复且占掉对话区） */
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
    /* 对簿：一盏灯，三人同时就同一件物证开口（在座不足两人则无从对簿） */
    if (game.guests.filter(function (q) { return !q.flags.left; }).length >= 2) {
      C.TOPICS.forEach(function (t) { out.push({ type: 'CONFRONT', topic: t.id }); });
    }
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
    // 逻辑层（P2）：满足当夜残卷式的人直接压倒「不符条数」。
    // 高级档里「三处全不符」的清白客条数最多，只数叉会把他当无相；
    // 这里让「式子筛出来的那一位」带走大头，与推演台同一口径。
    // 灯不够问全时，未问的格子按五五开枚举（logic.posterior），
    // 于是「嫌疑度」= 他在所有可能世界里符合残卷式的比例。
    var lg = (SD.Logic && game.cs.logic && game.cs.logic.expr) ? game.cs.logic : null;
    if (lg) {
      var post = SD.Logic.posterior(game.cs, game.statements, lg.expr);
      if (post) {
        var bonus = game.cs.clues.length + 1;
        game.guests.forEach(function (q) { raw[q.id] = post.share[q.id] * bonus; });
      }
    }
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
      game.calmTurns = 2;
      game.guests.forEach(function (q) {
        q.state.tension = C.clamp(q.state.tension - 20, 0, 100);
        q.state.trust = C.clamp(q.state.trust + 8, 0, 100);
        q.memory.push({ turn: game.turn, type: 'LISTEN', topic: null, npcAction: 'CALM', text: '掌柜添了一轮茶。' });
      });
      pushLog(game, 'system', '你添了一轮茶。灯影稳了些，众人紧绷的肩松下来，话也好问了。');
      result.events.push({ type: 'CALM', text: '全场张力 −20，信任 +8，接下来 2 次问话不会被打岔' });
      if (game.lampsLeft <= 0) conclude(game, 'lamps');
      return result;
    }

    /* ---- 对簿：一盏灯换「三人同时就同一件物证开口」----
     * 灯只有那么几盏，而式子常要吃「2 处 × 3 人 = 6 格」；只靠一对一地问，中/高级档永远问不全。
     * 对簿把「一盏灯换一格」变成「一盏灯换至多三格」，代价是：①话题由你选、问谁不由你选（可能补到已知的格）；
     * ②三人当众被摆上台面，疑心照涨 —— 高级档疑心阈值低，连对两场簿可能把无相逼走。
     * 每人仍各自走 NPC.decide / NPC.apply（行为可校验），只有语气固定为 'confront'。
     */
    if (action.type === 'CONFRONT') {
      var ct = C.topic(action.topic);
      if (!ct) return { ok: false, error: '非法的对簿话题' };
      if (game.lampsLeft <= 0) return { ok: false, error: '灯已燃尽' };
      var present = game.guests.filter(function (q) { return !q.flags.left; });
      if (present.length < 2) return { ok: false, error: '在座不足两人，无从对簿' };

      game.turn++; game.lampsLeft--;
      pushLog(game, 'ask', '【你】把「' + ct.label + '」的物证摊到桌上，请三位当众开口');
      var decided = [], got = [];
      present.forEach(function (q) {
        var act = { guestId: q.id, topic: action.topic, tone: 'confront' };
        var d = NPC.decide(game, act, {});
        NPC.apply(game, act, d);
        d.playerAction = { type: 'CONFRONT', topic: action.topic };
        game.decisions.push(d);
        decided.push(d);
        if (d.revealed) { d.revealed.byConfront = true; game.statements.push(d.revealed); got.push(d.revealed); }
        pushLog(game, 'npc', '【' + q.name + '·' + d.actionLabel + '】' + d.text);
      });
      if (game.calmTurns > 0) game.calmTurns--;

      result.decisions = decided;
      result.decision = decided.filter(function (d) { return d.revealed; })[0] || decided[0] || null;
      result.events.push({ type: 'CONFRONT', text: '当众对簿 · ' + ct.label, opened: got.length, asked: present.length });
      if (got.length) result.events.push({ type: 'STATEMENTS', data: got });
      decided.forEach(function (d) {
        result.events = result.events.concat(d.effects.map(function (e) { return { type: 'EFFECT', text: d.guestName + '：' + e }; }));
      });

      if (decided.some(function (d) { return d.chosen === 'FLEE'; })) {
        conclude(game, 'flee');
        result.events.push({ type: 'END', text: '无相趁夜遁走' });
      } else if (game.lampsLeft <= 0) {
        conclude(game, 'lamps');
      }
      return result;
    }

    if (action.type !== 'ASK') return { ok: false, error: '未知动作类型' };
    var q = guest(game, action.guestId);
    if (!q || q.flags.left) return { ok: false, error: '该客人已不在座' };
    if (!C.topic(action.topic) || !C.tone(action.tone)) return { ok: false, error: '非法的问话参数' };
    if (game.lampsLeft <= 0) return { ok: false, error: '灯已燃尽' };

    game.turn++; game.lampsLeft--;
    var decision = NPC.decide(game, action, { force: opts.forceNpcAction });
    if (game.calmTurns > 0) game.calmTurns--;
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

  /* ---- 复盘：结算页告诉玩家「你漏了什么、哪里自相矛盾、离最高结局差多少」 ----
   * 只读 game 已有数据，不改任何状态；纯展示用。
   */
  function buildReview(game) {
    var missed = [], contra = [];
    game.cs.clues.forEach(function (clue) {
      var seen = {};
      game.statements.forEach(function (s) { if (s.topic === clue.topic) seen[s.guestId] = s; });
      var miss = game.guests.filter(function (q) { return !seen[q.id] && !q.flags.left; });
      if (miss.length) {
        missed.push({
          clue: clue.title, topic: C.topic(clue.topic).label,
          guests: miss.map(function (q) { return q.name; })
        });
      }
      game.guests.forEach(function (q) {
        var s = seen[q.id];
        if (s && s.value !== clue.expect) {
          contra.push({ guest: q.name, topic: C.topic(clue.topic).label, said: s.value, expect: clue.expect });
        }
      });
    });

    var clueTopics = game.cs.clues.map(function (c) { return c.topic; });
    var wasted = (game.decisions || []).filter(function (d) {
      return d.playerAction && clueTopics.indexOf(d.playerAction.topic) < 0;
    }).length;

    var need = game.cs.clues.length * 2;                 // 最高结局门槛（与 accuse() 同一口径）
    var maxChain = game.cs.clues.length * game.guests.length;   // 理论上限：每条物证 × 每位客人
    var lampsAll = game.lamps;
    var reachable = maxChain >= need && lampsAll >= need;       // 灯数不够也拿不到

    return {
      missed: missed, contradictions: contra, wastedAsks: wasted,
      lampsUsed: lampsAll - game.lampsLeft, lampsAll: lampsAll,
      need: need, maxChain: maxChain, reachable: reachable,
      bestEnding: '灯下留名'
    };
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
      // 收益结构：以「证据链」为主、余灯为辅。
      // 历史配比（chain 35 / lamp 40）导致「少问早猜」严格优于「多问取证」，一局 4 步就结束；
      // 现配比（chain 110 / lamp 15）让多问一句的边际收益显著高于省一盏灯。
      gain = 380 + chain * 110 + game.lampsLeft * 15 + Math.round((avgTrust - 45) * 2);
      if (chain < diff.chainMinForFullCredit) gain -= 180; // 证据链不足，基本靠蒙
      if (leftCount > 0) gain -= 80;
      gain = Math.max(120, gain);
    } else {
      gain = -120;
    }

    var ending;
    if (!correct) ending = '灯灭';
    else if (leftCount > 0) ending = '一灯独明';
    else if (chain >= game.cs.clues.length * 2 && avgTrust >= diff.endingBestTrust) ending = '灯下留名';
    else ending = '破晓';

    game.phase = 'ended';
    game.ending = ending;
    game.result = {
      correct: correct, accused: q.name, impostor: game.guests.filter(function (x) { return x.id === game.cs.impostorId; })[0].name,
      chain: chain, lampsLeft: game.lampsLeft, avgTrust: C.round(avgTrust, 1),
      score: gain, belief: belief(game), ending: ending,
      review: buildReview(game),
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
