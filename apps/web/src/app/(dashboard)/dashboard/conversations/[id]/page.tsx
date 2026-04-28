'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import { ArrowLeft, Phone, Send, Bot, UserCheck, ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { conversationApi } from '@/lib/api';
import { formatDate, maskPhone } from '@/lib/utils';
import { cn } from '@/lib/utils';

function getApiErrorStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}

function getConversationErrorMessage(status: number | undefined): string {
  if (status === 401) return 'Please sign in again to view this conversation.';
  if (status === 403) return 'This conversation belongs to a different tenant or organization.';
  if (status === 404) return 'Conversation not found';
  return 'Unable to load conversation. Please refresh and try again.';
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  sender?: 'bot' | 'human' | 'customer';
}

interface ConversationIntake {
  verticalLabel: string;
  captured: Array<{ key: string; label: string; value: string; confidence?: string }>;
  missing?: Array<{ key: string; label: string }>;
}

function readConversationIntake(value: unknown): ConversationIntake | null {
  if (!value || typeof value !== 'object') return null;
  const intake = value as Partial<ConversationIntake>;
  if (!Array.isArray(intake.captured) || intake.captured.length === 0) return null;
  return {
    verticalLabel: typeof intake.verticalLabel === 'string' ? intake.verticalLabel : 'Lead',
    captured: intake.captured.filter((field) =>
      field &&
      typeof field.key === 'string' &&
      typeof field.label === 'string' &&
      typeof field.value === 'string',
    ),
    missing: Array.isArray(intake.missing)
      ? intake.missing.filter((field) => field && typeof field.key === 'string' && typeof field.label === 'string')
      : [],
  };
}

