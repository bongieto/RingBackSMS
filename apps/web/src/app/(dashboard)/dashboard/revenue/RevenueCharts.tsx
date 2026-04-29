'use client';

import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export function RevenueByDayChart({
  data,
}: {
  data: Array<{ date: string; revenueCents: number; orders: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={data.map((d) => ({ ...d, dollars: d.revenueCents / 100 }))}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickFormatter={(d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          fontSize={12}
        />
        <YAxis tickFormatter={(v) => `$${v}`} fontSize={12} />
        <Tooltip
          formatter={(v: number) => [`$${v.toFixed(2)}`, 'Revenue']}
          labelFormatter={(d) => new Date(String(d) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        />
        <Line type="monotone" dataKey="dollars" stroke="#10b981" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function OrdersByHourChart({
  data,
}: {
  data: Array<{ hour: number; orders: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="hour"
          tickFormatter={(h) => {
            if (h === 0) return '12a';
            if (h === 12) return '12p';
            return h < 12 ? `${h}a` : `${h - 12}p`;
          }}
          fontSize={11}
          interval={1}
        />
        <YAxis allowDecimals={false} fontSize={12} />
        <Tooltip
          labelFormatter={(h) => {
            const hour = Number(h);
            return hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`;
          }}
        />
        <Bar dataKey="orders" fill="#3b82f6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
