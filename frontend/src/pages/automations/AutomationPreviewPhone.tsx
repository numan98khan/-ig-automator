import React from 'react';
import {
  Phone,
  Video,
  Info,
  Smile,
  Mic,
  Image as ImageIcon,
  Plus,
  Send,
} from 'lucide-react';

export type PreviewMessage = {
  id: string;
  from: 'customer' | 'ai';
  text: string;
};

type AutomationPreviewPhoneProps = {
  accountDisplayName: string;
  accountHandle: string;
  accountAvatarUrl?: string;
  accountInitial: string;
  messages: PreviewMessage[];
  emptyStateText?: string;
  showSeen?: boolean;
  mode: 'interactive' | 'static';
  inputValue?: string;
  onInputChange?: (value: string) => void;
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  onInputFocus?: () => void;
  onInputBlur?: () => void;
  inputDisabled?: boolean;
  sendDisabled?: boolean;
};

export const AutomationPreviewPhone: React.FC<AutomationPreviewPhoneProps> = ({
  accountDisplayName,
  accountHandle,
  accountAvatarUrl,
  accountInitial,
  messages,
  emptyStateText = 'No messages yet. Start the conversation below.',
  showSeen = false,
  mode,
  inputValue = '',
  onInputChange,
  onSubmit,
  onInputFocus,
  onInputBlur,
  inputDisabled = false,
  sendDisabled = false,
}) => (
  <div className="font-instagram bg-[#0b0d10] rounded-[34px] border border-[#1f2937] overflow-hidden shadow-sm h-full w-full flex flex-col min-h-0">
    <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-[#0f1215]">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full overflow-hidden bg-[#1f2937] flex items-center justify-center text-xs font-semibold text-white">
          {accountAvatarUrl ? (
            <img
              src={accountAvatarUrl}
              alt={accountDisplayName}
              className="h-full w-full object-cover"
            />
          ) : (
            accountInitial
          )}
        </div>
        <div className="flex flex-col max-w-[160px]">
          <span className="text-sm font-semibold text-white truncate">
            {accountDisplayName}
          </span>
          <span className="text-xs text-white/60 truncate">
            {accountHandle}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3 text-white/80">
        <Phone className="w-4 h-4" />
        <Video className="w-4 h-4" />
        <Info className="w-4 h-4" />
      </div>
    </div>
    <div className="px-4 py-4 space-y-3 flex-1 min-h-0 overflow-y-auto bg-[#0b0d10]">
      {messages.length === 0 ? (
        <div className="text-xs text-white/50 text-center py-20">
          {emptyStateText}
        </div>
      ) : (
        messages.map((msg) => {
          const isUser = msg.from === 'customer';
          return (
            <div
              key={msg.id}
              className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm leading-snug ${
                  isUser
                    ? 'rounded-br-md bg-[#3797f0] text-white'
                    : 'rounded-bl-md bg-[#262626] text-white/90'
                }`}
              >
                {msg.text}
              </div>
            </div>
          );
        })
      )}
      {showSeen && (
        <div className="text-xs text-white/50 text-right pr-2">Seen</div>
      )}
    </div>
    <div className="p-3 border-t border-white/5 bg-[#0f1215]">
      {mode === 'interactive' ? (
        <form
          onSubmit={onSubmit} // Submit test messages in templates
          className="flex items-center gap-2 px-3 py-2 rounded-full border border-white/10 bg-[#15181c] text-white/70"
        >
          <button type="button" className="text-white/70 hover:text-white">
            <Smile className="w-4 h-4" />
          </button>
          <input
            value={inputValue}
            onChange={(event) => onInputChange?.(event.target.value)}
            onFocus={() => onInputFocus?.()}
            onBlur={() => onInputBlur?.()}
            placeholder="Message..."
            disabled={inputDisabled}
            className="flex-1 bg-transparent text-base text-white/90 placeholder:text-white/40 focus:outline-none"
          />
          <button type="button" className="text-white/70 hover:text-white">
            <Mic className="w-4 h-4" />
          </button>
          <button type="button" className="text-white/70 hover:text-white">
            <ImageIcon className="w-4 h-4" />
          </button>
          <button
            type="submit"
            disabled={sendDisabled}
            className="h-8 w-8 rounded-full bg-[#3797f0] text-white flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed"
            aria-label="Send"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2 rounded-full border border-white/10 bg-[#15181c] text-white/70">
          <Smile className="w-4 h-4" />
          <input
            disabled
            placeholder="Message..."
            className="flex-1 bg-transparent text-base text-white/80 placeholder:text-white/40 focus:outline-none"
          />
          <Mic className="w-4 h-4" />
          <ImageIcon className="w-4 h-4" />
          <Plus className="w-4 h-4" />
        </div>
      )}
    </div>
  </div>
);
