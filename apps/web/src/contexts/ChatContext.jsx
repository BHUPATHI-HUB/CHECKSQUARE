import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from './AuthContext.jsx';
import pb from '@/lib/pocketbaseClient.js';

const ChatContext = createContext(null);

export const useChatContext = () => {
  const context = useContext(ChatContext);
  if (!context) throw new Error('useChatContext must be used within ChatProvider');
  return context;
};

/**
 * ChatProvider — owns chat list, message cache per chat, and an inspection
 * metadata cache so the chat header can show the property address as the
 * group chat name without N+1 API calls.
 *
 * Performance fixes (May 2026):
 *  - Drop the per-chat double-query inside calculateUnreadCount. We now
 *    derive unread from a single in-memory map of message-id -> chatId,
 *    populated lazily as the user opens chats. Realtime subscriptions only
 *    refetch the chat that received the new message, never all chats.
 *  - subscribeToMessages is per-chat, key'd by chatId so we don't blow away
 *    open subscriptions when navigating between threads.
 *  - getChats no longer cascades into per-chat fetches.
 */
export const ChatProvider = ({ children }) => {
  const { user } = useAuth();
  const [chats, setChats] = useState([]);
  const [messages, setMessages] = useState({}); // { chatId: Message[] }
  const [inspectionsMap, setInspectionsMap] = useState({}); // { inspectionId: { propertyAddress, ... } }
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const subscriptions = useRef({}); // { chatId: unsub }

  // ─── Fetch & cache the chat list ───────────────────────────────────────
  const getChats = useCallback(async () => {
    if (!user) return;
    try {
      const records = await pb.collection('chats').getFullList({
        filter: `participants ~ "${user.id}"`,
        expand: 'participants',
        sort: '-updated',
        $autoCancel: false,
      });
      // Normalize `participants` to always be an array. Rows created before
      // migration 1779500003 (when the field was maxSelect=1) may come back
      // as a bare string instead of an array of ids, which would break
      // every `chat.participants.includes(...)` call downstream.
      const normalized = records.map((c) => ({
        ...c,
        participants: Array.isArray(c.participants)
          ? c.participants
          : (c.participants ? [c.participants] : []),
      }));
      setChats(normalized);

      // Backfill inspection metadata for any new inspectionIds we haven't seen.
      // Use setState callback to read latest inspectionsMap without making it a
      // hook dep (would cause getChats identity to change → cascading re-renders
      // and chat-list "blink").
      setInspectionsMap((current) => {
        const missing = [...new Set(
          records.map((c) => c.inspectionId).filter((id) => id && !current[id]),
        )];
        if (missing.length === 0) return current;
        Promise.allSettled(
          missing.map((id) =>
            pb.collection('inspections').getOne(id, { fields: 'id,metadata' }),
          ),
        ).then((fetched) => {
          setInspectionsMap((prev) => {
            const next = { ...prev };
            fetched.forEach((r, i) => {
              if (r.status === 'fulfilled') next[missing[i]] = r.value;
            });
            return next;
          });
        });
        return current;
      });
    } catch (error) {
      if (!String(error?.message || '').includes('autocancel')) {
        console.error('Error fetching chats:', error);
      }
    }
  }, [user]);

  // ─── Fetch & cache messages for a chat ─────────────────────────────────
  const getMessages = useCallback(async (chatId) => {
    if (!user || !chatId) return [];
    try {
      const records = await pb.collection('messages').getFullList({
        filter: `chatId = "${chatId}"`,
        sort: 'created',
        $autoCancel: false,
      });
      setMessages((prev) => ({ ...prev, [chatId]: records }));
      return records;
    } catch (error) {
      if (!String(error?.message || '').includes('autocancel')) {
        console.error('Error fetching messages:', error);
      }
      return [];
    }
  }, [user]);

  // ─── Unread count derived from message cache (no extra API calls) ──────
  const unreadCount = useMemo(() => {
    if (!user) return 0;
    let total = 0;
    for (const chatId of Object.keys(messages)) {
      const list = messages[chatId] || [];
      for (const m of list) {
        if (m.senderId !== user.id && (!m.readBy || !m.readBy.includes(user.id))) {
          total++;
        }
      }
    }
    return total;
  }, [messages, user]);

  // ─── Send a message (optionally with attachments) ──────────────────────
  const sendMessage = useCallback(async (chatId, content, attachments = []) => {
    if (!user || !chatId) return;
    if (!content?.trim() && (!attachments || attachments.length === 0)) return;
    try {
      const form = new FormData();
      form.append('chatId', chatId);
      form.append('senderId', user.id);
      form.append('senderName', user.name || user.email);
      // schema enum: Admin / Inspector / Customer (capitalized)
      const role = (user.role || 'customer').charAt(0).toUpperCase() + (user.role || 'customer').slice(1);
      form.append('senderRole', ['Admin', 'Inspector', 'Customer'].includes(role) ? role : 'Customer');
      form.append('content', content?.trim() || '📎 Attachment');
      form.append('readBy', JSON.stringify([user.id]));
      (attachments || []).forEach((f) => form.append('attachments', f));

      await pb.collection('messages').create(form, { $autoCancel: false });
      // Bump the chat's updated timestamp so it floats to the top.
      await pb.collection('chats').update(chatId, { updated: new Date().toISOString() }, { $autoCancel: false });
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }, [user]);

  // ─── Mark a chat's messages as read (single bulk update) ──────────────
  // Stable identity — reads messages via setState callback so this callback
  // never changes when the messages cache updates. Prevents downstream
  // useEffect re-runs (which were causing the chat loader to blink).
  const markAsRead = useCallback(async (chatId) => {
    if (!user || !chatId) return;
    let unread = [];
    setMessages((prev) => {
      const list = prev[chatId] || [];
      unread = list.filter((m) => m.senderId !== user.id && (!m.readBy || !m.readBy.includes(user.id)));
      if (unread.length === 0) return prev;
      // Optimistic local update
      return {
        ...prev,
        [chatId]: list.map((m) =>
          unread.find((u) => u.id === m.id)
            ? { ...m, readBy: [...(m.readBy || []), user.id] }
            : m,
        ),
      };
    });
    if (unread.length === 0) return;
    try {
      await Promise.allSettled(
        unread.map((m) =>
          pb.collection('messages').update(
            m.id,
            { readBy: [...(m.readBy || []), user.id] },
            { $autoCancel: false },
          ),
        ),
      );
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  }, [user]);

  // ─── Create a chat (avoid duplicate direct chats) ─────────────────────
  // Read `chats` via ref to keep the callback identity stable; otherwise
  // every chat-list update would re-create createChat and cascade re-renders.
  const chatsRef = useRef([]);
  useEffect(() => { chatsRef.current = chats; }, [chats]);

  const createChat = useCallback(async (participants, type = 'direct', inspectionId = '') => {
    if (!user) return null;
    try {
      if (type === 'direct' && participants.length === 2) {
        const existing = chatsRef.current.find(
          (c) =>
            c.type === 'direct' &&
            (c.participants || []).length === 2 &&
            (c.participants || []).includes(participants[0]) &&
            (c.participants || []).includes(participants[1])
        );
        if (existing) return existing;
      }
      const newChat = await pb.collection('chats').create(
        { type, participants, inspectionId },
        { $autoCancel: false }
      );
      await getChats();
      return newChat;
    } catch (error) {
      console.error('Error creating chat:', error);
      return null;
    }
  }, [user, getChats]);

  // ─── Delete (for everyone) — admin / inspector / sender ───────────────
  // Hard delete from PocketBase. PB rules (migration 1779600001) gate this
  // server-side; the UI just calls and reacts. Realtime subscribers receive
  // a 'delete' event and the row vanishes from every participant's view.
  const canDeleteMessage = useCallback((msg) => {
    if (!user || !msg) return false;
    if (user.role === 'admin' || user.role === 'inspector') return true;
    return msg.senderId === user.id;
  }, [user]);

  const canDeleteChat = useCallback((chat) => {
    if (!user || !chat) return false;
    if (user.role === 'admin' || user.role === 'inspector') return true;
    return (chat.participants || []).includes(user.id);
  }, [user]);

  const deleteMessage = useCallback(async (messageId, chatId) => {
    if (!messageId) return false;
    try {
      await pb.collection('messages').delete(messageId, { $autoCancel: false });
      setMessages((prev) => ({
        ...prev,
        [chatId]: (prev[chatId] || []).filter((m) => m.id !== messageId),
      }));
      return true;
    } catch (error) {
      console.error('Error deleting message:', error);
      throw error;
    }
  }, []);

  const deleteChat = useCallback(async (chatId) => {
    if (!chatId) return false;
    try {
      // messages.chatId has cascadeDelete=true (migration 1779600003), so
      // PocketBase atomically removes every message when the chat row is
      // deleted. No need to delete each message client-side, which would
      // also fail for messages the actor doesn't own.
      await pb.collection('chats').delete(chatId, { $autoCancel: false });

      // Tear down subscription for this chat
      subscriptions.current[chatId]?.();
      delete subscriptions.current[chatId];

      setChats((prev) => prev.filter((c) => c.id !== chatId));
      setMessages((prev) => {
        const next = { ...prev };
        delete next[chatId];
        return next;
      });
      return true;
    } catch (error) {
      console.error('Error deleting chat:', error?.data || error);
      throw error;
    }
  }, []);

  // ─── Subscriptions ────────────────────────────────────────────────────
  const subscribeToMessages = useCallback((chatId, callback) => {
    if (!chatId) return () => {};
    // Reuse existing subscription if any
    if (subscriptions.current[chatId]) {
      return () => {
        subscriptions.current[chatId]?.();
        delete subscriptions.current[chatId];
      };
    }
    const handle = (e) => {
      if (e.record.chatId !== chatId) return;
      setMessages((prev) => {
        const list = prev[chatId] || [];
        if (e.action === 'create') return { ...prev, [chatId]: [...list, e.record] };
        if (e.action === 'update') return { ...prev, [chatId]: list.map((m) => (m.id === e.record.id ? e.record : m)) };
        if (e.action === 'delete') return { ...prev, [chatId]: list.filter((m) => m.id !== e.record.id) };
        return prev;
      });
      if (callback) callback(e);
    };
    pb.collection('messages').subscribe('*', handle);
    const unsub = () => pb.collection('messages').unsubscribe('*');
    subscriptions.current[chatId] = unsub;
    return () => {
      subscriptions.current[chatId]?.();
      delete subscriptions.current[chatId];
    };
  }, []);

  // ─── Helpers exposed for UI ───────────────────────────────────────────
  const getChatTitle = useCallback((chat) => {
    if (!chat || !user) return 'Conversation';
    if (chat.type === 'group') {
      const ins = inspectionsMap[chat.inspectionId];
      const addr = ins?.metadata?.propertyAddress;
      if (addr) return addr;
      if (chat.inspectionId) return `Inspection #${String(chat.inspectionId).substring(0, 6)}`;
      return 'Group Chat';
    }
    const other = chat.expand?.participants?.find((p) => p.id !== user.id);
    return other?.name || other?.email || 'Direct Message';
  }, [inspectionsMap, user]);

  useEffect(() => {
    if (user) {
      getChats();
      setOnlineUsers(new Set([])); // placeholder for presence

      // Global chat realtime: react to chat row delete (so the list updates
      // when another user — e.g. an admin — deletes a conversation).
      const chatHandler = (e) => {
        if (e.action === 'delete') {
          setChats((prev) => prev.filter((c) => c.id !== e.record.id));
          setMessages((prev) => {
            const next = { ...prev };
            delete next[e.record.id];
            return next;
          });
        } else if (e.action === 'create' || e.action === 'update') {
          // If the current user is a participant, refresh the list so we
          // pick up new/updated chats.
          if ((e.record.participants || []).includes(user.id)) {
            getChats();
          }
        }
      };
      pb.collection('chats').subscribe('*', chatHandler);

      return () => {
        pb.collection('chats').unsubscribe('*');
        Object.values(subscriptions.current).forEach((fn) => fn?.());
        subscriptions.current = {};
      };
    } else {
      setChats([]);
      setMessages({});
      setInspectionsMap({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const value = {
    chats,
    messages,
    unreadCount,
    onlineUsers,
    inspectionsMap,
    getChats,
    getMessages,
    sendMessage,
    markAsRead,
    createChat,
    deleteMessage,
    deleteChat,
    canDeleteMessage,
    canDeleteChat,
    subscribeToMessages,
    getChatTitle,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};
