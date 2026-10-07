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
    maxBrixRise: 1.22,      // 최대 상승폭 (Brix) - Plants 2024 원문에 맞춤 (물 47%에서 약 +1.0 = +20%, 토마토 관수 연구 +12~26% 범위)
    sustainS: 0.15,         // "스트레스가 있다"고 보는 S 하한 - 가정
    sustainMinDays: 3,      // 이 날 수 이상 연속돼야 당도가 오르기 시작 - 가정 ("지속될 때만" 상승, Plants 2024)
    brixTau: 8,             // 포화 함수 g(x)=1-e^(-x/τ)의 τ (스트레스·일) - 가정

    // ── 스트레스 지수 S (0~1) ──
    stressAccum: 0.5,       // 축적계수 - 가정
    stressRecover: 0.3,     // 회복계수 - 가정
    heatMultiplier: 1.4,    // 폭염 시 부족분 가중치 - 가정
    heatBaseDeficit: 0.05,  // 폭염 시 100% 관수에서도 생기는 부족분 (증산 증가) - 가정

    // ── 수량 ──
    yieldLinear: 0.193,     // S 1당 수량 감소 비율 - Plants 2024 원문에 맞춤 (물 47%에서 −12%)
    yieldQuadThreshold: 0.45, // 이 S를 넘는 강한 스트레스는 제곱항으로 추가 감소 - 가정
    yieldQuad: 0,           // 강한 스트레스 제곱항 - 토마토는 근거 부족으로 0 (다른 작물은 2.5, 가정)

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

  var EVIDENCE; // 아래 CROPS.tomato.evidence (하위 호환)

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

  // 기본값 ← 작물 설정 ← 화면에서 고친 값 순서로 덮어씀
  function mergeParams(over, crop) {
    var p = {};
    for (var k in DEFAULTS) p[k] = DEFAULTS[k];
    var cp = crop && CROPS[crop] ? CROPS[crop].params : null;
    if (cp) for (var c in cp) p[c] = cp[c];
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
   *   crop: 작물 키 (CROPS, 기본 'tomato'),
   *   params: DEFAULTS 덮어쓰기
   * }
   */
  function simulate(opts) {
    opts = opts || {};
    var crop = opts.crop && CROPS[opts.crop] ? opts.crop : 'tomato';
    var P = mergeParams(opts.params, crop);
    var mode = opts.mode || 'full';
    var days = Math.min(365, Math.max(1, Math.round(+opts.days || 30)));
    var heat = opts.weather === 'heat';
    var fixedRatio = mode === 'full' ? 1.0 : (opts.ratio == null ? 0.7 : +opts.ratio);
    var seed = isFinite(+opts.seed) && opts.seed !== '' && opts.seed != null ? +opts.seed : 42;
    var rngT = makeRng(seed), rngC = makeRng(seed + 7919);

    var zone = newZone(), ctrl = newZone();
    var out = {
      days: days, mode: mode, crop: crop, weather: heat ? 'heat' : 'normal', params: P,
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

  /*
   * 작물별 설정. params는 DEFAULTS를 덮어씁니다.
   * evidence: [항목, 값, 출처, 확인 수준]
   *   확인 수준 - '원문 확인': 논문·자료 원문(PDF)에서 수치를 직접 확인
   *               '초록 확인': 논문 초록에서 확인 (본문은 못 봄)
   *               '검색 요약': 검색 결과 요약으로만 확인
   *               '가정': 근거 없이 정한 값
   * targets: 문헌 목표와 모델 결과 비교 (check: true면 test.js가 검사)
   *   metric 'brixDelta' = 100% 관수 대비 당도 증가 (Brix), 'yieldPct' = 100% 대비 수량 (%)
   */
  var CLICK_EVIDENCE = [
    ['정상 식물 클릭', '대조군 모두 시간당 1회 미만', 'Khait et al., Cell 186:1328 (2023)', '원문 확인'],
    ['건조 식물 클릭', '토마토 35.4±6.1회/시간, 담배 11.0±1.4회/시간', 'Khait et al., Cell (2023)', '원문 확인'],
    ['단수 후 클릭 변화', '물을 준 뒤 4~5일간 늘다가 마르면서 감소', 'Khait et al., Cell (2023)', '원문 확인']
  ];
  var CLICK_BORROWED = ['이 작물의 클릭 소리', '측정 자료 없음 → 토마토 값 그대로 사용', 'Cell (2023)은 토마토·담배를 측정, 밀·옥수수·포도·선인장은 녹음만 성공', '가정'];

  var CROPS = {
    tomato: {
      name: '토마토 (논문 기준, 기본)', fruit: 'tomato',
      params: {},
      note: '발표 기본 모델. Plants (2024) 원문에 맞춤: 물 47%에서 수량 −12%(통계적으로 유의하지 않음), 당도 +1.0 정도.',
      evidence: [
        ['수량 (물 47% 공급, 방울형 2020)', '−12% (통계적으로 유의하지 않음)', 'Alomari-Mheidat et al., Plants 13:128 (2024)', '원문 확인'],
        ['과실 무게', '평균 −7~15%', 'Plants (2024)', '원문 확인'],
        ['당도', '스트레스가 지속될 때만 증가 (그래프로만 제시, 증가 폭 수치 없음)', 'Plants (2024)', '원문 확인'],
        ['당도 증가 폭', '+12~26% (방울토마토·부분근권건조 연구)', '토마토 관수 연구들', '검색 요약'],
        ['강한 스트레스의 추가 손해', '근거 부족 → 제곱항 없앰', '-', '가정']
      ].concat(CLICK_EVIDENCE),
      targets: [
        { label: '물 47%: 수량 −5~−15% (논문 −12%)', ratio: 0.47, days: 30, metric: 'yieldPct', lo: 85, hi: 95, source: 'Plants (2024) 원문', check: true },
        { label: '물 47%: 당도 +0.6~1.3 Brix (+12~26%)', ratio: 0.47, days: 30, metric: 'brixDelta', lo: 0.6, hi: 1.3, source: '토마토 관수 연구 (검색 요약)', check: true }
      ]
    },
    tomatoDraft: {
      name: '토마토 (처음 초안)', fruit: 'tomato', params: { maxBrixRise: 4.0, yieldLinear: 0.30, yieldQuad: 2.5 },
      note: '처음 프롬프트 기준(70%: 당도 +1.5 이상, 수량 −8~16%)에 맞춘 설정. 논문의 −12%는 물 47% 조건이었으므로 원문보다 당도도 수량 손해도 크게 나옵니다. 비교용.',
      evidence: [
        ['일반 당도', '약 5 Brix (일반 범위 3~7)', '이소셜타임즈, 전남농업기술원(2004)', '검색 요약'],
        ['고당도 기준', '8 Brix 이상만 "대저 짭짤이"', '이소셜타임즈 (대저 짭짤이)', '검색 요약'],
        ['수량 (물 47%·13% 공급, 방울형)', '−12%, −13% (통계적으로 유의하지 않음)', 'Alomari-Mheidat et al., Plants 13:128 (2024)', '원문 확인'],
        ['수량 (물 15% 공급, 대과 Marmande)', '−24% (유의하지 않음)', 'Plants (2024)', '원문 확인'],
        ['과실 무게', '평균 −7%, −15% (방울형), −14% (대과형)', 'Plants (2024)', '원문 확인'],
        ['당도가 오르는 조건', '스트레스가 "지속"될 때만 증가', 'Plants (2024) 초록', '원문 확인'],
        ['가공용 토마토 메타분석', '물 부족 관수: 수량 감소(평균 −18.6 t/ha), 당도·비타민C 증가 (25편, 561처리)', 'Agricultural Water Management 222:301 (2019)', '초록 확인'],
        ['당도 증가 폭', '부분근권건조 +26%, 방울토마토 +12~16%', '토마토 관수 연구들 (검색 요약)', '검색 요약']
      ].concat(CLICK_EVIDENCE),
      targets: [
        { label: '70% 관수: 당도 +1.5 이상', ratio: 0.7, days: 30, metric: 'brixDelta', lo: 1.5, hi: 99, source: '프롬프트 기준', check: true },
        { label: '70% 관수: 수량 −8~−16%', ratio: 0.7, days: 30, metric: 'yieldPct', lo: 84, hi: 92, source: '프롬프트 기준 (논문 원문은 물 47%에서 −12%)', check: true },
        { label: '참고: 당도 +12~26% (= +0.6~1.3 Brix)', ratio: 0.7, days: 30, metric: 'brixDelta', lo: 0.6, hi: 1.3, source: '토마토 관수 연구 (검색 요약)', check: false },
        { label: '참고: 물 47%에서 수량 −12% (유의하지 않음)', ratio: 0.47, days: 30, metric: 'yieldPct', lo: 85, hi: 95, source: 'Plants (2024) 원문', check: false }
      ]
    },
    cherry: {
      name: '방울토마토', fruit: 'cherry',
      params: { baseBrix: 7, highBrix: 9, maxBrixRise: 1.7, yieldLinear: 0.255, yieldQuad: 2.5 },
      note: '당도 증가 +12~16%, 가을 작기 수량 감소 5~20%에 맞춤.',
      evidence: [
        ['일반 당도', '7 Brix로 둠', '-', '가정'],
        ['고당도 기준', '9 Brix로 둠', '-', '가정'],
        ['물 부족 관수 시 당도', '+15.73% (두 품종 모두)', 'Agriculture 11:669 (2021), 잎 수분퍼텐셜 기반 관수', '검색 요약'],
        ['물 부족 관수 시 당도', '+12.44%', '방울토마토 Summerbrix·Lazarino 연구', '검색 요약'],
        ['수량 (Summerbrix·Lazarino)', '가을 작기는 뚜렷한 차이 없음, 봄 작기는 감소 (물 85% 절약)', 'Agricultural Water Management, 방울토마토 RDI', '초록 확인'],
        ['수량 감소 폭', '가을 작기 −5~20%, 봄 작기 −60~62%', '같은 연구', '검색 요약']
      ].concat(CLICK_EVIDENCE),
      targets: [
        { label: '70% 관수: 당도 +12~16% (= +0.8~1.1 Brix)', ratio: 0.7, days: 30, metric: 'brixDelta', lo: 0.8, hi: 1.15, source: 'Agriculture (2021) 외', check: true },
        { label: '70% 관수: 수량 −5~−20%', ratio: 0.7, days: 30, metric: 'yieldPct', lo: 80, hi: 95, source: 'Summerbrix·Lazarino 가을 작기', check: true }
      ]
    },
    strawberry: {
      name: '딸기', fruit: 'strawberry',
      params: { baseBrix: 9, highBrix: 11, maxBrixRise: 0.4, yieldLinear: 0.84, yieldQuad: 2.5 },
      note: '수량은 크게 줄고, 당도는 연구에 따라 증가·변화 없음·감소가 모두 보고됨. 당도 상승을 아주 작게 잡음. 물을 줄여 얻는 것이 적은 작물.',
      evidence: [
        ['일반 당도', '9 Brix로 둠', '-', '가정'],
        ['고당도 기준', '11 Brix로 둠', '-', '가정'],
        ['Malling Ace (사철 딸기, 10개월)', '상품 수량 −30~36%, 당도 변화 없음', 'Frontiers in Horticulture (2025), NIAB', '검색 요약'],
        ['San Andreas (관수 100·80·60%)', '물을 줄일수록 수량·과중 감소, 당도·경도·산 증가', 'Applied Fruit Science (2025)', '초록 확인'],
        ['정식 직후부터 물 줄이기', '환원당 −25.1%, 과중 −12.6% (당이 오히려 감소)', 'Hortic. Environ. Biotechnol. (2023)', '초록 확인'],
        ['개화 후부터 물 줄이기', '과실 품질에 나쁜 영향 없음, 규산과 함께 쓰면 당 증가', '같은 연구', '초록 확인']
      ].concat([CLICK_BORROWED]),
      targets: [
        { label: '70% 관수: 수량 −30~−36%', ratio: 0.7, days: 30, metric: 'yieldPct', lo: 62, hi: 72, source: 'Frontiers in Horticulture (2025)', check: true },
        { label: '70% 관수: 당도 변화 작음 (−0.5~+0.5)', ratio: 0.7, days: 30, metric: 'brixDelta', lo: -0.5, hi: 0.5, source: '위 연구들 (결과가 엇갈림)', check: true }
      ]
    },
    melon: {
      name: '멜론', fruit: 'melon',
      params: { baseBrix: 11, highBrix: 14, maxBrixRise: 3.1, yieldLinear: 0.4, yieldQuad: 2.5 },
      note: '50% 관수에서 당도 +23%, 상품 수량 −30%(주로 과실 크기 감소)에 맞춤. 품종에 따라 수량 감소가 −24~43%로 다름.',
      evidence: [
        ['일반 당도', '11 Brix로 둠', '-', '가정'],
        ['고당도 기준', '14 Brix로 둠', '-', '가정'],
        ['50% ETc 관수 시 당도', 'Mission 품종 +23%', 'Agricultural Water Management (2014), 미국 텍사스 2년 시험', '초록 확인'],
        ['50% ETc 관수 시 상품 수량', '−30% (주로 과실 크기 감소)', '같은 연구', '초록 확인'],
        ['품종 차이', 'Mission −24%, Da Vinci −30%, Super Nectar −33~43%', '같은 연구', '초록 확인'],
        ['물 절약', 'Mission·Da Vinci 37~45% 절약', '같은 연구', '초록 확인']
      ].concat([CLICK_BORROWED]),
      targets: [
        { label: '50% 관수: 당도 +23% (= 약 +2.5 Brix)', ratio: 0.5, days: 30, metric: 'brixDelta', lo: 2.0, hi: 3.0, source: 'Agric. Water Manag. (2014) 초록', check: true },
        { label: '50% 관수: 상품 수량 −24~−43%', ratio: 0.5, days: 30, metric: 'yieldPct', lo: 57, hi: 76, source: '같은 연구', check: true }
      ]
    },
    citrus: {
      name: '감귤 (타이벡 피복)', fruit: 'citrus',
      params: { baseBrix: 10, highBrix: 11, maxBrixRise: 3.8, yieldLinear: 0.23, yieldQuad: 2.5, sustainMinDays: 25, stressAccum: 0.25 },
      note: '타이벡으로 빗물을 막아 물을 줄이는 실제 재배법. 피복 후 30~60일 지나야 스트레스가 시작돼 재배 기간을 60일로 늘려 보세요. 관수 50%를 "피복"으로 봄.',
      evidence: [
        ['노지감귤 평균 당도', '9.8~10.5 °Bx', '제주농업기술원, 토양피복재배 실천기술 교육 (2019)', '원문 확인'],
        ['타이벡 피복재배 효과', '당도 2.6~3.0 °Bx 향상', '같은 자료 (감귤연구소 결과 인용)', '원문 확인'],
        ['스트레스가 시작되는 시점', '피복 후 30~60여 일 지나서부터', '같은 자료', '원문 확인'],
        ['물이 고인 나무', '당도 9.9 °Bx (정상 11.7), 산함량 0.94% (정상 1.13%)', '같은 자료 (’08년 애월 조사)', '원문 확인'],
        ['수확 전 관리 기준', '11 °Bx 이하면 관수하지 않음, 한 번에 많이 주면 당도 하락', '같은 자료', '원문 확인'],
        ['고당도 등급', '11 °Brix 이상, 산도 1% 이하', '시판 감귤 품질 비교 (KCI)', '초록 확인'],
        ['과실 크기', '피복 과원은 작은 과실이 되지 않도록 적과 필수 (수치 없음)', '같은 자료', '원문 확인'],
        ['수량 감소 폭', '수치 자료 없음 → 10%로 둠', '-', '가정']
      ].concat([CLICK_BORROWED]),
      targets: [
        { label: '피복(50%) 60일: 당도 +2.6~3.0 Brix', ratio: 0.5, days: 60, metric: 'brixDelta', lo: 2.6, hi: 3.0, source: '제주농업기술원 (원문 확인)', check: true },
        { label: '피복(50%) 30일: 당도가 거의 안 오름 (30~60일 지연)', ratio: 0.5, days: 30, metric: 'brixDelta', lo: 0, hi: 1.0, source: '같은 자료', check: true }
      ]
    },
    pepper: {
      name: '파프리카', fruit: 'pepper',
      params: { baseBrix: 7, highBrix: 8, maxBrixRise: 0.8, yieldLinear: 0.036, yieldQuad: 2.5 },
      note: '20% 정도 줄여도 수량이 거의 줄지 않는다는 연구가 있음. 당도 상승은 작게 잡음.',
      evidence: [
        ['일반 당도', '7 Brix로 둠', '-', '가정'],
        ['고당도 기준', '8 Brix로 둠', '-', '가정'],
        ['80% ETc 관수 (영양생장기·과실기)', '총수량이 오히려 증가, 물 10% 절약, 품질 향상', 'ISHS Acta Hortic. 1034 (bell pepper, 2010~2011 온실)', '초록 확인'],
        ['짠물(EC 3.4) 관수', '수량 −35%, 대신 당도·당·비타민C 증가', '같은 연구', '초록 확인'],
        ['생육 단계', '꽃 피는 시기가 물 부족에 가장 약함', '같은 연구', '초록 확인'],
        ['권장', '근권 수분을 보며 20% 감량', '파프리카 관수 연구 (검색 요약)', '검색 요약']
      ].concat([CLICK_BORROWED]),
      targets: [
        { label: '80% 관수: 수량 거의 그대로 (−3% 이내)', ratio: 0.8, days: 30, metric: 'yieldPct', lo: 97, hi: 101, source: 'ISHS 1034 (검색 요약)', check: true },
        { label: '80% 관수: 당도 소폭 증가 (0~+0.6)', ratio: 0.8, days: 30, metric: 'brixDelta', lo: 0.05, hi: 0.6, source: '같은 연구', check: true }
      ]
    }
  };

  // 작물 목표 검증 (화면 검증표와 test.js에서 사용)
  function verifyCrop(key, seed) {
    var c = CROPS[key];
    return c.targets.map(function (tg) {
      var r = run({ crop: key, mode: 'fixed', ratio: tg.ratio, days: tg.days, weather: 'normal', seed: seed == null ? 42 : seed });
      var v = r.summary[tg.metric];
      return { target: tg, value: v, ok: v >= tg.lo && v <= tg.hi };
    });
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
    DEFAULTS: DEFAULTS, LIMITS: LIMITS, mergeParams: mergeParams, PARAM_META: PARAM_META, EVIDENCE: CROPS.tomato.evidence,
    CROPS: CROPS, verifyCrop: verifyCrop,
    simulate: simulate, summarize: summarize, run: run, compareAll: compareAll, brixCurve: brixCurve,
    makeRng: makeRng
  };
});
