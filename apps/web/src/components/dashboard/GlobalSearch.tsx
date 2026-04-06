'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOrganization } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { Search, User, MessageSquare, ShoppingBag, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { searchApi } from '@/lib/api';
import { cn } from '@/lib/utils';

export function GlobalSearch() {
  const { organization } = useOrganization();
  const tenantId = organization?.publicMetadata?.tenantId as string | undefined;
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: results } = useQuery({
    queryKey: ['global-search', tenantId, query],
    queryFn: () => searchApi.search(tenantId!, query),
    enabled: !!tenantId && query.length >= 2,
    staleTime: 5000,
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const hasResults = results && (
    results.contacts?.length > 0 ||
    results.conversations?.length > 0 ||
    results.orders?.length > 0
  );

  const navigate = (path: string) => {
    setOpen(false);
    setQuery('');
    router.push(path);
  };

  return (
    <div ref={ref} className="relative w-full sm:w-80">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search contacts, orders, conversations..."
          className="pl-9 pr-8 h-9 text-sm bg-white"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setOpen(false); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && query.length >= 2 && (
        <div className="absolute top-full mt-1 w-full bg-white rounded-lg border shadow-lg z-50 max-h-80 overflow-y-auto">
          {!hasResults ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              No results for &ldquo;{query}&rdquo;
            </div>
          ) : (
            <div className="py-1">
              {results.contacts?.length > 0 && (
                <Section title="Contacts">
                  {results.contacts.map((c: any) => (
                    <ResultItem
                      key={c.id}
                      icon={User}
                      title={c.name || c.phone}
                      subtitle={c.name ? c.phone : c.status}
                      onClick={() => navigate(`/dashboard/contacts?search=${encodeURIComponent(c.phone)}`)}
                    />
                  ))}
                </Section>
              )}
              {results.conversations?.length > 0 && (
                <Section title="Conversations">
                  {results.conversations.map((c: any) => (
                    <ResultItem
                      key={c.id}
                      icon={MessageSquare}
                      title={c.callerPhone}
                      subtitle={c.flowType ?? 'Conversation'}
                      onClick={() => navigate(`/dashboard/conversations/${c.id}`)}
                    />
                  ))}
                </Section>
              )}
              {results.orders?.length > 0 && (
                <Section title="Orders">
                  {results.orders.map((o: any) => (
                    <ResultItem
                      key={o.id}
                      icon={ShoppingBag}
                      title={`Order #${o.orderNumber}`}
                      subtitle={`${o.callerPhone} - ${o.status}`}
                      onClick={() => navigate('/dashboard/orders')}
                    />
                  ))}
                </Section>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {title}
      </div>
      {children}
    </div>
  );
}

function ResultItem({ icon: Icon, title, subtitle, onClick }: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/50 transition-colors text-left"
    >
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{title}</div>
        <div className="text-xs text-muted-foreground truncate">{subtitle}</div>
      </div>
    </button>
  );
}
