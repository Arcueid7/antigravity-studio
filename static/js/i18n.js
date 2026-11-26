/* ==========================================================================
   Antigravity Studio — Zero-Dependency Lightweight i18n Engine
   Supported locales: zh-CN (source), en (English), ja (日本語), ko (한국어)
   Lossless DOM translation with WeakMap state machine & strict user-content guards.
   ========================================================================== */

export const SUPPORTED_LANGUAGES = [
  { code: 'zh-CN', label: '简体中文', short: '中文', htmlLang: 'zh-CN' },
  { code: 'en', label: 'English', short: 'EN', htmlLang: 'en' },
  { code: 'ja', label: '日本語', short: '日本語', htmlLang: 'ja' },
  { code: 'ko', label: '한국어', short: '한국어', htmlLang: 'ko' },
];

const LANG_CODES = new Set(SUPPORTED_LANGUAGES.map((l) => l.code));
const STORAGE_KEY = 'agy_studio_lang';

export function normalizeLanguage(lang) {
  const raw = String(lang || '').trim();
  if (LANG_CODES.has(raw)) return raw;
  const low = raw.toLowerCase();
  if (low.startsWith('en')) return 'en';
  if (low.startsWith('ja')) return 'ja';
  if (low.startsWith('ko')) return 'ko';
  return 'zh-CN';
}

let currentLang = (() => {
  try {
    return normalizeLanguage(localStorage.getItem(STORAGE_KEY) || 'zh-CN');
  } catch {
    return 'zh-CN';
  }
})();

export function getLanguage() {
  return currentLang;
}

export function getLanguageMeta(code = currentLang) {
  const norm = normalizeLanguage(code);
  return SUPPORTED_LANGUAGES.find((l) => l.code === norm) || SUPPORTED_LANGUAGES[0];
}

// =========================================================================
// Exact Phrase Dictionary: zh-CN -> [en, ja, ko]
// =========================================================================

