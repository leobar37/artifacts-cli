/**
 * Machine- and human-readable description of what the artifact viewer
 * supports. Single source of truth for `artifact capabilities [--json]`,
 * agent guidance and the skill docs — keep in sync with the renderers in
 * `src/server/markdown-viewer.ts` and `src/server/mdx-components.ts`.
 */

export interface ComponentPropDoc {
  name: string;
  required: boolean;
  description: string;
}

export interface ComponentDoc {
  name: string;
  description: string;
  props: ComponentPropDoc[];
  example: string;
}

export interface FormatDoc {
  format: 'html' | 'md' | 'mdx';
  entryFile: string;
  description: string;
}

export interface ViewerCapabilities {
  formats: FormatDoc[];
  components: ComponentDoc[];
  features: string[];
  mermaid: {
    supported: true;
    usage: string;
    note: string;
  };
  guidePath: '/mdx-guide';
  /** Where the JSON behind `artifact capabilities --json` comes from. */
  cliCommand: 'artifact capabilities [--json]';
}

export function getViewerCapabilities(): ViewerCapabilities {
  return {
    formats: [
      {
        format: 'html',
        entryFile: 'index.html',
        description: 'standalone HTML page (legacy default), isolated iframe',
      },
      {
        format: 'md',
        entryFile: 'index.md',
        description: 'Markdown rendered by the built-in viewer (GFM + mermaid)',
      },
      {
        format: 'mdx',
        entryFile: 'index.mdx',
        description: 'Markdown + built-in components (Chart, Stats, Callout)',
      },
    ],
    components: [
      {
        name: 'Chart',
        description: 'Chart rendered server-side with recharts (static, themed)',
        props: [
          { name: 'type', required: false, description: 'bar (default) | line | area | pie' },
          { name: 'data', required: true, description: 'array of objects: x key + numeric keys' },
          { name: 'x', required: false, description: 'x-axis key (default "name")' },
          { name: 'series', required: false, description: 'numeric keys to plot (default: all numeric keys, max 4)' },
          { name: 'title', required: false, description: 'caption above the chart' },
          { name: 'height', required: false, description: 'px, 160-480 (default 240)' },
        ],
        example: '<Chart type="bar" data={[{ name: "Q1", mrr: 12 }]} series={["mrr"]} />',
      },
      {
        name: 'Stats',
        description: 'Responsive grid wrapper for KPI cells',
        props: [{ name: 'children', required: true, description: 'one or more <Stat /> components' }],
        example: '<Stats><Stat value="14.9k" label="MRR" delta="+24%" /></Stats>',
      },
      {
        name: 'Stat',
        description: 'KPI cell',
        props: [
          { name: 'value', required: true, description: 'main figure (string)' },
          { name: 'label', required: false, description: 'small uppercase label' },
          { name: 'delta', required: false, description: '"+24%" green / "-0.5pp" red (sign picks color)' },
        ],
        example: '<Stat value="72" label="Sessions" delta="+38%" />',
      },
      {
        name: 'Callout',
        description: 'Highlighted note; children are rendered as markdown',
        props: [
          { name: 'type', required: false, description: 'info (default) | warning | success | danger' },
          { name: 'title', required: false, description: 'bold heading' },
          { name: 'children', required: false, description: 'markdown body' },
        ],
        example: '<Callout type="warning" title="Careful">**Read this.**</Callout>',
      },
    ],
    features: [
      'GFM: tables, task lists, strikethrough, autolinks',
      'fenced code with syntax highlighting',
      'mermaid diagrams via ```mermaid fences',
      'frontmatter title/type feed the sidebar label and artifact type',
      'dark/light theme follows the dashboard (?theme=dark|light)',
      '?raw=1 serves the plain source',
      'MDX: module-level import/export and {/* comments */} hidden',
      'MDX: props must be literals (viewer executes no code); unknown components render as visible placeholders',
      'versioned store: artifact_create/artifact_update create v001, v002...',
    ],
    mermaid: {
      supported: true,
      usage: 'fenced code block with language `mermaid` (flowchart, sequence, class, state, er, gantt, pie, ...)',
      note: 'rendered client-side from the daemon-served bundle; raw source stays visible when JS is unavailable',
    },
    guidePath: '/mdx-guide',
    cliCommand: 'artifact capabilities [--json]',
  };
}

/** Human-readable rendering for `artifact capabilities`. */
export function formatCapabilitiesText(caps: ViewerCapabilities, guideUrl: string | null): string {
  const lines: string[] = ['Artifact viewer capabilities', ''];
  lines.push('Formats');
  for (const f of caps.formats) {
    lines.push(`  ${f.format.padEnd(5)} ${f.entryFile.padEnd(11)} ${f.description}`);
  }
  lines.push('', 'Built-in MDX components (props must be literals)');
  for (const comp of caps.components) {
    const props = comp.props.map((p) => `${p.name}${p.required ? '' : '?'}`).join(', ');
    lines.push(`  ${comp.name.padEnd(8)} (${props}) — ${comp.description}`);
    lines.push(`           ${comp.example}`);
  }
  lines.push('', 'Diagrams');
  lines.push(`  mermaid   ${caps.mermaid.usage}`);
  lines.push(`            ${caps.mermaid.note}`);
  lines.push('', 'Viewer features');
  for (const feat of caps.features) {
    lines.push(`  - ${feat}`);
  }
  lines.push('', `Live guide: ${guideUrl ?? `not running — start it with artifact start, then open ${caps.guidePath}`}`);
  lines.push('Machine-readable: artifact capabilities --json');
  return lines.join('\n');
}
