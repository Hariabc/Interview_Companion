'use client';
import { useEffect, useState } from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    Radar
} from 'recharts';

export function ProgressChart({ data }: { data: any[] }) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    if (!mounted) return <div className="h-64 w-full flex items-center justify-center text-gray-500">Loading chart...</div>;

    return (
        <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="date" stroke="#9CA3AF" />
                    <YAxis stroke="#9CA3AF" domain={[0, 100]} />
                    <Tooltip
                        contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px' }}
                        itemStyle={{ color: '#E5E7EB' }}
                    />
                    <Line
                        type="monotone"
                        dataKey="score"
                        stroke="#3B82F6"
                        strokeWidth={2}
                        dot={{ r: 4, fill: '#3B82F6' }}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}

export function MasteryChart({ data }: { data: any[] }) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    if (!mounted) return <div className="h-64 w-full flex items-center justify-center text-gray-500">Loading chart...</div>;

    return (
        <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
                    <PolarGrid stroke="#374151" />
                    <PolarAngleAxis dataKey="topic" tick={{ fill: '#9CA3AF' }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} />
                    <Radar
                        name="Mastery"
                        dataKey="score"
                        stroke="#10B981"
                        fill="#10B981"
                        fillOpacity={0.5}
                    />
                    <Tooltip
                        contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px' }}
                        itemStyle={{ color: '#E5E7EB' }}
                    />
                </RadarChart>
            </ResponsiveContainer>
        </div>
    );
}