const DICT = {
  // Top Menu Bar
  '文件': ['File', 'ファイル', '파일'],
  '编辑': ['Edit', '編集', '편집'],
  '视图': ['View', '表示', '보기'],
  '帮助': ['Help', 'ヘルプ', '도움말'],
  '新聊天': ['New Chat', '新しいチャット', '새 채팅'],
  '新建项目…': ['New Project…', '新規プロジェクト…', '새 프로젝트…'],
  '从 GitHub 克隆仓库…': ['Clone from GitHub…', 'GitHub からクローン…', 'GitHub에서 클론…'],
  '打开文件夹': ['Open Folder', 'フォルダーを開く', '폴더 열기'],
  '快速打开文件': ['Quick Open File', 'ファイルを素早く開く', '파일 빠르게 열기'],
  '打开文件目录页': ['Open File Explorer', 'ファイル一覧を開く', '파일 탐색기 열기'],
  '关闭当前标签页': ['Close Active Tab', '現在のタブを閉じる', '현재 탭 닫기'],
  '打开本地数据目录': ['Open Local Data Folder', 'ローカルデータフォルダーを開く', '로컬 데이터 폴더 열기'],
  '退出 Antigravity Studio': ['Quit Antigravity Studio', 'Antigravity Studio を終了', 'Antigravity Studio 종료'],
  '撤销': ['Undo', '元に戻す', '실행 취소'],
  '重做': ['Redo', 'やり直す', '다시 실행'],
  '剪切': ['Cut', '切り取り', '잘라내기'],
  '复制': ['Copy', 'コピー', '복사'],
  '粘贴': ['Paste', '貼り付け', '붙여넣기'],
  '删除': ['Delete', '削除', '삭제'],
  '全选': ['Select All', 'すべて選択', '모두 선택'],
  '设置': ['Settings', '設定', '설정'],
  '全局命令面板…': ['Command Palette…', 'コマンドパレット…', '명령 팔레트…'],
  '定位对话轮次目录': ['Turn Timeline Navigator', '会話タイムライン目次', '대화 타임라인 목차'],
  '切换左侧边栏': ['Toggle Left Sidebar', '左サイドバーを切り替え', '왼쪽 사이드바 전환'],
  '切换右侧多标签栏': ['Toggle Right Workspace Pane', '右ワークスペースを切り替え', '오른쪽 워크스페이스 전환'],
  '并排双文件分屏阅读': ['Side-by-Side Split View', '左右分割ビュー', '나란히 분할 보기'],
  '打开工作区终端': ['Open Workspace Terminal', 'ワークスペース端末を開く', '워크스페이스 터미널 열기'],
  '打开变更审查 (Review)': ['Open Git Review', '変更レビュー (Review) を開く', '변경 리뷰 (Review) 열기'],
  '切换浅色 / 深色': ['Toggle Light / Dark', 'ライト / ダーク切替', '라이트 / 다크 전환'],
  '界面语言…': ['Interface Language…', '表示言語…', '인터페이스 언어…'],
  '主题与自由调色盘': ['Themes & Color Studio', 'テーマとカラーパレット', '테마 및 색상 팔레트'],
  'Custom CSS 工作台': ['Custom CSS Studio', 'Custom CSS スタジオ', 'Custom CSS 스튜디오'],
  '放大界面': ['Zoom In', '拡大', '화면 확대'],
  '缩小界面': ['Zoom Out', '縮小', '화면 축소'],
  '重置缩放': ['Reset Zoom', 'ズームをリセット', '확대/축소 재설정'],
  '全屏 / 还原窗口': ['Toggle Fullscreen', '全画面 / 元に戻す', '전체 화면 전환'],
  '重新加载界面': ['Reload Window', '画面を再読み込み', '화면 새로고침'],
  '查看实时配额 (View Usage)': ['View Live Usage Quota', '使用量クォータを表示', '실시간 사용량 보기'],
  '打开偏好设置': ['Open Preferences', '環境設定を開く', '환경설정 열기'],
  '快捷键一览': ['Keyboard Shortcuts', 'キーボードショートカット', '단축키 안내'],
  '查看本地运行日志': ['View Local Server Log', 'ローカル実行ログを表示', '로컬 실행 로그 보기'],
  '关于 Antigravity Studio': ['About Antigravity Studio', 'Antigravity Studio について', 'Antigravity Studio 정보'],
  '展开/收起侧边栏 (Ctrl+B)': ['Toggle Sidebar (Ctrl+B)', 'サイドバーを開閉 (Ctrl+B)', '사이드바 열기/닫기 (Ctrl+B)'],
  '后退': ['Back', '戻る', '뒤로'],
  '前进': ['Forward', '進む', '앞으로'],
  '最小化': ['Minimize', '最小化', '최소화'],
  '最大化': ['Maximize', '最大化', '최대화'],
  '向下还原': ['Restore Down', '元に戻す', '이전 크기로 복원'],
  '关闭': ['Close', '閉じる', '닫기'],

  // Left Sidebar
  '库': ['Library', 'ライブラリ', '라이브러리'],
  '已排定': ['Scheduled', 'スケジュール', '예약 작업'],
  '学生': ['Study', '学習', '학습'],
  '自定义': ['Customize', 'カスタマイズ', '사용자 지정'],
  '视频': ['Video', '動画', '비디오'],
  '项目': ['Projects', 'プロジェクト', '프로젝트'],
  '最近': ['Recent', '最近', '최근'],
  '搜索对话标题或正文…': ['Search conversations…', '会話を検索…', '대화 제목 또는 내용 검색…'],
  '清除搜索': ['Clear search', '検索をクリア', '검색 지우기'],
  '从 GitHub 克隆 / 拉取仓库': ['Clone / Pull from GitHub', 'GitHub からクローン / 取得', 'GitHub에서 클론 / 풀'],
  '添加本地项目文件夹': ['Add Local Project Folder', 'ローカルプロジェクトを追加', '로컬 프로젝트 폴더 추가'],
  '正在检测 agy…': ['Detecting agy…', 'agy を検出中…', 'agy 감지 중…'],
  '未检测到 agy': ['agy not detected', 'agy 未検出', 'agy 감지되지 않음'],
  '点击右上角 + 添加项目目录': ['Click + above to pin a project', '右上の + でプロジェクトを追加', '오른쪽 위 + 로 프로젝트 추가'],
  '暂无最近对话': ['No recent conversations', '最近の会話はありません', '최근 대화가 없습니다'],
  '标题与聊天正文中均无匹配': ['No matching conversations', '一致する会話がありません', '일치하는 대화가 없습니다'],
  '快速切换主题色': ['Quick Color Schemes', 'テーマカラー切替', '빠른 색상 테마'],
  '进入自由调色盘…': ['Open Color Studio…', 'カラーパレットを開く…', '자유 색상 팔레트 열기…'],
  '自定义画布、侧栏、强调色与气泡颜色': ['Customize canvas, sidebar, accent & bubble colors', '背景・サイドバー・アクセント色を自由に調整', '배경, 사이드바, 강조색 및 말풍선 색상 지정'],
  '切换主题配色 / 自定义颜色': ['Switch Theme / Colors', '配色・カスタムカラー', '테마配色 / 색상 변경'],
  '切换浅色 / 深色主题': ['Toggle Light / Dark Theme', 'ライト / ダークテーマ切替', '라이트 / 다크 테마 전환'],
  '设置（头像、外观、Custom CSS、agy CLI）': ['Settings (Profile, Theme, CSS, CLI)', '設定（プロフィール・外観・CSS・CLI）', '설정 (프로필, 외관, CSS, CLI)'],
  '头像': ['Avatar', 'アバター', '아바타'],

  // Stage Topbar & Composer
  '导出 .md': ['Export .md', '.md エクスポート', '.md 내보내기'],
  '将当前对话导出为 Markdown (.md) 笔记': ['Export conversation as Markdown (.md)', '現在の会話を Markdown (.md) で保存', '현재 대화를 Markdown (.md)으로 내보내기'],
  '展开/收起右侧工作区面板 (Ctrl+\\)': ['Toggle Right Workspace Pane (Ctrl+\\)', '右ワークスペースを開閉 (Ctrl+\\)', '오른쪽 워크스페이스 열기/닫기 (Ctrl+\\)'],
  '点击换一句问候': ['Click for another greeting', 'クリックで別の挨拶を表示', '클릭하여 다른 인사말 보기'],
  '点击重命名': ['Click to rename', 'クリックして名前を変更', '클릭하여 이름 변경'],
  '随心输入（支持 @ 引用文件 · / 快捷指令与 Skills）': [
    'Ask anything (@ to mention files · / for commands & Skills)',
    '何でも入力（@ ファイル参照 · / コマンドと Skills）',
    '무엇이든 입력하세요 (@ 파일 참조 · / 명령 및 Skills)',
  ],
  '添加文件、图像、搜索或更多工具': ['Attach files, images, search & tools', 'ファイル・画像・ツールを追加', '파일, 이미지, 검색 및 도구 추가'],
  '添加照片和文件': ['Upload Photos & Files', '写真・ファイルを追加', '사진 및 파일 업로드'],
  '引用工作区文件': ['Mention Workspace File', 'ワークスペースファイルを参照', '워크스페이스 파일 참조'],
  '调度 Skill': ['Invoke Skill', 'Skill を呼び出す', 'Skill 호출'],
  '输入 / 随时挂载仓库技能': ['Type / to mount any repository Skill', '/ を入力して Skill を適用', '/ 를 입력해 저장소 Skill 적용'],
  '在项目中工作': ['Work in Project Folder', 'プロジェクトフォルダーで作業', '프로젝트 폴더에서 작업'],
  '绘图': ['Sketchpad', 'スケッチパッド', '스케치패드'],
  '绘制并附加图像': ['Draw & attach a quick sketch', '手描きスケッチを作成して添付', '스케치를 그려 대화에 첨부'],
  '创建图像': ['Create Image', '画像を作成', '이미지 생성'],
  '可视化呈现任何内容': ['Visualize any concept', 'アイデアをビジュアル化', '무엇이든 시각화'],
  '网页搜索': ['Web Search', 'ウェブ検索', '웹 검색'],
  '查找实时新闻和信息': ['Find live news & info', '最新ニュースや情報を検索', '실시간 뉴스 및 정보 검색'],
  '深度研究': ['Deep Research', 'ディープリサーチ', '심층 리서치'],
  '获取详细报告': ['Generate an in-depth report', '詳細な調査レポートを作成', '상세 리포트 생성'],
  '思考一下': ['Think Deeper', '深く考える', '깊게 생각하기'],
  '获取详细解答': ['Reason through complex problems', '複雑な課題をじっくり推論', '복잡한 문제를 심층 추론'],
  '请求批准': ['Ask Approval', '承認を求める', '승인 요청'],
  '先做规划': ['Plan First', 'プラン優先', '계획 우선'],
  '自动编辑': ['Auto Edit', '自動編集', '자동 편집'],
  '完全自动': ['Full Auto', '完全自動', '완전 자동'],
  '请求批准 (Default)': ['Ask Approval (Default)', '承認を求める (Default)', '승인 요청 (Default)'],
  '先做规划 (Plan)': ['Plan First (Plan)', 'プラン優先 (Plan)', '계획 우선 (Plan)'],
  '自动编辑 (Accept Edits)': ['Accept Edits', '自動編集 (Accept Edits)', '자동 편집 (Accept Edits)'],
  '完全自动 (Auto)': ['Full Auto (Auto)', '完全自動 (Auto)', '완전 자동 (Auto)'],
  '选择项目': ['Select Project', 'プロジェクト選択', '프로젝트 선택'],
  '当前工作区目录': ['Active Workspace Folder', '現在のワークスペース', '현재 워크스페이스 폴더'],
  '切换项目 / 工作区目录': ['Switch Project / Workspace', 'プロジェクト / 作業ディレクトリ切替', '프로젝트 / 작업 폴더 전환'],
  '退出当前项目，回到默认工作区': ['Leave project and return to default workspace', 'プロジェクトを閉じて既定ワークスペースへ戻る', '프로젝트를 나가 기본 워크스페이스로 복귀'],
  'agy 执行权限模式 (--mode)': ['Execution Permission Mode (--mode)', '実行権限モード (--mode)', '실행 권한 모드 (--mode)'],
  '选择模型': ['Select Model', 'モデルを選択', '모델 선택'],
  '调整推理深度 (Effort)': ['Adjust Reasoning Effort', '推論の深さ (Effort) を調整', '추론 깊이 (Effort) 조정'],
  '发送 (Enter)': ['Send (Enter)', '送信 (Enter)', '전송 (Enter)'],
  '停止当前对话生成': ['Stop Generating', '生成を停止', '생성 중지'],
  '移除附件': ['Remove Attachment', '添付を削除', '첨부 파일 제거'],
  '尚未检测到': ['Not detected:', '未検出:', '감지되지 않음:'],
  '复制安装命令': ['Copy Install Command', 'インストールコマンドをコピー', '설치 명령 복사'],
  '已复制 ✓': ['Copied ✓', 'コピー済み ✓', '복사됨 ✓'],
  '✦ 立即体验内置 UI 演示流': ['✦ Try Built-in Interactive Demo', '✦ 内蔵 UI デモを体験', '✦ 내장 UI 데모 체험하기'],
  '演示思考流、工具调用卡片与右侧 Artifact 预览': ['Preview thinking stream, tool summary & Artifact sandbox', '思考ストリーム・ツール要約・Artifact プレビューを体験', '사고 스트림, 도구 요약 및 Artifact 미리보기 체험'],
  '演示模式': ['Demo Mode', 'デモモード', '데모 모드'],

  // Models & Usage Popover
  '执行权限 Mode': ['Permission Mode', '実行権限 Mode', '실행 권한 Mode'],
  '推理深度 Effort': ['Reasoning Effort', '推論深度 Effort', '추론 깊이 Effort'],
  '使用 agy CLI 默认配置模型': ['Use default agy CLI model', 'agy CLI の既定モデルを使用', 'agy CLI 기본 모델 사용'],
  'Gemini 4 全能均衡模型': ['Gemini 4 balanced all-rounder', 'Gemini 4 バランス万能モデル', 'Gemini 4 균형 잡힌 만능 모델'],
  'Gemini 4 前沿深度推理': ['Gemini 4 frontier deep reasoning', 'Gemini 4 最先端ディープ推論', 'Gemini 4 최첨단 심층 추론'],
  'Gemini 4 轻量稳定输出': ['Gemini 4 lightweight & steady', 'Gemini 4 軽量・安定出力', 'Gemini 4 경량 안정 출력'],
  'Gemini 4 高阶复杂任务': ['Gemini 4 advanced complex tasks', 'Gemini 4 高度な複雑タスク向け', 'Gemini 4 고난도 복합 작업'],
  '多步骤任务编排引擎': ['Multi-step task orchestration', 'マルチステップ実行エンジン', '다단계 작업 오케스트레이션'],
  '旗舰推理与复杂架构': ['Flagship reasoning & architecture', 'フラッグシップ推論・設計', '플래그십 추론 및 아키텍처'],
  '高效编程与日常主力': ['Fast daily coding workhorse', '高速コーディングの主力', '고효율 코딩 데일리 주력'],
  '极速低延迟响应': ['Ultra-fast low latency', '超高速・低遅延レスポンス', '초고속 저지연 응답'],
  '开源大模型': ['Open-source LLM', 'オープンソース LLM', '오픈소스 대형 모델'],
  '自定义 agy CLI 模型': ['Custom agy CLI model', 'カスタム agy CLI モデル', '사용자 지정 agy CLI 모델'],
  '自定义模型标识': ['Custom model slug', 'カスタムモデル識別子', '사용자 지정 모델 ID'],
  '按 CLI 默认策略执行，敏感操作先确认': ['Default policy; ask before sensitive actions', 'CLI 既定ポリシーで実行（重要操作は確認）', '기본 정책으로 실행, 민감한 작업 전 승인'],
  '先输出方案并确认后再修改文件': ['Draft plan first before modifying files', 'まず計画を提示し、承認後に変更', '먼저 계획을 제시하고 확인 후 파일 수정'],
  '自动批准文件读写与代码修改': ['Auto-approve file edits & reads', 'ファイル読み書きと編集を自動承認', '파일 읽기/쓰기 및 코드 수정 자동 승인'],
  '全自动执行工具与终端命令': ['Auto-run tools & terminal commands', 'ツールと端末コマンドを完全自動実行', '도구 및 터미널 명령 완전 자동 실행'],
  '跟随 CLI 默认推理深度': ['Follow CLI default effort', 'CLI 既定の推論深度に従う', 'CLI 기본 추론 깊이 따름'],
  '快速直接响应': ['Fast direct response', '素早く簡潔に回答', '빠르고 직접적인 응답'],
  '速度与思考深度均衡': ['Balanced speed & depth', '速度と思考深度のバランス', '속도와 사고 깊이의 균형'],
  '深度思考与复杂推理': ['Deep thinking & complex reasoning', '深い思考と複雑な推論', '심층 사고 및 복합 추론'],
  '极致深度推理': ['Maximum deep reasoning', '最高レベルの深層推論', '극한 심층 추론'],
  '最大思考预算': ['Max thinking budget', '最大の思考予算', '최대 사고 예산'],
  '刷新实时配额': ['Refresh Live Quota', 'リアルタイム残量を更新', '실시간 사용량 새로고침'],
  '即将重置': ['Resets soon', 'まもなくリセット', '곧 초기화'],
  '未返回有效配额数据': ['No quota data returned', '有効なクォータ情報がありません', '유효한 사용량 데이터가 없습니다'],
  '点击右上角刷新图标获取当前账号配额。': ['Click refresh in the top-right to load your quota.', '右上の更新アイコンでアカウント残量を取得します。', '오른쪽 위 새로고침을 눌러 사용량을 조회하세요.'],
  '正在通过': ['Querying via', 'クエリ中:', '조회 중:'],
  '查询实时配额…': ['for live usage quota…', 'でリアルタイム残量を取得中…', '실시간 사용량 조회 중…'],

  // Chat Messages, Turns & Tool Cards
  '思考过程': ['Thinking', '思考プロセス', '사고 과정'],
  '复制全文': ['Copy', '全文コピー', '전체 복사'],
  '重新生成': ['Regenerate', '再生成', '다시 생성'],
  '↻ 重新生成': ['↻ Regenerate', '↻ 再生成', '↻ 다시 생성'],
  '从此处分叉': ['Fork Here', 'ここから分岐', '여기서 분기'],
  '回滚代码': ['Rollback', 'ロールバック', '코드 롤백'],
  '↺ 回滚代码': ['↺ Rollback', '↺ ロールバック', '↺ 코드 롤백'],
  '回滚到此步前': ['Rollback Before Turn', 'この手順の前に戻す', '이 단계 이전으로 롤백'],
  '↺ 回滚到此步前': ['↺ Rollback Before Turn', '↺ この手順の前に戻す', '↺ 이 단계 이전으로 롤백'],
  '编辑重发': ['Edit & Resend', '編集して再送', '수정 후 재전송'],
  '分叉': ['Fork', '分岐', '분기'],
  '使用原问题重新生成本条回复': ['Regenerate this reply from the same prompt', '同じ質問からこの回答を再生成', '같은 질문으로 이 답변 다시 생성'],
  '从这条回复分叉出一条新对话': ['Fork a new conversation from this reply', 'この回答から新しい会話を分岐', '이 답변에서 새 대화 분기'],
  '将工作区代码回滚到本轮修改之前': ['Rollback workspace files before this turn', 'このターンの変更前にコードを戻す', '이 턴 수정 전으로 워크스페이스 롤백'],
  '修改此条消息并重新生成后续回复': ['Edit this message and regenerate reply', 'メッセージを編集して再生成', '이 메시지를 수정하고 답변 다시 생성'],
  '保留原对话并从此处分叉出一条新对话': ['Keep original and fork a new chat here', '元の会話を残してここから分岐', '원본을 유지하고 여기서 새 대화 분기'],
  '预览并将工作区代码回滚到本轮发消息前的快照': ['Preview and rollback workspace to pre-turn snapshot', 'このターン前のスナップショットを確認して復元', '이 턴 이전 스냅샷을 미리 보고 롤백'],
  '本轮 AI 修改前': ['Before this turn', 'このターンの変更前', '이번 AI 수정 전'],
  '已置顶': ['Pinned', 'ピン留め済み', '고정됨'],
  '置顶对话': ['Pin Chat', '会話をピン留め', '대화 고정'],
  '取消置顶': ['Unpin', 'ピン留め解除', '고정 해제'],
  '已置顶对话 📌': ['Conversation pinned', '会話をピン留めしました', '대화를 고정했습니다'],
  '已取消置顶': ['Unpinned', 'ピン留めを解除しました', '고정이 해제되었습니다'],
  '删除对话': ['Delete Chat', '会話を削除', '대화 삭제'],
  '后台运行中': ['Running in background', 'バックグラウンド実行中', '백그라운드 실행 중'],
  '新回复已完成': ['New reply ready', '新しい回答が完了しました', '새 답변 완료됨'],
  '已调度': ['Dispatched', '適用済み', '호출됨'],
  '自动调度': ['Auto Dispatch', '自動ディスパッチ', '자동 디스패치'],
  '斜杠调度': ['Slash Invoked', 'スラッシュ呼出', '슬래시 호출'],
  '手动挂载': ['Mounted', '手動マウント', '수동 마운트'],
  '执行出错': ['Execution Error', '実行エラー', '실행 오류'],
  '查阅工作区文件': ['Read workspace files', 'ワークスペースファイルを参照', '워크스페이스 파일 읽기'],
  '修改文件内容': ['Edited file', 'ファイルを編集', '파일 내용 수정'],
  '写入文件': ['Wrote file', 'ファイルに書き込み', '파일 쓰기'],
  '运行终端命令': ['Ran command', 'コマンドを実行', '터미널 명령 실행'],
  '检索工作区内容': ['Searched workspace', 'ワークスペースを検索', '워크스페이스 검색'],
  '联网获取信息': ['Fetched web info', 'ウェブ情報を取得', '웹 정보 검색'],
  '协调子任务执行': ['Coordinated sub-task', 'サブタスクを実行', '하위 작업 조율'],
  '生成图像': ['Generated image', '画像を生成', '이미지 생성'],
  '执行操作': ['Executed action', '操作を実行', '작업 실행'],
  '正在查阅工作区文件…': ['Reading workspace files…', 'ファイルを参照中…', '워크스페이스 파일 읽는 중…'],
  '正在修改文件…': ['Editing file…', 'ファイルを編集中…', '파일 수정 중…'],
  '正在写入文件…': ['Writing file…', 'ファイルに書き込み中…', '파일 쓰는 중…'],
  '正在运行终端命令…': ['Running command…', 'コマンドを実行中…', '터미널 명령 실행 중…'],
  '正在检索工作区…': ['Searching workspace…', 'ワークスペースを検索中…', '워크스페이스 검색 중…'],
  '正在联网获取信息…': ['Searching the web…', 'ウェブ情報を取得中…', '웹 정보 가져오는 중…'],
  '正在协调子任务…': ['Running sub-task…', 'サブタスクを実行中…', '하위 작업 조율 중…'],
  '正在生成图像…': ['Generating image…', '画像を生成中…', '이미지 생성 중…'],
  '查看原始参数与输出': ['View raw arguments & output', '生の引数と出力を表示', '원본 인자 및 출력 보기'],
  '… Diff 过长，已折叠剩余行': ['… Diff truncated, remaining lines folded', '… Diff が長いため残りを省略', '… Diff가 길어 나머지 줄 접힘'],
  '预览 Artifact': ['Preview Artifact', 'Artifact プレビュー', 'Artifact 미리보기'],
  '✦ 预览 Artifact': ['✦ Preview Artifact', '✦ Artifact プレビュー', '✦ Artifact 미리보기'],
  'Mermaid 图表': ['Mermaid Diagram', 'Mermaid 図表', 'Mermaid 다이어그램'],
  '问 agy': ['Ask agy', 'agy に質問', 'agy에게 묻기'],
  '引用片段': ['Quote Snippet', '抜粋を引用', '스니펫 인용'],
  '已达上限': ['Max', '上限', '최대'],
  '已达下限': ['Min', '下限', '최소'],
  '默认': ['Default', '標準', '기본'],
  '图表': ['Diagram', '図表', '다이어그램'],
  '源码': ['Source', 'ソース', '소스'],
  '图表生成中…': ['Generating diagram…', '図表を生成中…', '다이어그램 생성 중…'],
  '正在渲染图表…': ['Rendering diagram…', '図表をレンダリング中…', '다이어그램 렌더링 중…'],
  '查看大图': ['View Large', '拡大表示', '크게 보기'],
  '放大查看': ['Zoom in', '拡大して表示', '확대 보기'],
  '右侧查看': ['Open in Pane', '右ペインで開く', '오른쪽에서 보기'],
  '在文件夹中显示': ['Reveal in Folder', 'フォルダーで表示', '폴더에서 표시'],
  '用系统默认应用打开': ['Open in System App', '既定アプリで開く', '시스템 기본 앱으로 열기'],
  '图片预览': ['Image Preview', '画像プレビュー', '이미지 미리보기'],
  '下载': ['Download', 'ダウンロード', '다운로드'],
  '系统打开': ['Open External', 'アプリで開く', '시스템으로 열기'],
  '复制路径': ['Copy Path', 'パスをコピー', '경로 복사'],
  '适应': ['Fit', '合わせる', '맞춤'],
  '放大': ['Zoom In', '拡大', '확대'],
  '缩小': ['Zoom Out', '縮小', '축소'],
  '适应窗口': ['Fit to Window', 'ウィンドウに合わせる', '창에 맞춤'],
  '下载图片': ['Download Image', '画像をダウンロード', '이미지 다운로드'],
  '复制本地路径': ['Copy Local Path', 'ローカルパスをコピー', '로컬 경로 복사'],
  '用系统默认照片应用打开': ['Open with system viewer', '既定の画像アプリで開く', '시스템 기본 사진 앱으로 열기'],
  '工作区文件': ['Workspace File', 'ワークスペースファイル', '워크스페이스 파일'],
  '附件图片': ['Attached Image', '添付画像', '첨부 이미지'],
  '对话轮次目录': ['Turn Timeline', '会話タイムライン', '대화 타임라인'],
  '对话时间轴定位': ['Turn Timeline Navigator', '会話タイムライン目次', '대화 타임라인 탐색'],
  '悬停查看对话目录 · 点击快速定位': ['Hover for turn outline · Click to jump', 'ホバーで目次表示・クリックで移動', '마우스를 올려 목차 보기 · 클릭하여 이동'],
  '当前对话': ['Current Chat', '現在の会話', '현재 대화'],
  '（附件消息）': ['(Attachment)', '（添付メッセージ）', '(첨부 메시지)'],

  // Right Multi-Tab Sidebar
  '打开新标签页（文件 / 变更 / 终端 / 产物）': ['New Tab (Files / Review / Terminal / Artifact)', '新しいタブ（ファイル・変更・端末・成果物）', '새 탭 열기 (파일 / 변경 / 터미널 / 산출물)'],
  '全宽专注阅读': ['Full-Width Focus', '全幅フォーカス', '전체 너비 집중 보기'],
  '全宽专注阅读 / 恢复对话分栏': ['Toggle Full-Width Focus Mode', '全幅フォーカス表示の切替', '전체 너비 집중 모드 전환'],
  '退出全宽专注阅读': ['Exit Full-Width Focus', '全幅フォーカス終了', '전체 너비 집중 종료'],
  '退出全宽专注阅读，恢复对话分栏': ['Exit full-width focus and restore split', '全幅フォーカスを終了し分割に戻す', '전체 너비 집중을 종료하고 분할 복원'],
  '收起侧栏 (Ctrl+\\)': ['Collapse Pane (Ctrl+\\)', 'パネルを閉じる (Ctrl+\\)', '패널 접기 (Ctrl+\\)'],
  '快速搜索并打开文件': ['Quick Search & Open File', 'ファイルを検索して開く', '파일 빠르게 검색 및 열기'],
  '搜索工作区文件并新开标签页...': ['Search workspace files to open in new tab…', 'ファイルを検索して新規タブで開く…', '워크스페이스 파일 검색 후 새 탭으로 열기…'],
  '变更审查': ['Git Review', '変更レビュー', '변경 리뷰'],
  '独立文件目录页': ['File Explorer', 'ファイルツリー', '파일 탐색기'],
  '工作区终端': ['Terminal', 'ワークスペース端末', '워크스페이스 터미널'],
  '产物预览': ['Artifact Preview', '成果物プレビュー', '산출물 미리보기'],
  '实时样式工作台': ['Live CSS Studio', 'リアルタイム CSS', '실시간 스타일 스튜디오'],
  '刷新目录树': ['Refresh File Tree', 'ツリーを更新', '트리 새로고침'],
  '文件目录': ['Explorer', 'ファイル一覧', '파일 탐색기'],
  '浏览并搜索你的文件': ['Browse & search workspace files', 'ワークスペースのファイルを閲覧・検索', '워크스페이스 파일 탐색 및 검색'],
  '在根目录新建文件': ['New File in Root', 'ルートにファイルを作成', '루트에 새 파일 만들기'],
  '在根目录新建文件夹': ['New Folder in Root', 'ルートにフォルダーを作成', '루트에 새 폴더 만들기'],
  '新建文件': ['New File', '新規ファイル', '새 파일'],
  '新建文件夹': ['New Folder', '新規フォルダー', '새 폴더'],
  '新建文件…': ['New File…', '新規ファイル…', '새 파일…'],
  '新建子文件夹…': ['New Subfolder…', '新規サブフォルダー…', '새 하위 폴더…'],
  '重命名…': ['Rename…', '名前を変更…', '이름 바꾸기…'],
  '重命名文件': ['Rename File', 'ファイル名を変更', '파일 이름 바꾸기'],
  '重命名文件夹': ['Rename Folder', 'フォルダー名を変更', '폴더 이름 바꾸기'],
  '删除文件': ['Delete File', 'ファイルを削除', '파일 삭제'],
  '删除文件…': ['Delete File…', 'ファイルを削除…', '파일 삭제…'],
  '删除文件夹': ['Delete Folder', 'フォルダーを削除', '폴더 삭제'],
  '删除文件夹…': ['Delete Folder…', 'フォルダーを削除…', '폴더 삭제…'],
  '确认删除': ['Confirm Delete', '削除を確認', '삭제 확인'],
  '确认重命名': ['Confirm Rename', '変更を確定', '이름 변경 확인'],
  '创建并编辑': ['Create & Edit', '作成して編集', '생성 후 편집'],
  '创建文件夹': ['Create Folder', 'フォルダーを作成', '폴더 만들기'],
  '搜索文件名...': ['Filter filenames…', 'ファイル名で絞り込み…', '파일 이름 검색…'],
  '渲染': ['Rendered', '表示', '렌더링'],
  '预览': ['Preview', 'プレビュー', '미리보기'],
  '排版': ['Formatted', '整形', '서식'],
  '纯文本': ['Plain Text', 'プレーン', '일반 텍스트'],
  '工具栏': ['Toolbar', 'ツールバー', '도구 모음'],
  '精简': ['Minimal', 'シンプル', '간소화'],
  '保存': ['Save', '保存', '저장'],
  '保存 ●': ['Save ●', '保存 ●', '저장 ●'],
  '保存中…': ['Saving…', '保存中…', '저장 중…'],
  '保存修改 (Ctrl+S)': ['Save Changes (Ctrl+S)', '変更を保存 (Ctrl+S)', '변경 사항 저장 (Ctrl+S)'],
  '编辑文件': ['Edit File', 'ファイルを編集', '파일 편집'],
  '退出编辑模式': ['Exit Edit Mode', '編集モード終了', '편집 모드 종료'],
  '切换轻量编辑模式': ['Toggle Lightweight Editor', '軽量編集モード切替', '경량 편집 모드 전환'],
  '切换轻量编辑模式 (Ctrl+S 保存)': ['Toggle Editor (Ctrl+S to save)', '編集モード切替 (Ctrl+S で保存)', '편집 모드 전환 (Ctrl+S 저장)'],
  '退出编辑回到只读视图': ['Exit editing to read-only view', '編集を終了し読み取り専用に戻る', '편집을 종료하고 읽기 전용으로 복귀'],
  '并排阅读两个文件': ['Split View Two Files', '2ファイルを並べて表示', '두 파일 나란히 보기'],
  '关闭并排分屏': ['Close Split View', '分割表示を閉じる', '분할 보기 닫기'],
  '并排分屏打开': ['Open in Split View', '分割ビューで開く', '분할 보기로 열기'],
  '并排同时阅读两个文件 (Ctrl+Shift+\\)': ['Read two files side-by-side (Ctrl+Shift+\\)', '2ファイルを並べて閲覧 (Ctrl+Shift+\\)', '두 파일 나란히 보기 (Ctrl+Shift+\\)'],
  '文件操作与信息': ['File Actions & Info', 'ファイル操作と情報', '파일 작업 및 정보'],
  '@ 引用到对话输入框': ['@ Cite in Chat', '@ チャットへ引用', '@ 대화창에 인용'],
  '@ 引用到对话': ['@ Cite in Chat', '@ チャットへ引用', '@ 대화에 인용'],
  '@ 引用': ['@ Cite', '@ 引用', '@ 인용'],
  '@ 审查': ['@ Review', '@ レビュー', '@ 리뷰'],
  '引用此文件到输入框': ['Cite this file in chat composer', 'このファイルをチャット入力欄へ引用', '이 파일을 대화 입력창에 인용'],
  '复制文件内容': ['Copy File Contents', 'ファイル内容をコピー', '파일 내용 복사'],
  '打开所在文件夹': ['Open Containing Folder', '親フォルダーを開く', '상위 폴더 열기'],
  '在资源管理器中显示文件': ['Reveal in Explorer', 'エクスプローラーで表示', '탐색기에서 표시'],
  '重新读取文件': ['Reload File', 'ファイルを再読み込み', '파일 다시 읽기'],
  '上下': ['Vertical', '上下', '상하'],
  '左右': ['Horizontal', '左右', '좌우'],
  '切换左右 / 上下分屏布局': ['Switch Horizontal / Vertical Split', '左右 / 上下分割を切り替え', '좌우 / 상하 분할 레이아웃 전환'],
  '选择并排阅读的第二个文件': ['Choose second file for split view', '分割表示する2つ目のファイルを選択', '분할 보기할 두 번째 파일 선택'],
  '选择工作区文件…': ['Choose workspace file…', 'ファイルを選択…', '워크스페이스 파일 선택…'],
  '关闭分屏': ['Close Split', '分割を閉じる', '분할 닫기'],
  '关闭标签页': ['Close Tab', 'タブを閉じる', '탭 닫기'],
  '在右侧打开': ['Open on Right', '右で開く', '오른쪽에서 열기'],
  '当前目录为空': ['Directory is empty', 'フォルダーは空です', '현재 디렉터리가 비어 있습니다'],
  '未找到匹配文件': ['No matching files found', '一致するファイルがありません', '일치하는 파일을 찾을 수 없습니다'],
  '正在加载工作区文件…': ['Loading workspace files…', 'ファイルを読み込み中…', '워크스페이스 파일 불러오는 중…'],
  '正在读取文件…': ['Reading file…', 'ファイルを読み込み中…', '파일 읽는 중…'],
  '读取中…': ['Loading…', '読み込み中…', '불러오는 중…'],
  '无法读取文件': ['Unable to read file', 'ファイルを読み込めません', '파일을 읽을 수 없습니다'],
  '本地运行日志': ['Local Server Log', 'ローカル実行ログ', '로컬 실행 로그'],
  '（空文件夹）': ['(Empty folder)', '（空のフォルダー）', '(빈 폴더)'],
  '（文档无文本内容）': ['(Empty document)', '（テキストなし）', '(텍스트 내용 없음)'],
  '（空白幻灯片）': ['(Blank slide)', '（空白スライド）', '(빈 슬라이드)'],
  '表格为空': ['Table is empty', 'テーブルは空です', '표가 비어 있습니다'],
  '未提取到幻灯片文本': ['No slide text extracted', 'スライドのテキストがありません', '슬라이드 텍스트가 없습니다'],
  '有未保存修改 (Ctrl+S)': ['Unsaved changes (Ctrl+S)', '未保存の変更あり (Ctrl+S)', '저장되지 않은 변경 있음 (Ctrl+S)'],
  '已引用 ✓': ['Cited ✓', '引用済み ✓', '인용됨 ✓'],
  '已引用到对话 ✓': ['Cited in chat ✓', 'チャットへ引用しました ✓', '대화에 인용됨 ✓'],
  '已复制到剪贴板 ✓': ['Copied to clipboard ✓', 'クリップボードにコピーしました ✓', '클립보드에 복사됨 ✓'],
  '已保存 ✓': ['Saved ✓', '保存済み ✓', '저장됨 ✓'],
  '已保存至 custom.css ✓': ['Saved to custom.css ✓', 'custom.css に保存しました ✓', 'custom.css에 저장됨 ✓'],
  '检测到外部修改，已自动热重载 ✓': ['External edit detected, hot-reloaded ✓', '外部変更を検出し自動再読込しました ✓', '외부 수정 감지됨, 자동 리로드 완료 ✓'],
  '已与磁盘 custom.css 同步': ['Synced with custom.css on disk', 'ディスク上の custom.css と同期済み', '디스크의 custom.css와 동기화됨'],
  '实时预览中（未保存）': ['Live preview (unsaved)', 'ライブプレビュー中（未保存）', '실시간 미리보기 중 (미저장)'],
  '已应用预设（点击保存写入磁盘）': ['Preset applied (click Save to persist)', 'プリセット適用済み（保存で確定）', '프리셋 적용됨 (저장 클릭 시 반영)'],

  // Git / GitHub / Worktrees / Terminal / Artifact / CSS
  '改动': ['Changes', '変更', '변경'],
  '非 Git': ['Non-Git', '非 Git', 'Git 아님'],
  '非 Git 仓库': ['Not a Git Repo', 'Git リポジトリではありません', 'Git 저장소 아님'],
  '干净': ['Clean', 'クリーン', '깨끗함'],
  '切换或新建 Git 分支': ['Switch or create Git branch', 'Git ブランチ切替・作成', 'Git 브랜치 전환 또는 생성'],
  '拉取远程更新 (git pull --rebase)': ['Pull updates (git pull --rebase)', 'リモートから取得 (git pull --rebase)', '원격 업데이트 풀 (git pull --rebase)'],
  '推送到远程仓库 (git push)': ['Push to remote (git push)', 'リモートへプッシュ (git push)', '원격 저장소로 푸시 (git push)'],
  'GitHub 仓库 / 设置': ['GitHub Repo / Settings', 'GitHub リポジトリ・設定', 'GitHub 저장소 / 설정'],
  '全部 Diff': ['All Diff', '全 Diff', '전체 Diff'],
  '刷新 Git / GitHub 状态': ['Refresh Git / GitHub Status', 'Git / GitHub 状態を更新', 'Git / GitHub 상태 새로고침'],
  '输入 Commit 提交信息，或点击下方 AI 自动生成…': ['Enter commit message or click AI Write Commit…', 'コミットメッセージを入力、または AI で自動生成…', '커밋 메시지를 입력하거나 AI 자동 생성을 클릭…'],
  '✦ AI 写 Commit': ['✦ AI Commit', '✦ AI コミット作成', '✦ AI 커밋 작성'],
  '✦ 生成中…': ['✦ Generating…', '✦ 生成中…', '✦ 생성 중…'],
  '让 agy 根据当前 Diff 自动生成规范 Commit 信息': ['Generate commit message from current Diff via agy', '現在の Diff から agy がコミット文を自動生成', '현재 Diff를 바탕으로 agy가 커밋 메시지 생성'],
  '提交': ['Commit', 'コミット', '커밋'],
  '提交并推送': ['Commit & Push', 'コミットしてプッシュ', '커밋 및 푸시'],
  '暂存此文件': ['Stage File', 'ステージ', '스테이징'],
  '取消暂存': ['Unstage', 'ステージ解除', '스테이징 해제'],
  '已暂存': ['Staged', 'ステージ済み', '스테이지됨'],
  '打开文件': ['Open File', 'ファイルを開く', '파일 열기'],
  '让 agy 审查当前变更': ['Ask agy to review current changes', 'agy に現在の変更をレビューさせる', 'agy에게 현재 변경 사항 리뷰 요청'],
  '+ 新建 PR': ['+ New PR', '+ 新規 PR', '+ 새 PR'],
  '创建 PR': ['Create PR', 'PR を作成', 'PR 만들기'],
  'Pull Request 标题': ['Pull Request title', 'Pull Request タイトル', 'Pull Request 제목'],
  '源分支 (自动当前分支)': ['Head branch (current)', 'ソースブランチ (現在)', '소스 브랜치 (현재 브랜치)'],
  '目标分支 (默认 main)': ['Base branch (default main)', 'ベースブランチ (既定 main)', '대상 브랜치 (기본 main)'],
  'PR 改动说明（可选）…': ['PR description (optional)…', 'PR の説明（任意）…', 'PR 변경 설명 (선택)…'],
  '收起详情': ['Collapse', '閉じる', '접기'],
  '✦ AI 审 PR': ['✦ AI Review PR', '✦ AI PR レビュー', '✦ AI PR 리뷰'],
  '✦ AI 分析修复': ['✦ AI Analyze & Fix', '✦ AI 分析・修正', '✦ AI 분석 및 수정'],
  '输入分支名创建独立 Worktree（如 feat/ui）': ['Branch name for new Worktree (e.g. feat/ui)', '新規 Worktree のブランチ名（例: feat/ui）', '새 Worktree 브랜치 이름 입력 (예: feat/ui)'],
  '+ 新建': ['+ New', '+ 新規', '+ 새로 만들기'],
  '进入此工作区': ['Enter Workspace', 'この作業領域へ移動', '이 워크스페이스로 이동'],
  '正在此目录中工作': ['Active workspace', '現在の作業ディレクトリ', '현재 작업 중인 디렉터리'],
  '主工作区': ['Main Workspace', 'メイン作業領域', '메인 워크스페이스'],
  '当前': ['Current', '現在', '현재'],
  '移除': ['Remove', '削除', '제거'],
  '暂无 Worktree 列表': ['No Worktrees found', 'Worktree はありません', 'Worktree 목록이 없습니다'],
  '正在加载 Worktree…': ['Loading Worktrees…', 'Worktree を読み込み中…', 'Worktree 불러오는 중…'],
  '正在加载 Pull Requests…': ['Loading Pull Requests…', 'Pull Requests を読み込み中…', 'Pull Requests 불러오는 중…'],
  '正在加载 Issues…': ['Loading Issues…', 'Issues を読み込み中…', 'Issues 불러오는 중…'],
  '正在加载 Diff…': ['Loading Diff…', 'Diff を読み込み中…', 'Diff 불러오는 중…'],
  '暂无文本差异内容。': ['No text diff available.', 'テキスト差分はありません。', '텍스트 차이 내용이 없습니다.'],
  '全部工作区改动': ['All Workspace Changes', 'すべてのワークスペース変更', '전체 워크스페이스 변경'],
  '（此 Issue 无正文描述）': ['(No description provided)', '（説明なし）', '(본문 설명 없음)'],
  'Artifact 预览': ['Artifact Preview', 'Artifact プレビュー', 'Artifact 미리보기'],
  '暂无活跃 Artifact': ['No Active Artifact', 'アクティブな Artifact はありません', '활성 Artifact 없음'],
  '生成 HTML / SVG 交互界面或代码片段后，点击代码块右上角「Artifact」即可在此实时渲染预览。': [
    'Generate an HTML/SVG snippet, then click "Artifact" on the code block to preview live here.',
    'HTML / SVG コードを生成後、右上の「Artifact」ボタンでここにライブ表示できます。',
    'HTML / SVG 코드를 생성한 뒤 코드 블록 우측 상단의 "Artifact"를 누르면 실시간 미리보기가 표시됩니다.',
  ],
  '清空': ['Clear', 'クリア', '지우기'],
  '停止': ['Stop', '停止', '중지'],
  '运行': ['Run', '実行', '실행'],
  '终端当前工作目录': ['Terminal Working Directory', '端末のカレントディレクトリ', '터미널 현재 작업 디렉터리'],
  '输入命令并回车，如 python --version、git log -5...': ['Type a command & press Enter (e.g. python --version, git log -5)…', 'コマンドを入力して Enter（例: python --version）…', '명령어를 입력하고 Enter (예: python --version, git log -5)…'],
  '工作区终端已就绪（PowerShell · UTF-8）。支持': ['Workspace Terminal Ready (PowerShell · UTF-8). Supports', 'ワークスペース端末準備完了（PowerShell · UTF-8）。対応:', '워크스페이스 터미널 준비됨 (PowerShell · UTF-8). 지원:'],
  '切换目录与': ['directory switching &', 'ディレクトリ移動と', '디렉터리 전환 및'],
  '历史命令。': ['command history.', 'コマンド履歴。', '명령 기록.'],
  '输出已清空。': ['Output cleared.', '出力をクリアしました。', '출력이 지워졌습니다.'],
  '(无输出)': ['(no output)', '（出力なし）', '(출력 없음)'],
  '流中断': ['Stream aborted', 'ストリーム中断', '스트림 중단됨'],
  '把此命令和输出发到输入框让 agy 分析': ['Send command & output to chat for agy analysis', 'このコマンドと出力を agy へ送って分析', '이 명령과 출력을 채팅창으로 보내 agy 분석 요청'],
  '实时预览': ['Live Preview', 'ライブプレビュー', '실시간 미리보기'],
  '在下方输入任意 CSS 即可': ['Type any CSS below for', '下に CSS を入力すると即座に', '아래에 CSS를 입력하면 즉시'],
  '；保存后写入本地': ['; click Save to write to', '。保存するとローカルの', '; 저장 시 로컬 파일에 기록되며'],
  '并支持外部编辑器热重载。': ['with external editor hot-reload.', 'へ書き出し、外部エディタからのホットリロードにも対応します。', '외부 편집기 핫 리로드를 지원합니다.'],
  '暖玫瑰强调色': ['Warm Rose Accent', 'ウォームローズ', '웜 로즈 강조색'],
  '宽屏阅读 (920px)': ['Wide Reading (920px)', 'ワイド表示 (920px)', '와이드 읽기 (920px)'],
  '大字号排版 (17.5px)': ['Large Type (17.5px)', '大きい文字 (17.5px)', '큰 글꼴 (17.5px)'],
  '清空覆盖': ['Clear CSS', 'リセット', '초기화'],
  'Ctrl+S 保存': ['Ctrl+S to save', 'Ctrl+S で保存', 'Ctrl+S 저장'],
  '保存到 custom.css': ['Save to custom.css', 'custom.css に保存', 'custom.css에 저장'],

  // Feature Views: Library
  '汇总你上传的图片、手绘草图、附件以及对话中生成的 HTML/SVG Artifact 与代码产物': [
    'All your uploaded images, sketches, files, HTML/SVG Artifacts, and generated code in one place.',
    'アップロードした画像・スケッチ・添付ファイル・HTML/SVG Artifact を一覧管理します。',
    '업로드한 이미지, 스케치, 첨부 파일 및 생성된 HTML/SVG Artifact와 코드 산출물을 모아봅니다.',
  ],
  '全部': ['All', 'すべて', '전체'],
  '图片': ['Images', '画像', '이미지'],
  '✦ 预览': ['✦ Preview', '✦ プレビュー', '✦ 미리보기'],
  '查看代码': ['View Code', 'コードを表示', '코드 보기'],
  '原对话': ['Source Chat', '元の会話', '원본 대화'],
  '附加到聊天': ['Attach to Chat', 'チャットに添付', '채팅에 첨부'],

  // Feature Views: Skills Hub
  'Skill 仓库': ['Skills Hub', 'Skill ハブ', 'Skill 저장소'],
  '统一管理个人与本机': ['Manage personal and local', '個人・ローカルの', '개인 및 로컬'],
  '技能：支持对话中输入': ['skills: type', 'スキルを一元管理：チャットで', '스킬을 통합 관리: 대화 중'],
  '随时点名、按触发词自动路由调度，以及绑定「已排定」定时执行': [
    'to invoke anytime, auto-route by trigger keywords, or bind to Scheduled tasks.',
    'で呼び出し、トリガー語で自動ルーティング、スケジュール実行にも対応します。',
    '입력으로 즉시 호출, 트리거 키워드 자동 라우팅 및 예약 작업 연동을 지원합니다.',
  ],
  '开启后发送消息时自动根据触发词匹配最合适的 Skill': [
    'Automatically match the best Skill from trigger keywords when sending messages',
    'オンにすると送信時のトリガー語から最適な Skill を自動選択します',
    '켜면 메시지 전송 시 트리거 키워드에 맞는 Skill을 자동으로 적용합니다',
  ],
  '导入 Skill': ['Import Skill', 'Skill をインポート', 'Skill 가져오기'],
  '新建 Skill': ['New Skill', '新規 Skill', '새 Skill'],
  '我的仓库': ['My Repo', 'マイ倉庫', '내 저장소'],
  '本机发现': ['Discovered', 'ローカル検出', '로컬 감지'],
  '已停用': ['Disabled', '無効', '비활성'],
  '搜索 Skill 名称、/slug 或触发词…': ['Search Skill name, /slug, or triggers…', 'Skill 名・/slug・トリガー語を検索…', 'Skill 이름, /slug 또는 트리거 검색…'],
  '调度试算': ['Route Tester', 'ルーティング試算', '라우팅 테스트'],
  '输入示例消息验证自动命中': ['Enter a sample message to test auto-matching', 'テスト文を入力して自動ヒットを確認', '예시 메시지를 입력해 자동 매칭 확인'],
  '测试路由': ['Test Route', 'テスト', '라우팅 테스트'],
  '正在加载 Skill 仓库…': ['Loading Skills repository…', 'Skill リポジトリを読み込み中…', 'Skill 저장소 불러오는 중…'],
  '当前筛选下暂无 Skill，可点击右上角「+ 新建 Skill」或「导入 Skill」添加。': [
    'No Skills match this filter. Click "+ New Skill" or "Import Skill" to add one.',
    '該当する Skill がありません。右上の「新規 Skill」または「インポート」から追加できます。',
    '현재 필터에 해당하는 Skill이 없습니다. 오른쪽 위 "새 Skill" 또는 "Skill 가져오기"로 추가하세요.',
  ],
  '没有匹配该关键词的 Skill。': ['No Skills match that keyword.', '一致する Skill がありません。', '해당 키워드와 일치하는 Skill이 없습니다.'],
  '尚未调度': ['Never used', '未使用', '사용 기록 없음'],
  '自动命中': ['Auto-Matched', '自動一致', '자동 매칭'],
  '斜杠点名': ['Slash Invoked', 'スラッシュ指定', '슬래시 호출'],
  '克隆编辑': ['Clone & Edit', '複製して編集', '복제 후 편집'],
  '同步 CLI': ['Sync CLI', 'CLI 同期', 'CLI 동기화'],
  '已同步 ✓': ['Synced ✓', '同期済み ✓', '동기화됨 ✓'],
  '取消挂载': ['Unmount', '解除', '해제'],
  '置顶此 Skill': ['Pin Skill', 'ピン留め', 'Skill 고정'],
  '（无描述）': ['(No description)', '（説明なし）', '(설명 없음)'],
  '通用技能': ['General', '汎用', '일반 스킬'],
  '工程开发': ['Engineering', '開発', '엔지니어링'],
  '开启后发送相关消息时由调度器自动匹配挂载': ['Auto-mount when message matches trigger keywords', '関連メッセージ送信時に自動マウント', '관련 메시지 전송 시 자동 매칭 적용'],
  '在「已排定」中绑定此 Skill 创建定时任务': ['Bind this Skill to a Scheduled task', 'スケジュールタスクにこの Skill を紐付け', '예약 작업에 이 Skill 연동'],
  '请填写 Skill 名称与指令正文': ['Please enter a Skill name and instructions', 'Skill 名と指示本文を入力してください', 'Skill 이름과 지시 본문을 입력하세요'],
  '请至少填写 GitHub 链接、本地路径或直接粘贴 SKILL.md 内容': [
    'Provide a GitHub URL, local path, or paste SKILL.md content',
    'GitHub リンク、ローカルパス、または SKILL.md の内容を入力してください',
    'GitHub 링크, 로컬 경로 또는 SKILL.md 내용을 하나 이상 입력하세요',
  ],
  '正在试算路由调度…': ['Testing skill dispatch…', 'ルーティングを試算中…', '라우팅 테스트 중…'],
  '未自动命中任何 Skill（仍可通过输入': ['No Skill auto-matched (you can still invoke via', '自動一致する Skill はありません（', '자동 매칭된 Skill이 없습니다 ('],
  '手动点名调度）。': ['explicitly).', 'で手動呼び出し可能です）。', '로 직접 호출 가능).'],

  // Feature Views: Scheduled Tasks
  '由本地后端守护线程按计划自动调用': ['Automatically runs', 'ローカルの常駐スレッドが予定通りに', '로컬 백엔드 데몬이 일정에 따라 자동으로'],
  'CLI 执行，结果自动保存为对话记录': ['CLI on schedule and saves results as conversations.', 'CLI を実行し、結果を会話履歴として自動保存します。', 'CLI를 실행하고 결과를 대화 기록으로 자동 저장합니다.'],
  '本地守护就绪': ['Daemon Ready', 'デーモン待機中', '로컬 데몬 준비됨'],
  '新建排定任务': ['New Scheduled Task', '新規スケジュールタスク', '새 예약 작업'],
  '到期自动发起对话': ['Auto-run on schedule', '予定時刻に自動実行', '예약 시간에 자동 실행'],
  '任务名称': ['Task Name', 'タスク名', '작업 이름'],
  '例如：每日 AI 科技早报 / 代码仓库健康巡检': ['e.g., Daily AI Tech Brief / Repo Health Check', '例：毎朝の AI ニュース要約 / リポジトリ巡回', '예: 매일 AI 기술 브리핑 / 저장소 상태 점검'],
  '触发频率': ['Frequency', '実行頻度', '실행 주기'],
  '每天定时': ['Daily', '毎日定時', '매일 정시'],
  '固定间隔': ['Interval', '一定間隔', '고정 간격'],
  '分钟': ['min', '分', '분'],
  '绑定 Skill': ['Bind Skill', 'Skill 連携', 'Skill 연동'],
  '可选 · 到点执行时自动加载该 Skill 指令': ['Optional · Auto-load this Skill on run', '任意・実行時にこの Skill 指示を自動適用', '선택 · 실행 시 해당 Skill 지침 자동 로드'],
  '不绑定特定 Skill（走默认或自动调度）': ['No bound Skill (default or auto-dispatch)', '特定の Skill を指定しない（既定 / 自動判定）', '특정 Skill 미지정 (기본 또는 자동 디스패치)'],
  '执行提示词（Prompt）': ['Prompt', '実行プロンプト (Prompt)', '실행 프롬프트 (Prompt)'],
  '输入到期时自动发送给 agy 的完整指令…': ['Enter the prompt automatically sent to agy when triggered…', '予定時刻に agy へ自動送信する指示を入力…', '예약 시간에 agy로 자동 전송할 프롬프트를 입력…'],
  '默认沿用当前模型、执行权限与工作区目录': ['Uses current model, permission mode & workspace', '現在のモデル・権限・ワークスペースを使用', '현재 모델, 실행 권한 및 워크스페이스 설정 사용'],
  '创建排定任务': ['Create Schedule', 'タスクを作成', '예약 작업 생성'],
  '查看结果': ['View Result', '結果を表示', '결과 보기'],
  '上次成功': ['Last Succeeded', '前回成功', '최근 성공'],
  '上次异常': ['Last Failed', '前回エラー', '최근 오류'],
  '等待触发': ['Pending', '待機中', '대기 중'],
  '运行中…': ['Running…', '実行中…', '실행 중…'],
  '已启用': ['Enabled', '有効', '활성화됨'],
  '已暂停': ['Paused', '一時停止', '일시 중지'],
  '启用': ['Enable', '有効化', '활성화'],
  '暂停': ['Pause', '一時停止', '일시 중지'],
  '排定任务': ['Scheduled Task', 'スケジュールタスク', '예약 작업'],

  // Feature Views: Study
  '学生 · 深度学习空间': ['Study · Deep Learning Space', '学習・ディープラーニング空間', '학습 · 심층 학습 공간'],
  '切换为启发式导师人格：不直接堆砌标准答案，通过提问、类比与互动测验帮你真正学懂': [
    'Switch to a guided tutor persona: build true intuition through questions, analogies, and interactive quizzes.',
    '対話型チューターモードに切り替え、質問・類推・クイズを通して本質から理解を深めます。',
    '소크라테스식 튜터 모드로 전환하여 질문, 비유, 인터랙티브 퀴즈를 통해 개념을 완전히 이해합니다.',
  ],
  '苏格拉底启发引导': ['Socratic Guidance', 'ソクラテス式ガイド', '소크라테스식 문답'],
  '通过循序渐进的追问引导你自己推导出结论，适合算法、数学与系统设计': [
    'Lead you step-by-step to derive conclusions yourself — great for algorithms, math & systems.',
    '段階的な問いかけで自ら結論を導き出します。アルゴリズム・数学・設計に最適。',
    '단계적 질문을 통해 스스로 결론을 도출하도록 이끕니다. 알고리즘, 수학, 시스템 설계에 적합합니다.',
  ],
  '概念精讲与直觉类比': ['Intuitive Explanations', '直感的な概念解説', '직관적 개념 강의'],
  '用日常类比和清晰阶梯拆解晦涩概念，结尾附带核心知识速记清单': [
    'Break down tough concepts with everyday analogies and a crisp cheat sheet at the end.',
    '身近な例えと段階的な解説で難解な概念を紐解き、要点まとめ付きで整理します。',
    '일상적인 비유와 명확한 단계로 어려운 개념을 풀고 핵심 요약 노트를 제공합니다.',
  ],
  '出题测验与逐题批改': ['Interactive Quiz & Grading', '演習クイズと採点', '인터랙티브 퀴즈 및 채점'],
  '按知识点生成由浅入深的练习题，等你作答后逐题点评错因与思路': [
    'Generate progressive practice questions and grade each answer with clear feedback.',
    '理解度に合わせた練習問題を出題し、回答後に1問ずつ丁寧に添削します。',
    '단계별 연습 문제를 생성하고 답변 후 오답 원인과 풀이를 꼼꼼히 피드백합니다.',
  ],
  '论文 / 教材章节精读': ['Paper & Textbook Deep Dive', '論文・教科書の精読', '논문 / 교재 심층 독해'],
  '提炼研究问题、核心推导、实验结论与方法局限，生成结构化笔记': [
    'Extract research questions, derivations, results & limitations into structured notes.',
    '研究課題・数式導出・実験結果・限界を構造化ノートとして整理します。',
    '연구 문제, 핵심 유도, 실험 결론 및 한계를 구조화된 노트로 정리합니다.',
  ],
  '开始一次学习对话': ['Start a Study Session', '学習セッションを開始', '학습 대화 시작'],
  '输入你想攻克的知识点、题目或论文主题，例如：帮我从直觉理解 Transformer 的注意力机制…': [
    'Enter a topic, problem, or paper you want to master (e.g., Explain Transformer attention intuitively)…',
    '学びたいテーマ・問題・論文を入力（例：Transformer の Attention を直感的に理解したい）…',
    '정복하고 싶은 개념, 문제 또는 논문 주제를 입력하세요 (예: Transformer 어텐션 직관적으로 이해하기)…',
  ],
  '启动后会自动激活对应的学习导师指令并进入对话页': [
    'Activates the selected tutor instruction and launches a chat session.',
    '開始すると選択した学習チューター指示が有効になりチャットへ移動します。',
    '시작 시 선택한 튜터 지침이 자동 활성화되며 대화 화면으로 이동합니다.',
  ],
  '开始学习': ['Start Studying', '学習を始める', '학습 시작'],
  '苏格拉底引导': ['Socratic Tutor', 'ソクラテス式', '소크라테스 튜터'],
  '概念精讲': ['Concept Guide', '概念解説', '개념 정강'],
  '互动测验': ['Quiz Mode', '演習クイズ', '인터랙티브 퀴즈'],
  '论文精读': ['Paper Review', '論文精読', '논문 정독'],

  // Feature Views: Customize
  '统一管理全局系统指令、外观与字体、实时 CSS 样式表，以及本机已加载的 Skills / Rules / Plugins': [
    'Manage global instructions, color schemes, typography, live Custom CSS, and discovered local extensions.',
    'グローバル指示・テーマ配色・フォント・ライブ CSS・ローカル拡張機能を一元管理します。',
    '전역 지침, 색상 테마, 글꼴, 실시간 Custom CSS 및 로컬 확장 기능을 한곳에서 관리합니다.',
  ],
  '全局个人偏好指令（Custom Instructions）': ['Global Custom Instructions', 'グローバル指示 (Custom Instructions)', '전역 사용자 지정 지침 (Custom Instructions)'],
  '保存后将自动注入每次': ['Automatically injected into every', '保存すると毎回', '저장 후 매번'],
  '对话中，用于固定回答语言、代码规范或角色风格。': ['chat for preferred language, coding style, or persona.', 'の会話に自動注入され、回答言語やコード規約を統一できます。', '대화에 자동 주입되어 답변 언어, 코드 스타일 또는 역할을 고정합니다.'],
  '例如：默认使用简洁中文回答；所有 Python 代码遵循类型注解；修改文件前先简述思路…': [
    'e.g., Reply concisely; use Python type annotations; outline plan before editing files…',
    '例：簡潔に日本語で回答；Python は型ヒントを使用；編集前に方針を説明…',
    '예: 간결하게 답변; 모든 Python 코드에 타입 힌트 적용; 수정 전 간단한 계획 설명…',
  ],
  '保存全局指令': ['Save Instructions', 'グローバル指示を保存', '전역 지침 저장'],
  '已保存并将在下次对话生效 ✓': ['Saved — takes effect on next chat ✓', '保存しました（次回会話から有効）✓', '저장됨 — 다음 대화부터 적용 ✓'],
  '主题配色与自由调色盘': ['Color Schemes & Freehand Palette', 'テーマ配色とカラーパレット', '색상 테마 및 자유 팔레트'],
  '恢复方案默认色': ['Reset Scheme Colors', '既定色に戻す', '테마 기본색 복원'],
  '恢复默认色': ['Reset Colors', '既定色に戻す', '기본색 복원'],
  '清除手动微调的颜色，恢复当前方案默认色': ['Clear custom color overrides and restore scheme defaults', 'カスタム配色を解除してスキーム既定色に戻す', '사용자 지정 색상을 지우고 테마 기본색 복원'],
  '主题强调色': ['Accent Color', 'アクセント色', '강조 색상'],
  '主画布背景': ['Canvas Background', 'メイン背景', '메인 배경색'],
  '侧边栏背景': ['Sidebar Background', 'サイドバー背景', '사이드바 배경색'],
  '用户气泡背景': ['User Bubble', 'ユーザー吹き出し', '사용자 말풍선'],
  '字体风格与样式表': ['Typography & Stylesheet', 'フォントとスタイルシート', '글꼴 및 스타일시트'],
  '打开 Custom CSS 实时工作台': ['Open Live Custom CSS Studio', 'Custom CSS スタジオを開く', 'Custom CSS 스튜디오 열기'],
  '打开 Custom CSS 工作台': ['Open Custom CSS Studio', 'Custom CSS スタジオを開く', 'Custom CSS 스튜디오 열기'],
  '全局排版字体（同步作用于品牌标题、问候语与正文）': ['Global Typography (applies to title, greetings & prose)', 'グローバルフォント（見出し・挨拶・本文に適用）', '전역 글꼴 (제목, 인사말 및 본문에 동시 적용)'],
  '本机 Antigravity 扩展概览': ['Local Antigravity Extensions', 'ローカル Antigravity 拡張機能', '로컬 Antigravity 확장 기능'],
  '正在扫描本机配置…': ['Scanning local config…', 'ローカル設定をスキャン中…', '로컬 설정 스캔 중…'],
  '已同步本地配置': ['Local Config Synced', 'ローカル設定同期済み', '로컬 설정 동기화됨'],

  // Feature Views: Video
  '视频 · 视听分析与动态演示': ['Video · Media Analysis & Motion', '動画・メディア分析とモーション', '비디오 · 미디어 분석 및 모션'],
  '上传本地视频/音频进行内容总结与字幕时间轴提取，或创作专业分镜脚本与可交互 HTML5 动画演示': [
    'Upload local video/audio for summaries & timestamps, or craft storyboards and interactive HTML5 motion demos.',
    '動画・音声をアップロードして要約やタイムラインを抽出、または絵コンテや HTML5 アニメーションを生成します。',
    '로컬 동영상/오디오를 업로드해 요약 및 타임라인을 추출하거나 스토리보드와 인터랙티브 HTML5 모션을 제작하세요.',
  ],
  '点击选择或拖拽视频 / 音频文件': ['Click or drag a video / audio file here', '動画 / 音声ファイルを選択またはドロップ', '비디오 / 오디오 파일을 선택하거나 끌어다 놓기'],
  '支持 MP4 / MOV / WebM / MP3 / WAV（≤ 25 MB），上传后将自动附加到新对话由 agy 分析': [
    'Supports MP4 / MOV / WebM / MP3 / WAV (≤ 25 MB), automatically attached to a new agy chat.',
    'MP4 / MOV / WebM / MP3 / WAV（≤ 25 MB）対応。アップロード後、新しい会話へ自動添付されます。',
    'MP4 / MOV / WebM / MP3 / WAV(≤ 25 MB) 지원. 업로드 후 새 대화에 자동 첨부됩니다.',
  ],
  '交互式动画演示（Artifact 播放）': ['Interactive Motion Demo (Artifact)', 'インタラクティブ動画デモ (Artifact)', '인터랙티브 모션 데모 (Artifact)'],
  '让 agy 生成带播放/暂停与进度控制的单页 HTML/SVG 动画，直接在右侧面板播放': [
    'Generate a playable HTML/SVG animation with transport controls right inside the Artifact pane.',
    '再生・一時停止やシークバー付きの HTML/SVG アニメーションを生成し、右ペインで再生します。',
    '재생/일시정지 및 진행 바가 포함된 HTML/SVG 애니메이션을 생성해 오른쪽 패널에서 바로 재생합니다.',
  ],
  '短视频 / 产品宣传分镜脚本': ['Short Video / Promo Storyboard', 'ショート動画・PR 絵コンテ', '숏폼 / 제품 홍보 스토리보드'],
  '生成分镜头景别、画面描述、旁白口播与节奏时长表': [
    'Create shot-by-shot framing, visuals, voiceover script, and pacing timeline.',
    'カット割り・映像描写・ナレーション・尺構成表を自動作成します。',
    '샷 구성, 화면 묘사, 내레이션 대본 및 타임라인을 생성합니다.',
  ],
  '视频要点与时间轴纪要': ['Video Summary & Timestamps', '動画要約とタイムライン', '비디오 핵심 요약 및 타임라인'],
  '结合上传的视频/音频或网页视频链接提炼结构化笔记与关键时间点': [
    'Extract structured takeaways and key timestamps from uploaded media or links.',
    'アップロードした動画・音声や URL から要点と重要タイムスタンプを抽出します。',
    '업로드한 영상/오디오 또는 링크에서 구조화된 노트와 주요 타임스탬프를 추출합니다.',
  ],
  '输入视频创作或分析需求': ['Describe your video or analysis request', '動画制作や分析のリクエストを入力', '비디오 제작 또는 분석 요청 입력'],
  '例如：制作一个 15 秒的产品介绍交互动画展示 Antigravity Studio 的工作流，或总结我刚刚上传的演示视频…': [
    'e.g., Create a 15s interactive product walkthrough animation, or summarize my uploaded demo video…',
    '例：Antigravity Studio のワークフローを紹介する 15 秒アニメを作成、または添付動画を要約…',
    '예: 15초 제품 소개 인터랙티브 애니메이션 제작, 또는 업로드한 데모 영상 요약…',
  ],
  '开始生成 / 分析': ['Generate / Analyze', '生成・分析を開始', '생성 / 분석 시작'],
  '视频脚本': ['Video Script', '動画台本', '비디오 대본'],
  '视频分析': ['Video Analysis', '動画分析', '비디오 분석'],
  '动画演示': ['Motion Demo', 'モーションデモ', '모션 데모'],

  // Settings Modal (All 7 Tabs)
  '通用': ['General', '一般', '일반'],
  '外观': ['Appearance', '外観', '외관'],
  '快捷键': ['Shortcuts', 'ショートカット', '단축키'],
  '通知': ['Notifications', '通知', '알림'],
  '模型': ['Models', 'モデル', '모델'],
  '点击编辑头像与资料': ['Click to edit profile & avatar', 'プロフィールとアバターを編集', '프로필 및 아바타 편집'],
  '关闭设置 (Esc)': ['Close Settings (Esc)', '設定を閉じる (Esc)', '설정 닫기 (Esc)'],
  '配置界面布局、Agent 执行权限与输入框行为。': [
    'Configure interface language, layout, Agent permissions, and composer behavior.',
    '表示言語・レイアウト・Agent 実行権限・入力欄の動作を設定します。',
    '인터페이스 언어, 레이아웃, Agent 실행 권한 및 입력창 동작을 설정합니다.',
  ],
  '界面语言': ['Interface Language', '表示言語', '인터페이스 언어'],
  '显示语言': ['Display Language', 'UI 言語', '표시 언어'],
  '实时切换工作台界面语言，不影响对话内容与代码文件。': [
    'Switch UI language instantly without altering your chats or workspace files.',
    'チャット内容やコードに影響せず、UI の表示言語を即座に切り替えます。',
    '대화 내용이나 코드 파일에 영향을 주지 않고 UI 언어를 즉시 전환합니다.',
  ],
  '界面布局': ['Workspace Layout', 'インターフェースレイアウト', '인터페이스 레이아웃'],
  '知识工作': ['Knowledge Work', 'ナレッジワーク', '지식 작업'],
  '精简界面，隐藏项目目录与开发控件，专注研究、写作与日常对话。': [
    'Streamlined view hiding dev controls & project directories for research, writing, and chat.',
    '開発ツールを隠したシンプル構成で、調査・執筆・会話に集中できます。',
    '개발 도구를 숨긴 간결한 화면으로 리서치, 글쓰기 및 일상 대화에 집중합니다.',
  ],
  '软件工程': ['Software Engineering', 'ソフトウェア開発', '소프트웨어 엔지니어링'],
  '完整界面，展示项目工作区、权限模式切换与完整编码辅助工具。': [
    'Full workbench with project folders, permission modes, and developer tools.',
    'プロジェクト・実行権限切替・開発補助ツールをすべて表示します。',
    '프로젝트 워크스페이스, 권한 모드 및 전체 개발 도구를 표시합니다.',
  ],
  '权限与 CLI 引擎': ['Permissions & CLI Engine', '権限と CLI エンジン', '권한 및 CLI 엔진'],
  '控制本地 AI CLI 引擎与当前计算机上可执行的操作权限。': [
    'Choose your local AI CLI engine and control what actions it may perform.',
    'ローカル AI CLI エンジンと実行可能な操作権限を管理します。',
    '로컬 AI CLI 엔진과 이 컴퓨터에서 허용할 작업 권한을 제어합니다.',
  ],
  '驱动引擎 (CLI Adapter)': ['CLI Engine Adapter', 'CLI エンジンアダプター', 'CLI 엔진 어댑터'],
  '默认使用 Antigravity CLI (`agy`)，已安装其他 CLI 时可按需切换。': [
    'Defaults to Antigravity CLI (`agy`). Switch anytime if other CLIs are installed.',
    '既定は Antigravity CLI (`agy`)。他の CLI を導入済みなら切り替え可能です。',
    '기본값은 Antigravity CLI (`agy`)이며, 다른 CLI가 설치된 경우 전환할 수 있습니다.',
  ],
  '默认执行模式': ['Default Permission Mode', '既定の実行モード', '기본 실행 모드'],
  '控制文件编辑与命令运行是否需要确认。': [
    'Control whether file edits and terminal commands require approval.',
    'ファイル編集やコマンド実行時に確認を求めるかを設定します。',
    '파일 편집과 명령 실행 시 승인 확인 여부를 제어합니다.',
  ],
  '高级 CLI 参数 ›': ['Advanced CLI Options ›', '高度な CLI 設定 ›', '고급 CLI 옵션 ›'],
  'agy 可执行文件路径（留空自动探测）': ['agy Executable Path (blank = auto-detect)', 'agy 実行ファイルパス（空欄で自動検出）', 'agy 실행 파일 경로 (비워두면 자동 감지)'],
  '留空自动使用已探测的 agy.exe': ['Leave blank to auto-detect agy.exe', '空欄で検出済みの agy.exe を使用', '비워두면 감지된 agy.exe 자동 사용'],
  '当前尚未在 PATH 中找到 agy 可执行文件': ['agy executable not found in PATH yet', 'PATH 内に agy 実行ファイルが見つかりません', 'PATH에서 agy 실행 파일을 찾지 못했습니다'],
  '附加 CLI 启动参数（可选）': ['Extra CLI Flags (optional)', '追加 CLI 引数（任意）', '추가 CLI 실행 플래그 (선택)'],
  '例如：--add-dir D:\\Docs': ['e.g., --add-dir D:\\Docs', '例：--add-dir D:\\Docs', '예: --add-dir D:\\Docs'],
  '保存 CLI 参数': ['Save CLI Options', 'CLI 設定を保存', 'CLI 옵션 저장'],
  '输入框': ['Composer', '入力欄', '입력창'],
  '生成中发送消息': ['Follow-up While Streaming', '生成中の追加送信', '생성 중 메시지 전송'],
  '在 AI 回复尚未结束时提交追问的处理方式。': [
    'How to handle a follow-up submitted while a reply is still streaming.',
    'AI の応答生成中に追加メッセージを送った際の挙動を設定します。',
    'AI 응답이 생성 중일 때 후속 메시지를 보내는 방식을 선택합니다.',
  ],
  '队列等待': ['Queue Until Done', '完了まで待機', '대기열에 추가'],
  '中断并立即发送': ['Interrupt & Send', '中断して即送信', '중단 후 즉시 전송'],
  '发送消息快捷键': ['Send Shortcut', '送信ショートカット', '전송 단축키'],
  '选择在聊天输入框中触发发送的按键。': [
    'Choose which key submits messages in the chat composer.',
    'チャット入力欄で送信をトリガーするキーを選択します。',
    '채팅 입력창에서 메시지를 전송할 키를 선택합니다.',
  ],
  '自定义亮/暗主题、排版字体风格、配色方案与对话阅读宽度。': [
    'Customize light/dark mode, typography, color schemes, and reading width.',
    'ライト/ダークモード・フォント・配色スキーム・表示幅をカスタマイズします。',
    '라이트/다크 테마, 글꼴, 색상 테마 및 대화 읽기 너비를 설정합니다.',
  ],
  '主题模式': ['Theme Mode', 'テーマモード', '테마 모드'],
  '在浅色与深色界面间切换（所有配色方案均支持双模式）。': [
    'Switch between light and dark modes (supported by every color scheme).',
    'ライトとダークを切り替え（すべての配色スキームが両対応）。',
    '라이트 및 다크 모드 전환 (모든 색상 테마에서 양방향 지원).',
  ],
  '浅色': ['Light', 'ライト', '라이트'],
  '深色': ['Dark', 'ダーク', '다크'],
  '主题配色方案': ['Color Schemes', 'カラーテーマ', '색상 테마'],
  '快捷微调色盘': ['Quick Palette Tweaks', 'クイック配色微調整', '빠른 색상 미세 조정'],
  '前往自定义页': ['Open Customize', 'カスタマイズへ', '사용자 지정으로'],
  '对话阅读宽度': ['Conversation Width', '会話の表示幅', '대화 읽기 너비'],
  '调整聊天流与输入框的最大列宽。': [
    'Adjust max column width for chat messages and composer.',
    'チャット欄と入力ボックスの最大幅を調整します。',
    '채팅 메시지와 입력창의 최대 열 너비를 조정합니다.',
  ],
  '紧凑': ['Compact', 'コンパクト', '좁게'],
  '标准': ['Standard', '標準', '표준'],
  '宽屏': ['Wide', 'ワイド', '넓게'],
  '字体风格（同步应用于标题、问候语与正文）': ['Typography Style (titles, greetings & prose)', 'フォントスタイル（見出し・挨拶・本文に適用）', '글꼴 스타일 (제목, 인사말 및 본문 적용)'],
  '全局与桌面窗口快捷键一览。': ['Global and desktop window keyboard shortcuts.', 'グローバルおよびデスクトップウィンドウのショートカット一覧。', '전역 및 데스크톱 창 단축키 목록입니다.'],
  '发送消息 / 输入框换行': ['Send Message / New Line', '送信 / 改行', '메시지 전송 / 줄 바꿈'],
  '打开设置 / 快捷键一览': ['Open Settings / Shortcuts', '設定 / ショートカット一覧', '설정 / 단축키 안내 열기'],
  '收起 / 展开左侧边栏': ['Toggle Left Sidebar', '左サイドバーを開閉', '왼쪽 사이드바 열기/닫기'],
  '收起 / 展开右侧多标签栏': ['Toggle Right Workspace', '右ワークスペースを開閉', '오른쪽 워크스페이스 열기/닫기'],
  '关闭当前右侧标签页': ['Close Active Right Tab', '右ペインの現在のタブを閉じる', '오른쪽 활성 탭 닫기'],
  '界面放大 / 缩小 / 重置': ['Zoom In / Out / Reset', '拡大 / 縮小 / リセット', '화면 확대 / 축소 / 초기화'],
  '全屏切换 / 退出应用': ['Fullscreen / Quit App', '全画面切替 / アプリ終了', '전체 화면 / 앱 종료'],
  '当长任务完成时向你发送桌面提醒或提示音。': [
    'Get a desktop alert or chime when a long task completes.',
    '長時間のタスク完了時にデスクトップ通知や効果音でお知らせします。',
    '긴 작업이 완료되면 데스크톱 알림이나 완료음을 보냅니다.',
  ],
  '任务完成桌面通知': ['Desktop Notifications', 'デスクトップ通知', '작업 완료 데스크톱 알림'],
  '当页面处于后台且': ['Pop a system notification when the window is in the background and', 'ウィンドウが背面にある際、', '창이 백그라운드에 있고'],
  '回复完成时弹出系统通知。': ['finishes replying.', 'の応答が完了したらシステム通知を表示します。', '답변이 완료되면 시스템 알림을 표시합니다.'],
  '完成提示音': ['Completion Chime', '完了サウンド', '완료 알림음'],
  '回复结束时播放一声柔和提示音。': ['Play a soft chime when a reply completes.', '応答完了時にやさしい通知音を鳴らします。', '답변이 끝나면 부드러운 알림음을 재생합니다.'],
  '查看当前账号下': ['Inspect available model families for your', '現在のアカウントで利用可能な', '현재 계정에서 사용 가능한'],
  'CLI 可用的模型家族，或附加自定义模型标识。': ['CLI account, or pin a custom model slug.', 'CLI モデル一覧を確認、またはカスタム識別子を追加します。', 'CLI 모델 목록을 확인하거나 사용자 지정 모델 ID를 추가합니다.'],
  '当前使用中': ['Active', '使用中', '사용 중'],
  '选用': ['Use', '選択', '선택'],
  '自定义模型标识（可选）': ['Custom Model Slug (optional)', 'カスタムモデル識別子（任意）', '사용자 지정 모델 ID (선택)'],
  '例如：gemini-4-neon-xhigh': ['e.g., gemini-4-neon-xhigh', '例：gemini-4-neon-xhigh', '예: gemini-4-neon-xhigh'],
  '添加并选用': ['Add & Use', '追加して選択', '추가 후 선택'],

  // GitHub Integration & Modals
  'GitHub 集成': ['GitHub Integration', 'GitHub 連携', 'GitHub 연동'],
  '支持在软件内直接克隆仓库、一键提交与推送、浏览和创建 PR / Issue，并交由': [
    'Clone repos, commit & push, browse or create PRs & Issues, and let',
    'アプリ内でリポジトリのクローン、コミット＆プッシュ、PR / Issue の閲覧・作成を行い、',
    '앱 내에서 저장소 클론, 커밋/푸시, PR 및 Issue 탐색/생성을 지원하며',
  ],
  '自动写 Commit 与深度审查 PR。': [
    'auto-write commits and deeply review PRs.',
    'がコミット作成や PR レビューを自動支援します。',
    '가 커밋 작성과 PR 리뷰를 자동으로 돕습니다.',
  ],
  '尚未连接 GitHub 账号': ['GitHub Account Not Connected', 'GitHub アカウント未接続', 'GitHub 계정 미연결'],
  '点击右侧按钮即可通过浏览器一键授权登录，免手动创建 Token。': [
    'Sign in via browser with one click — no manual token needed.',
    '右のボタンからブラウザでワンクリック認証できます（手動 Token 不要）。',
    '오른쪽 버튼으로 브라우저에서 원클릭 로그인하세요 (수동 토큰 불필요).',
  ],
  '浏览器一键登录': ['Sign in with Browser', 'ブラウザでログイン', '브라우저 원클릭 로그인'],
  '断开连接': ['Disconnect', '接続解除', '연결 해제'],
  '浏览器授权进行中': ['Browser Authorization in Progress', 'ブラウザ認証を実行中', '브라우저 인증 진행 중'],
  '复制验证码': ['Copy Code', 'コードをコピー', '인증 코드 복사'],
  '打开授权页 ↗': ['Open Auth Page ↗', '認証ページを開く ↗', '인증 페이지 열기 ↗'],
  '取消': ['Cancel', 'キャンセル', '취소'],
  '验证码已自动复制：请在打开的 GitHub 页面粘贴 8 位验证码并点击 Authorize，授权后将自动完成登录…': [
    'Code copied automatically: paste the 8-digit code on GitHub and click Authorize to finish sign-in…',
    'コードを自動コピーしました：開いた GitHub ページに 8 桁のコードを貼り付けて Authorize を押してください…',
    '인증 코드가 자동 복사되었습니다. 열린 GitHub 페이지에 8자리 코드를 붙여넣고 Authorize를 누르세요…',
  ],
  '高级：自定义 OAuth Client ID 或手动粘贴 Token（可选） ›': [
    'Advanced: Custom OAuth Client ID or Manual PAT (optional) ›',
    '詳細：カスタム OAuth Client ID または手動 Token（任意）›',
    '고급: 사용자 지정 OAuth Client ID 또는 수동 토큰 (선택) ›',
  ],
  '自定义 OAuth App Client ID（留空使用内置默认应用）': [
    'Custom OAuth App Client ID (blank = built-in app)',
    'カスタム OAuth App Client ID（空欄で内蔵既定アプリ）',
    '사용자 지정 OAuth App Client ID (비워두면 내장 앱 사용)',
  ],
  '留空即自动使用内置 Antigravity Studio OAuth App': [
    'Leave blank to use the built-in Antigravity Studio OAuth App',
    '空欄で内蔵の Antigravity Studio OAuth App を自動使用',
    '비워두면 내장 Antigravity Studio OAuth App 자동 사용',
  ],
  '自建 OAuth App ↗': ['Create OAuth App ↗', 'OAuth App を作成 ↗', 'OAuth App 만들기 ↗'],
  '手动 Personal Access Token (PAT)': ['Manual Personal Access Token (PAT)', '手動 Personal Access Token (PAT)', '수동 Personal Access Token (PAT)'],
  '去 GitHub 生成 Token ↗': ['Create Token on GitHub ↗', 'GitHub で Token を作成 ↗', 'GitHub에서 토큰 생성 ↗'],
  '粘贴 ghp_... 或 github_pat_...（仅保存在本机 data/settings.json）': [
    'Paste ghp_… or github_pat_… (stored locally in data/settings.json only)',
    'ghp_… または github_pat_… を貼り付け（ローカルのみに保存）',
    'ghp_… 또는 github_pat_… 붙여넣기 (로컬 data/settings.json에만 저장)',
  ],
  '验证 Token': ['Verify Token', 'Token を検証', '토큰 검증'],
  '验证并连接': ['Verify & Connect', '検証して接続', '검증 및 연결'],
  '验证中…': ['Verifying…', '検証中…', '검증 중…'],
  '本地 Git 提交身份（未配置全局 .gitconfig 时自动生效）': [
    'Local Git Commit Identity (used if global .gitconfig is unset)',
    'ローカル Git コミット名義（グローバル .gitconfig 未設定時に適用）',
    '로컬 Git 커밋 신원 (전역 .gitconfig 미설정 시 자동 적용)',
  ],
  '例如：you@users.noreply.github.com': ['e.g., you@users.noreply.github.com', '例：you@users.noreply.github.com', '예: you@users.noreply.github.com'],
  '保存提交身份': ['Save Identity', '名義を保存', '커밋 신원 저장'],
  '提交身份已保存 ✓': ['Identity saved ✓', 'コミット名義を保存しました ✓', '커밋 신원 저장됨 ✓'],
  '暂无已固定项目': ['No pinned projects yet', 'ピン留めプロジェクトなし', '고정된 프로젝트 없음'],
  '在项目中开始聊天': ['Start Chat in Project', 'このプロジェクトでチャット開始', '이 프로젝트에서 채팅 시작'],
  '立即在该项目目录下发起新聊天。': ['Open a new chat rooted in this project folder.', 'このプロジェクトフォルダーで新しい会話を開始します。', '이 프로젝트 폴더를 기준으로 새 채팅을 시작합니다.'],
  '打开项目': ['Open Project', 'プロジェクトを開く', '프로젝트 열기'],
  '从常用项目中移除': ['Unpin from Projects', 'プロジェクト一覧から外す', '고정 프로젝트에서 제거'],
  '仅移出侧边栏列表，不会删除本地磁盘文件。': ['Only removes from sidebar — local files stay untouched.', 'サイドバーから外すだけで、ローカルファイルは削除されません。', '사이드바 목록에서만 제거되며 로컬 파일은 삭제되지 않습니다.'],
  '移除项目': ['Remove Project', '一覧から外す', '프로젝트 제거'],

  // Profile Settings
  '个人资料与头像': ['Profile & Avatar', 'プロフィールとアバター', '프로필 및 아바타'],
  '自定义左下角显示的头像、名称与副标题。': ['Customize your display name, subtitle, and avatar.', '左下に表示されるアバター・名前・サブタイトルを編集します。', '왼쪽 하단에 표시되는 아바타, 이름 및 부제를 설정합니다.'],
  '上传本地头像': ['Upload Local Avatar', 'ローカル画像をアップロード', '로컬 아바타 업로드'],
  '恢复默认': ['Reset Default', '既定に戻す', '기본값 복원'],
  '显示名称': ['Display Name', '表示名', '표시 이름'],
  '例如：Your Name': ['e.g., Your Name', '例：Your Name', '예: Your Name'],
  '副标题 / 邮箱（可选）': ['Subtitle / Email (optional)', 'サブタイトル / メール（任意）', '부제 / 이메일 (선택)'],
  '例如：yourname@gmail.com': ['e.g., yourname@gmail.com', '例：yourname@gmail.com', '예: yourname@gmail.com'],
  '或直接粘贴 Google 头像链接 (https://lh3.googleusercontent.com/...)': [
    'Or paste an avatar URL (https://lh3.googleusercontent.com/…)',
    'またはアバター画像 URL を貼り付け (https://lh3.googleusercontent.com/…)',
    '또는 아바타 이미지 링크 붙여넣기 (https://lh3.googleusercontent.com/…)',
  ],
  '在 Gmail / Google 账号右上角右键头像 →「复制图片地址」粘贴到上方即可同步 Google 头像。': [
    'Right-click your Google avatar → "Copy image address" and paste above to sync it.',
    'Google アカウントのアバターを右クリック →「画像アドレスをコピー」して貼り付けると同期できます。',
    'Google 계정 아바타를 우클릭 → "이미지 주소 복사" 후 위에 붙여넣으면 동기화됩니다.',
  ],
  '保存资料': ['Save Profile', 'プロフィールを保存', '프로필 저장'],
  '资料已保存 ✓': ['Profile saved ✓', 'プロフィールを保存しました ✓', '프로필 저장됨 ✓'],
  '已上传并生效 ✓': ['Uploaded & applied ✓', 'アップロード完了 ✓', '업로드 및 적용됨 ✓'],
  '(已保存本地图片)': ['(Local image saved)', '（ローカル画像保存済み）', '(로컬 이미지 저장됨)'],
  '处理中…': ['Processing…', '処理中…', '처리 중…'],

  // Modals: Folder Browser, File Picker, Sketchpad, Skill Editor/Import, GitHub Clone, Checkpoints
  '选择工作区文件夹': ['Select Workspace Folder', 'ワークスペースフォルダーを選択', '워크스페이스 폴더 선택'],
  '添加项目文件夹': ['Add Project Folder', 'プロジェクトフォルダーを追加', '프로젝트 폴더 추가'],
  '系统文件夹弹窗': ['System Folder Picker', 'システム選択ダイアログ', '시스템 폴더 선택 창'],
  '打开 Windows 系统文件夹选择窗口': ['Open native OS folder picker', 'OS 標準のフォルダー選択ダイアログを開く', 'Windows 기본 폴더 선택 창 열기'],
  '上一级目录': ['Parent Folder', '上の階層へ', '상위 폴더'],
  '输入目录路径后按 Enter 跳转…': ['Enter directory path and press Enter…', 'ディレクトリパスを入力して Enter…', '디렉터리 경로 입력 후 Enter…'],
  '刷新当前目录': ['Refresh Current Folder', '現在のフォルダーを更新', '현재 폴더 새로고침'],
  '刷新目录': ['Refresh Folder', 'フォルダーを更新', '폴더 새로고침'],
  '在当前目录新建文件夹': ['New Folder Here', 'ここに新規フォルダーを作成', '현재 위치에 새 폴더 만들기'],
  '输入新文件夹名称…': ['Enter new folder name…', '新しいフォルダー名を入力…', '새 폴더 이름 입력…'],
  '输入新文件夹名称（如 my-project）…': ['Enter new folder name (e.g. my-project)…', '新しいフォルダー名（例: my-project）…', '새 폴더 이름 입력 (예: my-project)…'],
  '输入新的文件夹名称…': ['Enter new folder name…', '新しいフォルダー名を入力…', '새 폴더 이름 입력…'],
  '创建': ['Create', '作成', '생성'],
  '确定': ['Confirm', '確定', '확인'],
  '完成': ['Done', '完了', '완료'],
  '切换为当前工作区': ['Set as Workspace', '作業フォルダーに設定', '현재 워크스페이스로 설정'],
  '添加为项目并使用': ['Pin Project & Open', 'プロジェクトに追加して使用', '프로젝트로 추가 후 사용'],
  '选择当前目录': ['Use Current Folder', 'このフォルダーを選択', '현재 폴더 선택'],
  '选择此文件夹': ['Select Folder', 'このフォルダーを選択', '이 폴더 선택'],
  '添加此文件夹为项目': ['Pin as Project', 'プロジェクトに追加', '프로젝트로 추가'],
  '进入文件夹': ['Open Folder', 'フォルダーを開く', '폴더 열기'],
  '在此新建子文件夹…': ['New Subfolder Here…', 'ここにサブフォルダー作成…', '여기에 새 하위 폴더…'],
  '在此项目新建聊天': ['New Chat in Project', 'このプロジェクトで新規チャット', '이 프로젝트에서 새 채팅'],
  '在系统资源管理器中打开': ['Open in File Explorer', 'エクスプローラーで開く', '파일 탐색기에서 열기'],
  '此目录下没有子文件夹（可点击上方「新建文件夹」或右键新建）': [
    'No subfolders here (click "New Folder" above or right-click to create one)',
    'サブフォルダーはありません（上の「新規フォルダー」または右クリックで作成可能）',
    '하위 폴더가 없습니다 (위 "새 폴더" 또는 우클릭으로 생성 가능)',
  ],
  '引用当前工作区文件': ['Mention Workspace File', 'ワークスペースファイルを参照', '워크스페이스 파일 참조'],
  '搜索文件名或相对路径…': ['Search filename or relative path…', 'ファイル名または相対パスを検索…', '파일 이름 또는 상대 경로 검색…'],
  '未找到匹配的工作区文件': ['No matching workspace files found', '一致するファイルがありません', '일치하는 워크스페이스 파일이 없습니다'],
  '绘图草图板': ['Interactive Sketchpad', 'インタラクティブスケッチパッド', '인터랙티브 스케치패드'],
  '墨黑': ['Ink Black', 'ブラック', '잉크 블랙'],
  '赤陶橙': ['Terracotta', 'テラコッタ', '테라코타'],
  '钴蓝': ['Cobalt Blue', 'コバルトブルー', '코발트 블루'],
  '森绿': ['Forest Green', 'フォレストグリーン', '포레스트 그린'],
  '琥珀': ['Amber', 'アンバー', '앰버'],
  '橡皮擦': ['Eraser', '消しゴム', '지우개'],
  '橡皮': ['Erase', '消す', '지우개'],
  '细': ['S', '細', '가늘게'],
  '中': ['M', '中', '보통'],
  '粗': ['L', '太', '굵게'],
  '清空画布': ['Clear Canvas', 'キャンバスをクリア', '캔버스 지우기'],
  '附加到对话': ['Attach to Chat', 'チャットに添付', '대화에 첨부'],
  'Skill 名称 *': ['Skill Name *', 'Skill 名 *', 'Skill 이름 *'],
  '例如：算法面试导师 / SQL 调优专家': ['e.g., Algorithm Tutor / SQL Optimizer', '例：アルゴリズム講師 / SQL チューニング', '예: 알고리즘 튜터 / SQL 최적화 전문가'],
  '调用标识 (/slug，留空自动生成)': ['Slug (/slug, auto-generated if blank)', '呼び出し識別子 (/slug・空欄で自動生成)', '호출 식별자 (/slug, 비워두면 자동 생성)'],
  '例如：sql-optimizer': ['e.g., sql-optimizer', '例：sql-optimizer', '예: sql-optimizer'],
  '分类': ['Category', 'カテゴリ', '카테고리'],
  '工程开发 / 研究学习 / 效率写作 / 设计前端': ['Engineering / Research / Writing / Frontend', '開発 / 研究 / 執筆 / デザイン', '엔지니어링 / 리서치 / 글쓰기 / 프론트엔드'],
  '标签（逗号分隔）': ['Tags (comma-separated)', 'タグ（カンマ区切り）', '태그 (쉼표로 구분)'],
  '一句话简介': ['One-Line Summary', '一言説明', '한 줄 요약'],
  '说明该 Skill 擅长的场景，方便检索与调度': ['Describe when this Skill shines for search & routing', '得意な用途を記述（検索・自動ルーティングに使用）', '검색과 라우팅을 위해 이 Skill의 용도를 설명하세요'],
  '自动调度触发词（逗号分隔，用户输入命中时自动挂载）': ['Auto-Dispatch Triggers (comma-separated keywords)', '自動ルーティング用トリガー語（カンマ区切り）', '자동 디스패치 트리거 키워드 (쉼표로 구분)'],
  '例如：慢查询, sql 优化, 索引设计, explain': ['e.g., slow query, sql tuning, index, explain', '例：スロークエリ, sql 最適化, インデックス', '예: 슬로우 쿼리, sql 최적화, 인덱스, explain'],
  'Skill 指令正文 (Markdown) *': ['Skill Instructions (Markdown) *', 'Skill 指示本文 (Markdown) *', 'Skill 지시 본문 (Markdown) *'],
  '编写角色规范、工作步骤、输出模板与约束条件…': ['Write persona rules, workflow steps, output templates & constraints…', '役割・手順・出力テンプレート・制約を記述…', '역할 규범, 작업 단계, 출력 템플릿 및 제약 조건 작성…'],
  '启用此 Skill': ['Enable this Skill', 'この Skill を有効化', '이 Skill 활성화'],
  '允许自动调度': ['Allow Auto-Dispatch', '自動ディスパッチを許可', '자동 디스패치 허용'],
  '置顶显示': ['Pin to Top', '先頭に固定', '상단에 고정'],
  '保存 Skill': ['Save Skill', 'Skill を保存', 'Skill 저장'],
  '导入 Skill 到仓库': ['Import Skill to Repository', 'Skill をリポジトリにインポート', '저장소로 Skill 가져오기'],
  '方式 1：GitHub': ['Option 1: GitHub', '方法 1：GitHub', '방법 1: GitHub'],
  '链接（支持普通 blob 或 raw URL）': ['URL (supports blob or raw URLs)', 'リンク（blob / raw URL 対応）', '링크 (일반 blob 또는 raw URL 지원)'],
  '方式 2：本机文件夹或': ['Option 2: Local folder or', '方法 2：ローカルフォルダーまたは', '방법 2: 로컬 폴더 또는'],
  '路径': ['path', 'パス', '경로'],
  '例如：D:\\my-skills\\paper-helper 或 ...\\SKILL.md': ['e.g., D:\\my-skills\\helper or …\\SKILL.md', '例：D:\\my-skills\\helper または …\\SKILL.md', '예: D:\\my-skills\\helper 또는 …\\SKILL.md'],
  '方式 3：直接粘贴': ['Option 3: Paste raw', '方法 3：直接貼り付け', '방법 3: 직접 붙여넣기'],
  '全文': ['content', '全文', '전체 내용'],
  '自定义 slug（可选，留空自动识别）': ['Custom slug (optional, auto-detected if blank)', 'カスタム slug（任意・空欄で自動判定）', '사용자 지정 slug (선택, 비워두면 자동 인식)'],
  '例如：my-imported-skill': ['e.g., my-imported-skill', '例：my-imported-skill', '예: my-imported-skill'],
  '解析并导入': ['Parse & Import', '解析してインポート', '분석 및 가져오기'],
  '导入中…': ['Importing…', 'インポート中…', '가져오는 중…'],
  '正在解析并入库…': ['Parsing & saving Skill…', '解析して登録中…', '분석 및 저장 중…'],
  '从 GitHub 克隆仓库': ['Clone GitHub Repository', 'GitHub リポジトリをクローン', 'GitHub 저장소 클론'],
  'GitHub 账号设置': ['GitHub Settings', 'GitHub 設定', 'GitHub 설정'],
  '搜索 GitHub 仓库或浏览我的仓库': ['Search GitHub or Browse My Repos', 'GitHub 検索またはマイリポジトリ', 'GitHub 저장소 검색 또는 내 저장소 탐색'],
  '输入关键词搜索公开仓库，或先连接账号查看私人仓库': ['Search public repos, or sign in to view private repos', 'キーワードで公開リポジトリを検索、または接続して非公開を表示', '키워드로 공개 저장소를 검색하거나 로그인해 비공개 저장소 보기'],
  '输入关键词搜索（如 antigravity / codex）或浏览已登录账号仓库…': ['Search keywords (e.g. antigravity / codex) or browse your repos…', 'キーワード検索（例: antigravity）またはアカウントのリポジトリを閲覧…', '키워드 검색 (예: antigravity / codex) 또는 내 저장소 탐색…'],
  '公开仓库无需登录也可浏览与克隆；浏览器授权登录后解锁私有仓库、推送与创建 PR。': [
    'Public repos can be browsed & cloned without login; sign in via browser for private repos, push & PRs.',
    '公開リポジトリはログイン不要でクローン可能。ブラウザ認証で非公開リポジトリ・プッシュ・PR に対応します。',
    '공개 저장소는 로그인 없이 탐색 및 클론 가능하며, 브라우저 인증 후 비공개 저장소, 푸시 및 PR을 사용할 수 있습니다.',
  ],
  '仓库地址或': ['Repository URL or', 'リポジトリ URL または', '저장소 주소 또는'],
  '例如：owner/repo 或 https://github.com/owner/repo.git': ['e.g., owner/repo or https://github.com/owner/repo.git', '例：owner/repo または https://github.com/owner/repo.git', '예: owner/repo 또는 https://github.com/owner/repo.git'],
  '本地保存位置（父目录）': ['Local Parent Directory', '保存先親フォルダー', '로컬 저장 위치 (상위 폴더)'],
  '默认保存在 scratch 目录': ['Defaults to scratch directory', '既定は scratch フォルダー', '기본값: scratch 디렉터리'],
  '克隆并打开': ['Clone & Open', 'クローンして開く', '클론 후 열기'],
  '克隆中…': ['Cloning…', 'クローン中…', '클론 중…'],
  '连接 GitHub': ['Connect GitHub', 'GitHub に接続', 'GitHub 연결'],
  '回滚工作区到检查点': ['Rollback Workspace to Checkpoint', 'チェックポイントへロールバック', '체크포인트로 워크스페이스 롤백'],
  '正在比对当前工作区文件变化…': ['Comparing workspace changes…', '現在の変更点を比較中…', '워크스페이스 파일 변경 비교 중…'],
  '当前工作区与该检查点完全一致，无需回滚任何文件。': ['Workspace already matches this checkpoint — nothing to rollback.', '現在のワークスペースはチェックポイントと一致しています。', '현재 워크스페이스가 이 체크포인트와 완전히 일치합니다.'],
  '将被恢复的修改文件': ['Modified Files to Restore', '復元される変更ファイル', '복원될 수정 파일'],
  '将被移除的新建文件': ['New Files to Remove', '削除される新規ファイル', '제거될 새 파일'],
  '将被重新还原的已删文件': ['Deleted Files to Re-create', '再復元される削除済みファイル', '다시 복구될 삭제 파일'],
  '恢复': ['Restore', '復元', '복원'],
  '还原': ['Re-create', '復旧', '복구'],
  '确认回滚': ['Confirm Rollback', 'ロールバックを実行', '롤백 확인'],
  '回滚中…': ['Rolling back…', 'ロールバック中…', '롤백 중…'],
  '正在备份当前状态并恢复文件…': ['Backing up current state & restoring files…', '現在状態をバックアップして復元中…', '현재 상태 백업 및 파일 복원 중…'],
  '关闭 (Esc)': ['Close (Esc)', '閉じる (Esc)', '닫기 (Esc)'],

  // Command Palette & Slash Menu
  '全局命令面板': ['Command Palette', 'コマンドパレット', '명령 팔레트'],
  '输入命令、项目、主题配色、字体、对话或 Skill…': [
    'Search commands, projects, themes, fonts, languages, chats, or Skills…',
    'コマンド・プロジェクト・配色・フォント・言語・会話・Skill を検索…',
    '명령, 프로젝트, 테마, 글꼴, 언어, 대화 또는 Skill 검색…',
  ],
  '选择 ·': ['Select ·', '選択 ·', '선택 ·'],
  '执行 ·': ['Run ·', '実行 ·', '실행 ·'],
  '随时唤起': ['open anytime', 'いつでも起動', '언제든 열기'],
  '未找到匹配的指令、项目、配色或对话': ['No matching commands, projects, themes, or chats', '一致するコマンド・項目が見つかりません', '일치하는 명령, 프로젝트, 테마 또는 대화가 없습니다'],
  '常用指令': ['Commands', 'よく使うコマンド', '자주 쓰는 명령'],
  '切换项目工作区': ['Switch Project', 'プロジェクト切替', '프로젝트 전환'],
  '跳转对话': ['Jump to Chat', '会話へ移動', '대화로 이동'],
  '主题配色': ['Color Schemes', 'カラーテーマ', '색상 테마'],
  '字体排版': ['Typography', 'フォント', '글꼴'],
  '挂载 Skill': ['Mount Skill', 'Skill をマウント', 'Skill 마운트'],
  '新建空白聊天': ['New Blank Chat', '新しい空白チャット', '새 빈 채팅'],
  '开启一条新的对话会话': ['Start a fresh conversation', '新しい会話セッションを開始', '새로운 대화 세션을 시작합니다'],
  '定位当前对话轮次目录': ['Open Turn Timeline Navigator', '会話タイムライン目次を開く', '현재 대화 타임라인 목차 열기'],
  '打开时间轴浮层，按时间戳与问题一键跳转到任意对话轮次': ['Jump to any turn in this conversation by timestamp', 'タイムスタンプと質問から任意のターンへジャンプ', '타임스탬프와 질문으로 원하는 대화 턴으로 즉시 이동'],
  '导出当前对话为 Markdown (.md)': ['Export Active Chat as Markdown (.md)', '現在の会話を Markdown (.md) で出力', '현재 대화를 Markdown (.md)으로 내보내기'],
  '打开工作区终端 (Terminal)': ['Open Workspace Terminal', 'ワークスペース端末を開く', '워크스페이스 터미널 열기'],
  '在右侧面板启动实时流式 SSE 终端': ['Launch live streaming PowerShell SSE terminal', '右ペインでリアルタイム SSE 端末を起動', '오른쪽 패널에서 실시간 스트리밍 SSE 터미널 실행'],
  '打开 Git 变更审查 (Review)': ['Open Git Review', 'Git 変更レビューを開く', 'Git 변경 리뷰 열기'],
  '查看工作区 Diff、暂存提交、GitHub PR 与 Issue': ['Inspect diffs, stage/commit, GitHub PRs & Issues', 'Diff 確認・コミット・GitHub PR / Issue を管理', 'Diff 확인, 커밋, GitHub PR 및 Issue 관리'],
  '打开 Git Worktree 分支隔离': ['Open Git Worktree Manager', 'Git Worktree 管理を開く', 'Git Worktree 브랜치 격리 열기'],
  '管理独立分支工作目录，多任务并行互不干扰': ['Manage isolated branch directories for parallel work', '独立ブランチ作業ディレクトリを並列管理', '독립 브랜치 작업 디렉터리로 병렬 작업 관리'],
  '打开右侧文件目录 (Explorer)': ['Open File Explorer', '右ファイルツリーを開く', '오른쪽 파일 탐색기 열기'],
  '浏览、新建、重命名与编辑工作区文件': ['Browse, create, rename & edit workspace files', 'ワークスペースのファイルを閲覧・作成・編集', '워크스페이스 파일 탐색, 생성, 이름 변경 및 편집'],
  '切换并排双文件分屏阅读': ['Toggle Side-by-Side Split View', '2ファイル並べて表示を切替', '나란히 두 파일 분할 보기 전환'],
  '在右侧同时对照阅读两个文件或 PDF/代码': ['Compare two files, code, or PDFs side-by-side', '2つのファイルや PDF・コードを並べて閲覧', '오른쪽에서 두 파일 또는 PDF/코드를 나란히 비교'],
  '切换为浅色主题 (Light)': ['Switch to Light Theme', 'ライトテーマに切り替え', '라이트 테마로 전환'],
  '切换为深色主题 (Dark)': ['Switch to Dark Theme', 'ダークテーマに切り替え', '다크 테마로 전환'],
  '立即切换全局浅色 / 深色外观模式': ['Instantly switch light / dark appearance', 'ライト / ダーク外観を即座に切り替え', '라이트 / 다크 테마를 즉시 전환'],
  '打开 Skill 仓库与智能调度器': ['Open Skills Hub & Auto-Dispatcher', 'Skill ハブと自動ディスパッチャを開く', 'Skill 저장소 및 자동 디스패처 열기'],
  '管理内置与本机自定义 Skills、触发词与自动路由测试': ['Manage Skills, trigger keywords & routing tests', 'Skill・トリガー語・自動ルーティングテストを管理', 'Skill, 트리거 키워드 및 자동 라우팅 테스트 관리'],
  '打开已排定任务 (Scheduled)': ['Open Scheduled Tasks', 'スケジュールタスクを開く', '예약 작업 열기'],
  '管理本地定时自动运行的 AI 任务与绑定 Skill': ['Manage scheduled local AI tasks & bound Skills', '定時実行タスクと連携 Skill を管理', '로컬 예약 AI 작업 및 연동 Skill 관리'],
  '进入学生 / 论文精读模式': ['Open Study / Paper Reading Mode', '学習・論文精読モードへ', '학습 / 논문 정독 모드 열기'],
  '苏格拉底引导、概念精讲、互动测验与论文精读': ['Socratic guidance, explanations, quizzes & paper reviews', 'ソクラテス式・概念解説・演習クイズ・論文精読', '소크라테스 문답, 개념 강의, 퀴즈 및 논문 정독'],
  '打开自定义与自由调色盘': ['Open Customize & Color Studio', 'カスタマイズ・カラーパレットを開く', '사용자 지정 및 색상 팔레트 열기'],
  '编辑全局偏好指令、配色、字体与本机扩展': ['Edit custom instructions, colors, fonts & extensions', 'グローバル指示・配色・フォント・拡張を編集', '전역 지침, 색상, 글꼴 및 로컬 확장 편집'],
  '打开 Custom CSS 实时工作台': ['Open Live Custom CSS Studio', 'Custom CSS ワークベンチを開く', 'Custom CSS 실시간 스튜디오 열기'],
  '实时编写并热重载自定义界面样式': ['Write and hot-reload custom stylesheet live', 'カスタムスタイルをリアルタイム編集＆適用', '실시간으로 사용자 정의 CSS 작성 및 핫 리로드'],
  '浏览你的 GitHub 仓库或粘贴 URL 一键克隆并打开项目': ['Browse your GitHub repos or paste URL to clone & open', 'GitHub リポジトリを検索または URL からクローン', 'GitHub 저장소 탐색 또는 URL로 원클릭 클론'],
  '浏览并切换本地工作区目录…': ['Browse & Switch Workspace Folder…', 'ローカル作業フォルダーを切り替え…', '로컬 워크스페이스 폴더 전환…'],
  '打开可视化目录选择器切换项目文件夹': ['Open visual folder browser to switch workspace', 'フォルダーブラウザーで作業ディレクトリを切替', '시각적 폴더 탐색기로 프로젝트 폴더 전환'],
  '打开偏好设置 (Settings)': ['Open Preferences (Settings)', '環境設定 (Settings) を開く', '환경설정 (Settings) 열기'],
  '配置 CLI 引擎、模型、头像资料、GitHub 授权与通知': ['Configure CLI engine, models, profile, GitHub & alerts', 'CLI エンジン・モデル・プロフィール・GitHub・通知を設定', 'CLI 엔진, 모델, 프로필, GitHub 및 알림 설정'],
  '查看各模型配额余量与重置倒计时': ['Check remaining model quota & reset countdown', '各モデルの残量とリセット時刻を確認', '모델별 남은 사용량 및 초기화 카운트다운 확인'],
  '立即清理旧检查点快照 (GC)': ['Run Checkpoint Garbage Collection (GC)', '古いチェックポイントを整理 (GC)', '오래된 체크포인트 스냅샷 정리 (GC)'],
  '回收超过保留上限的旧快照并清理孤儿 Blob 释放磁盘空间': ['Prune old checkpoints & orphan blobs to free disk space', '上限を超えたスナップショットと孤立オブジェクトを削除', '보관 한도를 초과한 스냅샷과 고아 객체를 정리해 공간 확보'],
  '展开 / 收起左侧边栏': ['Toggle Left Sidebar', '左サイドバーを開閉', '왼쪽 사이드바 열기/닫기'],
  '切换导航侧栏显示状态': ['Show or hide navigation sidebar', 'ナビゲーションサイドバーの表示を切り替え', '탐색 사이드바 표시 상태 전환'],
  '展开 / 收起右侧多标签工作区': ['Toggle Right Multi-Tab Pane', '右マルチタブパネルを開閉', '오른쪽 멀티탭 워크스페이스 열기/닫기'],
  '切换右侧文件/终端/审查多标签面板': ['Show or hide right files/terminal/review pane', 'ファイル・端末・レビューパネルの表示切替', '오른쪽 파일/터미널/리뷰 패널 전환'],
  '打开右侧 Git Review 面板，审查当前工作区代码变更': ['Open Git Review pane to inspect workspace code changes', '右の Git Review パネルを開き変更をレビュー', '오른쪽 Git Review 패널을 열어 변경 사항 검토'],
  '将执行权限切换为「先做规划」，先输出实现方案再改文件': ['Switch mode to Plan First before editing any files', '実行権限を「プラン優先」に切り替え', '실행 권한을 계획 우선 모드로 전환'],
  '将当前对话提炼为紧凑进展摘要，释放上下文窗口': ['Summarize conversation progress to free context window', '会話の進捗を簡潔に要約してコンテキストを解放', '현재 대화를 요약해 컨텍스트 창 확보'],
  '清空当前对话舞台，立即开启全新空白聊天': ['Clear current stage and start a fresh chat', '現在の会話をクリアして新しいチャットを開始', '현재 대화 화면을 비우고 새 채팅 시작'],
  '打开 Git Worktree 面板，管理多分支并行工作目录': ['Open Git Worktree pane to manage parallel branch dirs', 'Git Worktree パネルで複数ブランチを並列管理', 'Git Worktree 패널에서 다중 브랜치 작업 디렉터리 관리'],

  // Theme & Font Preset Names & Descriptions
  '羊皮纸 · 赤陶': ['Parchment · Terracotta', 'パーチメント・テラコッタ', '양피지 · 테라코타'],
  '经典暖白与赤陶橙': ['Classic warm ivory & terracotta', 'クラシックな温白とテラコッタ', '클래식 웜 화이트 & 테라코타'],
  '青瓷烟雨 · 苍青': ['Celadon Mist · Jade', '青磁ミスト・翡翠', '청자 안개 · 비취'],
  '清雅莫兰迪青釉色': ['Refined Morandi celadon glaze', '上品なモランディ青磁カラー', '우아한 모란디 청자 톤'],
  '海盐晴空 · 钴蓝': ['Sea Salt Sky · Cobalt', 'シーソルトスカイ・コバルト', '바다소금 하늘 · 코발트'],
  '清朗通透冰川蓝': ['Crisp airy glacier blue', '透明感のあるグレイシャーブルー', '맑고 투명한 글레이셔 블루'],
  '晚樱暮色 · 玫瑰': ['Dusk Sakura · Rose', '夕桜・ローズ', '저녁 벚꽃 · 로즈'],
  '温柔复古绯红调': ['Soft vintage crimson rose', 'やさしいレトロローズ調', '부드러운 빈티지 로즈 톤'],
  '森野松针 · 翡翠': ['Forest Pine · Emerald', 'フォレストパイン・エメラルド', '숲 솔잎 · 에메랄드'],
  '护眼淡雅草木绿': ['Calm botanical sage green', '目に優しいボタニカルグリーン', '눈이 편안한 보태니컬 그린'],
  '薰衣草雾 · 靛紫': ['Lavender Fog · Indigo', 'ラベンダーフォグ・インディゴ', '라벤더 안개 · 인디고'],
  '静谧杂志灰紫调': ['Quiet editorial muted violet', '落ち着いたエディトリアル紫灰', '차분한 에디토리얼 그레이 바이올렛'],
  '琥珀拿铁 · 暖金': ['Amber Latte · Gold', 'アンバーラテ・ゴールド', '앰버 라떼 · 웜 골드'],
  '柔和象牙与琥珀金': ['Warm ivory & golden amber', '柔らかなアイボリーと琥珀色', '부드러운 아이보리 & 앰버 골드'],
  '纯净极简 · 曜石': ['Pure Minimal · Obsidian', 'ピュアミニマル・オブシディアン', '퓨어 미니멀 · 옵시디언'],
  '清透无彩色黑白灰': ['Pure achromatic monochrome', '洗練された無彩色モノクロ', '깔끔한 무채색 모노크롬'],
  '杂志衬线': ['Editorial Serif', 'エディトリアル明朝', '에디토리얼 명조'],
  '现代无衬线': ['Modern Sans', 'モダンゴシック', '모던 산세리프'],
  '极客等宽': ['Developer Mono', '等幅コード', '개발자 모노'],
  '学术雅颂': ['Academic Serif', 'アカデミック明朝', '학술 세리프'],
  '几何极简': ['Geometric Sans', 'ジオメトリック', '지오메트릭 미니멀'],
  '书香楷韵': ['Literary Kai', '書香・楷書風', '서예 해서체'],
  '雅致仿宋': ['Classic Fangsong', 'クラシック宋朝', '우아한 방송체'],
  '轻盈圆体': ['Soft Rounded', 'やわらか丸ゴシック', '부드러운 둥근체'],
  '系统原生': ['System Native', 'システム標準', '시스템 기본'],
  '已开启智能自动调度 Skill': ['Skill auto-dispatch enabled', 'Skill 自動ディスパッチを有効化しました', 'Skill 자동 디스패치가 켜졌습니다'],
  '已关闭自动调度（仍可通过 /slug 手动调用）': ['Auto-dispatch paused (still available via /slug)', '自動ディスパッチをオフにしました（/slug で手動可）', '자동 디스패치 꺼짐 (/slug로 수동 호출 가능)'],
  '已开启全新对话': ['Started a new chat', '新しいチャットを開始しました', '새 대화를 시작했습니다'],
  '已切换为「先做规划 (Plan)」模式': ['Switched to Plan First mode', '「プラン優先」モードに切り替えました', '계획 우선 (Plan) 모드로 전환했습니다'],
  '已打开 Git Worktree 分支隔离面板': ['Opened Git Worktree panel', 'Git Worktree パネルを開きました', 'Git Worktree 패널을 열었습니다'],
  '已打开代码审查面板，按回车即可发起审查': ['Opened Code Review — press Enter to start', 'コードレビューを開きました（Enter で実行）', '코드 리뷰 패널을 열었습니다. Enter로 시작하세요'],
  '当前对话暂无历史消息可压缩': ['No conversation history to compact yet', '圧縮できる会話履歴がまだありません', '압축할 대화 기록이 아직 없습니다'],
  '已断开 GitHub 连接': ['Disconnected from GitHub', 'GitHub 接続を解除しました', 'GitHub 연결이 해제되었습니다'],
  '已取消浏览器授权': ['Browser authorization canceled', 'ブラウザ認証をキャンセルしました', '브라우저 인증이 취소되었습니다'],
  '已提交到本地仓库 ✓': ['Committed locally ✓', 'ローカルにコミットしました ✓', '로컬 저장소에 커밋됨 ✓'],
  '已提交并成功推送到远程 ✓': ['Committed & pushed to remote ✓', 'コミットしてリモートへプッシュしました ✓', '커밋 및 원격 푸시 완료 ✓'],
  '已推送到远程仓库 ✓': ['Pushed to remote ✓', 'リモートへプッシュしました ✓', '원격 저장소에 푸시됨 ✓'],
  '已拉取最新远程代码 ✓': ['Pulled latest remote changes ✓', '最新のリモート変更を取得しました ✓', '최신 원격 코드를 가져왔습니다 ✓'],
  '已由 agy 生成提交信息，可直接提交或微调 ✓': ['Commit message drafted by agy ✓', 'agy がコミット文を作成しました ✓', 'agy가 커밋 메시지를 작성했습니다 ✓'],
  '已按变更摘要生成提交信息 ✓': ['Commit message generated from diff summary ✓', '変更要約からコミット文を作成しました ✓', '변경 요약으로 커밋 메시지를 생성했습니다 ✓'],
  '已同步到全局 agy Skills 目录 ✓': ['Synced to global agy Skills directory ✓', 'グローバル agy Skills へ同期しました ✓', '전역 agy Skills 디렉터리에 동기화됨 ✓'],
  '已连接 GitHub 账号（点击管理设置）': ['GitHub Connected (click to manage)', 'GitHub 接続済み（クリックで管理）', 'GitHub 연결됨 (클릭하여 관리)'],
  '点击配置 GitHub Token': ['Click to configure GitHub', 'クリックして GitHub を設定', '클릭하여 GitHub 설정'],
  '网络请求失败': ['Network request failed', 'ネットワークエラー', '네트워크 요청 실패'],
  '操作失败': ['Operation failed', '操作に失敗しました', '작업 실패'],
  '连接异常': ['Connection Error', '接続エラー', '연결 오류'],
  '已添加 ✓': ['Added ✓', '追加しました ✓', '추가됨 ✓'],
  '已删除文件夹': ['Folder deleted', 'フォルダーを削除しました', '폴더가 삭제되었습니다'],
  '请先输入新分支或已有分支名': ['Enter a new or existing branch name first', 'ブランチ名を入力してください', '먼저 브랜치 이름을 입력하세요'],
  '共': ['Total', '合計', '총'],
  '个 Skill': ['Skills', '件の Skill', '개 Skill'],
  '仓库托管': ['In Repo', 'リポジトリ', '저장소 보관'],
  '自动调度就绪': ['Auto-Ready', '自動対応', '자동 준비'],
  '默认主力引擎 · 完整支持模型切换、配额查询、多模态与权限模式': [
    'Primary engine · Full support for models, quota, multimodal & permission modes',
    'メインエンジン・モデル切替、残量取得、マルチモーダル、権限モードに完全対応',
    '기본 주력 엔진 · 모델 전환, 사용량 조회, 멀티모달 및 권한 모드 완전 지원',
  ],
  '可选引擎 · 检测到本机 Claude Code CLI 后可直接驱动': [
    'Optional engine · Drives locally installed Claude Code CLI directly',
    '任意エンジン・ローカルの Claude Code CLI 検出後に利用可能',
    '선택 엔진 · 로컬 Claude Code CLI 감지 시 바로 실행 가능',
  ],
  '可选引擎 · 检测到本机 Codex CLI 后支持 JSONL 流式执行': [
    'Optional engine · Streams JSONL from locally installed Codex CLI',
    '任意エンジン・ローカルの Codex CLI で JSONL ストリーミング実行',
    '선택 엔진 · 로컬 Codex CLI 감지 시 JSONL 스트리밍 실행 지원',
  ],
  '可选引擎 · 检测到本机 Gemini CLI 后支持流式输出': [
    'Optional engine · Streams output from locally installed Gemini CLI',
    '任意エンジン・ローカルの Gemini CLI でストリーミング出力に対応',
    '선택 엔진 · 로컬 Gemini CLI 감지 시 스트리밍 출력 지원',
  ],
  '同步本机 agy 对话': ['Sync Local agy Chats', 'ローカル agy 会話を同期', '로컬 agy 대화 동기화'],
  '自动同步本机 Antigravity 应用与 agy CLI 的聊天记录。': [
    'Automatically sync conversations from local Antigravity App and agy CLI.',
    'ローカルの Antigravity アプリおよび agy CLI の会話履歴を自動同期します。',
    '로컬 Antigravity 앱 및 agy CLI의 대화 기록을 자동으로 동기화합니다.',
  ],
  '同步本机 agy / Antigravity 对话记录': [
    'Sync Local agy / Antigravity Conversations',
    'ローカル agy / Antigravity 会話を同期',
    '로컬 agy / Antigravity 대화 동기화',
  ],
  '从本机 Antigravity 应用与 agy CLI 增量拉取并合并最新聊天记录': [
    'Incrementally pull and merge recent chats from Antigravity App & agy CLI',
    'Antigravity アプリと agy CLI から最新の会話を増分同期します',
    'Antigravity 앱과 agy CLI에서 최신 대화를 증분 동기화합니다',
  ],
  '本机 agy 对话已是最新 ✓': [
    'Local agy conversations are up to date ✓',
    'ローカルの agy 会話は最新です ✓',
    '로컬 agy 대화가 이미 최신 상태입니다 ✓',
  ],
  '正在同步本机 agy 对话…': [
    'Syncing local agy conversations…',
    'ローカル agy 会話を同期中…',
    '로컬 agy 대화 동기화 중…',
  ],
  'Antigravity 回复已完成': ['Antigravity Reply Complete', 'Antigravity の応答が完了しました', 'Antigravity 답변 완료'],
  '你的任务已完成。': ['Your task has finished.', 'タスクが完了しました。', '작업이 완료되었습니다.'],
  '（当前）': [' (Active)', '（現在）', ' (현재)'],
};

