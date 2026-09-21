import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

interface MarkdownMessageProps {
  content: string;
  className?: string;
}

const components: Components = {
  p: ({ children }) => (
    <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
  ),
  code: ({ className, children, ...props }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code
          className="rounded-md bg-panel-raised px-1.5 py-0.5 font-mono text-xs text-text-secondary"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code className={`block ${className}`} {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="mb-2 overflow-x-auto rounded-xl bg-panel-raised p-3 font-mono text-xs leading-relaxed border border-line">
      {children}
    </pre>
  ),
  ul: ({ children }) => (
    <ul className="mb-2 list-disc list-inside space-y-0.5 text-text-secondary">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 list-decimal list-inside space-y-0.5 text-text-secondary">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="text-text-secondary">{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent hover:text-accent-hover underline underline-offset-2"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-line pl-3 italic text-text-muted">
      {children}
    </blockquote>
  ),
  h1: ({ children }) => (
    <h1 className="mb-2 text-lg font-medium text-text-primary">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 text-base font-medium text-text-primary">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 text-sm font-medium text-text-primary">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-1 text-sm font-medium text-text-secondary">{children}</h4>
  ),
  strong: ({ children }) => (
    <strong className="font-medium text-text-primary">{children}</strong>
  ),
  em: ({ children }) => <em className="italic text-text-muted">{children}</em>,
  hr: () => <hr className="my-3 border-line" />,
  table: ({ children }) => (
    <div className="mb-2 overflow-x-auto">
      <table className="min-w-full text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-panel-raised">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="px-2 py-1 text-left font-medium text-text-primary">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-t border-line px-2 py-1 text-text-secondary">
      {children}
    </td>
  ),
};

export function MarkdownMessage({
  content,
  className = "",
}: MarkdownMessageProps) {
  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
