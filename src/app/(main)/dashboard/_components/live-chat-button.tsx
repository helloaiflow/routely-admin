"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useUser } from "@clerk/nextjs";
import { IconArrowUp, IconMessageCircle2, IconX } from "@tabler/icons-react";
import { createPortal } from "react-dom";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ChatMessage = {
  id: string;
  from: "user" | "agent";
  text: string;
  time: string;
};

function timeLabel(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function LiveChatButton() {
  const { user } = useUser();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messageCount = messages.length;
  const firstName = user?.firstName || "there";

  // Drag state
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const didDrag = useRef(false);
  const dragStart = useRef<{ mx: number; my: number; bx: number; by: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Load saved position
  useEffect(() => {
    const saved = localStorage.getItem("chat-btn-pos");
    if (saved) {
      try {
        setPos(JSON.parse(saved));
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    if (open && messageCount === 0) {
      const t = setTimeout(() => {
        setMessages([
          {
            id: genId(),
            from: "agent",
            text: `Hi ${firstName}! I'm Sofia, your Routely support assistant. How can I help you today?`,
            time: timeLabel(),
          },
        ]);
      }, 600);
      return () => clearTimeout(t);
    }
  }, [open, messageCount, firstName]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: messageCount intentionally triggers scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messageCount]);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (open && typeof window !== "undefined" && window.innerWidth < 640) {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [open]);

  const send = useCallback(() => {
    const text = message.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { id: genId(), from: "user", text, time: timeLabel() }]);
    setMessage("");
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: genId(),
          from: "agent",
          text: "Thanks for reaching out! A member of our team will follow up shortly. For urgent issues, call us at (888) 920-1907.",
          time: timeLabel(),
        },
      ]);
    }, 1200);
  }, [message]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragStart.current = { mx: e.clientX, my: e.clientY, bx: pos.x, by: pos.y };
      didDrag.current = false;
      setDragging(true);
      btnRef.current?.setPointerCapture(e.pointerId);
    },
    [pos.x, pos.y],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging || !dragStart.current) return;
      const dx = e.clientX - dragStart.current.mx;
      const dy = e.clientY - dragStart.current.my;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag.current = true;
      setPos({ x: dragStart.current.bx + dx, y: dragStart.current.by + dy });
    },
    [dragging],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      setDragging(false);
      dragStart.current = null;
      btnRef.current?.releasePointerCapture(e.pointerId);
      localStorage.setItem("chat-btn-pos", JSON.stringify(pos));
    },
    [dragging, pos],
  );

  const handleClick = useCallback(() => {
    if (didDrag.current) return;
    setOpen((o) => !o);
  }, []);

  const hasCustomPos = pos.x !== 0 || pos.y !== 0;

  if (!mounted) return null;

  return createPortal(
    <>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close chat"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm sm:hidden"
          />
          <div className="fixed inset-x-3 top-20 bottom-3 z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl sm:inset-auto sm:top-auto sm:right-6 sm:bottom-24 sm:h-[480px] sm:w-[380px] sm:rounded-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-700 font-bold text-[10px] text-white">
                      S
                    </AvatarFallback>
                  </Avatar>
                  <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-background bg-emerald-500" />
                </div>
                <div>
                  <p className="font-semibold text-sm leading-tight">Sofia</p>
                  <p className="text-[11px] text-muted-foreground">Routely Support</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <IconX className="size-4" />
              </Button>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
              <div className="space-y-3">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.from === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${msg.from === "user" ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted text-foreground"}`}
                    >
                      <p>{msg.text}</p>
                      <p
                        className={`mt-1 text-[10px] ${msg.from === "user" ? "text-primary-foreground/60" : "text-muted-foreground"}`}
                      >
                        {msg.time}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="border-t px-3 py-2.5" style={{ paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
                className="flex items-center gap-2"
              >
                <Input
                  ref={inputRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="h-10 flex-1 text-base sm:h-9 sm:text-sm"
                  enterKeyHint="send"
                />
                <Button
                  type="submit"
                  size="icon"
                  className="size-10 shrink-0 rounded-full sm:size-9"
                  disabled={!message.trim()}
                  aria-label="Send message"
                >
                  <IconArrowUp className="size-4" />
                </Button>
              </form>
              <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
                Or call{" "}
                <a href="tel:+18889201907" className="font-medium underline underline-offset-2">
                  (888) 920-1907
                </a>
              </p>
            </div>
          </div>
        </>
      )}

      {!open && hover && !hasCustomPos && (
        <div className="pointer-events-none fixed right-[5.5rem] bottom-7 z-40 hidden items-center sm:flex">
          <div className="relative rounded-lg bg-foreground px-2.5 py-1.5 font-medium text-background text-xs shadow-md">
            Chat with us
            <div className="absolute top-1/2 right-0 size-2 translate-x-1/2 -translate-y-1/2 rotate-45 bg-foreground" />
          </div>
        </div>
      )}

      <button
        ref={btnRef}
        type="button"
        onClick={handleClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          bottom: hasCustomPos ? undefined : "max(5rem, calc(env(safe-area-inset-bottom) + 4.5rem))",
          right: hasCustomPos ? undefined : "1.5rem",
          transform: hasCustomPos ? `translate(${pos.x}px, ${pos.y}px)` : undefined,
          cursor: dragging ? "grabbing" : "grab",
          userSelect: "none",
          touchAction: "none",
        }}
        className="fixed right-4 z-50 hidden size-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-primary/20 transition-shadow hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:right-6 sm:flex sm:size-14"
        aria-label={open ? "Close chat" : "Open live chat"}
      >
        {open ? (
          <IconX className="size-6" />
        ) : (
          <div className="relative">
            <IconMessageCircle2 className="size-6" strokeWidth={2} />
            <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-primary bg-emerald-500" />
          </div>
        )}
      </button>
    </>,
    document.body,
  );
}
