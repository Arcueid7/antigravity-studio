/* ==========================================================================
   Antigravity Studio — Multilingual Time-of-Day Editorial Greetings
   ========================================================================== */

import { getLanguage } from './i18n.js';

export const TIME_GREETINGS = {
  dawn: [
    '早安，今天想从哪行代码启程？',
    '晨光正好，此刻脑海里有什么灵感？',
    '早安，让我们把新想法变成现实。',
    '新的一天开始了，今天想构建些什么？',
    '清晨思绪最澄明，先攻克哪个难题？',
    '早安，第一杯咖啡配哪项创造？',
    '晨风未歇，准备好写下今天的序章了吗？',
    '早安，有什么值得雕琢的作品在等你？',
    '日出之时，正是开启新实验的好时刻。',
    '早安，今天想探索哪片未知领域？',
  ],
  morning: [
    '上午好，此刻正适合进入深度心流。',
    '上午好，今天的主线任务从哪里切入？',
    '思路正热，想一起推演哪个方案？',
    '上午好，我们来把复杂的问题拆解清楚。',
    '效率正当时，有什么棘手的代码交给我？',
    '上午好，今天想打磨哪一处细节？',
    '阳光正好，一起构思点有意思的东西吧。',
    '上午好，手头的工作需要怎样的助力？',
    '状态渐佳，准备好推进今天的构想了吗？',
    '上午好，从一份清晰的蓝图开始吧。',
  ],
  noon: [
    '午安，小憩片刻，或者顺手解一道巧题？',
    '午间时光，有什么灵光一闪的想法吗？',
    '中午好，趁着安静，一起理理思路吧。',
    '午后未至，想聊聊哪个轻巧的新点子？',
    '午安，需要我帮你整理上午的脉络吗？',
    '日影正中，不妨先做个简短的头脑风暴。',
    '中午好，随时为你候命。',
    '午间偷闲，探索点有趣的新知识如何？',
    '午安，下午的计划要现在一起起草吗？',
    '正午静谧，灵感往往在不经意间降临。',
  ],
  afternoon: [
    '下午好，今天想构建什么？',
    '午后正好，我们继续打磨手头的作品吧。',
    '下午好，有什么架构或创意想一起推敲？',
    '光影斜长，最适合静心写一段优雅的代码。',
    '下午好，哪里卡住了？我们一起拆解。',
    '午后茶香配灵感，此刻想探索什么主题？',
    '下午好，把脑海里的草图变成可运行的原型吧。',
    '思路渐入佳境，下一站你想去往何处？',
    '下午好，需要一份深度分析还是敏捷实现？',
    '漫长午后，正宜细细推敲每个细节。',
    '下午好，今天有什么值得骄傲的进展？',
  ],
  evening: [
    '晚上好，华灯初上，此刻想做些什么？',
    '夜色渐浓，静下来把想法落到实处吧。',
    '晚上好，今天还有哪件作品想收个漂亮的尾？',
    '灯火可亲，最适合一场深度的思维漫游。',
    '晚上好，想聊聊技术、设计，还是天马行空？',
    '晚风拂过，不妨开启一段不受打扰的创造。',
    '晚上好，把白天的零碎灵感串成体系吧。',
    '夜幕低垂，你的下一个绝妙点子是什么？',
    '晚上好，随时准备好与你并肩思考。',
    '今夜清宁，适合雕琢真正打动人的细节。',
    '晚上好，想一起推演哪个有趣的课题？',
  ],
  lateNight: [
    '夜深了，静谧时刻最容易诞生好想法。',
    '凌晨好，万籁俱寂，我陪你慢慢推敲。',
    '星河渐沉，这个点还在构思什么杰作？',
    '深夜好，思路清晰，也别忘了早些休息。',
    '夜阑人静，最适合解开白天遗留的谜题。',
    '凌晨的灯光与代码，今天想完成哪一块拼图？',
    '夜深露重，把此刻的灵光先记录下来吧。',
    '午夜静好，无需急躁，我们一步步来。',
    '长夜未央，你的下一次灵感迸发从这里开始。',
    '深夜安好，随时在这里接住你的每一个念头。',
  ],
};

