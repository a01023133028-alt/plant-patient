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

// 2. 70% 고정
var r70 = M.run(opt({ mode: 'fixed', ratio: 0.7 }));
var s70 = r70.summary;
console.log('2. 70% 고정, 30일, 보통');
check('수량 −8~−16%', s70.yieldPct - 100 <= -8 && s70.yieldPct - 100 >= -16, f(s70.yieldPct - 100, 1) + '%');
check('Brix +1.5 이상', s70.brixDelta >= 1.5, '+' + f(s70.brixDelta));

// 3. 50% 고정
var r50 = M.run(opt({ mode: 'fixed', ratio: 0.5 }));
var s50 = r50.summary;
console.log('3. 50% 고정, 30일, 보통');
check('수량 −20% 이하', s50.yieldPct - 100 <= -20, f(s50.yieldPct - 100, 1) + '%');
check('70%보다 Brix 높음', s50.brix > s70.brix, f(s50.brix) + ' > ' + f(s70.brix));

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

// 참고: 세 방식 비교
['normal', 'heat'].forEach(function (w) {
  console.log('\n[참고] 세 방식 비교 (30일, ' + (w === 'heat' ? '폭염' : '보통') + ', 프리미엄 30%, 시드 42)');
  M.compareAll({ days: 30, weather: w, premium: 0.3, seed: 42 }).forEach(function (g) {
    var s = g.summary;
    console.log('  ' + g.name.padEnd(16) + ' Brix ' + f(s.brix) + ' (+' + f(s.brixDelta) + ')  수량 ' + f(s.yieldPct, 1) +
      '%  소득 ' + Math.round(s.income) + '만 원 (' + (s.incomeDelta >= 0 ? '+' : '') + Math.round(s.incomeDelta) + ')  물 ' +
      f(s.waterPct, 0) + '%  경보 ' + s.alarms + '회');
  });
});

console.log('\n결과: ' + passed + '개 통과, ' + failed + '개 실패\n');
process.exit(failed ? 1 : 0);
