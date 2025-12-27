import React from 'react';

type AutomationPlaceholderSectionProps = {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  description: string;
};

export const AutomationPlaceholderSection: React.FC<AutomationPlaceholderSectionProps> = ({
  icon,
  title,
  subtitle,
  description,
}) => (
  <div className="space-y-6 animate-fade-in">
    <div className="text-center py-16 border-2 border-dashed border-border/70 dark:border-white/10 rounded-xl bg-muted/40 dark:bg-white/5">
      <div className="w-16 h-16 mx-auto mb-4 text-muted-foreground flex items-center justify-center">
        {icon}
      </div>
      <h3 className="text-2xl font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground text-lg mb-4">{subtitle}</p>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">
        {description}
      </p>
    </div>
  </div>
);
