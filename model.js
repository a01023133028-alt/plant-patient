/*
 * 식물환자 관수 시뮬레이터 - 계산 모델
 *
 * 공개 연구 수치에 맞춘 "교육용" 모델입니다. 실제 재배 결과가 아닙니다.
 * 하루 단위로 계산하며, 모든 계수는 DEFAULTS에 모여 있습니다.
 * 근거가 있는 값은 출처를, 근거가 없는 값은 "가정"을 주석으로 달았습니다.
 *
 * 브라우저: window.PlantModel / Node: module.exports
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlantModel = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAULTS = {
    // ── 당도 ──
    baseBrix: 5.0,          // 일반 당도 약 5 Brix (범위 3~7) - 이소셜타임즈, 전남농업기술원(2004)
    highBrix: 8.0,          // 고당도 기준 8 Brix 이상 - 이소셜타임즈 (대저 짭짤이 기준)
    maxBrixRise: 4.0,       // 최대 상승폭 (Brix) - 가정 (5 → 9, 고당도 기준을 넘을 수 있는 폭)
    sustainS: 0.15,         // "스트레스가 있다"고 보는 S 하한 - 가정
    sustainMinDays: 3,      // 이 날 수 이상 연속돼야 당도가 오르기 시작 - 가정 ("지속될 때만" 상승, Plants 2024)
    brixTau: 8,             // 포화 함수 g(x)=1-e^(-x/τ)의 τ (스트레스·일) - 가정

    // ── 스트레스 지수 S (0~1) ──
    stressAccum: 0.5,       // 축적계수 - 가정
    stressRecover: 0.3,     // 회복계수 - 가정
    heatMultiplier: 1.4,    // 폭염 시 부족분 가중치 - 가정
    heatBaseDeficit: 0.05,  // 폭염 시 100% 관수에서도 생기는 부족분 (증산 증가) - 가정

    // ── 수량 ──
    yieldLinear: 0.30,      // S 1당 수량 감소 비율 - 가정 (70% 관수 시 −12% 근처가 되도록, Plants 2024)
    yieldQuadThreshold: 0.45, // 이 S를 넘는 강한 스트레스는 제곱항으로 추가 감소 - 가정
    yieldQuad: 2.5,         // 제곱항 계수 - 가정 (최대 −24% 대과형 근거, Plants 2024)

    // ── 클릭 소리 ──
    clickBase: 0.5,         // 정상 식물 시간당 1회 미만 - Khait et al., Cell (2023)
    clickMax: 45,           // S=1일 때 최대 클릭 (회/시간) - 가정 (건조 평균 35.4회, Cell 2023 근처가 되도록)
    clickExp: 2,            // S에 대한 지수 (약한 스트레스에서는 거의 안 늘어남) - 가정
    severeS: 0.8,           // "심한 건조"로 보는 S - 가정
    fatigueOnsetDays: 2,    // 심한 건조가 이 날 수를 넘으면 클릭이 줄기 시작 - 가정 (4~5일째 최고점, Cell 2023)
    fatigueTau: 3,          // 감소 속도 (일) - 가정
    clickNoise: 0.12,       // 하루 클릭 변동 (표준편차, 평균 대비 비율) - 가정

    // ── 소리 브레이크 ──
    brakeStep: 0.10,        // 하루 한 계단 감량 (10%p) - 발표 설계
    brakeFloor: 0.40,       // 최저 관수 비율 - 가정
    brakeDelta: 4.0,        // 대조 구역보다 이만큼(회/시간) 늘면 "뚜렷한 증가" - 가정
    brakeLine: 5,           // 그래프 브레이크 기준선 (회/시간) - 발표 설계
    alarmLine: 15,          // 경보 기준 (회/시간) - 발표 설계
    alarmRecoverDays: 3     // 경보 후 100% 유지 일수 - 가정
  };

  // 화면 표시용 설명 (근거 표·가정값 편집 패널)
  var PARAM_META = {
    baseBrix: ['일반 당도 (Brix)', '이소셜타임즈, 전남농업기술원(2004)'],
    highBrix: ['고당도 기준 (Brix)', '이소셜타임즈 (대저 짭짤이)'],
    maxBrixRise: ['최대 당도 상승폭 (Brix)', '가정'],
    sustainS: ['스트레스 인정 하한 S', '가정'],
    sustainMinDays: ['당도 상승에 필요한 연속 일수', '가정 ("지속" 조건, Plants 2024)'],
    brixTau: ['당도 포화 τ (스트레스·일)', '가정'],
    stressAccum: ['스트레스 축적계수', '가정'],
    stressRecover: ['스트레스 회복계수', '가정'],
    heatMultiplier: ['폭염 부족분 가중치', '가정'],
    heatBaseDeficit: ['폭염 기본 부족분', '가정'],
    yieldLinear: ['수량 감소 (S 비례)', '가정 (Plants 2024 −12%에 맞춤)'],
    yieldQuadThreshold: ['강한 스트레스 임계 S', '가정'],
    yieldQuad: ['강한 스트레스 제곱 계수', '가정 (Plants 2024 최대 −24%)'],
    clickBase: ['정상 클릭 (회/시간)', 'Khait et al., Cell (2023)'],
    clickMax: ['최대 클릭 (회/시간)', '가정 (Cell 2023 평균 35.4회에 맞춤)'],
    clickExp: ['클릭 지수', '가정'],
    severeS: ['심한 건조 S', '가정'],
    fatigueOnsetDays: ['클릭 감소 시작 (일)', '가정 (Cell 2023 4~5일째 최고점)'],
    fatigueTau: ['클릭 감소 속도 (일)', '가정'],
    clickNoise: ['하루 클릭 변동', '가정'],
    brakeStep: ['감량 계단 (비율)', '발표 설계'],
    brakeFloor: ['최저 관수 비율', '가정'],
    brakeDelta: ['브레이크 판정: 대조 대비 증가 (회/시간)', '가정'],
    brakeLine: ['브레이크 기준선 (회/시간)', '발표 설계'],
    alarmLine: ['경보 기준 (회/시간)', '발표 설계'],
    alarmRecoverDays: ['경보 후 100% 유지 (일)', '가정']
  };

  var EVIDENCE = [
    ['일반 당도', '약 5 Brix (일반 범위 3~7)', '이소셜타임즈, 전남농업기술원(2004)'],
    ['고당도 기준', '8 Brix 이상', '이소셜타임즈 (대저 짭짤이 기준)'],
    ['관수 제한 시 수량', '−12~13% (방울형), 최대 −24% (대과형)', 'Alomari-Mheidat et al., Plants (2024)'],
    ['관수 제한 시 과실 무게', '평균 −7~15%', 'Plants (2024)'],
    ['당도가 오르는 조건', '스트레스가 "지속"될 때만 상승', 'Plants (2024)'],
    ['정상 식물 클릭', '시간당 1회 미만', 'Khait et al., Cell (2023)'],
    ['건조 식물 클릭', '평균 시간당 35.4회', 'Cell (2023), KISTI 과학향기'],
    ['단수 후 클릭 변화', '4~5일째 최고점 후 감소', 'Cell (2023), Science News Explores']
  ];

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // 시드 고정 난수 (mulberry32)
  function makeRng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(rng) {
    var u = Math.max(rng(), 1e-9), v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // 계수 허용 범위 [최소, 최대]. 화면에서 0·음수 같은 값을 넣어도 계산이 깨지지 않게 함.
  var LIMITS = {
    baseBrix: [1, 15], highBrix: [1, 20], maxBrixRise: [0, 10], sustainS: [0, 0.99], sustainMinDays: [0, 30],
    brixTau: [0.1, 100], stressAccum: [0, 1], stressRecover: [0, 1], heatMultiplier: [1, 5], heatBaseDeficit: [0, 0.5],
    yieldLinear: [0, 1], yieldQuadThreshold: [0, 1], yieldQuad: [0, 20], clickBase: [0, 10], clickMax: [0, 200],
    clickExp: [0.1, 5], severeS: [0.01, 1], fatigueOnsetDays: [0, 30], fatigueTau: [0.1, 100], clickNoise: [0, 1],
    brakeStep: [0.01, 0.5], brakeFloor: [0, 1], brakeDelta: [0, 1000], brakeLine: [0, 200], alarmLine: [0.1, 1000],
    alarmRecoverDays: [0, 30]
  };

  function mergeParams(over) {
    var p = {};
    for (var k in DEFAULTS) p[k] = DEFAULTS[k];
    if (over) for (var j in over) {
      var v = +over[j];
      if (j in DEFAULTS && over[j] !== '' && over[j] !== null && isFinite(v)) p[j] = LIMITS[j] ? clamp(v, LIMITS[j][0], LIMITS[j][1]) : v;
    }
    if (p.highBrix <= p.baseBrix) p.highBrix = p.baseBrix + 0.1; // 고당도 기준은 일반 당도보다 커야 함
    return p;
  }

  // 구역 하나(감량 구역 또는 대조 구역)의 상태
  function newZone() { return { S: 0, severe: 0, run: 0, x: 0 }; }

  // 하루 진행: 스트레스 갱신 → 지속 스트레스 누적 → 클릭 계산
  function stepZone(z, ratio, heat, P, rng) {
    var d = Math.max(0, 1 - ratio);
    if (heat) d = Math.min(1, d * P.heatMultiplier + P.heatBaseDeficit);
    // S += 축적×d − 회복×(1−d). (1−S), S를 곱해 0~1 안에서 수렴하도록 함 (README 참고)
    z.S = clamp(z.S + P.stressAccum * d * (1 - z.S) - P.stressRecover * (1 - d) * z.S, 0, 1);

    if (z.S >= P.sustainS) z.run++; else z.run = 0;
    if (z.run >= P.sustainMinDays) z.x += z.S - P.sustainS;

    if (z.S >= P.severeS) z.severe++; else z.severe = Math.max(0, z.severe - 1);
    var fatigue = Math.exp(-Math.max(0, z.severe - P.fatigueOnsetDays) / P.fatigueTau);
    var mean = P.clickBase + P.clickMax * Math.pow(z.S, P.clickExp) * fatigue;
    return Math.max(0, mean * (1 + P.clickNoise * gauss(rng)));
  }

  function brixOf(x, P) { return P.baseBrix + P.maxBrixRise * (1 - Math.exp(-x / P.brixTau)); }
  function dailyYield(S, P) {
    var q = Math.max(0, S - P.yieldQuadThreshold);
    return clamp(1 - P.yieldLinear * S - P.yieldQuad * q * q, 0, 1);
  }

  /*
   * opts: {
   *   mode: 'full' | 'fixed' | 'brake',
   *   ratio: 고정 감량 비율 (0~1.1, mode='fixed'),
   *   weather: 'normal' | 'heat',
   *   days: 재배 기간 (일),
   *   seed: 난수 시드,
   *   params: DEFAULTS 덮어쓰기
   * }
   */
  function simulate(opts) {
    opts = opts || {};
    var P = mergeParams(opts.params);
    var mode = opts.mode || 'full';
    var days = Math.min(365, Math.max(1, Math.round(+opts.days || 30)));
    var heat = opts.weather === 'heat';
    var fixedRatio = mode === 'full' ? 1.0 : (opts.ratio == null ? 0.7 : +opts.ratio);
    var seed = isFinite(+opts.seed) && opts.seed !== '' && opts.seed != null ? +opts.seed : 42;
    var rngT = makeRng(seed), rngC = makeRng(seed + 7919);

    var zone = newZone(), ctrl = newZone();
    var out = {
      days: days, mode: mode, weather: heat ? 'heat' : 'normal', params: P,
      ratio: [], clicks: [], ctrlClicks: [], S: [], brix: [], phase: [], alarm: [],
      yieldRatio: [], water: [], alarms: 0
    };

    // 소리 브레이크 상태
    var level = 1.0, phase = 'descend', holdElev = 0, recoverLeft = 0;
    var ySum = 0, wSum = 0;

    for (var t = 0; t < days; t++) {
      var r, ph;
      if (mode === 'brake') {
        if (t > 0) {
          var delta = out.clicks[t - 1] - out.ctrlClicks[t - 1];
          if (out.alarm[t - 1]) { level = 1.0; phase = 'recover'; recoverLeft = P.alarmRecoverDays; }
          if (phase === 'recover') {
            recoverLeft--;
            if (recoverLeft <= 0) phase = 'descend';
          } else if (phase === 'descend') {
            if (delta >= P.brakeDelta) { level = Math.min(1, level + P.brakeStep); phase = 'hold'; holdElev = 0; }
            else level = Math.max(P.brakeFloor, level - P.brakeStep);
          } else { // hold: 이틀 연속 여전히 높으면 한 계단 더 복귀
            if (delta >= P.brakeDelta) { holdElev++; if (holdElev >= 2) { level = Math.min(1, level + P.brakeStep); holdElev = 0; } }
            else holdElev = 0;
          }
          level = Math.round(level * 100) / 100;
        }
        r = level;
        ph = phase === 'hold' ? 'hold' : r < 1 ? 'reduce' : 'normal';
      } else {
        r = fixedRatio;
        ph = r < 1 ? 'reduce' : 'normal';
      }

      var c = stepZone(zone, r, heat, P, rngT);
      var cc = stepZone(ctrl, 1.0, heat, P, rngC);
      var alarm = c >= P.alarmLine;
      if (alarm) {
        out.alarms++;
        ph = 'alarm';
        if (mode === 'brake') { r = 1.0; level = 1.0; } // 경보: 그날 바로 100% 관수
      }

      ySum += dailyYield(zone.S, P);
      wSum += r;
      var yr = ySum / (t + 1);
      var bx = brixOf(zone.x, P);

      out.ratio.push(r);
      out.clicks.push(c);
      out.ctrlClicks.push(cc);
      out.S.push(zone.S);
      out.brix.push(bx);
      out.phase.push(ph);
      out.alarm.push(alarm);
      out.yieldRatio.push(yr);
      out.water.push(wSum / (t + 1));
    }
    return out;
  }

  // t일째(0부터)까지의 요약. base는 같은 조건의 100% 관수 결과.
  function summarize(res, base, t) {
    if (t == null) t = res.days - 1;
    var bt = Math.min(t, base.days - 1);
    var sumC = 0;
    for (var i = 0; i <= t; i++) sumC += res.clicks[i];
    return {
      day: t + 1,
      brix: res.brix[t],
      brixDelta: res.brix[t] - base.brix[bt],
      yieldPct: 100 * res.yieldRatio[t] / base.yieldRatio[bt],
      waterPct: 100 * res.water[t] / base.water[bt],
      meanClicks: sumC / (t + 1),
      alarms: res.alarm.slice(0, t + 1).filter(Boolean).length
    };
  }

  function run(opts) {
    var res = simulate(opts);
    var bo = {};
    for (var k in opts) bo[k] = opts[k];
    bo.mode = 'full';
    var base = simulate(bo);
    return { res: res, base: base, summary: summarize(res, base) };
  }

  // 관수 비율별 최종 당도 (관계 그래프용). 같은 조건에서 고정 감량만 바꿔 계산.
  function brixCurve(opts, ratios) {
    return ratios.map(function (r) {
      var o = {};
      for (var k in opts) o[k] = opts[k];
      o.mode = 'fixed'; o.ratio = r;
      var res = simulate(o);
      return { ratio: r, brix: res.brix[res.days - 1], yieldRatio: res.yieldRatio[res.days - 1] };
    });
  }

  // 세 방식 비교 (발표 파일럿 설계와 같은 3그룹)
  function compareAll(opts) {
    var groups = [
      { key: 'full', name: '① 충분히 관수 (100%)', mode: 'full' },
      { key: 'fixed', name: '② 고정 감량 (70%)', mode: 'fixed', ratio: 0.7 },
      { key: 'brake', name: '③ 소리 브레이크', mode: 'brake' }
    ];
    return groups.map(function (g) {
      var o = {};
      for (var k in opts) o[k] = opts[k];
      o.mode = g.mode;
      o.ratio = g.ratio;
      var r = run(o);
      return { key: g.key, name: g.name, res: r.res, summary: r.summary };
    });
  }

  return {
    DEFAULTS: DEFAULTS, LIMITS: LIMITS, mergeParams: mergeParams, PARAM_META: PARAM_META, EVIDENCE: EVIDENCE,
    simulate: simulate, summarize: summarize, run: run, compareAll: compareAll, brixCurve: brixCurve,
    makeRng: makeRng
  };
});
