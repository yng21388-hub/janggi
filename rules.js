/* 장기 규칙 모듈 (대한장기협회 규칙 기준)
 * 브라우저(window.Janggi)와 Node(require)에서 같이 쓴다.
 *
 * 좌표: c = 0..8 (왼쪽→오른쪽), r = 0..9 (위→아래). 한(han)이 위(r 0~2 궁성), 초(cho)가 아래(r 7~9 궁성).
 * 말: K 궁, A 사, R 차, N 마, E 상, C 포, P 졸/병.
 * 상태: { board: 10x9 배열(null 또는 {side,t,id}), turn, history, ... } — 보드만 다룬다. 화면 상태는 index.html.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Janggi = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var COLS = 9, ROWS = 10;

  // 궁성 영역과 대각선 점
  function inPalace(side, c, r) {
    if (c < 3 || c > 5) return false;
    return side === 'han' ? (r >= 0 && r <= 2) : (r >= 7 && r <= 9);
  }
  function palaceOf(c, r) {
    if (c < 3 || c > 5) return null;
    if (r >= 0 && r <= 2) return 'han';
    if (r >= 7 && r <= 9) return 'cho';
    return null;
  }
  // 대각선이 지나는 점: 모서리 4개 + 중앙
  function onDiag(c, r) {
    var p = palaceOf(c, r);
    if (!p) return false;
    var top = p === 'han' ? 0 : 7;
    var rr = r - top;
    return (c === 4 && rr === 1) || ((c === 3 || c === 5) && (rr === 0 || rr === 2));
  }
  // 두 점이 같은 궁성 대각선으로 한 칸 연결되어 있는가
  function diagStep(c1, r1, c2, r2) {
    if (Math.abs(c1 - c2) !== 1 || Math.abs(r1 - r2) !== 1) return false;
    return onDiag(c1, r1) && onDiag(c2, r2) && palaceOf(c1, r1) === palaceOf(c2, r2);
  }

  function inside(c, r) { return c >= 0 && c < COLS && r >= 0 && r < ROWS; }

  function emptyBoard() {
    var b = [];
    for (var r = 0; r < ROWS; r++) { b.push([]); for (var c = 0; c < COLS; c++) b[r].push(null); }
    return b;
  }

  // 마상 배치: 'NENE'(마상마상) 'ENEN'(상마상마) 'NEEN'(마상상마) 'ENNE'(상마마상) — 왼쪽부터
  var SETUPS = { NENE: '마상마상', ENEN: '상마상마', NEEN: '마상상마', ENNE: '상마마상' };

  function initialBoard(setupHan, setupCho) {
    setupHan = setupHan || 'NENE'; setupCho = setupCho || 'NENE';
    var b = emptyBoard(), id = 0;
    function put(side, t, c, r) { b[r][c] = { side: side, t: t, id: id++ }; }
    function back(side, r, setup) {
      var s = setup.split('');
      put(side, 'R', 0, r); put(side, s[0], 1, r); put(side, s[1], 2, r); put(side, 'A', 3, r);
      put(side, 'A', 5, r); put(side, s[2], 6, r); put(side, s[3], 7, r); put(side, 'R', 8, r);
    }
    back('han', 0, setupHan); back('cho', 9, setupCho);
    put('han', 'K', 4, 1); put('cho', 'K', 4, 8);
    put('han', 'C', 1, 2); put('han', 'C', 7, 2); put('cho', 'C', 1, 7); put('cho', 'C', 7, 7);
    for (var c = 0; c < 9; c += 2) { put('han', 'P', c, 3); put('cho', 'P', c, 6); }
    return b;
  }

  function cloneBoard(b) { return b.map(function (row) { return row.map(function (p) { return p ? { side: p.side, t: p.t, id: p.id } : null; }); }); }

  function findKing(b, side) {
    for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) { var p = b[r][c]; if (p && p.side === side && p.t === 'K') return { c: c, r: r }; }
    return null;
  }

  var ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // 의사 합법수(장군 여부 미검사). 반환: [{c,r}]
  function pseudoMoves(b, c, r) {
    var p = b[r][c]; if (!p) return [];
    var out = [], side = p.side;
    function add(tc, tr) {
      if (!inside(tc, tr)) return false;
      var q = b[tr][tc];
      if (!q) { out.push({ c: tc, r: tr }); return true; }
      if (q.side !== side) out.push({ c: tc, r: tr });
      return false;
    }
    var i, d, tc, tr;
    if (p.t === 'K' || p.t === 'A') {
      for (i = 0; i < 4; i++) {
        tc = c + ORTHO[i][0]; tr = r + ORTHO[i][1];
        if (inPalace(side, tc, tr)) add(tc, tr);
      }
      [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (dd) {
        tc = c + dd[0]; tr = r + dd[1];
        if (inPalace(side, tc, tr) && diagStep(c, r, tc, tr)) add(tc, tr);
      });
    } else if (p.t === 'R') {
      for (i = 0; i < 4; i++) {
        tc = c; tr = r;
        while (true) { tc += ORTHO[i][0]; tr += ORTHO[i][1]; if (!inside(tc, tr)) break; if (!add(tc, tr)) break; }
      }
      // 궁성 대각선 활주 (모서리→중앙→반대 모서리)
      if (onDiag(c, r)) {
        [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (dd) {
          var pc = c, pr = r;
          while (true) {
            tc = pc + dd[0]; tr = pr + dd[1];
            if (!diagStep(pc, pr, tc, tr)) break;
            if (!add(tc, tr)) break;
            pc = tc; pr = tr;
          }
        });
      }
    } else if (p.t === 'N') {
      for (i = 0; i < 4; i++) {
        var mc = c + ORTHO[i][0], mr = r + ORTHO[i][1];
        if (!inside(mc, mr) || b[mr][mc]) continue; // 멍마
        var perp = ORTHO[i][0] === 0 ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]];
        perp.forEach(function (q) { add(mc + ORTHO[i][0] + q[0], mr + ORTHO[i][1] + q[1]); });
      }
    } else if (p.t === 'E') {
      for (i = 0; i < 4; i++) {
        var ec = c + ORTHO[i][0], er = r + ORTHO[i][1];
        if (!inside(ec, er) || b[er][ec]) continue;
        var perp2 = ORTHO[i][0] === 0 ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]];
        perp2.forEach(function (q) {
          var dc = ORTHO[i][0] + q[0], dr = ORTHO[i][1] + q[1];
          var m1c = ec + dc, m1r = er + dr;
          if (!inside(m1c, m1r) || b[m1r][m1c]) return;
          add(m1c + dc, m1r + dr);
        });
      }
    } else if (p.t === 'C') {
      // 직선: 말 하나(포 제외)를 넘어 이동·포획(포는 못 잡음)
      for (i = 0; i < 4; i++) {
        tc = c; tr = r; var screen = null;
        while (true) {
          tc += ORTHO[i][0]; tr += ORTHO[i][1];
          if (!inside(tc, tr)) break;
          var q = b[tr][tc];
          if (!screen) { if (q) { if (q.t === 'C') break; screen = q; } continue; }
          if (!q) { out.push({ c: tc, r: tr }); continue; }
          if (q.side !== side && q.t !== 'C') out.push({ c: tc, r: tr });
          break;
        }
      }
      // 궁성 대각선: 모서리에서 중앙의 말을 넘어 반대 모서리
      if (onDiag(c, r)) {
        [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (dd) {
          var m1c = c + dd[0], m1r = r + dd[1], m2c = c + 2 * dd[0], m2r = r + 2 * dd[1];
          if (!diagStep(c, r, m1c, m1r) || !diagStep(m1c, m1r, m2c, m2r)) return;
          var s = b[m1r][m1c]; if (!s || s.t === 'C') return;
          var q = b[m2r][m2c];
          if (!q) out.push({ c: m2c, r: m2r });
          else if (q.side !== side && q.t !== 'C') out.push({ c: m2c, r: m2r });
        });
      }
    } else if (p.t === 'P') {
      var fwd = side === 'han' ? 1 : -1;
      add(c, r + fwd); add(c - 1, r); add(c + 1, r);
      // 궁성 안 대각선 전진
      [[1, fwd], [-1, fwd]].forEach(function (dd) {
        tc = c + dd[0]; tr = r + dd[1];
        if (diagStep(c, r, tc, tr)) add(tc, tr);
      });
    }
    return out;
  }

  // side의 궁이 공격받고 있는가
  function isAttacked(b, side, kc, kr) {
    for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
      var p = b[r][c]; if (!p || p.side === side) continue;
      var ms = pseudoMoves(b, c, r);
      for (var i = 0; i < ms.length; i++) if (ms[i].c === kc && ms[i].r === kr) return true;
    }
    return false;
  }
  function inCheck(b, side) {
    var k = findKing(b, side); if (!k) return false;
    return isAttacked(b, side, k.c, k.r);
  }

  // 두 궁이 같은 열에서 마주보는가(사이에 말 없음)
  function kingsFacing(b) {
    var kh = findKing(b, 'han'), kc = findKing(b, 'cho');
    if (!kh || !kc || kh.c !== kc.c) return false;
    for (var r = kh.r + 1; r < kc.r; r++) if (b[r][kh.c]) return false;
    return true;
  }

  function makeMove(b, from, to) {
    var nb = cloneBoard(b);
    var p = nb[from.r][from.c];
    var captured = nb[to.r][to.c];
    nb[to.r][to.c] = p; nb[from.r][from.c] = null;
    return { board: nb, captured: captured };
  }

  // 합법수: 자기 궁이 장군에 놓이는 수 제외
  function legalMoves(b, c, r) {
    var p = b[r][c]; if (!p) return [];
    return pseudoMoves(b, c, r).filter(function (m) {
      var nb = makeMove(b, { c: c, r: r }, m).board;
      return !inCheck(nb, p.side);
    });
  }
  function allLegalMoves(b, side) {
    var out = [];
    for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
      var p = b[r][c]; if (!p || p.side !== side) continue;
      legalMoves(b, c, r).forEach(function (m) { out.push({ from: { c: c, r: r }, to: m }); });
    }
    return out;
  }

  // 한 수 쉬기 가능 여부: 장군 상태가 아니면 가능
  function canPass(b, side) { return !inCheck(b, side); }

  // 국면 판정. 반환 { check, checkmate, mustPass, facing }
  function status(b, side) {
    var chk = inCheck(b, side);
    var moves = allLegalMoves(b, side);
    return {
      check: chk,
      checkmate: chk && moves.length === 0,
      mustPass: !chk && moves.length === 0,
      facing: kingsFacing(b),
      moveCount: moves.length
    };
  }

  // 점수제(옵션): 차13 포7 마5 상3 사3 졸2, 한 1.5 덤
  var VALUE = { R: 13, C: 7, N: 5, E: 3, A: 3, P: 2, K: 0 };
  function score(b, side) {
    var s = side === 'han' ? 1.5 : 0;
    for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) { var p = b[r][c]; if (p && p.side === side) s += VALUE[p.t]; }
    return s;
  }

  // 수 표기 (기보용): 출발/도착 좌표를 장기 표기(열 1~9 왼쪽→오른쪽, 행 1~10 위→아래)로
  function notate(from, to, piece) {
    return (from.r + 1) + '' + (from.c + 1) + ' ' + (piece ? piece.t : '') + ' ' + (to.r + 1) + '' + (to.c + 1);
  }

  return {
    COLS: COLS, ROWS: ROWS, SETUPS: SETUPS,
    initialBoard: initialBoard, cloneBoard: cloneBoard,
    inPalace: inPalace, onDiag: onDiag,
    pseudoMoves: pseudoMoves, legalMoves: legalMoves, allLegalMoves: allLegalMoves,
    inCheck: inCheck, kingsFacing: kingsFacing, makeMove: makeMove, canPass: canPass, status: status,
    score: score, notate: notate, findKing: findKing
  };
});
