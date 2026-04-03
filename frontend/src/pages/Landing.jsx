import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowRight, User, Bot, Copy, Check } from "lucide-react";
import {
  Show,
  SignInButton,
  UserButton,
  useUser,
} from "@clerk/react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import Sidebar from "@/components/Sidebar";
import { Spotlight } from "@/components/ui/spotlight-new";

const CodeBlock = ({ language, value }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group rounded-lg overflow-hidden my-3"
      style={{ border: "1px solid #2a2a2a" }}>
      <div className="flex items-center justify-between px-4 py-2"
        style={{ background: "#111111", borderBottom: "1px solid #2a2a2a" }}>
        <span className="text-[11px] font-mono uppercase tracking-wider"
          style={{ color: "#666666" }}>
          {language || "code"}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[11px] transition-colors"
          style={{ color: copied ? "#888888" : "#555555" }}
        >
          {copied ? (
            <>
              <Check className="w-3 h-3" style={{ color: "#888888" }} />
              <span style={{ color: "#888888" }}>Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <SyntaxHighlighter
        language={language || "text"}
        style={oneDark}
        customStyle={{
          margin: 0,
          borderRadius: 0,
          fontSize: "0.8rem",
          padding: "1rem",
          background: "#0d0d0d",
        }}
        showLineNumbers
      >
        {value}
      </SyntaxHighlighter>
    </div>
  );
};

const markdownComponents = {
  code({ node, inline, className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "");
    const value = String(children).replace(/\n$/, "");

    if (!inline && (match || value.includes("\n"))) {
      return <CodeBlock language={match?.[1]} value={value} />;
    }

    return (
      <code
        className="px-1.5 py-0.5 rounded text-[0.8em] font-mono"
        style={{ background: "#1e1e1e", color: "#cccccc" }}
        {...props}
      >
        {children}
      </code>
    );
  },
  p: ({ children }) => (
    <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }) => (
    <h1 className="text-lg font-bold mb-2 mt-3" style={{ color: "#e5e5e5" }}>
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-base font-bold mb-2 mt-3" style={{ color: "#e5e5e5" }}>
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-bold mb-1 mt-2" style={{ color: "#e5e5e5" }}>
      {children}
    </h3>
  ),
  blockquote: ({ children }) => (
    <blockquote
      className="pl-3 italic my-2"
      style={{ borderLeft: "4px solid #3a3a3a", color: "#777777" }}
    >
      {children}
    </blockquote>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold" style={{ color: "#e5e5e5" }}>
      {children}
    </strong>
  ),
};

