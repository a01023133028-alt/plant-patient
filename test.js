// 모델 검증: node test.js
'use strict';
var M = require('./model.js');

var passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) passed++; else failed++;
  console.log((ok ? '  통과  ' : '  실패  ') + name + (detail ? '  (' + detail + ')' : ''));
}
function f(v, n) { return v.toFixed(n == null ? 2 : n); }
function mean(a) { return a.reduce(function (s, v) { return s + v; }, 0) / a.length; }
function argmax(a) { var k = 0; for (var i = 1; i < a.length; i++) if (a[i] > a[k]) k = i; return k; }

var base = { days: 30, weather: 'normal', seed: 42 };
function opt(extra) { var o = {}; for (var k in base) o[k] = base[k]; for (var j in extra) o[j] = extra[j]; return o; }

console.log('\n식물환자 관수 시뮬레이터 - 모델 검증\n');

// 1. 100% 관수, 30일, 보통
var r100 = M.run(opt({ mode: 'full' }));
var s100 = r100.summary;
var y100 = 100 * r100.res.yieldRatio[29];
console.log('1. 100% 관수, 30일, 보통');
check('Brix 4.8~5.5', s100.brix >= 4.8 && s100.brix <= 5.5, 'Brix ' + f(s100.brix));
check('수량 97~100%', y100 >= 97 && y100 <= 100, f(y100, 1) + '%');
check('평균 클릭 < 1회/시간', s100.meanClicks < 1, f(s100.meanClicks) + '회');

// 2. 70% 고정 (Plants 2024 원문 기준으로 바꿈: 원문의 −12%는 물 47% 조건)
var r70 = M.run(opt({ mode: 'fixed', ratio: 0.7 }));
var s70 = r70.summary;
console.log('2. 70% 고정, 30일, 보통');
check('수량 −3~−10% (물 47%의 −12%보다 작게)', s70.yieldPct - 100 <= -3 && s70.yieldPct - 100 >= -10, f(s70.yieldPct - 100, 1) + '%');
check('Brix +0.4 이상', s70.brixDelta >= 0.4, '+' + f(s70.brixDelta));

// 3. 물 47% 고정 = Plants 2024 방울토마토 2020 조건
var r47 = M.run(opt({ mode: 'fixed', ratio: 0.47 }));
var s47 = r47.summary;
var r50 = M.run(opt({ mode: 'fixed', ratio: 0.5 }));
console.log('3. 물 47% 고정, 30일, 보통 (Plants 2024: 수량 −12%)');
check('수량 −5~−15%', s47.yieldPct - 100 <= -5 && s47.yieldPct - 100 >= -15, f(s47.yieldPct - 100, 1) + '%');
check('Brix +0.6~1.3 (+12~26%)', s47.brixDelta >= 0.6 && s47.brixDelta <= 1.3, '+' + f(s47.brixDelta));
check('50%가 70%보다 Brix 높고 수량 낮음', r50.summary.brix > s70.brix && r50.summary.yieldPct < s70.yieldPct, f(r50.summary.brix) + ' > ' + f(s70.brix));

// 4. 단수 7일
var r0 = M.simulate({ mode: 'fixed', ratio: 0, days: 7, weather: 'normal', seed: 42 });
var pk = argmax(r0.clicks);
console.log('4. 0% (단수) 7일');
console.log('     클릭: ' + r0.clicks.map(function (v) { return f(v, 1); }).join(', '));
check('최고점 3~6일째', pk + 1 >= 3 && pk + 1 <= 6, (pk + 1) + '일째');
check('최고점 20~50회/시간', r0.clicks[pk] >= 20 && r0.clicks[pk] <= 50, f(r0.clicks[pk], 1) + '회');
check('최고점 이후 감소', r0.clicks[6] < r0.clicks[pk], '7일째 ' + f(r0.clicks[6], 1) + '회');

