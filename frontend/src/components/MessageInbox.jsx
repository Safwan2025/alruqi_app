import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mail, User, Send, Check, Trash2, ChevronRight, MessageSquare, Inbox, Users as UsersIcon, PenSquare } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/utils/api';
import AdminBulkMessaging from '@/components/AdminBulkMessaging';

const MessageInbox = ({
  messages,
  setMessages,
  role,
  isAdmin = false,
  composeTarget = null,
  onComposeHandled
}) => {
  const isTeacher = role === 'teacher';
  const partnerKey = isTeacher ? 'student_id' : 'teacher_id';
  const partnerNameKey = isTeacher ? 'student_name' : 'teacher_name';
  const incomingCheck = useCallback(
    (msg) => isTeacher ? msg.from_role === 'student' : (msg.from_role === 'teacher' || !msg.from_role),
    [isTeacher]
  );

  const [activeTab, setActiveTab] = useState('inbox');
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [deletingThread, setDeletingThread] = useState(false);

  // Compose state
  const [composeOpen, setComposeOpen] = useState(false);
  const [composePartnerId, setComposePartnerId] = useState('');
  const [composePartnerName, setComposePartnerName] = useState('');
  const [composeText, setComposeText] = useState('');
  const [sending, setSending] = useState(false);
  const [partners, setPartners] = useState([]); // list of teachers (for student) or students (for teacher)
  const [loadingPartners, setLoadingPartners] = useState(false);

  // Load partners (teachers list for student, students list for teacher)
  const loadPartners = useCallback(async () => {
    setLoadingPartners(true);
    try {
      if (isTeacher) {
        const res = await api.get('/teacher/students-points');
        setPartners(res.data.map(s => ({ id: s.user_id, name: s.name })));
      } else {
        const res = await api.get('/teachers');
        setPartners(res.data.map(t => ({ id: t.teacher_id, name: t.name })));
      }
    } catch {
      // silent — partner list is best-effort
    } finally {
      setLoadingPartners(false);
    }
  }, [isTeacher]);

  // Open compose externally (e.g. from session "رسالة" button)
  useEffect(() => {
    if (composeTarget) {
      setComposePartnerId(composeTarget.id || '');
      setComposePartnerName(composeTarget.name || '');
      setComposeOpen(true);
      onComposeHandled?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composeTarget]);

  // Load partners when compose opens
  useEffect(() => {
    if (composeOpen && partners.length === 0) loadPartners();
  }, [composeOpen, partners.length, loadPartners]);

  // ===== Conversation grouping =====
  const conversations = useMemo(() => {
    const grouped = {};
    messages.forEach(msg => {
      const partnerId = msg[partnerKey];
      const partnerName = msg[partnerNameKey] || 'غير معروف';
      if (!grouped[partnerId]) {
        grouped[partnerId] = {
          partnerId,
          partnerName,
          messages: [],
          unread: 0,
          lastTime: msg.created_at
        };
      }
      grouped[partnerId].messages.push(msg);
      if (!msg.read && incomingCheck(msg)) {
        grouped[partnerId].unread++;
      }
      if (msg.created_at > grouped[partnerId].lastTime) {
        grouped[partnerId].lastTime = msg.created_at;
      }
    });
    return Object.values(grouped).sort((a, b) => new Date(b.lastTime) - new Date(a.lastTime));
  }, [messages, partnerKey, partnerNameKey, incomingCheck]);

  // Inbox conversations: those that have at least one incoming msg
  const inboxConversations = useMemo(
    () => conversations.filter(c => c.messages.some(incomingCheck)),
    [conversations, incomingCheck]
  );

  // Sent messages flat list (newest first)
  const sentMessages = useMemo(
    () => messages
      .filter(m => !incomingCheck(m))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [messages, incomingCheck]
  );

  const activeConvo = conversations.find(c => c.partnerId === selectedConversation);
  const sortedMessages = activeConvo
    ? [...activeConvo.messages].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    : [];

  // ===== Actions =====
  const markAsRead = async (messageId) => {
    try {
      await api.put(`/messages/${messageId}/read`);
      setMessages(prev => prev.map(m => m.message_id === messageId ? { ...m, read: true } : m));
    } catch {
      // ignore
    }
  };

  const deleteMessage = async (messageId) => {
    if (!window.confirm('سيتم حذف هذه الرسالة نهائياً للطرفين. هل أنت متأكد؟')) return;
    setDeletingId(messageId);
    try {
      await api.delete(`/messages/${messageId}`);
      setMessages(prev => prev.filter(m => m.message_id !== messageId));
      toast.success('تم حذف الرسالة نهائياً');
    } catch {
      toast.error('فشل حذف الرسالة');
    } finally {
      setDeletingId(null);
    }
  };

  const deleteThread = async (partnerId) => {
    if (!window.confirm('سيتم حذف هذه المحادثة بالكامل من صندوقك. هل أنت متأكد؟')) return;
    setDeletingThread(true);
    try {
      await api.delete(`/messages/conversation/${partnerId}`);
      setMessages(prev => prev.filter(m => m[partnerKey] !== partnerId));
      setSelectedConversation(null);
      toast.success('تم حذف المحادثة');
    } catch {
      toast.error('فشل حذف المحادثة');
    } finally {
      setDeletingThread(false);
    }
  };

  const handleSendCompose = async () => {
    if (!composePartnerId) {
      toast.error('يرجى اختيار المستلم');
      return;
    }
    if (!composeText.trim()) {
      toast.error('يرجى كتابة الرسالة');
      return;
    }
    setSending(true);
    try {
      if (isTeacher) {
        await api.post('/messages/send', {
          student_id: composePartnerId,
          message: composeText.trim()
        });
      } else {
        await api.post('/messages/send-to-teacher', {
          teacher_id: composePartnerId,
          message: composeText.trim()
        });
      }
      toast.success('تم إرسال الرسالة');
      setComposeText('');
      setComposeOpen(false);
      setComposePartnerId('');
      setComposePartnerName('');

      // Reload messages to reflect the new sent message
      try {
        const res = await api.get('/messages/my-messages');
        setMessages(res.data);
      } catch {
        // ignore
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل إرسال الرسالة');
    } finally {
      setSending(false);
    }
  };

  const openCompose = (prefilledPartner = null) => {
    if (prefilledPartner) {
      setComposePartnerId(prefilledPartner.id);
      setComposePartnerName(prefilledPartner.name);
    } else {
      setComposePartnerId('');
      setComposePartnerName('');
    }
    setComposeText('');
    setComposeOpen(true);
  };

  const totalUnread = inboxConversations.reduce((sum, c) => sum + c.unread, 0);

  return (
    <div data-testid="message-inbox">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="font-amiri text-xl sm:text-2xl font-bold text-primary flex items-center gap-2">
          <Inbox size={24} />
          صندوق الرسائل
          {totalUnread > 0 && (
            <span className="bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full">
              {totalUnread} جديدة
            </span>
          )}
        </h3>
        <Button
          data-testid="compose-message-btn"
          onClick={() => openCompose()}
          size="sm"
          className="rounded-full gap-1"
        >
          <PenSquare size={14} />
          رسالة جديدة
        </Button>
      </div>

      {/* Top tabs: Inbox / Sent / (admin) Bulk */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full flex h-auto p-1 bg-muted/60 rounded-xl mb-4" data-testid="inbox-tabs">
          <TabsTrigger value="inbox" data-testid="tab-inbox" className="flex-1 gap-1.5 font-plex py-2 text-xs sm:text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white">
            <Inbox size={14} />
            الوارد
            {totalUnread > 0 && (
              <span className="bg-blue-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">{totalUnread}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="sent" data-testid="tab-sent" className="flex-1 gap-1.5 font-plex py-2 text-xs sm:text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white">
            <Send size={14} />
            المرسل
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="bulk" data-testid="tab-bulk" className="flex-1 gap-1.5 font-plex py-2 text-xs sm:text-sm rounded-lg data-[state=active]:bg-purple-600 data-[state=active]:text-white">
              <UsersIcon size={14} />
              رسالة جماعية
            </TabsTrigger>
          )}
        </TabsList>

        {/* ===== Inbox Tab ===== */}
        <TabsContent value="inbox">
          {inboxConversations.length === 0 ? (
            <Card className="text-center p-8 sm:p-12" data-testid="no-messages-card">
              <Mail className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-amiri text-xl font-bold text-primary mb-2">لا توجد رسائل واردة</h3>
              <p className="font-plex text-sm text-muted-foreground">
                {isTeacher ? 'ستظهر هنا رسائل الطلاب' : 'ستظهر هنا رسائل المعلمين'}
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Conversation List */}
              <div className={`space-y-1 ${selectedConversation ? 'hidden md:block' : ''}`}>
                <Card>
                  <CardContent className="p-0">
                    {inboxConversations.map((convo) => (
                      <button
                        key={convo.partnerId}
                        data-testid={`convo-${convo.partnerId}`}
                        onClick={() => setSelectedConversation(convo.partnerId)}
                        className={`w-full text-right p-3 sm:p-4 border-b last:border-b-0 hover:bg-gray-50 transition-colors flex items-center justify-between gap-3 ${
                          selectedConversation === convo.partnerId ? 'bg-primary/5 border-r-4 border-r-primary' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <User size={18} className="text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-plex font-bold text-gray-800 truncate text-sm">{convo.partnerName}</p>
                            <p className="font-plex text-xs text-gray-400 truncate">
                              {convo.messages[0]?.message?.substring(0, 40)}...
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col items-center gap-1 flex-shrink-0">
                          {convo.unread > 0 && (
                            <span className="bg-blue-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center">
                              {convo.unread}
                            </span>
                          )}
                          <ChevronRight size={14} className="text-gray-300" />
                        </div>
                      </button>
                    ))}
                  </CardContent>
                </Card>
              </div>

              {/* Messages Panel */}
              <div className={`md:col-span-2 ${!selectedConversation ? 'hidden md:block' : ''}`}>
                {selectedConversation && activeConvo ? (
                  <Card>
                    <div className="border-b p-3 sm:p-4 flex items-center justify-between bg-gray-50 gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          onClick={() => setSelectedConversation(null)}
                          className="md:hidden p-1 rounded-full hover:bg-gray-200"
                          aria-label="رجوع"
                        >
                          <ChevronRight size={20} className="rotate-180" />
                        </button>
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <User size={16} className="text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-plex font-bold text-sm truncate">{activeConvo.partnerName}</p>
                          <p className="font-plex text-xs text-gray-400">{activeConvo.messages.length} رسالة</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          data-testid="reply-convo-btn"
                          size="sm"
                          variant="outline"
                          className="rounded-full gap-1"
                          onClick={() => openCompose({ id: activeConvo.partnerId, name: activeConvo.partnerName })}
                        >
                          <Send size={14} />
                          رد
                        </Button>
                        <Button
                          data-testid="delete-thread-btn"
                          size="sm"
                          variant="outline"
                          className="rounded-full gap-1 border-red-300 text-red-600 hover:bg-red-50"
                          onClick={() => deleteThread(activeConvo.partnerId)}
                          disabled={deletingThread}
                        >
                          {deletingThread
                            ? <div className="border-2 border-red-500 border-t-transparent rounded-full w-3 h-3 animate-spin" />
                            : <Trash2 size={14} />
                          }
                          حذف المحادثة
                        </Button>
                      </div>
                    </div>
                    <CardContent className="p-0">
                      <div className="max-h-[500px] overflow-y-auto p-3 sm:p-4 space-y-3">
                        {sortedMessages.map((msg) => {
                          const isIncoming = incomingCheck(msg);
                          const isUnread = !msg.read && isIncoming;
                          return (
                            <div
                              key={msg.message_id}
                              data-testid={`message-${msg.message_id}`}
                              className={`flex ${isIncoming ? 'justify-start' : 'justify-end'}`}
                            >
                              <div className={`max-w-[85%] rounded-2xl p-3 ${
                                isIncoming
                                  ? `bg-gray-100 rounded-tr-sm ${isUnread ? 'border-2 border-blue-300' : ''}`
                                  : 'bg-primary/10 rounded-tl-sm'
                              }`}>
                                <div className="flex items-start gap-2 justify-between">
                                  <p className="font-plex text-sm leading-relaxed flex-1 whitespace-pre-wrap">{msg.message}</p>
                                  <button
                                    data-testid={`delete-${msg.message_id}`}
                                    onClick={() => deleteMessage(msg.message_id)}
                                    className="p-1 rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                                    disabled={deletingId === msg.message_id}
                                    title="حذف الرسالة نهائياً للطرفين"
                                  >
                                    {deletingId === msg.message_id
                                      ? <div className="border-2 border-red-500 border-t-transparent rounded-full w-3 h-3 animate-spin" />
                                      : <Trash2 size={12} />
                                    }
                                  </button>
                                </div>
                                <div className="flex items-center justify-between mt-1.5 gap-3">
                                  <p className="font-plex text-[10px] text-gray-400">
                                    {new Date(msg.created_at).toLocaleString('en-US', {
                                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                    })}
                                  </p>
                                  {isUnread && (
                                    <button
                                      data-testid={`mark-read-${msg.message_id}`}
                                      onClick={() => markAsRead(msg.message_id)}
                                      className="text-[10px] text-blue-500 hover:text-blue-700 font-plex flex items-center gap-0.5"
                                    >
                                      <Check size={10} />
                                      قراءة
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="h-64 flex items-center justify-center">
                    <div className="text-center text-gray-400">
                      <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p className="font-plex text-sm">اختر محادثة لعرض الرسائل</p>
                    </div>
                  </Card>
                )}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ===== Sent Tab ===== */}
        <TabsContent value="sent">
          {sentMessages.length === 0 ? (
            <Card className="text-center p-8 sm:p-12" data-testid="no-sent-card">
              <Send className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-amiri text-xl font-bold text-primary mb-2">لا توجد رسائل مرسلة</h3>
              <p className="font-plex text-sm text-muted-foreground">ستظهر هنا الرسائل التي أرسلتها</p>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  {sentMessages.map((msg) => (
                    <div key={msg.message_id} className="p-3 sm:p-4 flex items-start gap-3" data-testid={`sent-${msg.message_id}`}>
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Send size={14} className="text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <p className="font-plex text-sm">
                            <span className="text-gray-500">إلى:</span>{' '}
                            <span className="font-bold">{msg[partnerNameKey] || 'غير معروف'}</span>
                          </p>
                          <p className="font-plex text-[11px] text-gray-400">
                            {new Date(msg.created_at).toLocaleString('en-US', {
                              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                            })}
                          </p>
                        </div>
                        <p className="font-plex text-sm text-gray-700 mt-1 whitespace-pre-wrap">{msg.message}</p>
                      </div>
                      <button
                        data-testid={`sent-delete-${msg.message_id}`}
                        onClick={() => deleteMessage(msg.message_id)}
                        className="p-1.5 rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                        disabled={deletingId === msg.message_id}
                        title="حذف الرسالة نهائياً للطرفين"
                      >
                        {deletingId === msg.message_id
                          ? <div className="border-2 border-red-500 border-t-transparent rounded-full w-3 h-3 animate-spin" />
                          : <Trash2 size={14} />
                        }
                      </button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ===== Bulk Tab (Admin only) ===== */}
        {isAdmin && (
          <TabsContent value="bulk">
            <AdminBulkMessaging />
          </TabsContent>
        )}
      </Tabs>

      {/* ===== Compose Dialog ===== */}
      <Dialog open={composeOpen} onOpenChange={(open) => !open && setComposeOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-amiri text-xl flex items-center gap-2">
              <PenSquare size={20} className="text-primary" />
              {composePartnerName ? `إرسال رسالة إلى ${composePartnerName}` : 'رسالة جديدة'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!composePartnerName && (
              <div>
                <Label className="font-plex mb-2 block">
                  {isTeacher ? 'اختر الطالب' : 'اختر المعلم'}
                </Label>
                <Select value={composePartnerId} onValueChange={setComposePartnerId}>
                  <SelectTrigger data-testid="compose-partner-select">
                    <SelectValue placeholder={loadingPartners ? 'جاري التحميل...' : (isTeacher ? 'اختر الطالب' : 'اختر المعلم')} />
                  </SelectTrigger>
                  <SelectContent>
                    {partners.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="font-plex mb-2 block">الرسالة</Label>
              <Textarea
                value={composeText}
                onChange={(e) => setComposeText(e.target.value)}
                placeholder="اكتب رسالتك هنا..."
                rows={6}
                className="font-plex"
                data-testid="compose-message-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleSendCompose}
              disabled={sending || !composeText.trim() || !composePartnerId}
              className="rounded-full"
              data-testid="compose-send-btn"
            >
              {sending
                ? <><div className="spinner border-2 border-white border-t-transparent rounded-full w-4 h-4 ml-2"></div>جاري الإرسال...</>
                : <><Send className="ml-2" size={16} />إرسال</>
              }
            </Button>
            <Button
              variant="outline"
              onClick={() => setComposeOpen(false)}
              className="rounded-full"
              disabled={sending}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MessageInbox;