// =========================================================================
// Regex Pattern Rules for Dynamic Templates
// =========================================================================

const WEEKDAYS = {
  '周日': ['Sun', '日', '일'],
  '周一': ['Mon', '月', '월'],
  '周二': ['Tue', '火', '화'],
  '周三': ['Wed', '水', '수'],
  '周四': ['Thu', '木', '목'],
  '周五': ['Fri', '金', '금'],
  '周六': ['Sat', '土', '토'],
};

const PATTERN_RULES = [
  // Language switch toast & active tag
  [
    /^(简体中文|English|日本語|한국어)（当前）$/,
    (m, i) => `${m[1]}${[' (Active)', '（現在）', ' (현재)'][i]}`,
  ],
  [
    /^已切换界面语言为「(.+?)」$/,
    (m, i) => [
      `Interface language switched to ${m[1]}`,
      `表示言語を「${m[1]}」に切り替えました`,
      `인터페이스 언어가 ${m[1]}(으)로 변경되었습니다`,
    ][i],
  ],
  // CLI status & engine strings
  [
    /^([a-zA-Z0-9_-]+) 已就绪$/,
    (m, i) => [`${m[1]} Ready`, `${m[1]} 準備完了`, `${m[1]} 준비됨`][i],
  ],
  [
    /^未检测到 ([a-zA-Z0-9_-]+)$/,
    (m, i) => [`${m[1]} not detected`, `${m[1]} 未検出`, `${m[1]} 감지 안 됨`][i],
  ],
  [
    /^(.+?) \(未安装\)$/,
    (m, i) => [`${m[1]} (Not installed)`, `${m[1]} (未インストール)`, `${m[1]} (미설치)`][i],
  ],
  [
    /^(.+?)（已识别：(.+?)）$/,
    (m, i) => {
      const desc = translateExact(m[1], i) || m[1];
      return [`${desc} (Detected: ${m[2]})`, `${desc}（検出: ${m[2]}）`, `${desc} (감지됨: ${m[2]})`][i];
    },
  ],
  [
    /^(.+?)（未检测到，安装：(.+?)）$/,
    (m, i) => {
      const desc = translateExact(m[1], i) || m[1];
      return [`${desc} (Not found — install: ${m[2]})`, `${desc}（未検出・導入: ${m[2]}）`, `${desc} (미감지 — 설치: ${m[2]})`][i];
    },
  ],
  [
    /^([a-zA-Z0-9_-]+) 会话已绑定 \($/,
    (m, i) => [`${m[1]} session bound (`, `${m[1]} セッション連携中 (`, `${m[1]} 세션 연결됨 (`][i],
  ],
  [
    /^当前已识别路径:\s*(.+)$/,
    (m, i) => [`Detected path: ${m[1]}`, `検出パス: ${m[1]}`, `감지된 경로: ${m[1]}`][i],
  ],
  [
    /^已切换驱动引擎为 (.+)$/,
    (m, i) => [`Switched CLI engine to ${m[1]}`, `CLI エンジンを ${m[1]} に切り替えました`, `CLI 엔진을 ${m[1]}(으)로 전환했습니다`][i],
  ],
  // Counters & badges
  [
    /^(\d+) 运行中$/,
    (m, i) => [`${m[1]} running`, `${m[1]} 実行中`, `${m[1]} 실행 중`][i],
  ],
  [
    /^思考过程 · ([\d.]+s)$/,
    (m, i) => [`Thinking · ${m[1]}`, `思考プロセス · ${m[1]}`, `사고 과정 · ${m[1]}`][i],
  ],
  [
    /^(\d+) 步$/,
    (m, i) => [`${m[1]} ${Number(m[1]) === 1 ? 'step' : 'steps'}`, `${m[1]} ステップ`, `${m[1]}단계`][i],
  ],
  [
    /^已完成 (\d+) 步操作$/,
    (m, i) => [`Completed ${m[1]} steps`, `${m[1]} ステップ完了`, `${m[1]}단계 완료`][i],
  ],
  [
    /^共 (\d+) 个 Skill · 仓库托管 (\d+) · 自动调度就绪 (\d+)$/,
    (m, i) => [
      `${m[1]} Skills · ${m[2]} in repo · ${m[3]} auto-ready`,
      `全 ${m[1]} 件 · リポジトリ ${m[2]} · 自動対応 ${m[3]}`,
      `총 ${m[1]}개 Skill · 저장소 ${m[2]} · 자동 준비 ${m[3]}`,
    ][i],
  ],
  [
    /^共 (\d+) 项 · (\d+) 项启用$/,
    (m, i) => [`${m[1]} total · ${m[2]} enabled`, `全 ${m[1]} 件 · ${m[2]} 件有効`, `총 ${m[1]}개 · ${m[2]}개 활성`][i],
  ],
  [
    /^每天 (\S+)$/,
    (m, i) => [`Daily ${m[1]}`, `毎日 ${m[1]}`, `매일 ${m[1]}`][i],
  ],
  [
    /^每 (\d+) 分钟$/,
    (m, i) => [`Every ${m[1]} min`, `${m[1]} 分ごと`, `${m[1]}분마다`][i],
  ],
  [
    /^已调度 (\d+) 次$/,
    (m, i) => [`Used ${m[1]}×`, `${m[1]} 回使用`, `${m[1]}회 사용`][i],
  ],
  [
    /^(\d+) 改动$/,
    (m, i) => [`${m[1]} ${Number(m[1]) === 1 ? 'change' : 'changes'}`, `${m[1]} 件の変更`, `변경 ${m[1]}개`][i],
  ],
  [
    /^(.+?) · (\d+) 条消息$/,
    (m, i) => [`${m[1]} · ${m[2]} msgs`, `${m[1]} · ${m[2]} 件`, `${m[1]} · 메시지 ${m[2]}개`][i],
  ],
  [
    /^(\d+) 行 · (.+?)(（已截断）)?$/,
    (m, i) => {
      const tr = m[3] ? [' (truncated)', '（省略あり）', ' (일부 생략)'][i] : '';
      return [`${m[1]} lines · ${m[2]}${tr}`, `${m[1]} 行 · ${m[2]}${tr}`, `${m[1]}줄 · ${m[2]}${tr}`][i];
    },
  ],
  [
    /^(图片|视频|音频|表格|二进制) · (.+)$/,
    (m, i) => {
      const map = {
        '图片': ['Image', '画像', '이미지'],
        '视频': ['Video', '動画', '비디오'],
        '音频': ['Audio', '音声', '오디오'],
        '表格': ['Table', 'テーブル', '표'],
        '二进制': ['Binary', 'バイナリ', '바이너리'],
      };
      return `${map[m[1]][i]} · ${m[2]}`;
    },
  ],
  [
    /^(Notebook|PPT|ZIP) · (\d+) (单元格|页|项)$/,
    (m, i) => {
      const unit = {
        '单元格': ['cells', 'セル', '셀'],
        '页': ['slides', 'ページ', '슬라이드'],
        '项': ['items', '項目', '항목'],
      };
      return `${m[1]} · ${m[2]} ${unit[m[3]][i]}`;
    },
  ],
  // Tool Activity Group Summaries
  [
    /^查阅了 (.+?) 等 (\d+) 处文件$/,
    (m, i) => [`Read ${m[1]} & ${m[2]} files`, `${m[1]} ほか ${m[2]} ファイルを参照`, `${m[1]} 외 파일 ${m[2]}곳 읽음`][i],
  ],
  [
    /^查阅了 (\d+) 处文件$/,
    (m, i) => [`Read ${m[1]} files`, `${m[1]} ファイルを参照`, `파일 ${m[1]}곳 읽음`][i],
  ],
  [
    /^查阅了 (.+)$/,
    (m, i) => [`Read ${m[1]}`, `${m[1]} を参照`, `${m[1]} 읽음`][i],
  ],
  [
    /^查阅 (.+)$/,
    (m, i) => [`Read ${m[1]}`, `${m[1]} を参照`, `${m[1]} 읽기`][i],
  ],
  [
    /^正在读取 (.+?)…$/,
    (m, i) => [`Reading ${m[1]}…`, `${m[1]} を読み込み中…`, `${m[1]} 읽는 중…`][i],
  ],
  [
    /^修改了 (.+?) 等 (\d+) 个文件(.*)$/,
    (m, i) => [`Edited ${m[1]} & ${m[2]} files${m[3]}`, `${m[1]} ほか ${m[2]} ファイルを編集${m[3]}`, `${m[1]} 외 파일 ${m[2]}개 수정${m[3]}`][i],
  ],
  [
    /^修改了 (\d+) 处文件(.*)$/,
    (m, i) => [`Edited ${m[1]} files${m[2]}`, `${m[1]} ファイルを編集${m[2]}`, `파일 ${m[1]}곳 수정${m[2]}`][i],
  ],
  [
    /^修改了 (.+)$/,
    (m, i) => [`Edited ${m[1]}`, `${m[1]} を編集`, `${m[1]} 수정됨`][i],
  ],
  [
    /^修改 (.+)$/,
    (m, i) => [`Edit ${m[1]}`, `${m[1]} を編集`, `${m[1]} 수정`][i],
  ],
  [
    /^正在修改 (.+?)…$/,
    (m, i) => [`Editing ${m[1]}…`, `${m[1]} を編集中…`, `${m[1]} 수정 중…`][i],
  ],
  [
    /^写入 (.+)$/,
    (m, i) => [`Write ${m[1]}`, `${m[1]} に書き込み`, `${m[1]} 쓰기`][i],
  ],
  [
    /^正在写入 (.+?)…$/,
    (m, i) => [`Writing ${m[1]}…`, `${m[1]} に書き込み中…`, `${m[1]} 쓰는 중…`][i],
  ],
  [
    /^运行了 (\d+) 条命令$/,
    (m, i) => [`Ran ${m[1]} commands`, `${m[1]} コマンドを実行`, `명령 ${m[1]}개 실행`][i],
  ],
  [
    /^运行了 (.+)$/,
    (m, i) => [`Ran ${m[1]}`, `${m[1]} を実行`, `${m[1]} 실행됨`][i],
  ],
  [
    /^运行 (.+)$/,
    (m, i) => [`Run ${m[1]}`, `${m[1]} を実行`, `${m[1]} 실행`][i],
  ],
  [
    /^正在运行 (.+?)…$/,
    (m, i) => [`Running ${m[1]}…`, `${m[1]} を実行中…`, `${m[1]} 실행 중…`][i],
  ],
  [
    /^检索了 (\d+) 次内容$/,
    (m, i) => [`Searched ${m[1]}×`, `${m[1]} 回検索`, `${m[1]}회 검색`][i],
  ],
  [
    /^搜索了 “(.+?)”$/,
    (m, i) => [`Searched "${m[1]}"`, `「${m[1]}」を検索`, `"${m[1]}" 검색함`][i],
  ],
  [
    /^搜索 “(.+?)”$/,
    (m, i) => [`Search "${m[1]}"`, `「${m[1]}」を検索`, `"${m[1]}" 검색`][i],
  ],
  [
    /^正在搜索 “(.+?)”…$/,
    (m, i) => [`Searching "${m[1]}"…`, `「${m[1]}」を検索中…`, `"${m[1]}" 검색 중…`][i],
  ],
  [
    /^联网检索 “(.+?)”$/,
    (m, i) => [`Web search "${m[1]}"`, `ウェブ検索「${m[1]}」`, `웹 검색 "${m[1]}"`][i],
  ],
  [
    /^正在执行：(.+?)…$/,
    (m, i) => [`Running: ${m[1]}…`, `実行中: ${m[1]}…`, `실행 중: ${m[1]}…`][i],
  ],
  [
    /^正在执行 (.+?)…$/,
    (m, i) => [`Running ${m[1]}…`, `${m[1]} を実行中…`, `${m[1]} 실행 중…`][i],
  ],
  [
    /^在右侧阅读器打开：(.+)$/,
    (m, i) => [`Open in reader: ${m[1]}`, `リーダーで開く: ${m[1]}`, `리더에서 열기: ${m[1]}`][i],
  ],
  // Command Palette & Modal Dynamic Labels
  [
    /^切换项目：(.+)$/,
    (m, i) => [`Switch Project: ${m[1]}`, `プロジェクト切替: ${m[1]}`, `프로젝트 전환: ${m[1]}`][i],
  ],
  [
    /^配色：(.+?)(（当前）)?$/,
    (m, i) => {
      const name = translateExact(m[1], i) || m[1];
      const cur = m[2] ? [' (Active)', '（現在）', ' (현재)'][i] : '';
      return [`Theme: ${name}${cur}`, `配色: ${name}${cur}`, `색상: ${name}${cur}`][i];
    },
  ],
  [
    /^字体：(.+?)(（当前）)?$/,
    (m, i) => {
      const name = translateExact(m[1], i) || m[1];
      const cur = m[2] ? [' (Active)', '（現在）', ' (현재)'][i] : '';
      return [`Font: ${name}${cur}`, `フォント: ${name}${cur}`, `글꼴: ${name}${cur}`][i];
    },
  ],
  [
    /^挂载 Skill：(.+)$/,
    (m, i) => [`Mount Skill: ${m[1]}`, `Skill を適用: ${m[1]}`, `Skill 마운트: ${m[1]}`][i],
  ],
  [
    /^编辑 Skill：(.+)$/,
    (m, i) => [`Edit Skill: ${m[1]}`, `Skill を編集: ${m[1]}`, `Skill 편집: ${m[1]}`][i],
  ],
  [
    /^克隆到我的仓库：(.+)$/,
    (m, i) => [`Clone to My Repo: ${m[1]}`, `マイ倉庫へ複製: ${m[1]}`, `내 저장소로 복제: ${m[1]}`][i],
  ],
  [
    /^导出「(.+?)」为带思考过程与工具摘要的 \.md 笔记$/,
    (m, i) => [
      `Export "${m[1]}" as a Markdown note with thinking & tool summary`,
      `「${m[1]}」を思考過程・ツール要約付き Markdown で出力`,
      `"${m[1]}"을(를) 사고 과정 및 도구 요약 포함 Markdown으로 내보내기`,
    ][i],
  ],
  // Toasts & Statuses
  [
    /^已切换配色「(.+?)」$/,
    (m, i) => {
      const name = translateExact(m[1], i) || m[1];
      return [`Switched color scheme to "${name}"`, `配色を「${name}」に変更しました`, `색상 테마를 "${name}"(으)로 변경했습니다`][i];
    },
  ],
  [
    /^已切换字体「(.+?)」$/,
    (m, i) => {
      const name = translateExact(m[1], i) || m[1];
      return [`Switched font to "${name}"`, `フォントを「${name}」に変更しました`, `글꼴을 "${name}"(으)로 변경했습니다`][i];
    },
  ],
  [
    /^已挂载 Skill「(.+?)」，(?:直接输入需求即可使用|发送消息即可生效)$/,
    (m, i) => [
      `Mounted Skill "${m[1]}" — send a message to use it`,
      `Skill「${m[1]}」を適用しました`,
      `Skill "${m[1]}"이(가) 마운트되었습니다`,
    ][i],
  ],
  [
    /^Skill「(.+?)」已保存到仓库 ✓$/,
    (m, i) => [`Skill "${m[1]}" saved ✓`, `Skill「${m[1]}」を保存しました ✓`, `Skill "${m[1]}" 저장됨 ✓`][i],
  ],
  [
    /^已导入 Skill「(.+?)」到仓库 ✓$/,
    (m, i) => [`Imported Skill "${m[1]}" ✓`, `Skill「${m[1]}」をインポートしました ✓`, `Skill "${m[1]}" 가져오기 완료 ✓`][i],
  ],
  [
    /^已删除 Skill「(.+?)」$/,
    (m, i) => [`Deleted Skill "${m[1]}"`, `Skill「${m[1]}」を削除しました`, `Skill "${m[1]}" 삭제됨`][i],
  ],
  [
    /^已在「已排定」绑定 Skill「(.+?)」$/,
    (m, i) => [`Bound Skill "${m[1]}" in Scheduled`, `スケジュールに Skill「${m[1]}」を設定しました`, `예약 작업에 Skill "${m[1]}" 연동됨`][i],
  ],
  [
    /^点击关闭「(.+?)」$/,
    (m, i) => {
      const lbl = translateExact(m[1], i) || m[1];
      return [`Click to disable "${lbl}"`, `クリックして「${lbl}」を解除`, `클릭하여 "${lbl}" 끄기`][i];
    },
  ],
  [
    /^「(.+?)」后台回复已完成$/,
    (m, i) => [`"${m[1]}" finished replying`, `「${m[1]}」の応答が完了しました`, `"${m[1]}" 백그라운드 답변 완료`][i],
  ],
  [
    /^已分叉新对话「(.+?)」$/,
    (m, i) => [`Forked new chat "${m[1]}"`, `新しい会話「${m[1]}」を分岐しました`, `새 대화 "${m[1]}" 분기됨`][i],
  ],
  [
    /^已导出「(.+?)」✓$/,
    (m, i) => [`Exported "${m[1]}" ✓`, `「${m[1]}」をエクスポートしました ✓`, `"${m[1]}" 내보내기 완료 ✓`][i],
  ],
  [
    /^已保存 (.+?) ✓$/,
    (m, i) => [`Saved ${m[1]} ✓`, `${m[1]} を保存しました ✓`, `${m[1]} 저장됨 ✓`][i],
  ],
  [
    /^已创建文件夹 (.+?) ✓$/,
    (m, i) => [`Created folder ${m[1]} ✓`, `フォルダー ${m[1]} を作成しました ✓`, `폴더 ${m[1]} 생성됨 ✓`][i],
  ],
  [
    /^已新建文件夹「(.+?)」✓$/,
    (m, i) => [`Created folder "${m[1]}" ✓`, `フォルダー「${m[1]}」を作成しました ✓`, `폴더 "${m[1]}" 생성됨 ✓`][i],
  ],
  [
    /^已创建 (.+?) ✓$/,
    (m, i) => [`Created ${m[1]} ✓`, `${m[1]} を作成しました ✓`, `${m[1]} 생성됨 ✓`][i],
  ],
  [
    /^已删除 (.+)$/,
    (m, i) => [`Deleted ${m[1]}`, `${m[1]} を削除しました`, `${m[1]} 삭제됨`][i],
  ],
  [
    /^已重命名为「?(.+?)」? ✓$/,
    (m, i) => [`Renamed to ${m[1]} ✓`, `${m[1]} に名前を変更しました ✓`, `${m[1]}(으)로 이름 변경됨 ✓`][i],
  ],
  [
    /^我的仓库 \((\d+)\)$/,
    (m, i) => [`My Repos (${m[1]})`, `マイリポジトリ (${m[1]})`, `내 저장소 (${m[1]})`][i],
  ],
  [
    /^GitHub 搜索 \((\d+)\)$/,
    (m, i) => [`GitHub Search (${m[1]})`, `GitHub 検索 (${m[1]})`, `GitHub 검색 (${m[1]})`][i],
  ],
  [
    /^已连接 @(.+?) ✓$/,
    (m, i) => [`Connected as @${m[1]} ✓`, `@${m[1]} として接続済み ✓`, `@${m[1]} 연결됨 ✓`][i],
  ],
  [
    /^已连接 · (\d+) 公开仓库 \/ (\d+) 私有仓库$/,
    (m, i) => [
      `Connected · ${m[1]} public / ${m[2]} private repos`,
      `接続済み · 公開 ${m[1]} / 非公開 ${m[2]}`,
      `연결됨 · 공개 ${m[1]} / 비공개 ${m[2]}`,
    ][i],
  ],
  [
    /^已关联 GitHub: (.+?)（点击管理 GitHub 连接）$/,
    (m, i) => [
      `Linked GitHub: ${m[1]} (click to manage)`,
      `GitHub 連携中: ${m[1]}（クリックで管理）`,
      `GitHub 연결됨: ${m[1]} (클릭하여 관리)`,
    ][i],
  ],
  [
    /^目标快照：(.+)$/,
    (m, i) => {
      const lbl = translateExact(m[1], i) || m[1];
      return [`Target Snapshot: ${lbl}`, `対象スナップショット: ${lbl}`, `대상 스냅샷: ${lbl}`][i];
    },
  ],
  [
    /^快照编号：(.+)$/,
    (m, i) => [`Snapshot ID: ${m[1]}`, `スナップショット ID: ${m[1]}`, `스냅샷 ID: ${m[1]}`][i],
  ],
  [
    /^所在目录：工作区根目录（支持子路径，如 src\/utils\.py）$/,
    (_m, i) => [
      'Folder: Workspace Root (subpaths like src/utils.py supported)',
      '場所: ワークスペースルート（src/utils.py のようなサブパス可）',
      '위치: 워크스페이스 루트 (src/utils.py 등 하위 경로 지원)',
    ][i],
  ],
  [
    /^所在目录：工作区根目录$/,
    (_m, i) => ['Folder: Workspace Root', '場所: ワークスペースルート', '위치: 워크스페이스 루트'][i],
  ],
  [
    /^所在目录：(.+)$/,
    (m, i) => [`Folder: ${m[1]}`, `場所: ${m[1]}`, `위치: ${m[1]}`][i],
  ],
  [
    /^原路径：(.+)$/,
    (m, i) => [`Current Path: ${m[1]}`, `現在のパス: ${m[1]}`, `현재 경로: ${m[1]}`][i],
  ],
  [
    /^(\d+)月(\d+)日(周[日一二三四五六])$/,
    (m, i) => {
      const wd = WEEKDAYS[m[3]][i];
      return [`${m[1]}/${m[2]} ${wd}`, `${m[1]}月${m[2]}日(${wd})`, `${m[1]}월 ${m[2]}일 (${wd})`][i];
    },
  ],
  [
    /^未找到匹配「(.+?)」的文件$/,
    (m, i) => [`No files matching "${m[1]}"`, `「${m[1]}」に一致するファイルはありません`, `"${m[1]}"과(와) 일치하는 파일이 없습니다`][i],
  ],
  [
    /^检查点 GC 完成：清理 (\d+) 个快照 \/ (\d+) 个对象（释放 (\d+) KB）$/,
    (m, i) => [
      `Checkpoint GC done: removed ${m[1]} snapshots / ${m[2]} blobs (freed ${m[3]} KB)`,
      `GC 完了：スナップショット ${m[1]} 件 / オブジェクト ${m[2]} 件削除（${m[3]} KB 解放）`,
      `체크포인트 GC 완료: 스냅샷 ${m[1]}개 / 객체 ${m[2]}개 정리 (${m[3]} KB 확보)`,
    ][i],
  ],
  [
    /^(?:工作区已回滚|已回滚完成)：恢复 (\d+) 个文件，移除 (\d+) 个新建文件 ✓$/,
    (m, i) => [
      `Workspace rolled back: restored ${m[1]} files, removed ${m[2]} new files ✓`,
      `ロールバック完了：${m[1]} ファイルを復元、新規 ${m[2]} ファイルを削除 ✓`,
      `워크스페이스 롤백 완료: 파일 ${m[1]}개 복원, 새 파일 ${m[2]}개 제거 ✓`,
    ][i],
  ],
  [
    /^已同步本机 agy 对话：新增 (\d+) 条，更新 (\d+) 条 ✓$/,
    (m, i) => [
      `Synced local agy chats: ${m[1]} imported, ${m[2]} updated ✓`,
      `ローカル agy 会話を同期：新規 ${m[1]} 件・更新 ${m[2]} 件 ✓`,
      `로컬 agy 대화 동기화: ${m[1]}개 추가, ${m[2]}개 업데이트 ✓`,
    ][i],
  ],
  [
    /^同步对话失败：(.+)$/,
    (m, i) => [`Conversation sync failed: ${m[1]}`, `会話の同期に失敗: ${m[1]}`, `대화 동기화 실패: ${m[1]}`][i],
  ],
  [
    /^· 关键词: (.+)$/,
    (m, i) => [`· Matched: ${m[1]}`, `· 一致キーワード: ${m[1]}`, `· 일치 키워드: ${m[1]}`][i],
  ],
];

function langToIndex(lang) {
  if (lang === 'en') return 0;
  if (lang === 'ja') return 1;
  if (lang === 'ko') return 2;
  return -1;
}

function translateExact(core, idx) {
  if (idx < 0 || !core) return null;
  const entry = DICT[core];
  if (entry) return entry[idx];
  const collapsed = core.replace(/\s+/g, ' ');
  if (collapsed !== core && DICT[collapsed]) return DICT[collapsed][idx];
  return null;
}

export function translateText(raw, lang = currentLang) {
  if (typeof raw !== 'string' || !raw) return raw;
  const idx = langToIndex(lang);
  if (idx < 0) return raw;
  // Fast exit when there are no CJK characters to translate
  if (!/[\u4e00-\u9fff]/.test(raw)) return raw;

  const m = raw.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!m) return raw;
  const [, lead, core, trail] = m;
  if (!core) return raw;

  const exact = translateExact(core, idx);
  if (exact !== null) return lead + exact + trail;

  const collapsed = core.replace(/\s+/g, ' ');
  for (const [re, fn] of PATTERN_RULES) {
    const pm = collapsed.match(re);
    if (pm) return lead + fn(pm, idx) + trail;
  }

  // Compound dot-separated UI summary lines (e.g., "查阅了 3 处文件 · 运行了 2 条命令")
  if (collapsed.includes(' · ')) {
    const parts = collapsed.split(' · ');
    let changed = false;
    const translatedParts = parts.map((p) => {
      const tr = translateText(p, lang);
      if (tr !== p) changed = true;
      return tr;
    });
    if (changed) return lead + translatedParts.join(' · ') + trail;
  }

  return raw;
}