const LOCALIZED_GREETINGS = {
  'zh-CN': TIME_GREETINGS,
  en: {
    dawn: [
      'Good morning — where shall we begin today?',
      'Fresh morning light. What idea is sparking right now?',
      'Early start — let us turn a new concept into reality.',
      'Quiet dawn hours are best for clean architecture.',
      'Good morning — ready to write the opening chapter?',
    ],
    morning: [
      'Good morning — ready to get into deep flow?',
      'What are we building or refining this morning?',
      'Let us break down something complex together.',
      'Morning momentum — hand me the trickiest part.',
      'Good morning — let us start from a crisp blueprint.',
    ],
    noon: [
      'Good midday — quick brainstorm or a tidy refactor?',
      'Quiet noon window — what is on your mind?',
      'Need help organizing this morning’s notes and ideas?',
      'Good afternoon ahead — want to sketch the next step?',
      'Ready whenever you are.',
    ],
    afternoon: [
      'Good afternoon — what would you like to build?',
      'Let us turn that rough sketch into a working prototype.',
      'Stuck somewhere? Let us untangle it step by step.',
      'Good afternoon — deep analysis or rapid shipping?',
      'A calm afternoon for polishing the details that matter.',
    ],
    evening: [
      'Good evening — what shall we explore tonight?',
      'Unwind and bring one great idea across the finish line.',
      'Good evening — code, design, research, or something wild?',
      'Quiet evening hours are made for uninterrupted craft.',
      'Good evening — ready to think alongside you.',
    ],
    lateNight: [
      'Quiet night — the best ideas often arrive after midnight.',
      'Late-night focus. Let us work through it calmly together.',
      'What puzzle are we solving under the midnight lamp?',
      'Still going strong — capture the spark before resting.',
      'Peaceful late hours — no rush, one step at a time.',
    ],
  },
  ja: {
    dawn: [
      'おはようございます。今日はどのコードから始めましょうか？',
      '朝の澄んだ時間ですね。何かひらめきはありますか？',
      'おはようございます。新しいアイデアを形にしましょう。',
      '静かな早朝は、設計を練るのにぴったりの時間です。',
      'おはようございます。今日の一歩目を一緒に書き出しましょう。',
    ],
    morning: [
      'おはようございます。深い集中に入りましょう。',
      '今日のメインタスク、どこから切り込みますか？',
      '複雑な課題も、一緒に整理して解きほぐしましょう。',
      '調子が出てきましたね。どの細部を磨きましょうか？',
      '明確な設計図から、気持ちよくスタートしましょう。',
    ],
    noon: [
      'こんにちは。ひと息入れつつ、アイデアを整理しませんか？',
      'お昼の静かな時間に、軽いブレストでもいかがでしょう。',
      'こんにちは。いつでもお手伝いできる状態です。',
      '午後の計画を今のうちに一緒に下書きしますか？',
      'ふとしたひらめきを、すぐ形にしてみましょう。',
    ],
    afternoon: [
      'こんにちは。今日は何を作りましょうか？',
      '頭の中のスケッチを、動くプロトタイプに変えましょう。',
      '詰まっている箇所はありますか？一緒に分解して解決しましょう。',
      'じっくり分析しますか、それとも素早く実装しますか？',
      '穏やかな午後に、細部まで丁寧に仕上げましょう。',
    ],
    evening: [
      'こんばんは。今夜は何に取り組みましょうか？',
      '静かな夜に、アイデアを着実に形にしていきましょう。',
      '技術、デザイン、それとも自由な発想を広げますか？',
      '今日の作業を気持ちよく締めくくるお手伝いをします。',
      'こんばんは。いつでも隣で一緒に考えます。',
    ],
    lateNight: [
      '静かな深夜ですね。良いアイデアが浮かびやすい時間です。',
      '焦らず一歩ずつ、一緒にじっくり考えましょう。',
      '深夜の灯りとコード、どのピースを完成させますか？',
      '今浮かんだひらめきを、忘れないうちに書き留めましょう。',
      '夜更けもお疲れさまです。無理せず進めていきましょう。',
    ],
  },
  ko: {
    dawn: [
      '좋은 아침입니다. 오늘 첫 줄은 어디서 시작할까요?',
      '맑은 새벽 공기와 함께 어떤 아이디어가 떠올랐나요?',
      '좋은 아침이에요. 새로운 구상을 현실로 만들어 봅시다.',
      '고요한 아침은 깔끔한 설계를 그리기에 가장 좋은 시간입니다.',
      '오늘의 첫 장을 함께 열어 볼까요?',
    ],
    morning: [
      '좋은 오전입니다. 깊은 몰입을 시작해 볼까요?',
      '오늘의 핵심 작업은 어디서부터 풀어 갈까요?',
      '복잡한 문제도 함께 차근차근 분해해 봅시다.',
      '컨디션이 좋은 오전, 까다로운 코드를 맡겨 주세요.',
      '명확한 청사진에서 기분 좋게 출발해 봅시다.',
    ],
    noon: [
      '안녕하세요. 잠시 숨 고르며 생각을 정리해 볼까요?',
      '조용한 점심 시간, 번뜩이는 아이디어가 있나요?',
      '오전의 흐름을 깔끔하게 정리해 드릴까요?',
      '언제든 함께할 준비가 되어 있습니다.',
      '오후 계획을 지금 미리 스케치해 볼까요?',
    ],
    afternoon: [
      '좋은 오후입니다. 오늘 무엇을 만들어 볼까요?',
      '머릿속 스케치를 동작하는 프로토타입으로 바꿔 봅시다.',
      '막힌 부분이 있나요? 함께 원인을 찾아 풀어 봅시다.',
      '깊은 분석이 필요하신가요, 빠른 구현이 필요하신가요?',
      '차분한 오후, 완성도를 높이는 디테일을 다듬어 봅시다.',
    ],
    evening: [
      '좋은 저녁입니다. 오늘 밤엔 무엇을 탐구해 볼까요?',
      '차분해진 저녁, 아이디어를 차근차근 구현해 봅시다.',
      '기술, 디자인, 혹은 자유로운 브레인스토밍 무엇이든 좋습니다.',
      '오늘 작업의 멋진 마무리를 함께 도와드릴게요.',
      '좋은 저녁이에요. 언제든 곁에서 함께 고민하겠습니다.',
    ],
    lateNight: [
      '깊은 밤이네요. 고요한 시간에 가장 좋은 생각이 떠오르곤 합니다.',
      '서두르지 말고 한 걸음씩 차분히 풀어 봅시다.',
      '밤늦은 조명 아래, 오늘 완성하고 싶은 조각은 무엇인가요?',
      '지금 떠오른 영감을 잊기 전에 먼저 기록해 두세요.',
      '늦은 시간까지 고생이 많으세요. 쉴 틈도 챙기며 진행해요.',
    ],
  },
};