// 5. 폭염 > 보통
console.log('5. 폭염이 보통보다 스트레스·클릭이 큼 (70% 고정)');
var h70 = M.simulate(opt({ mode: 'fixed', ratio: 0.7, weather: 'heat' }));
var n70 = r70.res;
check('스트레스 S', mean(h70.S) > mean(n70.S), f(mean(h70.S)) + ' > ' + f(mean(n70.S)));
check('클릭', mean(h70.clicks) > mean(n70.clicks), f(mean(h70.clicks), 1) + ' > ' + f(mean(n70.clicks), 1));
var h100 = M.simulate(opt({ mode: 'full', weather: 'heat' }));
check('100% 관수에서도 폭염 스트레스가 더 큼', mean(h100.S) > mean(r100.res.S), f(mean(h100.S)) + ' > ' + f(mean(r100.res.S)));

// 6. 시드 고정 재현성
console.log('6. 시드 고정 시 결과가 매번 같음');
var a = M.simulate(opt({ mode: 'brake', weather: 'heat', seed: 7 }));
var b = M.simulate(opt({ mode: 'brake', weather: 'heat', seed: 7 }));
check('같은 시드 → 같은 결과', JSON.stringify(a.clicks) === JSON.stringify(b.clicks) && JSON.stringify(a.ratio) === JSON.stringify(b.ratio));
var c = M.simulate(opt({ mode: 'brake', weather: 'heat', seed: 8 }));
check('다른 시드 → 다른 노이즈', JSON.stringify(a.clicks) !== JSON.stringify(c.clicks));

// 7. 소리 브레이크: 경보 시 그날 바로 100%
console.log('7. 소리 브레이크: 경보 발생 시 그날 바로 100%');
// 브레이크 판정을 일부러 끄고(기준 크게) 폭염에서 경보까지 가게 만듦
var al = M.simulate(opt({ mode: 'brake', weather: 'heat', params: { brakeDelta: 1000 } }));
var ad = al.alarm.indexOf(true);
check('경보가 발생함', ad >= 0, ad >= 0 ? (ad + 1) + '일째' : '없음');
check('경보 당일 관수 100%', ad >= 0 && al.ratio[ad] === 1.0 && (ad === 0 || al.ratio[ad - 1] < 1.0),
  ad >= 0 ? '전날 ' + Math.round(al.ratio[ad - 1] * 100) + '% → 당일 ' + Math.round(al.ratio[ad] * 100) + '%' : '');
check('모든 경보일이 100%', al.alarm.every(function (x, i) { return !x || al.ratio[i] === 1.0; }));

// 8. 관계 그래프: 관수를 줄일수록 당도가 오름 (단조 감소 관계)
console.log('8. 관수 비율이 낮을수록 최종 당도가 높음 (40~110%)');
var rs = []; for (var q = 40; q <= 110; q += 5) rs.push(q / 100);
var cv = M.brixCurve({ days: 30, weather: 'normal', seed: 42 }, rs);
var mono = cv.every(function (pt, i) { return i === 0 || pt.brix <= cv[i - 1].brix + 1e-9; });
check('관수↓ → 당도↑', mono, '40%: ' + f(cv[0].brix) + ' / 70%: ' + f(cv[6].brix) + ' / 100%: ' + f(cv[12].brix));

// 9. 비정상 계수 입력에도 계산이 깨지지 않음
console.log('9. 비정상 계수 (0, 음수, 빈 값)에도 NaN 없음');
var weird = { brixTau: 0, highBrix: 5, fatigueTau: 0, stressAccum: 3, clickMax: -10, brakeStep: 0, alarmLine: 0, sustainMinDays: 0, clickExp: 'abc', baseBrix: '' };
var finiteAll = true;
['full', 'fixed', 'brake'].forEach(function (m) {
  var w = M.run({ mode: m, ratio: 0.5, days: 20, weather: 'heat', seed: '', params: weird });
  ['ratio', 'clicks', 'ctrlClicks', 'S', 'brix', 'yieldRatio', 'water'].forEach(function (k) {
    if (!w.res[k].every(isFinite)) finiteAll = false;
  });
  for (var k in w.summary) if (!isFinite(w.summary[k])) finiteAll = false;
});
check('모든 결과가 유한한 숫자', finiteAll);

