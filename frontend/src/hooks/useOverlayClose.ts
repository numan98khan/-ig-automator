import { useEffect, useRef } from 'react';

interface UseOverlayCloseProps {
  isOpen: boolean;
  onClose: () => void;
}

export const useOverlayClose = ({ isOpen, onClose }: UseOverlayCloseProps) => {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onClick);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onClick);
    };
  }, [isOpen, onClose]);

  return ref;
};

export default useOverlayClose;
