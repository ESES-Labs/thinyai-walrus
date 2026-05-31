import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const components: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-[1.7] text-agent">{children}</p>,

  h1: ({ children }) => (
    <h1 className="mb-2 mt-3 text-[13px] font-bold text-primary first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-1.5 mt-3 text-[12px] font-semibold text-primary first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1 mt-2 text-[11px] font-semibold text-sub first:mt-0">{children}</h3>
  ),

  ul: ({ children }) => <ul className="mb-2 ml-3 list-none space-y-0.5 last:mb-0">{children}</ul>,
  ol: ({ children }) => (
    <ol className="mb-2 ml-3 list-none space-y-0.5 last:mb-0 [counter-reset:item]">{children}</ol>
  ),
  li: ({ children, ...props }) => {
    const ordered = "ordered" in props ? props.ordered : false;
    return (
      <li className="flex gap-2 text-agent">
        <span className="mt-[2px] flex-shrink-0 text-muted">{ordered ? "→" : "–"}</span>
        <span>{children}</span>
      </li>
    );
  },

  code: ({ children, className }) => {
    const isBlock = className?.startsWith("language-");
    const lang = className?.replace("language-", "") ?? "";

    if (isBlock) {
      return (
        <div className="my-2 overflow-hidden rounded border border-border">
          {lang && (
            <div className="border-b border-border bg-[#0a0a0a] px-3 py-1.5 text-[9px] uppercase tracking-widest text-muted">
              {lang}
            </div>
          )}
          <pre className="overflow-x-auto bg-[#0a0a0a] px-3 py-2.5 text-[10px] leading-[1.7] text-primary">
            <code>{children}</code>
          </pre>
        </div>
      );
    }

    return (
      <code className="rounded border border-border bg-[#111] px-1 py-0.5 font-mono text-[10px] text-primary">
        {children}
      </code>
    );
  },

  pre: ({ children }) => <>{children}</>,

  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-border pl-3 text-sub">{children}</blockquote>
  ),

  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline decoration-border underline-offset-2 transition-colors hover:decoration-sub"
    >
      {children}
    </a>
  ),

  strong: ({ children }) => <strong className="font-semibold text-primary">{children}</strong>,

  em: ({ children }) => <em className="italic text-agent">{children}</em>,

  hr: () => <hr className="my-3 border-border" />,

  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-[10px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="border-b border-border">{children}</thead>,
  th: ({ children }) => (
    <th className="px-3 py-1.5 text-left font-mono text-[9px] uppercase tracking-widest text-muted">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-[#161616] px-3 py-1.5 text-agent">{children}</td>
  ),
};

interface MarkdownProps {
  content: string;
}

export function Markdown({ content }: MarkdownProps) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}