export default function ConversationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [replyText, setReplyText] = useState('');

  useEffect(() => {
    if (!id) router.replace('/dashboard/conversations');
  }, [id, router]);

  const { data: conversation, error, isError, isLoading } = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => conversationApi.get(id),
    enabled: Boolean(id),
    retry: (failureCount, err) => {
      const status = getApiErrorStatus(err);
      if (status && status >= 400 && status < 500) return false;
      return failureCount < 2;
    },
  });

  const replyMutation = useMutation({
    mutationFn: (message: string) => conversationApi.reply(id, message),
    onMutate: async (message) => {
      await queryClient.cancelQueries({ queryKey: ['conversation', id] });
      const previous = queryClient.getQueryData(['conversation', id]);

      queryClient.setQueryData(['conversation', id], (old: Record<string, unknown> | undefined) => {
        if (!old) return old;
        const msgs = Array.isArray(old.messages) ? old.messages : [];
        return {
          ...old,
          messages: [
            ...msgs,
            { role: 'assistant', content: message, timestamp: new Date().toISOString(), sender: 'human' },
          ],
        };
      });

      return { previous };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', id] });
      setReplyText('');
      toast.success('Reply sent!');
    },
    onError: (_err, _msg, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['conversation', id], context.previous);
      }
      toast.error('Failed to send reply');
    },
  });

  const handoffMutation = useMutation({
    mutationFn: (status: 'AI' | 'HUMAN') => conversationApi.setHandoff(id, status),
    onSuccess: (data) => {
      queryClient.setQueryData(['conversation', id], data);
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      const newStatus = data?.handoffStatus ?? 'AI';
      toast.success(newStatus === 'HUMAN' ? 'You took over the conversation' : 'AI is back in control');
    },
    onError: () => {
      toast.error('Failed to change handoff status');
    },
  });

  const handleSendReply = () => {
    const trimmed = replyText.trim();
    if (!trimmed) return;
    replyMutation.mutate(trimmed);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading conversation...</p>
      </div>
    );
  }

  if (!id) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading conversations...</p>
      </div>
    );
  }

  if (isError || !conversation) {
    const status = getApiErrorStatus(error);
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4 text-center">
        <p className="text-muted-foreground">{getConversationErrorMessage(status)}</p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/conversations">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to conversations
          </Link>
        </Button>
      </div>
    );
  }

  const messages: Message[] = Array.isArray(conversation.messages) ? conversation.messages : [];
  const isHumanMode = conversation.handoffStatus === 'HUMAN';
  const intake = readConversationIntake(conversation.intake);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/conversations">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Link>
        </Button>
      </div>

      <Header
        title={maskPhone(conversation.callerPhone)}
        description={`Started ${formatDate(conversation.createdAt)}`}
      />

      {/* Meta info + handoff toggle */}
      <div className="flex gap-3 mb-6 flex-wrap items-center">
        {conversation.flowType && (
          <Badge>{conversation.flowType}</Badge>
        )}
        <Badge variant={conversation.isActive ? 'success' : 'secondary'}>
          {conversation.isActive ? 'Active' : 'Closed'}
        </Badge>
        <Badge variant={isHumanMode ? 'destructive' : 'outline'}>
          {isHumanMode ? 'Human Mode' : 'AI Mode'}
        </Badge>
        <span className="text-sm text-muted-foreground self-center">
          {messages.length} messages
        </span>
        <div className="ml-auto">
          {isHumanMode ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handoffMutation.mutate('AI')}
              disabled={handoffMutation.isPending}
            >
              <Bot className="h-4 w-4 mr-1" />
              Hand Back to AI
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={() => handoffMutation.mutate('HUMAN')}
              disabled={handoffMutation.isPending}
            >
              <UserCheck className="h-4 w-4 mr-1" />
              Take Over
            </Button>
          )}
        </div>
      </div>

      {intake && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" />
              <div>
                <p className="text-sm font-semibold">Captured {intake.verticalLabel} intake</p>
                <p className="text-xs text-muted-foreground">Details the AI picked up from the customer conversation</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {intake.captured.map((field) => (
                <div key={field.key} className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs font-medium uppercase text-muted-foreground">{field.label}</p>
                  <p className="mt-1 text-sm font-medium">{field.value}</p>
                </div>
              ))}
            </div>
            {intake.missing && intake.missing.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {intake.missing.slice(0, 5).map((field) => (
                  <Badge key={field.key} variant="outline">Missing: {field.label}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Chat */}
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            {messages.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No messages</p>
            ) : (
              messages.map((msg, i) => {
                const isAssistant = msg.role === 'assistant';
                const senderLabel = msg.sender === 'human' ? 'Staff' : msg.sender === 'bot' ? 'Bot' : null;

                return (
                  <div
                    key={i}
                    className={cn('flex gap-3', isAssistant ? 'flex-row-reverse' : 'flex-row')}
                  >
                    <div className={cn(
                      'h-8 w-8 rounded-full flex items-center justify-center shrink-0 mt-1',
                      msg.role === 'user' ? 'bg-gray-200' :
                      msg.sender === 'human' ? 'bg-green-500' : 'bg-blue-500'
                    )}>
                      {msg.role === 'user'
                        ? <Phone className="h-4 w-4 text-gray-600" />
                        : msg.sender === 'human'
                          ? <UserCheck className="h-4 w-4 text-white" />
                          : <Bot className="h-4 w-4 text-white" />
                      }
                    </div>
                    <div className={cn(
                      'max-w-[85%] sm:max-w-[70%] space-y-1',
                      isAssistant ? 'items-end flex flex-col' : ''
                    )}>
                      {senderLabel && (
                        <span className={cn(
                          'text-xs font-medium px-1',
                          msg.sender === 'human' ? 'text-green-600' : 'text-blue-600'
                        )}>
                          {senderLabel}
                        </span>
                      )}
                      <div className={cn(
                        'rounded-2xl px-4 py-2 text-sm',
                        msg.role === 'user'
                          ? 'bg-gray-100 text-gray-900 rounded-tl-none'
                          : msg.sender === 'human'
                            ? 'bg-green-500 text-white rounded-tr-none'
                            : 'bg-blue-500 text-white rounded-tr-none'
                      )}>
                        {msg.content}
                      </div>
                      <span className="text-xs text-muted-foreground px-1">
                        {formatDate(msg.timestamp)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Reply input */}
          <div className="flex gap-2 mt-4 pt-4 border-t">
            <Input
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Type a reply..."
              disabled={replyMutation.isPending}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendReply();
                }
              }}
            />
            <Button
              onClick={handleSendReply}
              disabled={!replyText.trim() || replyMutation.isPending}
              size="icon"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Linked orders/meetings */}
      {(conversation.orders?.length > 0 || conversation.meetings?.length > 0) && (
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {conversation.orders?.map((order: { id: string; orderNumber: string; status: string; total: number }) => (
            <Card key={order.id}>
              <CardContent className="p-4">
                <p className="text-sm font-medium">Order {order.orderNumber}</p>
                <p className="text-xs text-muted-foreground">{order.status} · ${Number(order.total).toFixed(2)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