export default function Landing({ currentChatId, setCurrentChatId }) {
  const [prompt, setPrompt] = useState("");
  const [domain, setDomain] = useState("general");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);
  const { isLoaded, isSignedIn, user } = useUser();

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Sync user profile with backend
  useEffect(() => {
    if (isLoaded && isSignedIn && user) {
      fetch("http://localhost:5000/api/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clerkId: user.id,
          name: user.fullName,
          email: user.primaryEmailAddress?.emailAddress,
          imageUrl: user.imageUrl,
        }),
      }).catch((err) => console.error("Sync failed:", err));
    }
  }, [isLoaded, isSignedIn, user]);

  // Load messages when chat changes
  useEffect(() => {
    const loadMessages = async () => {
      if (!currentChatId) {
        setMessages([]);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(
          `http://localhost:5000/api/messages/${currentChatId}`
        );
        const data = await res.json();
        setMessages(data.messages || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadMessages();
  }, [currentChatId]);

  const handleSubmit = async () => {
    if (!prompt.trim() || !isSignedIn) return;

    const currentPrompt = prompt;
    setPrompt("");
    setMessages((prev) => [...prev, { role: "user", content: currentPrompt }]);
    setLoading(true);

    try {
      let chatId = currentChatId;

      if (!chatId) {
        const chatRes = await fetch("http://localhost:5000/api/chats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clerkId: user.id,
            title: currentPrompt.slice(0, 30),
          }),
        });
        const chatData = await chatRes.json();
        chatId = chatData.chat.id;
        setCurrentChatId(chatId);
        window.dispatchEvent(new Event("refreshChats"));
      } else {
        if (messages.length === 0) {
          await fetch(`http://localhost:5000/api/chats/${chatId}/title`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: currentPrompt.slice(0, 30) }),
          });
          window.dispatchEvent(new Event("refreshChats"));
        }
      }

      // Save user message
      await fetch("http://localhost:5000/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId,
          role: "user",
          content: currentPrompt,
          domain,
        }),
      });

      // Get AI response
      const aiRes = await fetch("http://localhost:5000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: currentPrompt, domain, chatId }),
      });
      const aiData = await aiRes.json();

      // Save AI message
      await fetch("http://localhost:5000/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId,
          role: "assistant",
          content: aiData.answer,
          domain: aiData.domain,
        }),
      });

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: aiData.answer, domain: aiData.domain },
      ]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#0a0a0a" }}>
      <Sidebar
        currentChatId={currentChatId}
        onNewChat={(newChatId) => {
          setCurrentChatId(newChatId);
          setMessages([]);
        }}
        onSelectChat={(id) => setCurrentChatId(id)}
      />

      <div
        className="flex flex-col flex-1 overflow-hidden"
        style={{ background: "#0a0a0a" }}
      >
        {/* Header */}
        <header
          className="px-6 py-4 flex justify-end shrink-0"
          style={{
            borderBottom: "1px solid #1e1e1e",
            background: "rgba(10,10,10,0.85)",
            backdropFilter: "blur(8px)",
          }}
        >
          <Show when="signed-in">
            <UserButton afterSignOutUrl="/" />
          </Show>
          <Show when="signed-out">
            <SignInButton mode="modal">
              <Button
                variant="ghost"
                className="text-sm transition-colors cursor-pointer"
                style={{ color: "#888888" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#e5e5e5")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#888888")}
              >
                Log in
              </Button>
            </SignInButton>
          </Show>
        </header>

        {/* Chat area — fixed layout, no flex juggling */}
        <main
          className="flex-1 overflow-y-auto relative"
          style={{ background: "#0a0a0a" }}
        >
          <Spotlight
            gradientFirst="radial-gradient(68.54% 68.72% at 55.02% 31.46%, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 100%)"
            gradientSecond="radial-gradient(50% 50% at 50% 50%, rgba(200,200,200,0.03) 0%, rgba(200,200,200,0) 100%)"
            gradientThird="radial-gradient(50% 50% at 50% 50%, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0) 100%)"
          />

          {messages.length === 0 && !loading ? (
            /* Empty state — centered */
            <div
              className="flex flex-col items-center justify-center text-center px-6"
              style={{ height: "100%" }}
            >
              <h1
                className="text-5xl font-bold tracking-tight mb-4"
                style={{ color: "#e5e5e5" }}
              >
                How can I help?
              </h1>
              <p className="text-lg" style={{ color: "#555555" }}>
                Ask me anything, and I'll assist you with knowledge across
                various domains.
              </p>
            </div>
          ) : (
            /* Message list — scrolls naturally */
            <div className="w-full max-w-4xl mx-auto px-6 py-8 space-y-6">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-3 ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {msg.role === "assistant" && (
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-1"
                      style={{
                        background: "#1e1e1e",
                        border: "1px solid #2a2a2a",
                      }}
                    >
                      <Bot className="w-5 h-5" style={{ color: "#888888" }} />
                    </div>
                  )}

                  <div
                    className={`px-4 py-3 rounded-xl text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "max-w-[75%] rounded-br-none"
                        : "w-full rounded-bl-none"
                    }`}
                    style={
                      msg.role === "user"
                        ? {
                            background: "#1f1f1f",
                            color: "#e5e5e5",
                            border: "1px solid #2a2a2a",
                          }
                        : {
                            background: "#111111",
                            color: "#cccccc",
                            border: "1px solid #1e1e1e",
                          }
                    }
                  >
                    {msg.role === "assistant" ? (
                      <div className="space-y-2">
                        {msg.domain && (
                          <span
                            className="inline-flex items-center text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                            style={{
                              background: "#1a1a1a",
                              color: "#666666",
                              border: "1px solid #2a2a2a",
                            }}
                          >
                            {msg.domain}
                          </span>
                        )}
                        <ReactMarkdown components={markdownComponents}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p style={{ color: "#e5e5e5" }}>{msg.content}</p>
                    )}
                  </div>

                  {msg.role === "user" && (
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-1"
                      style={{
                        background: "#1a1a1a",
                        border: "1px solid #2a2a2a",
                      }}
                    >
                      <User className="w-5 h-5" style={{ color: "#666666" }} />
                    </div>
                  )}
                </div>
              ))}

              {/* Loading dots */}
              {loading && (
                <div className="flex gap-3 items-center">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{
                      background: "#1e1e1e",
                      border: "1px solid #2a2a2a",
                    }}
                  >
                    <Bot className="w-5 h-5" style={{ color: "#888888" }} />
                  </div>
                  <div className="flex gap-1">
                    {[0, 150, 300].map((delay) => (
                      <div
                        key={delay}
                        className="h-2 w-2 rounded-full animate-bounce"
                        style={{
                          background: "#444444",
                          animationDelay: `${delay}ms`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Scroll anchor */}
              <div ref={scrollRef} />
            </div>
          )}
        </main>

        {/* Footer */}
        <footer
          className="px-6 py-4 shrink-0"
          style={{ borderTop: "1px solid #1e1e1e", background: "#0d0d0d" }}
        >
          <div
            className="max-w-4xl mx-auto flex items-center gap-3 px-4 py-3 rounded-lg"
            style={{ background: "#111111", border: "1px solid #222222" }}
          >
            <Select value={domain} onValueChange={setDomain}>
              <SelectTrigger
                className="w-32 border-none bg-transparent text-sm focus:ring-0"
                style={{ color: "#555555" }}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                style={{
                  background: "#111111",
                  border: "1px solid #2a2a2a",
                }}
              >
                {["general", "technology", "finance", "healthcare", "legal"].map(
                  (d) => (
                    <SelectItem
                      key={d}
                      value={d}
                      className="capitalize text-sm cursor-pointer"
                      style={{ color: "#aaaaaa" }}
                    >
                      {d}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>

            <Input
              className="border-none bg-transparent focus-visible:ring-0 text-sm flex-1"
              style={{ color: "#e5e5e5" }}
              placeholder="Ask anything..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />

            <Button
              onClick={handleSubmit}
              disabled={loading || !prompt.trim()}
              className="rounded-lg shrink-0 transition-colors disabled:opacity-30"
              style={{ background: "#e5e5e5", color: "#0a0a0a" }}
            >
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}