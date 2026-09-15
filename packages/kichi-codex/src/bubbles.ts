import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const english = {
  ready: 'Ready',
  thinking: 'Thinking',
  taskReceivedThinking: 'Task received, thinking',
  taskReceived: 'New task received',
  taskCompleted: 'Task complete',
  paused: 'Paused',
  approval: 'Waiting for confirmation',
  compacting: 'Organizing context',
  subagents: 'Subtasks in progress',
  command: 'Running a command',
  editing: 'Editing files',
  planning: 'Updating the plan',
  delegating: 'Assigning subtasks',
  tool: 'Using a tool',
};

export type BubbleMessages = typeof english;

const translations = {
  zh: {
    ready: '准备好了',
    thinking: '正在思考',
    taskReceivedThinking: '收到任务，正在思考',
    taskReceived: '收到新任务',
    taskCompleted: '任务已完成',
    paused: '已暂停',
    approval: '等待确认',
    compacting: '整理上下文',
    subagents: '子任务协作中',
    command: '正在执行命令',
    editing: '正在修改文件',
    planning: '正在整理计划',
    delegating: '正在分配子任务',
    tool: '正在调用工具',
  },
  ja: {
    ready: '準備完了',
    thinking: '思考中',
    taskReceivedThinking: 'タスクを受信、思考中',
    taskReceived: '新しいタスクを受信',
    taskCompleted: 'タスク完了',
    paused: '一時停止中',
    approval: '確認待ち',
    compacting: 'コンテキストを整理中',
    subagents: 'サブタスク連携中',
    command: 'コマンド実行中',
    editing: 'ファイル編集中',
    planning: '計画を整理中',
    delegating: 'サブタスク割り当て中',
    tool: 'ツール呼び出し中',
  },
  ko: {
    ready: '준비 완료',
    thinking: '생각 중',
    taskReceivedThinking: '작업 접수, 생각 중',
    taskReceived: '새 작업 접수',
    taskCompleted: '작업 완료',
    paused: '일시 중지',
    approval: '확인 대기 중',
    compacting: '컨텍스트 정리 중',
    subagents: '하위 작업 협업 중',
    command: '명령 실행 중',
    editing: '파일 수정 중',
    planning: '계획 정리 중',
    delegating: '하위 작업 배정 중',
    tool: '도구 호출 중',
  },
} satisfies Record<'zh' | 'ja' | 'ko', BubbleMessages>;

function systemLocale(): string {
  const options = { encoding: 'utf8', windowsHide: true, timeout: 5_000 } as const;
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot;
    if (!systemRoot) throw new Error('SystemRoot is required to read the Windows UI language');
    return execFileSync(
      join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '[Globalization.CultureInfo]::CurrentUICulture.Name'],
      options,
    ).trim();
  }
  if (process.platform === 'darwin') {
    return execFileSync('/usr/bin/osascript', [
      '-l', 'JavaScript', '-e',
      'ObjC.import("Foundation"); ObjC.unwrap($.NSLocale.preferredLanguages.objectAtIndex(0));',
    ], options).trim();
  }
  return new Intl.DateTimeFormat().resolvedOptions().locale;
}

// Resolve once per bridge, not in the short-lived processes parsing Hook payloads.
export function getSystemBubbles(): BubbleMessages {
  switch (new Intl.Locale(systemLocale()).language) {
    case 'zh': return translations.zh;
    case 'ja': return translations.ja;
    case 'ko': return translations.ko;
    default: return english;
  }
}