export function t(zhText) {
  return translateText(zhText, currentLang);
}

// =========================================================================
// Lossless WeakMap DOM Translator & Guarded MutationObserver
// =========================================================================

const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'CODE',
  'PRE',
  'TEXTAREA',
  'SVG',
  'CANVAS',
  'IFRAME',
]);

const SKIP_ANCESTOR_SELECTOR = [
  '[data-i18n-skip]',
  '.msg-user-text',
  '.msg-assistant-prose',
  '.thinking-body',
  '.tool-diff-body',
  '.tool-raw-body',
  '.rp-reader-content',
  '.rp-split-content',
  '.rp-diff-code',
  '.rp-term-output',
  '.artifact-source-view',
  '.conv-title',
  '.conv-item-title',
  '.conv-item-snippet',
  '.project-name',
  '.rp-tree-name',
  '.turn-nav-item-text',
  '.katex',
].join(',');

const TRANSLATABLE_ATTRS = ['placeholder', 'title', 'aria-label'];

// Track { orig, applied } per Text node & per Element attribute for 100% lossless round-trips
const textNodeState = new WeakMap();
const attrNodeState = new WeakMap();

let isApplying = false;
let observer = null;

function isProtectedElement(el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.closest('[data-i18n-skip]')) return true;
  if (el.closest('.code-block-header, .mermaid-toolbar, .chat-img-actions')) return false;
  return Boolean(el.closest(SKIP_ANCESTOR_SELECTOR));
}

