import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { User, Bot, Terminal } from 'lucide-react';

export function ChatMessage({ message }) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  const getMessageClass = () => {
    if (isUser) return 'user';
    if (isSystem) return 'system';
    return 'assistant';
  };

  const getAvatar = () => {
    if (isUser) return <User size={20} />;
    if (isSystem) return <Terminal size={20} />;
    return <Bot size={20} />;
  };

  return (
    <div className={`chat-message ${getMessageClass()}`}>
      <div className="message-avatar">
        {getAvatar()}
      </div>
      <div className="message-content">
        {isUser ? (
          <p>{message.content}</p>
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ node, inline, className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || '');
                return !inline && match ? (
                  <SyntaxHighlighter
                    style={oneDark}
                    language={match[1]}
                    PreTag="div"
                    {...props}
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                ) : (
                  <code className={className} {...props}>
                    {children}
                  </code>
                );
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
}
