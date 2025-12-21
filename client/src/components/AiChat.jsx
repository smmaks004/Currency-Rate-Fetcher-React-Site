import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import './AiChat.css';

// Persistent toggleable AI chat panel (streams responses from backend)
function AiChat() {
  const [open, setOpen] = useState(false);

  const { t } = useTranslation();

  const [aiMessages, setAiMessages] = useState(() => [
    { role: 'system', content: t('aiChat.system') }
  ]);
  const [aiInput, setAiInput] = useState('');
  const [aiSending, setAiSending] = useState(false);
  const [aiError, setAiError] = useState('');

  const aiWordQueueRef = useRef([]);
  const aiFlushTimerRef = useRef(null);
  const logRef = useRef(null);

  useEffect(() => {
    return () => {
      if (aiFlushTimerRef.current) {
        clearInterval(aiFlushTimerRef.current);
        aiFlushTimerRef.current = null;
      }
    };
  }, []);

  // Keep log scrolled to bottom whenever messages change
  useEffect(() => {
    const el = logRef.current;
    if (el) {
      // small timeout to wait for DOM updates while streaming
      setTimeout(() => { el.scrollTop = el.scrollHeight; }, 0);
    }
  }, [aiMessages]);

  const tokenize = (s) => (typeof s === 'string' ? s.split(/(\s+)/).filter(Boolean) : []);

  const ensureFlushTimer = (assistantId) => {
    if (aiFlushTimerRef.current) return;
    aiFlushTimerRef.current = setInterval(() => {
      const part = aiWordQueueRef.current.shift();
      if (!part) {
        clearInterval(aiFlushTimerRef.current);
        aiFlushTimerRef.current = null;
        return;
      }

      setAiMessages((prev) => prev.map((m) => {
        if (m && m.id === assistantId) return { ...m, content: (m.content || '') + part };
        return m;
      }));
    }, 35);
  };

  const onSendAi = async () => {
    const text = aiInput.trim();
    if (!text || aiSending) return;

    setAiError('');
    setAiSending(true);

    const assistantId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const nextMessages = [...aiMessages, { role: 'user', content: text }, { role: 'assistant', content: '', id: assistantId }];
    setAiMessages(nextMessages);
    setAiInput('');

    try {
      const res = await fetch('/api/ai/chat-stream', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages.filter((m) => m.role !== 'assistant' || m.id !== assistantId) })
      });

      if (res.status === 401) {
        setAiError(t('aiChat.error.unauthorized'));
        return;
      }

      if (!res.ok || !res.body) {
        const bodyText = await res.text().catch(() => '');
        setAiError(bodyText || t('aiChat.error.requestFailed'));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buf = '';
      let sawAnyDelta = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        while (true) {
          const nl = buf.indexOf('\n');
          if (nl === -1) break;

          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;

          let obj = null;
          try { obj = JSON.parse(line); } catch { obj = null; }
          if (!obj) continue;

          if (obj.error) {
            setAiError(typeof obj.details === 'string' && obj.details ? `${obj.error}: ${obj.details}` : obj.error);
            return;
          }

          if (obj.delta) {
            sawAnyDelta = true;
            aiWordQueueRef.current.push(...tokenize(obj.delta));
            ensureFlushTimer(assistantId);
          }

          if (obj.done) {
            ensureFlushTimer(assistantId);
            break;
          }
        }
      }

      if (!sawAnyDelta) {
        setAiMessages((prev) => prev.map((m) => {
          if (m && m.id === assistantId) return { ...m, content: '(empty response)' };
          return m;
        }));
      }
    } catch (e) {
      setAiError(t('aiChat.error.network'));
    } finally {
      setAiSending(false);
    }
  };

  return (
    <div className={`persistent-panel ${open ? 'open' : 'closed'}`} aria-hidden="false">
      <button
        className={`pp-toggle ${open ? 'open' : 'closed'}`}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label={open ? t('aiChat.ariaClose') : t('aiChat.ariaOpen')}
      >
        <span className="pp-triangle" />
      </button>

      <div className="pp-body" role="region" aria-live="polite">
        <div className="pp-header">{t('aiChat.header')}</div>
        <div className="pp-content ai-chat">
          <div ref={logRef} className="ai-chat-log" role="log" aria-label={t('aiChat.chatMessagesAria')}>
            {aiMessages.filter((m) => m.role !== 'system').map((m, idx) => (
              <div key={idx} className={`ai-chat-line ai-chat-line--${m.role}`}>
                <strong className="ai-chat-role">{m.role === 'user' ? t('aiChat.role.you') : t('aiChat.role.assistant')}:</strong>
                <span className="ai-chat-content">{m.content}</span>
              </div>
            ))}
          </div>

          <div className="ai-chat-controls">
              <textarea
              className="input-medium ai-chat-input"
              rows={3}
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              placeholder={t('aiChat.placeholder')}
              disabled={aiSending}
            />

            <div className="ai-chat-actions">
              <button className="btn-primary" onClick={onSendAi} disabled={aiSending || !aiInput.trim()}>
                {aiSending ? t('aiChat.sending') : t('aiChat.send')}
              </button>
              <button
                className="btn-ghost"
                onClick={() => { setAiMessages([{ role: 'system', content: t('aiChat.system') }]); setAiError(''); }}
                disabled={aiSending}
              >
                {t('aiChat.clear')}
              </button>
            </div>
          </div>

          {aiError && <div className="message message--error">{aiError}</div>}
        </div>
      </div>
    </div>
  );
}

export default React.memo(AiChat);