// 11. 작물별: 문헌 목표 범위 안에 드는지
console.log('11. 작물별 문헌 목표 (check 표시된 것만 검사)');
Object.keys(M.CROPS).forEach(function (k) {
  M.verifyCrop(k).forEach(function (v) {
    if (v.target.check) check(M.CROPS[k].name + ': ' + v.target.label, v.ok, '모델 ' + f(v.value));
    else console.log('  참고  ' + M.CROPS[k].name + ': ' + v.target.label + '  (모델 ' + f(v.value) + (v.ok ? ', 범위 안' : ', 범위 밖') + ')');
  });
});
['cherry', 'strawberry', 'melon', 'citrus', 'pepper', 'tomatoDraft'].forEach(function (k) {
  var cv = M.brixCurve({ crop: k, days: 60, weather: 'normal', seed: 42 }, rs);
  var ok = cv.every(function (pt, i) { return i === 0 || pt.brix <= cv[i - 1].brix + 1e-9; });
  check(M.CROPS[k].name + ': 관수↓ → 당도↑ (단조)', ok);
});

// 12. 소득
console.log('12. 소득 계산');
check('100% 관수 소득 = 기준 소득 2,437만 원', Math.abs(r100.summary.income - 2437) < 1e-6, Math.round(r100.summary.income) + '만 원');
var pLow = M.run(opt({ mode: 'fixed', ratio: 0.5, premium: 0 })).summary, pHigh = M.run(opt({ mode: 'fixed', ratio: 0.5, premium: 0.7 })).summary;
check('프리미엄이 클수록 소득 증가', pHigh.income > pLow.income, Math.round(pLow.income) + ' → ' + Math.round(pHigh.income));
check('프리미엄 0이면 소득 변화 = 수량 감소만큼', Math.abs(pLow.incomeDelta - 4202 * (pLow.yieldPct / 100 - 1)) < 1, Math.round(pLow.incomeDelta) + '만 원');

// 13. 사용자 작물
console.log('13. 사용자 작물 추가·삭제');
M.addCrop('custom_test', '시험 작물', 'melon', { baseBrix: 12, highBrix: 15, maxBrixRise: 3, baseRevenue: 5000, baseIncome: 3000 });
var ct = M.run({ crop: 'custom_test', mode: 'fixed', ratio: 0.6, days: 30, seed: 1 });
check('사용자 작물 계산 (값 유한, 일반 당도 12 적용)', isFinite(ct.summary.income) && ct.base.brix[0] === 12, 'Brix ' + f(ct.summary.brix));
M.removeCrop('custom_test'); M.removeCrop('tomato');
check('사용자 작물만 삭제됨 (기본 작물은 지워지지 않음)', !M.CROPS.custom_test && !!M.CROPS.tomato);

// 10. index.html 안의 계산 로직이 model.js와 같은지
console.log('10. index.html 안의 계산 로직이 model.js와 같음');
var fs = require('fs'), path = require('path');
var html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
var model = fs.readFileSync(path.join(__dirname, 'model.js'), 'utf8');
check('같음 (다르면 node build.js 실행)', require('./build.js').inlined(html, model) === html);

// 참고: 세 방식 비교
['normal', 'heat'].forEach(function (w) {
  console.log('\n[참고] 세 방식 비교 (30일, ' + (w === 'heat' ? '폭염' : '보통') + ', 시드 42)');
  M.compareAll({ days: 30, weather: w, seed: 42 }).forEach(function (g) {
    var s = g.summary;
    console.log('  ' + g.name.padEnd(16) + ' Brix ' + f(s.brix) + ' (+' + f(s.brixDelta) + ')  수량 ' + f(s.yieldPct, 1) +
      '%  물 ' + f(s.waterPct, 0) + '%  경보 ' + s.alarms + '회');
  });
});

console.log('\n결과: ' + passed + '개 통과, ' + failed + '개 실패\n');
process.exit(failed ? 1 : 0);
