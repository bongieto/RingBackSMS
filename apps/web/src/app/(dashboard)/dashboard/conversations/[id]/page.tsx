'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { ArrowLeft, Phone, User, Send } from 'lucide-react';
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

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export default function ConversationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [replyText, setReplyText] = useState('');

  const { data: conversation, isLoading } = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => conversationApi.get(id),
    enabled: !!id,
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
            { role: 'assistant', content: message, timestamp: new Date().toISOString() },
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

  if (!conversation) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Conversation not found</p>
      </div>
    );
  }

  const messages: Message[] = Array.isArray(conversation.messages) ? conversation.messages : [];

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

      {/* Meta info */}
      <div className="flex gap-3 mb-6 flex-wrap">
        {conversation.flowType && (
          <Badge>{conversation.flowType}</Badge>
        )}
        <Badge variant={conversation.isActive ? 'success' : 'secondary'}>
          {conversation.isActive ? 'Active' : 'Closed'}
        </Badge>
        <span className="text-sm text-muted-foreground self-center">
          {messages.length} messages
        </span>
      </div>

      {/* Chat */}
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            {messages.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No messages</p>
            ) : (
              messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn('flex gap-3', msg.role === 'assistant' ? 'flex-row-reverse' : 'flex-row')}
                >
                  <div className={cn(
                    'h-8 w-8 rounded-full flex items-center justify-center shrink-0 mt-1',
                    msg.role === 'user' ? 'bg-gray-200' : 'bg-blue-500'
                  )}>
                    {msg.role === 'user'
                      ? <Phone className="h-4 w-4 text-gray-600" />
                      : <User className="h-4 w-4 text-white" />
                    }
                  </div>
                  <div className={cn(
                    'max-w-[70%] space-y-1',
                    msg.role === 'assistant' ? 'items-end flex flex-col' : ''
                  )}>
                    <div className={cn(
                      'rounded-2xl px-4 py-2 text-sm',
                      msg.role === 'user'
                        ? 'bg-gray-100 text-gray-900 rounded-tl-none'
                        : 'bg-blue-500 text-white rounded-tr-none'
                    )}>
                      {msg.content}
                    </div>
                    <span className="text-xs text-muted-foreground px-1">
                      {formatDate(msg.timestamp)}
                    </span>
                  </div>
                </div>
              ))
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
