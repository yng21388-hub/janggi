const J = require('./rules.js');
function pos(b){ return b; }
let b = J.initialBoard();
const cho = J.allLegalMoves(b,'cho'), han = J.allLegalMoves(b,'han');
console.log('초 합법수', cho.length, '| 한 합법수', han.length);
function mv(c,r){ return J.legalMoves(b,c,r).map(m=>`(${m.c},${m.r})`).join(' '); }
console.log('마(1,9):', mv(1,9)); console.log('상(2,9):', mv(2,9)); console.log('포(1,7):', mv(1,7)||'없음');
console.log('궁(4,8):', mv(4,8)); console.log('사(3,9):', mv(3,9)); console.log('졸(0,6):', mv(0,6), '| 졸(4,6):', mv(4,6)); console.log('차(0,9):', mv(0,9));
// 포 넘기: 마(1,9)를 (0,7)로 옮기면 포(1,7)가 아래쪽 마 없어져… 대신 졸(2,6)을 (2,5)로 보내면 포(1,7)가 오른쪽? 아님. 직접 보드 구성
let e = J.initialBoard();
// 한 포(1,2)가 (1,3)? 비어있음… 포 앞 (1,3) empty; (1,4),(1,5),(1,6) empty, (1,7) 초 포 → 못 넘음. 졸을 (1,6)으로 옮기면 넘을 수 있음
let t = J.makeMove(e,{c:0,r:6},{c:1,r:6}).board; // 초 졸 (1,6)
console.log('한 포(1,2) 졸을 넘어:', J.legalMoves(t,1,2).map(m=>`(${m.c},${m.r})`).join(' '));
// 포끼리: (1,6)에 포를 두고 확인
let t2 = J.cloneBoard(e); t2[6][1] = {side:'cho',t:'C',id:99}; 
console.log('한 포(1,2) 포 못 넘음:', J.legalMoves(t2,1,2).length);
// 장군: 빈 판에 초 궁(4,8), 한 차(4,0) 마주보기 → 장군, 궁 합법수에 (4,7) 포함되면 안됨
let z = J.initialBoard(); for (let r=0;r<10;r++) for(let c=0;c<9;c++) z[r][c]=null;
z[8][4]={side:'cho',t:'K',id:1}; z[1][4]={side:'han',t:'K',id:2}; z[0][3]={side:'han',t:'R',id:3};
console.log('초 장군 아님(차 (3,0)):', J.inCheck(z,'cho'), '| 궁 마주봄:', J.kingsFacing(z));
z[0][3]=null; z[5][4]={side:'han',t:'R',id:3};
console.log('초 장군(차 (4,5)):', J.inCheck(z,'cho'), '| 초 궁 합법수:', J.legalMoves(z,4,8).map(m=>`(${m.c},${m.r})`).join(' '));
console.log('status 초:', JSON.stringify(J.status(z,'cho')));
// 외통: 초 궁 (4,8), 한 차 (4,5)와 (3,5)? 궁성 이동 불가하게: 차 (3,6)? 간단히 차 두 개로 7열·세로 봉쇄
let m = J.cloneBoard(z); m[5][4]=null; m[9][4]={side:'han',t:'R',id:3}; m[7][3]={side:'han',t:'R',id:4}; m[7][5]={side:'han',t:'R',id:5}; 
console.log('외통 테스트:', JSON.stringify(J.status(m,'cho')), J.legalMoves(m,4,8).map(x=>`(${x.c},${x.r})`).join(' '));
// 궁성 대각선 차: 차 (3,7)에서 (4,8)이 비면 (5,9)까지
let d = J.cloneBoard(z); d[5][4]=null; d[8][4]=null; d[9][5]={side:'cho',t:'K',id:1}; d[7][3]={side:'cho',t:'R',id:7};
console.log('차 (3,7) 대각:', J.legalMoves(d,3,7).filter(x=>Math.abs(x.c-3)===Math.abs(x.r-7)).map(x=>`(${x.c},${x.r})`).join(' '));
// 상 멍: 상(2,9) 앞 (2,8)에 말 있으면 0
let s = J.initialBoard(); s[8][2]={side:'cho',t:'P',id:50};
console.log('상 멍:', J.legalMoves(s,2,9).length, '| 점수 초/한:', J.score(J.initialBoard(),'cho'), J.score(J.initialBoard(),'han'));
// 마상 배치
console.log('배치 ENEN 1열:', J.initialBoard('ENEN','NEEN')[0][1].t, J.initialBoard('ENEN','NEEN')[9][2].t);
