export function formatJson(input: unknown): string {
  if (typeof input === 'string') {
    try {
      return JSON.stringify(JSON.parse(input), null, 2);
    } catch {
      return input;
    }
  }
  if (input && typeof input === 'object') {
    return JSON.stringify(input, null, 2);
  }
  return String(input ?? '');
}

export function truncateJson(json: string, maxLines = 8): string {
  const lines = json.split('\n');
  if (lines.length <= maxLines) return json;
  return lines.slice(0, maxLines).join('\n') + '\n...';
}

export function getToolStateLabel(state: string): string {
  switch (state) {
    case 'input-streaming':
      return 'Streaming input...';
    case 'input-available':
      return 'Preparing...';
    case 'output-available':
      return 'Completed';
    case 'output-error':
      return 'Error';
    case 'approval-requested':
      return 'Awaiting approval';
    case 'call':
    case 'partial-call':
      return 'Running...';
    case 'result':
      return 'Done';
    default:
      return state;
  }
}
