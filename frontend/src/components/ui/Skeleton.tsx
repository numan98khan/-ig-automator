import React from 'react';

type SkeletonProps = {
  className?: string;
};

export const Skeleton: React.FC<SkeletonProps> = ({ className }) => (
  <div
    aria-hidden="true"
    className={`animate-pulse rounded-md bg-muted ${className || ''}`}
  />
);
