import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { Badge } from './ui/Badge';

interface AiHandledCardProps {
  value: string;
  badgeText?: string;
  description?: string;
  className?: string;
}

export const AiHandledCard: React.FC<AiHandledCardProps> = ({
  value,
  badgeText = 'AI replies / threads',
  description = 'Share of inbound threads where AI replied.',
  className = '',
}) => (
  <div className={`rounded-2xl p-4 ${className}`}>
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>AI-handled %</span>
      <ShieldCheck className="w-4 h-4 text-primary" />
    </div>
    <div className="mt-3 flex items-end gap-2">
      <span className="text-3xl font-bold text-foreground">{value}</span>
      <Badge variant="primary">{badgeText}</Badge>
    </div>
    <p className="text-xs text-muted-foreground mt-2">{description}</p>
  </div>
);
