import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '@/components/Header.jsx';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { useChatContext } from '@/contexts/ChatContext.jsx';
import { useSettings } from '@/contexts/SettingsContext.jsx';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import pb from '@/lib/pocketbaseClient.js';
import { toast } from 'sonner';
import { useFeedback } from '@/contexts/FeedbackContext.jsx';
import {
  Search, Send, Paperclip, Smile, MoreVertical, MessageSquare,
  ChevronRight, Users, Filter, X, FileText, Image as ImageIcon, Trash2, Camera,
} from 'lucide-react';
import WebcamCaptureModal from '@/components/WebcamCaptureModal.jsx';

// ─── Static config ───────────────────────────────────────────────────────
const EMOJIS = ['😀','😁','😂','🤣','😊','😍','🤔','😎','😴','🙃','👍','👎','🙏','👏','💪','✅','❌','⚠️','📷','📎','🏠','🔧','🚨','💡','🔥','🎉','❤️','✨'];

const ATTACHMENT_FILTERS = [
  { value: 'any',   label: 'Any (no filter)' },
  { value: 'with',  label: 'Has attachment' },
  { value: 'none',  label: 'No attachment' },
  { value: 'image', label: 'Image attachment' },
  { value: 'pdf',   label: 'PDF attachment' },
];

const matchAttachment = (msg, filter) => {
  if (filter === 'any') return true;
  const list = Array.isArray(msg.attachments) ? msg.attachments : [];
  if (filter === 'with') return list.length > 0;
  if (filter === 'none') return list.length === 0;
  if (filter === 'image') return list.some((a) => /\.(png|jpe?g|gif|webp)$/i.test(typeof a === 'string' ? a : a?.name || ''));
  if (filter === 'pdf')   return list.some((a) => /\.pdf$/i.test(typeof a === 'string' ? a : a?.name || ''));
  return true;
};

// ─── Attachment renderer ─────────────────────────────────────────────────
// PocketBase stores file fields as filename strings; build the URL from
// the record's collectionId/id/filename triple.
const fileUrl = (record, filename) => {
  if (!filename) return null;
  return `${pb.baseUrl.replace(/\/$/, '')}/api/files/${record.collectionId}/${record.id}/${filename}`;
};

const Attachment = ({ msg, filename }) => {
  const url = fileUrl(msg, filename);
  const isImg = /\.(png|jpe?g|gif|webp)$/i.test(filename);
  if (isImg) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block max-w-[200px] rounded-lg overflow-hidden border bg-background">
        <img src={url} alt={filename} className="w-full h-auto object-cover" />
      </a>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-background text-xs hover:bg-muted"
    >
      <FileText className="w-4 h-4 text-primary" />
      <span className="truncate max-w-[160px]">{filename}</span>
    </a>
  );
};

