/**
 * ResourceMarkdown — extended markdown-lite renderer for the resource pages.
 *
 * Supports (all using design-system tokens, no magic numbers):
 *   ## Heading 2
 *   ### Heading 3
 *   > Blockquote callouts (single-line or leading-">" block)
 *   | table | rows |   (GitHub-flavored pipe tables)
 *   - Unordered list items
 *   **bold** inline
 *   [link text](url) inline links
 *   \n\n paragraph breaks
 *
 * Used by: what-is-geo-search, geo-visibility-guide, llm-citation-tracker,
 *          5-high-citation-post-templates (resource pages only).
 */

import React from "react";

// ---------------------------------------------------------------------------
// Inline renderer: **bold** and [text](url)
// ---------------------------------------------------------------------------

function renderInline(text: string): React.ReactNode[] {
  // Split on **bold** markers and [link](url) patterns
  const parts: React.ReactNode[] = [];
  // Combined regex: **bold** or [text](url)
  const INLINE_RE = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = INLINE_RE.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(<span key={last}>{text.slice(last, match.index)}</span>);
    }
    if (match[1] !== undefined) {
      // **bold**
      parts.push(<strong key={match.index}>{match[1]}</strong>);
    } else if (match[2] !== undefined && match[3] !== undefined) {
      // [text](url)
      parts.push(
        <a
          key={match.index}
          href={match[3]}
          style={{
            color: "var(--color-primary)",
            textDecoration: "underline",
            textUnderlineOffset: "2px",
          }}
        >
          {match[2]}
        </a>
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    parts.push(<span key={last}>{text.slice(last)}</span>);
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Table renderer — GitHub-flavored pipe tables
// ---------------------------------------------------------------------------

function renderTable(lines: string[]): React.ReactElement {
  // Filter out the alignment row (---|---)
  const rows = lines.filter((l) => !/^\|[-:| ]+\|$/.test(l.trim()));
  const [headerLine, ...bodyLines] = rows;

  function parseCells(line: string): string[] {
    return line
      .split("|")
      .slice(1, -1) // remove leading/trailing empties from | cell | cell |
      .map((c) => c.trim());
  }

  const headers = parseCells(headerLine);

  return (
    <div
      style={{ overflowX: "auto", margin: "0 0 var(--space-5) 0" }}
      role="region"
      aria-label="Data table"
      tabIndex={0}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "var(--font-size-body-sm)",
          fontFamily: "var(--font-family)",
        }}
      >
        <thead>
          <tr
            style={{
              backgroundColor: "var(--color-teal-surface)",
              borderBottom: "2px solid var(--color-teal-border)",
            }}
          >
            {headers.map((h, i) => (
              <th
                key={i}
                scope="col"
                style={{
                  padding: "var(--space-2) var(--space-3)",
                  textAlign: "left",
                  fontWeight: 700,
                  color: "var(--color-text)",
                  whiteSpace: "nowrap",
                }}
              >
                {renderInline(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyLines.map((row, ri) => {
            const cells = parseCells(row);
            return (
              <tr
                key={ri}
                style={{
                  backgroundColor:
                    ri % 2 === 0
                      ? "var(--color-surface)"
                      : "var(--color-surface-muted)",
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                {cells.map((cell, ci) => (
                  <td
                    key={ci}
                    style={{
                      padding: "var(--space-2) var(--space-3)",
                      color: "var(--color-text)",
                      verticalAlign: "top",
                      lineHeight: 1.5,
                    }}
                  >
                    {renderInline(cell)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Block type detection
// ---------------------------------------------------------------------------

type Block =
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "blockquote"; lines: string[] }
  | { type: "table"; lines: string[] }
  | { type: "list"; items: string[] }
  | { type: "paragraph"; text: string }
  | { type: "hr" };

function parseBlocks(md: string): Block[] {
  // Split into \n\n-delimited chunks first
  const rawChunks = md.split(/\n\n+/);
  const blocks: Block[] = [];

  for (const chunk of rawChunks) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;

    const lines = trimmed.split("\n");
    const firstLine = lines[0].trim();

    // Horizontal rule
    if (/^---+$/.test(firstLine) && lines.length === 1) {
      blocks.push({ type: "hr" });
      continue;
    }

    // H2
    if (firstLine.startsWith("## ")) {
      blocks.push({ type: "h2", text: firstLine.slice(3) });
      continue;
    }

    // H3
    if (firstLine.startsWith("### ")) {
      blocks.push({ type: "h3", text: firstLine.slice(4) });
      continue;
    }

    // Table (every line starts with |)
    if (lines.every((l) => l.trim().startsWith("|"))) {
      blocks.push({ type: "table", lines });
      continue;
    }

    // Blockquote (every line starts with >)
    if (lines.every((l) => l.trim().startsWith("> ") || l.trim() === ">")) {
      blocks.push({
        type: "blockquote",
        lines: lines.map((l) => l.replace(/^>\s?/, "")),
      });
      continue;
    }

    // Unordered list (every line starts with - or * )
    if (lines.every((l) => /^\s*[-*]\s/.test(l))) {
      blocks.push({
        type: "list",
        items: lines.map((l) => l.replace(/^\s*[-*]\s+/, "")),
      });
      continue;
    }

    // Paragraph (default)
    blocks.push({ type: "paragraph", text: trimmed });
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ResourceMarkdownProps {
  /** Markdown-lite string. Supports ## h2, ### h3, > blockquote, | tables |,
   *  - lists, **bold**, [link](url), and \n\n paragraphs. */
  body: string;
  /** Optional base heading level for ## headings (defaults to h2). */
  h2Tag?: "h2" | "h3";
}

export function ResourceMarkdown({
  body,
  h2Tag = "h2",
}: ResourceMarkdownProps): React.ReactElement {
  const blocks = parseBlocks(body);

  return (
    <>
      {blocks.map((block, i) => {
        switch (block.type) {
          case "hr":
            return (
              <hr
                key={i}
                style={{
                  border: "none",
                  borderTop: "1px solid var(--color-border)",
                  margin: "var(--space-6) 0",
                }}
              />
            );

          case "h2": {
            const Tag = h2Tag;
            const fontSize =
              h2Tag === "h2"
                ? "var(--font-size-h2)"
                : "var(--font-size-h3)";
            return (
              <Tag
                key={i}
                style={{
                  fontSize,
                  fontWeight: 800,
                  letterSpacing: "-0.01em",
                  margin: "var(--space-6) 0 var(--space-3) 0",
                  color: "var(--color-text)",
                  fontFamily: "var(--font-family)",
                  lineHeight: 1.3,
                }}
              >
                {renderInline(block.text)}
              </Tag>
            );
          }

          case "h3":
            return (
              <h3
                key={i}
                style={{
                  fontSize: "var(--font-size-body)",
                  fontWeight: 700,
                  margin: "var(--space-5) 0 var(--space-2) 0",
                  color: "var(--color-text)",
                  fontFamily: "var(--font-family)",
                  lineHeight: 1.4,
                }}
              >
                {renderInline(block.text)}
              </h3>
            );

          case "blockquote":
            return (
              <blockquote
                key={i}
                style={{
                  margin: "0 0 var(--space-4) 0",
                  padding: "var(--space-3) var(--space-4)",
                  borderLeft: "4px solid var(--color-primary)",
                  backgroundColor: "var(--color-surface-muted)",
                  borderRadius: "0 var(--radius-sm) var(--radius-sm) 0",
                }}
              >
                {block.lines.map((line, li) => (
                  <p
                    key={li}
                    style={{
                      margin: li === 0 ? 0 : "var(--space-2) 0 0 0",
                      fontSize: "var(--font-size-body-sm)",
                      fontStyle: "italic",
                      color: "var(--color-text)",
                      lineHeight: 1.6,
                      fontFamily: "var(--font-family)",
                    }}
                  >
                    {renderInline(line)}
                  </p>
                ))}
              </blockquote>
            );

          case "table":
            return <React.Fragment key={i}>{renderTable(block.lines)}</React.Fragment>;

          case "list":
            return (
              <ul
                key={i}
                style={{
                  margin: "0 0 var(--space-4) 0",
                  paddingLeft: "var(--space-5)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-2)",
                }}
              >
                {block.items.map((item, li) => (
                  <li
                    key={li}
                    style={{
                      fontSize: "var(--font-size-body-sm)",
                      lineHeight: 1.65,
                      color: "var(--color-text)",
                      fontFamily: "var(--font-family)",
                    }}
                  >
                    {renderInline(item)}
                  </li>
                ))}
              </ul>
            );

          case "paragraph":
          default:
            return (
              <p
                key={i}
                style={{
                  margin: "0 0 var(--space-3) 0",
                  lineHeight: 1.7,
                  fontSize: "var(--font-size-body-sm)",
                  color: "var(--color-text)",
                  fontFamily: "var(--font-family)",
                }}
              >
                {renderInline(block.text)}
              </p>
            );
        }
      })}
    </>
  );
}