export function updateTimeGreetingEl(greetingEl, animate = false) {
  if (!greetingEl) return;
  const lang = getLanguage();
  const pool = LOCALIZED_GREETINGS[lang] || LOCALIZED_GREETINGS['zh-CN'];

  const h = new Date().getHours();
  let bucket = pool.evening;
  if (h >= 5 && h < 9) bucket = pool.dawn;
  else if (h >= 9 && h < 12) bucket = pool.morning;
  else if (h >= 12 && h < 14) bucket = pool.noon;
  else if (h >= 14 && h < 18) bucket = pool.afternoon;
  else if (h >= 18 && h < 23) bucket = pool.evening;
  else bucket = pool.lateNight;

  let last = '';
  try {
    last = sessionStorage.getItem('agy_last_greeting') || '';
  } catch {
    // ignore
  }
  const candidates = bucket.filter((g) => g !== last);
  const picked = candidates[Math.floor(Math.random() * candidates.length)] || bucket[0];
  try {
    sessionStorage.setItem('agy_last_greeting', picked);
  } catch {
    // ignore
  }

  if (animate) {
    greetingEl.style.opacity = '0';
    setTimeout(() => {
      greetingEl.textContent = picked;
      greetingEl.style.opacity = '1';
    }, 150);
  } else {
    greetingEl.textContent = picked;
  }
}