function processTextNode(node, lang) {
  const parent = node.parentElement;
  if (!parent || parent.id === 'greeting-text' || SKIP_TAGS.has(parent.tagName) || isProtectedElement(parent)) return;

  const val = node.nodeValue || '';
  if (!val.trim()) return;

  let st = textNodeState.get(node);
  if (!st) {
    if (!/[\u4e00-\u9fff]/.test(val)) return;
    st = { orig: val, applied: val };
    textNodeState.set(node, st);
  } else if (val !== st.applied) {
    // Underlying JS updated this node to a fresh source string
    st.orig = val;
    st.applied = val;
  }

  const next = lang === 'zh-CN' ? st.orig : translateText(st.orig, lang);
  st.applied = next;
  if (node.nodeValue !== next) {
    node.nodeValue = next;
  }
}

function processElementAttrs(el, lang) {
  if (!el || el.nodeType !== 1) return;
  if (el.closest('[data-i18n-skip]')) return;
  // Allow placeholder/title on inputs & buttons, skip prose/code internals
  if (
    el.tagName !== 'INPUT' &&
    el.tagName !== 'TEXTAREA' &&
    el.tagName !== 'BUTTON' &&
    isProtectedElement(el)
  ) {
    return;
  }

  let map = attrNodeState.get(el);
  for (const attr of TRANSLATABLE_ATTRS) {
    if (!el.hasAttribute(attr)) continue;
    const val = el.getAttribute(attr) || '';
    if (!val.trim()) continue;

    let st = map && map[attr];
    if (!st) {
      if (!/[\u4e00-\u9fff]/.test(val)) continue;
      if (!map) {
        map = {};
        attrNodeState.set(el, map);
      }
      st = { orig: val, applied: val };
      map[attr] = st;
    } else if (val !== st.applied) {
      st.orig = val;
      st.applied = val;
    }

    const next = lang === 'zh-CN' ? st.orig : translateText(st.orig, lang);
    st.applied = next;
    if (el.getAttribute(attr) !== next) {
      el.setAttribute(attr, next);
    }
  }
}

