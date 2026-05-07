"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

export function MarkdownViewer({ source }: { source: string }) {
  return (
    <div className="prose prose-invert max-w-none prose-pre:bg-chrome prose-pre:border prose-pre:border-surface prose-code:text-primary prose-headings:text-text prose-strong:text-text prose-a:text-primary">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
