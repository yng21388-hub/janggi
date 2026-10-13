/* 장기 AI 엔진 래퍼 — Fairy-Stockfish(WebAssembly) 를 UCI 로 다룬다.
 * 사용:
 *   var eng = new JanggiEngine({ nnue: 'engine/janggi.nnue', onStatus: fn });
 *   eng.init().then(...)          // 엔진 로드(+NNUE). 실패하면 eng.available === false
 *   eng.bestMove(fen, moves, level).then(function (r) { r.move (uci), r.score })
 *   eng.hints(fen, moves, n).then(function (list) { [{move, score, pv}] })
 *   eng.stop()
 * 좌표 변환: 앱 (c 0~8, r 0~9 위→아래) ↔ UCI (a~i, 1~10 아래→위). 한 수 쉬기 = 궁 자리를 두 번(e2e2).
 */
(function (root) {
  'use strict';

  var LEVELS = [ // 1~10 단계: Skill Level(-20~20) 과 생각 시간(ms)
    null,
    { skill: -20, time: 150 }, { skill: -16, time: 200 }, { skill: -12, time: 300 }, { skill: -8, time: 400 }, { skill: -4, time: 500 },
    { skill: 0, time: 700 }, { skill: 5, time: 900 }, { skill: 10, time: 1200 }, { skill: 15, time: 1800 }, { skill: 20, time: 2500 }
  ];
  var FILES = 'abcdefghi';
  var LETTER = { K: 'k', A: 'a', E: 'b', N: 'n', C: 'c', R: 'r', P: 'p' };

  function sq(c, r) { return FILES[c] + (10 - r); }
  function parseSq(s) { return { c: FILES.indexOf(s[0]), r: 10 - parseInt(s.slice(1), 10) }; }

  // 보드 → FEN (초 = 백 = 대문자, 아래쪽 / 한 = 흑 = 소문자, 위쪽)
  function toFen(board, turn, halfmove, fullmove) {
    var rows = [];
    for (var r = 0; r < 10; r++) {
      var s = '', empty = 0;
      for (var c = 0; c < 9; c++) {
        var p = board[r][c];
        if (!p) { empty++; continue; }
        if (empty) { s += empty; empty = 0; }
        var L = LETTER[p.t]; s += p.side === 'cho' ? L.toUpperCase() : L;
      }
      if (empty) s += empty;
      rows.push(s);
    }
    return rows.join('/') + ' ' + (turn === 'cho' ? 'w' : 'b') + ' - - ' + (halfmove || 0) + ' ' + (fullmove || 1);
  }
  function moveToUci(from, to) { return sq(from.c, from.r) + sq(to.c, to.r); }
  function passUci(board, side) {
    for (var r = 0; r < 10; r++) for (var c = 0; c < 9; c++) { var p = board[r][c]; if (p && p.side === side && p.t === 'K') return sq(c, r) + sq(c, r); }
    return null;
  }
  function uciToMove(u) {
    var m = u.match(/^([a-i])(10|[1-9])([a-i])(10|[1-9])$/); if (!m) return null;
    var from = parseSq(m[1] + m[2]), to = parseSq(m[3] + m[4]);
    return { from: from, to: to, pass: from.c === to.c && from.r === to.r };
  }

  function JanggiEngine(opts) {
    opts = opts || {};
    this.nnueUrl = opts.nnue || null;
    this.onStatus = opts.onStatus || function () {};
    this.available = false; this.ready = false; this.busy = false;
    this.sf = null; this.listeners = []; this.lines = [];
  }

  JanggiEngine.prototype.init = function () {
    var self = this;
    if (typeof SharedArrayBuffer === 'undefined' || typeof Stockfish !== 'function') {
      self.onStatus('AI 엔진을 쓸 수 없는 환경입니다. (서버로 열어야 합니다)'); self.available = false;
      return Promise.resolve(false);
    }
    self.onStatus('AI 엔진 로드 중…');
    return Stockfish().then(function (sf) {
      self.sf = sf;
      sf.addMessageListener(function (line) { self._onLine(line); });
      return self._cmd('uci', function (l) { return l === 'uciok'; });
    }).then(function () {
      self.sf.postMessage('setoption name UCI_Variant value janggi');
      if (!self.nnueUrl) return null;
      self.onStatus('AI 평가망 받는 중…');
      return fetch(self.nnueUrl).then(function (res) { if (!res.ok) throw new Error('nnue ' + res.status); return res.arrayBuffer(); }).then(function (buf) {
        self.sf.FS.writeFile('/janggi.nnue', new Uint8Array(buf));
        self.sf.postMessage('setoption name EvalFile value /janggi.nnue');
        self.nnue = true;
      }).catch(function (e) { self.nnue = false; self.onStatus('평가망 없이 실행 (' + e.message + ')'); });
    }).then(function () {
      self.sf.postMessage('setoption name MultiPV value 1');
      return self._cmd('isready', function (l) { return l === 'readyok'; });
    }).then(function () {
      self.available = true; self.ready = true; self.onStatus(self.nnue ? 'AI 준비 완료' : 'AI 준비 완료 (기본 평가)');
      return true;
    }).catch(function (e) { self.available = false; self.onStatus('AI 엔진 로드 실패: ' + e.message); return false; });
  };

  JanggiEngine.prototype._onLine = function (line) {
    if (this.lines.length > 200) this.lines.shift();
    this.lines.push(line);
    var ls = this.listeners.slice(); // 먼저 등록한 것부터(오래된 탐색의 bestmove 를 새 탐색이 가로채지 않게)
    for (var i = 0; i < ls.length; i++) if (ls[i](line)) { var k = this.listeners.indexOf(ls[i]); if (k >= 0) this.listeners.splice(k, 1); }
  };
  JanggiEngine.prototype._cmd = function (cmd, done, timeout) {
    var self = this;
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error('timeout: ' + cmd)); }, timeout || 20000);
      self.listeners.push(function (l) { if (done(l)) { clearTimeout(t); resolve(l); return true; } return false; });
      self.sf.postMessage(cmd);
    });
  };

  // info 줄 파싱: {multipv, cp, mate, pv[]}
  function parseInfo(l) {
    if (!/^info .*\bpv /.test(l) || !/\bscore /.test(l)) return null;
    var mp = /multipv (\d+)/.exec(l), cp = /score cp (-?\d+)/.exec(l), mate = /score mate (-?\d+)/.exec(l), pv = /\bpv (.+)$/.exec(l), depth = /depth (\d+)/.exec(l);
    return { multipv: mp ? +mp[1] : 1, cp: cp ? +cp[1] : null, mate: mate ? +mate[1] : null, pv: pv ? pv[1].split(' ') : [], depth: depth ? +depth[1] : 0 };
  }

  // 탐색: level(1~10) 또는 {skill,time,multipv}
  // 탐색은 한 번에 하나만: 진행 중이면 멈추고 그 bestmove 가 온 뒤에 시작한다
  JanggiEngine.prototype.search = function (fen, moves, cfg) {
    var self = this;
    if (!self.ready) return Promise.reject(new Error('engine not ready'));
    if (self.busy) self.stop();
    var prev = self.pending || Promise.resolve();
    var p = prev.then(function () { return self._search(fen, moves, cfg); }, function () { return self._search(fen, moves, cfg); });
    self.pending = p;
    return p;
  };
  JanggiEngine.prototype._search = function (fen, moves, cfg) {
    var self = this;
    self.busy = true;
    var infos = {};
    return new Promise(function (resolve, reject) {
      var pos = 'position fen ' + fen + (moves && moves.length ? ' moves ' + moves.join(' ') : '');
      self.sf.postMessage('setoption name Skill Level value ' + cfg.skill);
      self.sf.postMessage('setoption name MultiPV value ' + (cfg.multipv || 1));
      self.sf.postMessage(pos);
      var t = setTimeout(function () { self.sf.postMessage('stop'); }, (cfg.time || 1000) + 4000);
      self.listeners.push(function (l) {
        var inf = parseInfo(l); if (inf) infos[inf.multipv] = inf;
        var bm = /^bestmove (\S+)/.exec(l);
        if (bm) {
          clearTimeout(t); self.busy = false;
          var list = Object.keys(infos).map(function (k) { return infos[k]; }).sort(function (a, b) { return a.multipv - b.multipv; });
          resolve({ move: bm[1] === '(none)' ? null : bm[1], infos: list });
          return true;
        }
        return false;
      });
      self.sf.postMessage('go movetime ' + (cfg.time || 1000));
    });
  };
  JanggiEngine.prototype.bestMove = function (fen, moves, level) {
    var L = LEVELS[Math.max(1, Math.min(10, level | 0))];
    return this.search(fen, moves, { skill: L.skill, time: L.time, multipv: 1 }).then(function (r) {
      var inf = r.infos[0]; return { move: r.move, cp: inf ? inf.cp : null, mate: inf ? inf.mate : null };
    });
  };
  JanggiEngine.prototype.hints = function (fen, moves, n) {
    return this.search(fen, moves, { skill: 20, time: 1500, multipv: n || 3 }).then(function (r) {
      return r.infos.filter(function (i) { return i.pv.length; }).map(function (i) { return { move: i.pv[0], cp: i.cp, mate: i.mate, pv: i.pv, depth: i.depth }; });
    });
  };
  // 복기용: 현재 국면 평가 + 최선 후보 (시간 짧게)
  JanggiEngine.prototype.evaluate = function (fen, moves, n, time) {
    return this.search(fen, moves, { skill: 20, time: time || 600, multipv: n || 3 }).then(function (r) {
      return r.infos.map(function (i) { return { move: i.pv[0], cp: i.cp, mate: i.mate, pv: i.pv, depth: i.depth }; });
    });
  };
  JanggiEngine.prototype.stop = function () { if (this.sf) this.sf.postMessage('stop'); };

  root.JanggiEngine = JanggiEngine;
  root.JanggiUci = { toFen: toFen, moveToUci: moveToUci, passUci: passUci, uciToMove: uciToMove, sq: sq, parseSq: parseSq, LEVELS: LEVELS };
})(typeof self !== 'undefined' ? self : this);