export function applyI18nToTree(root = document.body, lang = currentLang) {
  if (!root) return;
  const prev = isApplying;
  isApplying = true;
  try {
    if (root.nodeType === 3) {
      processTextNode(root, lang);
      return;
    }
    if (root.nodeType === 1) {
      processElementAttrs(root, lang);
    }
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      null
    );
    let n = walker.nextNode();
    while (n) {
      if (n.nodeType === 3) {
        processTextNode(n, lang);
      } else if (n.nodeType === 1) {
        processElementAttrs(n, lang);
      }
      n = walker.nextNode();
    }
  } finally {
    isApplying = prev;
  }
}

export function setLanguage(lang) {
  const norm = normalizeLanguage(lang);
  currentLang = norm;
  const meta = getLanguageMeta(norm);
  document.documentElement.setAttribute('lang', meta.htmlLang);
  document.documentElement.setAttribute('data-lang', norm);
  try {
    localStorage.setItem(STORAGE_KEY, norm);
  } catch {
    // ignore storage restrictions
  }
  applyI18nToTree(document.body, norm);
  return norm;
}

export function startI18nObserver() {
  if (observer || typeof MutationObserver === 'undefined' || !document.body) return;
  let queued = new Set();
  let scheduled = false;

  const flush = () => {
    scheduled = false;
    if (currentLang === 'zh-CN') {
      queued.clear();
      return;
    }
    const batch = Array.from(queued);
    queued.clear();
    for (const node of batch) {
      if (!node || !node.isConnected) continue;
      applyI18nToTree(node, currentLang);
    }
  };

  observer = new MutationObserver((mutations) => {
    if (isApplying || currentLang === 'zh-CN') return;
    for (const m of mutations) {
      if (m.type === 'childList') {
        for (const added of m.addedNodes) {
          if (added.nodeType === 1 || added.nodeType === 3) queued.add(added);
        }
      } else if (m.type === 'characterData') {
        if (m.target) queued.add(m.target);
      } else if (m.type === 'attributes') {
        if (m.target && m.target.nodeType === 1) queued.add(m.target);
      }
    }
    if (queued.size && !scheduled) {
      scheduled = true;
      queueMicrotask(flush);
    }
  });

  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: TRANSLATABLE_ATTRS,
  });
}
