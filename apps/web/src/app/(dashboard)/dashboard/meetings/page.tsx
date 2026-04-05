'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOrganization } from '@clerk/nextjs';
import {
  Calendar,
  List,
  Plus,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Clock,
  Eye,
} from 'lucide-react';
import {
  format,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  eachDayOfInterval,
  isSameDay,
  parseISO,
} from 'date-fns';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { meetingApi } from '@/lib/api';
import { maskPhone, cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

interface Meeting {
  id: string;
  tenantId: string;
  conversationId: string;
  callerPhone: string;
  calcomBookingId?: string | null;
  calcomBookingUid?: string | null;
  scheduledAt: string | null;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PaginatedResponse {
  success: boolean;
  data: Meeting[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

// ── Constants ────────────────────────────────────────────────────────────────

type StatusBadgeVariant = 'success' | 'warning' | 'destructive' | 'secondary' | 'outline';

const STATUS_COLORS: Record<string, StatusBadgeVariant> = {
  PENDING: 'warning',
  CONFIRMED: 'secondary',
  COMPLETED: 'success',
  CANCELLED: 'destructive',
};

const STATUS_OPTIONS = ['ALL', 'PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED'] as const;

type ViewMode = 'list' | 'week';

// ── Component ────────────────────────────────────────────────────────────────

export default function MeetingsPage() {
  const { organization } = useOrganization();
  const tenantId = organization?.publicMetadata?.tenantId as string | undefined;
  const queryClient = useQueryClient();

  // State
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newMeeting, setNewMeeting] = useState({
    callerPhone: '',
    scheduledAt: '',
    scheduledTime: '',
    notes: '',
  });

  // Week calculations
  const currentWeekStart = useMemo(() => {
    const base = new Date();
    const start = startOfWeek(base, { weekStartsOn: 0 });
    return weekOffset === 0 ? start : addWeeks(start, weekOffset);
  }, [weekOffset]);

  const currentWeekEnd = useMemo(
    () => endOfWeek(currentWeekStart, { weekStartsOn: 0 }),
    [currentWeekStart]
  );

  const weekDays = useMemo(
    () => eachDayOfInterval({ start: currentWeekStart, end: currentWeekEnd }),
    [currentWeekStart, currentWeekEnd]
  );

  // Query
  const { data, isLoading } = useQuery<PaginatedResponse>({
    queryKey: ['meetings', tenantId, statusFilter, viewMode, weekOffset],
    queryFn: () =>
      meetingApi.list(tenantId!, {
        pageSize: 100,
        ...(statusFilter !== 'ALL' && { status: statusFilter }),
        ...(viewMode === 'week' && {
          from: currentWeekStart.toISOString(),
          to: currentWeekEnd.toISOString(),
        }),
      }),
    enabled: !!tenantId,
    refetchInterval: 60_000,
  });

  const meetings = data?.data ?? [];

  // Mutations
  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; status?: string; notes?: string }) =>
      meetingApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      setSelectedMeeting(null);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => meetingApi.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      setSelectedMeeting(null);
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => meetingApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      setShowNewForm(false);
      setNewMeeting({ callerPhone: '', scheduledAt: '', scheduledTime: '', notes: '' });
    },
  });

  // Handlers
  function handleConfirm(meeting: Meeting) {
    updateMutation.mutate({ id: meeting.id, status: 'CONFIRMED' });
  }

  function handleComplete(meeting: Meeting) {
    updateMutation.mutate({ id: meeting.id, status: 'COMPLETED' });
  }

  function handleCancel(meeting: Meeting) {
    cancelMutation.mutate(meeting.id);
  }

  function handleCreateMeeting() {
    if (!tenantId || !newMeeting.callerPhone) return;

    let scheduledAt: string | undefined;
    if (newMeeting.scheduledAt && newMeeting.scheduledTime) {
      scheduledAt = new Date(
        `${newMeeting.scheduledAt}T${newMeeting.scheduledTime}:00`
      ).toISOString();
    } else if (newMeeting.scheduledAt) {
      scheduledAt = new Date(`${newMeeting.scheduledAt}T09:00:00`).toISOString();
    }

    createMutation.mutate({
      tenantId,
      callerPhone: newMeeting.callerPhone,
      ...(scheduledAt && { scheduledAt }),
      ...(newMeeting.notes && { notes: newMeeting.notes }),
    });
  }

  // Group meetings by day for week view
  const meetingsByDay = useMemo(() => {
    const map = new Map<string, Meeting[]>();
    for (const day of weekDays) {
      map.set(format(day, 'yyyy-MM-dd'), []);
    }
    for (const m of meetings) {
      if (m.scheduledAt) {
        const key = format(parseISO(m.scheduledAt), 'yyyy-MM-dd');
        const existing = map.get(key);
        if (existing) existing.push(m);
      }
    }
    return map;
  }, [meetings, weekDays]);

  return (
    <div>
      <Header
        title="Meetings"
        description="Schedule and manage meetings with customers"
        action={
          <Button onClick={() => setShowNewForm(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            New Meeting
          </Button>
        }
      />

      {/* New Meeting Form */}
      {showNewForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">New Meeting</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="callerPhone">Customer Phone</Label>
                <Input
                  id="callerPhone"
                  placeholder="+1234567890"
                  value={newMeeting.callerPhone}
                  onChange={(e) =>
                    setNewMeeting((prev) => ({ ...prev, callerPhone: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="scheduledDate">Date</Label>
                <Input
                  id="scheduledDate"
                  type="date"
                  value={newMeeting.scheduledAt}
                  onChange={(e) =>
                    setNewMeeting((prev) => ({ ...prev, scheduledAt: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="scheduledTime">Time</Label>
                <Input
                  id="scheduledTime"
                  type="time"
                  value={newMeeting.scheduledTime}
                  onChange={(e) =>
                    setNewMeeting((prev) => ({ ...prev, scheduledTime: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="meetingNotes">Notes</Label>
                <Input
                  id="meetingNotes"
                  placeholder="Optional notes..."
                  value={newMeeting.notes}
                  onChange={(e) =>
                    setNewMeeting((prev) => ({ ...prev, notes: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button
                onClick={handleCreateMeeting}
                disabled={!newMeeting.callerPhone || createMutation.isPending}
                size="sm"
              >
                {createMutation.isPending ? 'Creating...' : 'Create Meeting'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowNewForm(false);
                  setNewMeeting({ callerPhone: '', scheduledAt: '', scheduledTime: '', notes: '' });
                }}
              >
                Cancel
              </Button>
            </div>
            {createMutation.isError && (
              <p className="text-sm text-destructive mt-2">
                Failed to create meeting. Please check business hours and try again.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Controls */}
      <div className="flex items-center justify-between mb-4">
        {/* Status Filter */}
        <div className="flex gap-1">
          {STATUS_OPTIONS.map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(s)}
            >
              {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
            </Button>
          ))}
        </div>

        {/* View Toggle */}
        <div className="flex gap-1">
          <Button
            variant={viewMode === 'list' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('list')}
          >
            <List className="h-4 w-4 mr-1" />
            List
          </Button>
          <Button
            variant={viewMode === 'week' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('week')}
          >
            <Calendar className="h-4 w-4 mr-1" />
            Week
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">Loading meetings...</p>
          </CardContent>
        </Card>
      ) : viewMode === 'list' ? (
        <ListViewContent
          meetings={meetings}
          onConfirm={handleConfirm}
          onComplete={handleComplete}
          onCancel={handleCancel}
          onSelect={setSelectedMeeting}
          updatePending={updateMutation.isPending}
          cancelPending={cancelMutation.isPending}
        />
      ) : (
        <WeekViewContent
          weekDays={weekDays}
          meetingsByDay={meetingsByDay}
          weekOffset={weekOffset}
          currentWeekStart={currentWeekStart}
          currentWeekEnd={currentWeekEnd}
          onPrevWeek={() => setWeekOffset((o) => o - 1)}
          onNextWeek={() => setWeekOffset((o) => o + 1)}
          onToday={() => setWeekOffset(0)}
          onSelect={setSelectedMeeting}
        />
      )}

      {/* Meeting Detail Panel */}
      {selectedMeeting && (
        <MeetingDetailPanel
          meeting={selectedMeeting}
          onClose={() => setSelectedMeeting(null)}
          onConfirm={handleConfirm}
          onComplete={handleComplete}
          onCancel={handleCancel}
          updatePending={updateMutation.isPending}
          cancelPending={cancelMutation.isPending}
        />
      )}
    </div>
  );
}

// ── List View ────────────────────────────────────────────────────────────────

function ListViewContent({
  meetings,
  onConfirm,
  onComplete,
  onCancel,
  onSelect,
  updatePending,
  cancelPending,
}: {
  meetings: Meeting[];
  onConfirm: (m: Meeting) => void;
  onComplete: (m: Meeting) => void;
  onCancel: (m: Meeting) => void;
  onSelect: (m: Meeting) => void;
  updatePending: boolean;
  cancelPending: boolean;
}) {
  if (meetings.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Calendar className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-muted-foreground font-medium">No meetings found</p>
          <p className="text-sm text-muted-foreground mt-1">
            Meetings scheduled via SMS or created manually will appear here
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b text-left text-sm text-muted-foreground">
              <th className="p-4 font-medium">Date & Time</th>
              <th className="p-4 font-medium">Customer</th>
              <th className="p-4 font-medium">Status</th>
              <th className="p-4 font-medium">Notes</th>
              <th className="p-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {meetings.map((meeting) => (
              <tr key={meeting.id} className="border-b last:border-0 hover:bg-muted/50">
                <td className="p-4 text-sm">
                  {meeting.scheduledAt
                    ? format(parseISO(meeting.scheduledAt), 'MMM d, yyyy h:mm a')
                    : 'Not scheduled'}
                </td>
                <td className="p-4 text-sm font-mono">
                  {maskPhone(meeting.callerPhone)}
                </td>
                <td className="p-4">
                  <Badge variant={STATUS_COLORS[meeting.status] ?? 'outline'}>
                    {meeting.status}
                  </Badge>
                </td>
                <td className="p-4 text-sm text-muted-foreground max-w-[200px] truncate">
                  {meeting.notes ?? '--'}
                </td>
                <td className="p-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onSelect(meeting)}
                      title="View details"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    {meeting.status === 'PENDING' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onConfirm(meeting)}
                        disabled={updatePending}
                        title="Confirm"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {meeting.status === 'CONFIRMED' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onComplete(meeting)}
                        disabled={updatePending}
                        title="Complete"
                      >
                        <Clock className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {meeting.status !== 'CANCELLED' && meeting.status !== 'COMPLETED' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onCancel(meeting)}
                        disabled={cancelPending}
                        title="Cancel"
                        className="text-destructive hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── Week View ────────────────────────────────────────────────────────────────

function WeekViewContent({
  weekDays,
  meetingsByDay,
  weekOffset,
  currentWeekStart,
  currentWeekEnd,
  onPrevWeek,
  onNextWeek,
  onToday,
  onSelect,
}: {
  weekDays: Date[];
  meetingsByDay: Map<string, Meeting[]>;
  weekOffset: number;
  currentWeekStart: Date;
  currentWeekEnd: Date;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onSelect: (m: Meeting) => void;
}) {
  const today = new Date();

  return (
    <div>
      {/* Week Navigation */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onPrevWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={onNextWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {weekOffset !== 0 && (
            <Button variant="ghost" size="sm" onClick={onToday}>
              Today
            </Button>
          )}
        </div>
        <p className="text-sm font-medium text-muted-foreground">
          {format(currentWeekStart, 'MMM d')} &ndash; {format(currentWeekEnd, 'MMM d, yyyy')}
        </p>
      </div>

      {/* Weekly Grid */}
      <div className="grid grid-cols-7 gap-2">
        {weekDays.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const dayMeetings = meetingsByDay.get(key) ?? [];
          const isToday = isSameDay(day, today);

          return (
            <Card
              key={key}
              className={cn('min-h-[160px]', isToday && 'ring-2 ring-blue-500')}
            >
              <div
                className={cn(
                  'px-3 py-2 border-b text-center text-xs font-medium',
                  isToday ? 'bg-blue-50 text-blue-700' : 'text-muted-foreground'
                )}
              >
                <div>{format(day, 'EEE')}</div>
                <div className="text-lg font-semibold">{format(day, 'd')}</div>
              </div>
              <div className="p-2 space-y-1">
                {dayMeetings.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground text-center pt-4">
                    No meetings
                  </p>
                ) : (
                  dayMeetings.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => onSelect(m)}
                      className={cn(
                        'w-full text-left rounded px-2 py-1 text-[11px] leading-tight transition-colors',
                        m.status === 'PENDING' && 'bg-yellow-50 hover:bg-yellow-100 text-yellow-800',
                        m.status === 'CONFIRMED' && 'bg-blue-50 hover:bg-blue-100 text-blue-800',
                        m.status === 'COMPLETED' && 'bg-green-50 hover:bg-green-100 text-green-800',
                        m.status === 'CANCELLED' &&
                          'bg-red-50 hover:bg-red-100 text-red-800 line-through'
                      )}
                    >
                      <div className="font-medium">
                        {m.scheduledAt
                          ? format(parseISO(m.scheduledAt), 'h:mm a')
                          : 'TBD'}
                      </div>
                      <div className="truncate">{maskPhone(m.callerPhone)}</div>
                    </button>
                  ))
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── Meeting Detail Panel ─────────────────────────────────────────────────────

function MeetingDetailPanel({
  meeting,
  onClose,
  onConfirm,
  onComplete,
  onCancel,
  updatePending,
  cancelPending,
}: {
  meeting: Meeting;
  onClose: () => void;
  onConfirm: (m: Meeting) => void;
  onComplete: (m: Meeting) => void;
  onCancel: (m: Meeting) => void;
  updatePending: boolean;
  cancelPending: boolean;
}) {
  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-background border-l shadow-xl z-50 overflow-y-auto">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Meeting Details</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4">
          <div>
            <Label className="text-muted-foreground text-xs">Status</Label>
            <div className="mt-1">
              <Badge variant={STATUS_COLORS[meeting.status] ?? 'outline'}>
                {meeting.status}
              </Badge>
            </div>
          </div>

          <div>
            <Label className="text-muted-foreground text-xs">Customer Phone</Label>
            <p className="text-sm font-mono mt-1">{maskPhone(meeting.callerPhone)}</p>
          </div>

          <div>
            <Label className="text-muted-foreground text-xs">Scheduled At</Label>
            <p className="text-sm mt-1">
              {meeting.scheduledAt
                ? format(parseISO(meeting.scheduledAt), 'EEEE, MMMM d, yyyy h:mm a')
                : 'Not scheduled'}
            </p>
          </div>

          <div>
            <Label className="text-muted-foreground text-xs">Notes</Label>
            <p className="text-sm mt-1">{meeting.notes ?? 'No notes'}</p>
          </div>

          <div>
            <Label className="text-muted-foreground text-xs">Created</Label>
            <p className="text-sm mt-1">
              {format(parseISO(meeting.createdAt), 'MMM d, yyyy h:mm a')}
            </p>
          </div>

          {meeting.calcomBookingUid && (
            <div>
              <Label className="text-muted-foreground text-xs">Cal.com Booking</Label>
              <p className="text-sm font-mono mt-1">{meeting.calcomBookingUid}</p>
            </div>
          )}

          {/* Actions */}
          <div className="pt-4 border-t space-y-2">
            {meeting.status === 'PENDING' && (
              <Button
                className="w-full"
                size="sm"
                onClick={() => onConfirm(meeting)}
                disabled={updatePending}
              >
                <Check className="h-4 w-4 mr-1" />
                Confirm Meeting
              </Button>
            )}
            {meeting.status === 'CONFIRMED' && (
              <Button
                className="w-full"
                size="sm"
                onClick={() => onComplete(meeting)}
                disabled={updatePending}
              >
                <Clock className="h-4 w-4 mr-1" />
                Mark as Completed
              </Button>
            )}
            {meeting.status !== 'CANCELLED' && meeting.status !== 'COMPLETED' && (
              <Button
                variant="destructive"
                className="w-full"
                size="sm"
                onClick={() => onCancel(meeting)}
                disabled={cancelPending}
              >
                <X className="h-4 w-4 mr-1" />
                Cancel Meeting
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
