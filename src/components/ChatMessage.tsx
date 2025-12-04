"use client";

import { ChatMessage as ChatMessageType } from "@/types";

interface Props {
  message: ChatMessageType;
}

export function ChatMessage({ message }: Props) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3 animate-slide-up`}
    >
      <div
        className={`
          max-w-[85%] rounded-2xl px-4 py-3
          transform transition-all duration-200 ease-out
          hover:scale-[1.01] active:scale-[0.99]
          ${isUser
            ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-br-sm shadow-lg shadow-blue-500/20"
            : "bg-white text-gray-800 rounded-bl-sm shadow-md border border-gray-100"
          }
        `}
      >
        <div className="whitespace-pre-wrap text-[15px] leading-relaxed">
          {message.content.split("\n").map((line, i) => {
            // Handle markdown-like bold and italic
            const parts = line.split(/(\*\*.*?\*\*|_.*?_)/g);
            return (
              <p key={i} className={i > 0 ? "mt-2" : ""}>
                {parts.map((part, j) => {
                  if (part.startsWith("**") && part.endsWith("**")) {
                    return (
                      <strong key={j} className="font-semibold">{part.slice(2, -2)}</strong>
                    );
                  }
                  if (part.startsWith("_") && part.endsWith("_")) {
                    return (
                      <em key={j} className="opacity-80">{part.slice(1, -1)}</em>
                    );
                  }
                  return part;
                })}
              </p>
            );
          })}
        </div>
        <div
          className={`text-[11px] mt-2 flex items-center gap-1 ${
            isUser ? "text-blue-200" : "text-gray-400"
          }`}
          suppressHydrationWarning
        >
          <span>
            {message.timestamp.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {isUser && (
            <svg className="w-3.5 h-3.5 text-blue-200" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}