const ChatPage = () => {
  const { user } = useAuth();
  const { chatId } = useParams();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const brand = settings?.appName || 'CheckSquare';
  const {
    chats, messages, getMessages, sendMessage, markAsRead, onlineUsers,
    subscribeToMessages, getChatTitle, deleteChat, deleteMessage,
    canDeleteChat, canDeleteMessage,
  } = useChatContext();
  const { showDeleted } = useFeedback();

  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Confirmation popup state. `confirm` is a single object describing the
  // pending destructive action; null means no popup. Keeping one shared
  // dialog avoids stacking multiple AlertDialogs in the tree.
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Webcam capture state for chat attachments — desktop only; on mobile we
  // use the native camera via the file input's `capture` attribute below.
  const [camOpen, setCamOpen] = useState(false);
  const cameraInputRef = useRef(null);
  const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  // 5-axis omni-search state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSender, setFilterSender] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterInspection, setFilterInspection] = useState('');
  const [filterAttachment, setFilterAttachment] = useState('any');

  const activeFilterCount =
    (searchQuery ? 1 : 0) +
    (filterSender ? 1 : 0) +
    (filterFrom ? 1 : 0) +
    (filterTo ? 1 : 0) +
    (filterInspection ? 1 : 0) +
    (filterAttachment !== 'any' ? 1 : 0);

  const clearFilters = () => {
    setSearchQuery(''); setFilterSender(''); setFilterFrom('');
    setFilterTo(''); setFilterInspection(''); setFilterAttachment('any');
  };

  const activeChat = chats.find((c) => c.id === chatId);
  const activeMessages = chatId ? (messages[chatId] || []) : [];

  // Load messages + subscribe when active chat changes.
  // Only show the loader on the *first* fetch for a given chat — after that
  // the cached list is rendered immediately so the UI doesn't flash a
  // spinner every time messages update.
  useEffect(() => {
    if (!chatId) return;
    const alreadyCached = Array.isArray(messages[chatId]) && messages[chatId].length > 0;
    if (!alreadyCached) setIsLoading(true);
    getMessages(chatId).finally(() => setIsLoading(false));
    markAsRead(chatId);
    const unsub = subscribeToMessages(chatId, () => markAsRead(chatId));
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages.length]);

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!chatId) return;
    if (!inputText.trim() && pendingFiles.length === 0) return;
    setSending(true);
    try {
      await sendMessage(chatId, inputText, pendingFiles);
      setInputText('');
      setPendingFiles([]);
      toast.success('Message sent');
    } catch (err) {
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleFilePick = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    // PB schema: max 5 attachments per message, 20MB each
    const accepted = files.slice(0, 5).filter((f) => {
      if (f.size > 20 * 1024 * 1024) {
        toast.error(`${f.name} exceeds 20 MB`);
        return false;
      }
      return true;
    });
    setPendingFiles((prev) => [...prev, ...accepted].slice(0, 5));
    e.target.value = '';
  };

  const removePendingFile = (idx) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const insertEmoji = (e) => {
    setInputText((prev) => prev + e);
  };

  const getChatAvatar = (chat) => {
    if (chat?.type === 'group') return <Users className="w-5 h-5" />;
    const name = getChatTitle(chat);
    return name.charAt(0).toUpperCase();
  };

  const isOnline = (chat) => {
    if (!chat || !user || chat.type === 'group') return false;
    const otherId = (chat.participants || []).find((id) => id !== user.id);
    return onlineUsers.has(otherId);
  };

  const getUnreadForChat = (chat) => {
    const chatMsgs = messages[chat.id] || [];
    return chatMsgs.filter((m) => m.senderId !== user?.id && (!m.readBy || !m.readBy.includes(user?.id))).length;
  };

  // ─── Omni-search ─────────────────────────────────────────────────────
  const evaluateMessage = (msg) => {
    if (searchQuery && !String(msg.content || '').toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterSender && !String(msg.senderName || '').toLowerCase().includes(filterSender.toLowerCase())) return false;
    if (filterFrom) {
      const from = new Date(filterFrom).getTime();
      if (Number.isFinite(from) && new Date(msg.created).getTime() < from) return false;
    }
    if (filterTo) {
      const to = new Date(filterTo).getTime() + 24 * 60 * 60 * 1000 - 1;
      if (Number.isFinite(to) && new Date(msg.created).getTime() > to) return false;
    }
    if (!matchAttachment(msg, filterAttachment)) return false;
    return true;
  };

  const filteredChats = useMemo(() => {
    return chats.filter((chat) => {
      if (filterInspection) {
        if (!chat.inspectionId || !String(chat.inspectionId).toLowerCase().includes(filterInspection.toLowerCase())) {
          return false;
        }
      }
      const nameMatch = getChatTitle(chat).toLowerCase().includes(searchQuery.toLowerCase());
      const chatMsgs = messages[chat.id] || [];
      const anyMsgMatch = chatMsgs.some(evaluateMessage);
      if (activeFilterCount === 0) return true;
      if (activeFilterCount === 1 && searchQuery) return nameMatch || anyMsgMatch;
      return anyMsgMatch;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chats, messages, searchQuery, filterSender, filterFrom, filterTo, filterInspection, filterAttachment, activeFilterCount]);

  const visibleMessages = useMemo(() => {
    if (activeFilterCount === 0) return activeMessages;
    return activeMessages.filter(evaluateMessage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMessages, searchQuery, filterSender, filterFrom, filterTo, filterAttachment, activeFilterCount]);

  return (
    <>
      <Helmet>
        <title>{`Messages - ${brand}`}</title>
      </Helmet>

      <div className="h-screen bg-background flex flex-col overflow-hidden">
        <Header />

        <div className="flex-1 flex overflow-hidden border-t">

          {/* ───────── Left sidebar ───────── */}
          <div className={`w-full md:w-96 border-r flex flex-col bg-card h-full flex-shrink-0 ${chatId ? 'hidden md:flex' : 'flex'}`}>
            <div className="px-6 py-6 border-b space-y-4">
              <div className="flex items-baseline justify-between">
                <div>
                  <p className="editorial-eyebrow text-[10px]">Correspondence</p>
                  <h2 className="font-display text-3xl mt-1 leading-tight">Messages</h2>
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="relative rounded-full">
                      <Filter className="w-3.5 h-3.5 mr-1" /> Filter
                      {activeFilterCount > 0 && (
                        <Badge variant="default" className="absolute -top-2 -right-2 h-5 min-w-5 px-1 rounded-full text-[10px] bg-secondary text-primary">
                          {activeFilterCount}
                        </Badge>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[calc(100vw-2rem)] sm:w-80" align="end">
                    <div className="space-y-3">
                      <p className="editorial-eyebrow text-[10px]">Omni search</p>
                      <h4 className="font-display text-lg">Five axes</h4>
                      <div>
                        <Label className="text-xs">Sender name</Label>
                        <Input value={filterSender} onChange={(e) => setFilterSender(e.target.value)} placeholder="e.g. John Smith" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">From date</Label>
                          <Input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
                        </div>
                        <div>
                          <Label className="text-xs">To date</Label>
                          <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">Inspection ID</Label>
                        <Input value={filterInspection} onChange={(e) => setFilterInspection(e.target.value)} placeholder="record id substring" />
                      </div>
                      <div>
                        <Label className="text-xs">Attachment</Label>
                        <Select value={filterAttachment} onValueChange={setFilterAttachment}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ATTACHMENT_FILTERS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button variant="ghost" size="sm" onClick={clearFilters} className="w-full">
                        <X className="w-4 h-4 mr-1" /> Clear all
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search conversations…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-11 rounded-full border-2 bg-background"
                />
              </div>
            </div>

            <ScrollArea className="flex-1">
              {filteredChats.length > 0 ? (
                filteredChats.map((chat) => {
                  const unread = getUnreadForChat(chat);
                  return (
                    <button
                      key={chat.id}
                      onClick={() => navigate(`/chat/${chat.id}`)}
                      className={`w-full text-left px-4 sm:px-6 py-4 sm:py-5 border-b flex items-start gap-3 sm:gap-4 transition-all ${chatId === chat.id ? 'bg-muted/40 border-l-2 border-l-secondary' : 'hover:bg-muted/20 border-l-2 border-l-transparent'}`}
                    >
                      <div className="relative flex-shrink-0">
                        <div className="w-11 h-11 bg-primary text-primary-foreground flex items-center justify-center font-display text-lg">
                          {getChatAvatar(chat)}
                        </div>
                        {isOnline(chat) && <div className="status-dot online"></div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline mb-0.5 gap-2">
                          <h4 className="font-display text-base truncate">{getChatTitle(chat)}</h4>
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground flex-shrink-0">
                            {chat.updated ? new Date(chat.updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </div>
                        <p className={`text-xs truncate ${unread > 0 ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                          {chat.type === 'group' ? `${(chat.expand?.participants || []).length} participants` : 'Direct message'}
                        </p>
                      </div>
                      {unread > 0 && (
                        <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-[10px] font-semibold rounded-full bg-secondary text-primary ml-1">
                          {unread}
                        </span>
                      )}
                    </button>
                  );
                })
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">No conversations found</p>
                </div>
              )}
            </ScrollArea>
          </div>

          {/* ───────── Main chat area ───────── */}
          {activeChat ? (
            <div className={`flex-1 flex flex-col bg-background ${!chatId ? 'hidden md:flex' : 'flex'}`}>
              {/* Chat header */}
              <div className="border-b bg-card px-4 sm:px-6 py-4 sm:py-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 min-w-0">
                    <Button variant="ghost" size="icon" className="md:hidden" onClick={() => navigate('/chat')}>
                      <ChevronRight className="w-5 h-5 rotate-180" />
                    </Button>
                    <div className="relative">
                      <div className="w-11 h-11 bg-primary text-primary-foreground flex items-center justify-center font-display text-lg">
                        {getChatAvatar(activeChat)}
                      </div>
                      {isOnline(activeChat) && <div className="status-dot online"></div>}
                    </div>
                    <div className="min-w-0">
                      <p className="editorial-eyebrow text-[9px]">{activeChat.type === 'group' ? 'Group thread' : 'Direct line'}</p>
                      <h3 className="font-display text-xl truncate mt-0.5">{getChatTitle(activeChat)}</h3>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-muted-foreground rounded-full" title="More options">
                        <MoreVertical className="w-5 h-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {activeChat.type === 'group' ? 'Group thread' : 'Direct line'}
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {canDeleteChat(activeChat) ? (
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={(e) => {
                            e.preventDefault();
                            const isGroup = activeChat.type === 'group';
                            setConfirm({
                              kind: isGroup ? 'group' : 'chat',
                              title: isGroup ? 'Delete this group?' : 'Delete this chat?',
                              description: `All messages and attachments in “${getChatTitle(activeChat)}” will be permanently removed for every participant. This cannot be undone.`,
                              confirmLabel: isGroup ? 'Delete group' : 'Delete chat',
                              run: async () => {
                                await deleteChat(activeChat.id);
                                navigate('/chat');
                                showDeleted(
                                  isGroup ? 'Group deleted' : 'Chat deleted',
                                  `“${getChatTitle(activeChat)}” and all of its messages have been removed for every participant.`,
                                );
                              },
                            });
                          }}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          {activeChat.type === 'group' ? 'Delete group' : 'Delete chat'}
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem disabled>
                          <Trash2 className="w-4 h-4 mr-2 opacity-50" />
                          No permission to delete
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Participant chips (group + direct) */}
                {(activeChat.expand?.participants || []).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(activeChat.expand?.participants || []).map((p) => (
                      <Badge
                        key={p.id}
                        variant={p.id === user?.id ? 'default' : 'secondary'}
                        className="text-[11px] gap-1.5"
                        title={p.email}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-50"></span>
                        {p.name || p.email}
                        {p.id === user?.id && ' (you)'}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Messages feed */}
              <ScrollArea className="flex-1 p-4 sm:p-6 bg-muted/5">
                <div className="space-y-4">
                  {activeFilterCount > 0 && (
                    <div className="text-xs text-muted-foreground bg-muted/40 border rounded-md px-3 py-2 flex items-center justify-between">
                      <span>Showing {visibleMessages.length} of {activeMessages.length} messages (filters active)</span>
                      <Button variant="ghost" size="sm" onClick={clearFilters}><X className="w-3 h-3 mr-1" /> Clear</Button>
                    </div>
                  )}
                  {isLoading ? (
                    <div className="flex justify-center p-4">
                      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  ) : visibleMessages.length > 0 ? (
                    visibleMessages.map((msg, idx) => {
                      const isOwn = msg.senderId === user?.id;
                      const showHeader = idx === 0 || visibleMessages[idx - 1].senderId !== msg.senderId;
                      const attachments = Array.isArray(msg.attachments) ? msg.attachments : [];
                      return (
                        <div key={msg.id} className={`group flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                          {showHeader && !isOwn && (
                            <span className="text-xs text-muted-foreground mb-1 ml-1">
                              {msg.senderName} <span className="opacity-70">({msg.senderRole})</span>
                            </span>
                          )}
                          <div className={`flex items-center gap-1 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                            {msg.content && msg.content !== '📎 Attachment' && (
                              <div className={`chat-message-bubble ${isOwn ? 'chat-message-own' : 'chat-message-other'}`}>
                                {msg.content}
                              </div>
                            )}
                            {canDeleteMessage(msg) && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 opacity-0 group-hover:opacity-100 focus:opacity-100 transition rounded-full text-muted-foreground"
                                    title="Message actions"
                                  >
                                    <MoreVertical className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align={isOwn ? 'end' : 'start'} className="w-44">
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onSelect={(e) => {
                                      e.preventDefault();
                                      setConfirm({
                                        kind: 'message',
                                        title: 'Delete this message?',
                                        description: 'This message will be permanently removed for everyone in the conversation. This cannot be undone.',
                                        confirmLabel: 'Delete message',
                                        run: async () => {
                                          await deleteMessage(msg.id, chatId);
                                          showDeleted('Message deleted', 'The message has been removed from this conversation.');
                                        },
                                      });
                                    }}
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete message
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                          {attachments.length > 0 && (
                            <div className={`mt-1 flex flex-wrap gap-2 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                              {attachments.map((fname, i) => (
                                <Attachment key={`${msg.id}_${i}`} msg={msg} filename={fname} />
                              ))}
                            </div>
                          )}
                          <span className="text-[10px] text-muted-foreground mt-1 mx-1">
                            {new Date(msg.created).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {isOwn && msg.readBy?.length > 1 && <span className="ml-2 text-primary">✓ Read</span>}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="h-full flex items-center justify-center mt-20">
                      <div className="text-center p-6 bg-card rounded-2xl border border-dashed">
                        <MessageSquare className="w-10 h-10 mx-auto text-muted-foreground opacity-50 mb-3" />
                        <h4 className="font-medium mb-1">
                          {activeFilterCount > 0 ? 'No messages match your filters' : 'Start a conversation'}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {activeFilterCount > 0 ? 'Clear filters to see all messages.' : 'Send a message to begin.'}
                        </p>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Pending attachments preview */}
              {pendingFiles.length > 0 && (
                <div className="px-4 pt-2 border-t bg-muted/20">
                  <div className="flex flex-wrap gap-2">
                    {pendingFiles.map((f, i) => (
                      <div key={i} className="inline-flex items-center gap-2 px-2 py-1 rounded-md border bg-background text-xs">
                        {/^image\//.test(f.type) ? <ImageIcon className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                        <span className="truncate max-w-[140px]">{f.name}</span>
                        <button onClick={() => removePendingFile(i)} className="text-muted-foreground hover:text-destructive">×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Chat input */}
              <div className="p-4 bg-card border-t">
                <form onSubmit={handleSend} className="flex items-end gap-2 relative">
                  <div className="flex-1 bg-muted rounded-xl border flex items-center pl-2 pr-2 focus-within:ring-1 ring-ring transition-shadow">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="flex-shrink-0 text-muted-foreground h-9 w-9"
                      title="Attach files"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip className="w-4 h-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="flex-shrink-0 text-muted-foreground h-9 w-9"
                      title="Capture from camera"
                      onClick={() => (isMobile ? cameraInputRef.current?.click() : setCamOpen(true))}
                    >
                      <Camera className="w-4 h-4" />
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
                      className="hidden"
                      onChange={handleFilePick}
                    />
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={handleFilePick}
                    />
                    <textarea
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend(e);
                        }
                      }}
                      placeholder="Type a message..."
                      className="flex-1 max-h-32 min-h-[44px] bg-transparent border-none focus:outline-none resize-none py-3 px-2 text-sm"
                      rows={1}
                      disabled={sending}
                    />
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="flex-shrink-0 text-muted-foreground h-9 w-9"
                          title="Emoji"
                        >
                          <Smile className="w-4 h-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-2" align="end">
                        <div className="grid grid-cols-7 gap-1">
                          {EMOJIS.map((e) => (
                            <button
                              key={e}
                              type="button"
                              onClick={() => insertEmoji(e)}
                              className="text-xl p-1.5 rounded hover:bg-muted"
                            >
                              {e}
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <Button
                    type="submit"
                    size="icon"
                    disabled={sending || (!inputText.trim() && pendingFiles.length === 0)}
                    className="h-11 w-11 rounded-xl flex-shrink-0"
                  >
                    {sending
                      ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div>
                      : <Send className="w-5 h-5 ml-1" />}
                  </Button>
                </form>
              </div>
            </div>
          ) : (
            <div className="hidden md:flex flex-1 items-center justify-center bg-muted/10">
              <div className="text-center max-w-sm px-6">
                <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground/40 mb-6" strokeWidth={1.2} />
                <p className="editorial-eyebrow">Quiet, for now</p>
                <h3 className="font-display text-3xl mt-4">Choose a conversation.</h3>
                <p className="text-muted-foreground mt-3 leading-relaxed">
                  Select a thread on the left to begin reading or writing.
                </p>
              </div>
            </div>
          )}

          {/* ───────── Right sidebar (participants on lg screens) ───────── */}
          {activeChat && (
            <div className="hidden lg:flex w-80 border-l flex-col bg-card">
              <div className="px-7 py-8 border-b text-center flex flex-col items-center">
                <div className="w-20 h-20 bg-primary text-primary-foreground flex items-center justify-center font-display text-3xl mb-5 relative">
                  {getChatAvatar(activeChat)}
                  {isOnline(activeChat) && <div className="status-dot online h-4 w-4 right-[-4px] bottom-[-4px] border-[3px]"></div>}
                </div>
                <p className="editorial-eyebrow text-[10px]">{activeChat.type === 'group' ? 'Group thread' : 'Direct line'}</p>
                <h3 className="font-display text-xl mt-2 leading-tight">{getChatTitle(activeChat)}</h3>
                {activeChat.inspectionId && (
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-3 font-mono normal-case">
                    Ref #{activeChat.inspectionId.substring(0, 8)}
                  </p>
                )}
              </div>
              <div className="px-7 py-6">
                <p className="editorial-eyebrow text-[10px] mb-4">
                  Participants · {(activeChat.expand?.participants || []).length}
                </p>
                <div className="space-y-4">
                  {activeChat.expand?.participants?.map((p) => (
                    <div key={p.id} className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-muted flex items-center justify-center text-xs font-display">
                        {(p.name?.charAt(0) || p.email?.charAt(0) || '?').toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.name || p.email}{p.id === user?.id && ' (you)'}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{p.email}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Webcam capture modal for chat attachments (desktop) */}
      <WebcamCaptureModal
        open={camOpen}
        onOpenChange={setCamOpen}
        onCapture={(file) => {
          if (!file) return;
          setPendingFiles((prev) => [...prev, file].slice(0, 5));
        }}
      />

      {/* Shared destructive-action confirmation popup */}
      <AlertDialog
        open={!!confirm}
        onOpenChange={(open) => { if (!open && !confirmBusy) setConfirm(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title || 'Are you sure?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.description || 'This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async (e) => {
                e.preventDefault();
                if (!confirm?.run) { setConfirm(null); return; }
                setConfirmBusy(true);
                try {
                  await confirm.run();
                  setConfirm(null);
                } catch (err) {
                  const msg = err?.data?.message || err?.message || 'Action failed';
                  toast.error(msg);
                  // eslint-disable-next-line no-console
                  console.error('Confirm action failed:', err?.data || err);
                } finally {
                  setConfirmBusy(false);
                }
              }}
            >
              {confirmBusy ? 'Working…' : (confirm?.confirmLabel || 'Confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ChatPage;
