import React, { useState, useEffect, useCallback } from "react";
import { Button } from "./ui/button";
import { Plus, MessageSquare, Loader2, FileCodeCorner } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Show,
  SignInButton,
  UserButton,
  useUser,
} from "@clerk/react";

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || "${VITE_BACKEND_URL}";

const Sidebar = ({ onNewChat, onSelectChat, currentChatId }) => {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const { isLoaded, isSignedIn, user } = useUser();

  const fetchChats = useCallback(async () => {
    if (isLoaded && isSignedIn && user) {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/chats/${user.id}`);
        const data = await res.json();
        setChats(data.chats || []);
      } catch (err) {
        console.error("Failed to fetch chats:", err);
      } finally {
        setLoading(false);
      }
    }
  }, [isLoaded, isSignedIn, user]);

  useEffect(() => {
    fetchChats();
    window.addEventListener("refreshChats", fetchChats);
    return () => window.removeEventListener("refreshChats", fetchChats);
  }, [fetchChats]);

  const handleNewChat = async () => {
    if (!isSignedIn || !user) return;
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/chats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clerkId: user.id, title: "New Chat" }),
      });
      const data = await res.json();
      const newChatId = data.chat.id;
      await fetchChats();
      onNewChat(newChatId);
    } catch (err) {
      console.error("Failed to create chat:", err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <aside
      className="w-64 h-screen p-4 flex flex-col shrink-0"
      style={{ background: "#0d0d0d", borderRight: "1px solid #1e1e1e" }}
    >
      {/* Brand */}
      <div
        className="font-bold text-xl mb-6 px-2 tracking-tighter"
        style={{ color: "#e5e5e5" }}
      >
        Intellix.
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-2 mb-4">
        <button
          onClick={handleNewChat}
          disabled={creating}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors disabled:opacity-40 cursor-pointer"
          style={{
            background: "#1a1a1a",
            border: "1px solid #2a2a2a",
            color: "#aaaaaa",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = "#222222";
            e.currentTarget.style.color = "#e5e5e5";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = "#1a1a1a";
            e.currentTarget.style.color = "#aaaaaa";
          }}
        >
          {creating
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Plus className="w-4 h-4" />
          }
          {creating ? "Creating..." : "New Chat"}
        </button>

        <Link to="/private" className="w-full">
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors cursor-pointer"
            style={{
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              color: "#aaaaaa",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = "#222222";
              e.currentTarget.style.color = "#e5e5e5";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "#1a1a1a";
              e.currentTarget.style.color = "#aaaaaa";
            }}
          >
            <FileCodeCorner className="w-4 h-4" />
            File Space
          </button>
        </Link>
      </div>

      {/* Divider */}
      <div style={{ borderTop: "1px solid #1e1e1e", marginBottom: "12px" }} />

      {/* History label */}
      <p
        className="text-xs font-semibold uppercase px-2 mb-2 tracking-wider"
        style={{ color: "#3a3a3a" }}
      >
        History
      </p>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto space-y-0.5 custom-scrollbar">
        {loading ? (
          <div className="flex justify-center mt-6">
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#444444" }} />
          </div>
        ) : chats.length === 0 ? (
          <p className="text-xs px-2 mt-2" style={{ color: "#3a3a3a" }}>
            No chats yet.
          </p>
        ) : (
          chats.map((chat) => {
            const isActive = currentChatId === chat.id;
            return (
              <button
                key={chat.id}
                onClick={() => onSelectChat(chat.id)}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-all truncate text-left cursor-pointer"
                style={{
                  background: isActive ? "#1f1f1f" : "transparent",
                  color: isActive ? "#e5e5e5" : "#555555",
                  border: isActive ? "1px solid #2a2a2a" : "1px solid transparent",
                  fontWeight: isActive ? 500 : 400,
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = "#161616";
                    e.currentTarget.style.color = "#aaaaaa";
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "#555555";
                  }
                }}
              >
                <MessageSquare
                  className="w-4 h-4 shrink-0"
                  style={{ color: isActive ? "#888888" : "#333333" }}
                />
                <span className="truncate">{chat.title || "Untitled Chat"}</span>
              </button>
            );
          })
        )}
      </div>

      {/* User profile footer — pinned to bottom */}
      <div
        className="pt-3 mt-2"
      >
        <Show when="signed-in">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg">
            <UserButton afterSignOutUrl="/" />
            <div className="flex flex-col min-w-0 cursor-pointer">
              <span
                className="text-sm font-medium truncate"
                style={{ color: "#e5e5e5" }}
              >
                {user?.fullName || user?.firstName || "User"}
              </span>
            </div>
          </div>
        </Show>
        <Show when="signed-out">
          <SignInButton mode="modal">
            <div className="flex justify-center">
            <Button
              variant="outline"
              className="bg-[#3a3a3a] border-[#2a2a2a] text-[#e5e5e5] rounded-3xl p-5 cursor-pointer"
            >
              Log in
            </Button>
            </div>
          </SignInButton>
        </Show>
      </div>
    </aside>
  );
};

export default Sidebar;