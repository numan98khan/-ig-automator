import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Download, ExternalLink } from 'lucide-react';
import { MessageAttachment, LinkPreview } from '../services/api';

// Image Attachment Component
export const ImageAttachment: React.FC<{ attachment: MessageAttachment }> = ({ attachment }) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  return (
    <div className="relative max-w-sm rounded-lg overflow-hidden">
      {!loaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/20 animate-pulse">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
      {error ? (
        <div className="flex items-center justify-center p-4 bg-muted/20 rounded-lg">
          <p className="text-sm text-muted-foreground">Failed to load image</p>
        </div>
      ) : (
        <img
          src={attachment.url}
          alt={attachment.fileName || 'Image'}
          className={`w-full h-auto rounded-lg transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          loading="lazy"
        />
      )}
      <a
        href={attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-2 right-2 p-2 bg-black/60 hover:bg-black/80 rounded-full transition"
        title="Open in new tab"
      >
        <ExternalLink className="w-4 h-4 text-white" />
      </a>
    </div>
  );
};

// Video Attachment Component
export const VideoAttachment: React.FC<{ attachment: MessageAttachment }> = ({ attachment }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState(false);

  const togglePlay = () => {
    if (videoRef.current) {
      if (playing) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setPlaying(!playing);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !muted;
      setMuted(!muted);
    }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center p-4 bg-muted/20 rounded-lg max-w-sm">
        <p className="text-sm text-muted-foreground">Failed to load video</p>
      </div>
    );
  }

  return (
    <div className="relative max-w-sm rounded-lg overflow-hidden group">
      <video
        ref={videoRef}
        src={attachment.url}
        poster={attachment.thumbnailUrl || attachment.previewUrl}
        className="w-full h-auto rounded-lg"
        onError={() => setError(true)}
        onClick={togglePlay}
      />
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={togglePlay}
          className="p-4 bg-black/60 hover:bg-black/80 rounded-full transition"
        >
          {playing ? (
            <Pause className="w-8 h-8 text-white" />
          ) : (
            <Play className="w-8 h-8 text-white ml-1" />
          )}
        </button>
      </div>
      <div className="absolute bottom-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={toggleMute}
          className="p-2 bg-black/60 hover:bg-black/80 rounded-full transition"
        >
          {muted ? (
            <VolumeX className="w-4 h-4 text-white" />
          ) : (
            <Volume2 className="w-4 h-4 text-white" />
          )}
        </button>
        <a
          href={attachment.url}
          download
          className="p-2 bg-black/60 hover:bg-black/80 rounded-full transition"
          title="Download"
        >
          <Download className="w-4 h-4 text-white" />
        </a>
      </div>
      {attachment.duration && (
        <div className="absolute top-2 right-2 px-2 py-1 bg-black/60 rounded text-white text-xs">
          {formatDuration(attachment.duration)}
        </div>
      )}
    </div>
  );
};

// Voice Note / Audio Attachment Component
export const VoiceAttachment: React.FC<{ attachment: MessageAttachment }> = ({ attachment }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnd = () => setPlaying(false);
    const handleError = () => setError(true);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnd);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnd);
      audio.removeEventListener('error', handleError);
    };
  }, []);

  const togglePlay = () => {
    if (audioRef.current) {
      if (playing) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setPlaying(!playing);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  if (error) {
    return (
      <div className="flex items-center gap-2 p-3 bg-muted/20 rounded-lg">
        <p className="text-sm text-muted-foreground">Failed to load audio</p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg max-w-sm">
      <audio ref={audioRef} src={attachment.url} />
      <button
        onClick={togglePlay}
        className="flex-shrink-0 p-2 bg-primary hover:bg-primary/90 rounded-full transition"
      >
        {playing ? (
          <Pause className="w-5 h-5 text-primary-foreground" />
        ) : (
          <Play className="w-5 h-5 text-primary-foreground ml-0.5" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <input
          type="range"
          min="0"
          max={duration || 0}
          value={currentTime}
          onChange={handleSeek}
          className="w-full h-1 bg-border rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>{formatDuration(currentTime)}</span>
          <span>{formatDuration(duration)}</span>
        </div>
      </div>
    </div>
  );
};

// Link Preview Component
export const LinkPreviewComponent: React.FC<{ linkPreview: LinkPreview }> = ({ linkPreview }) => {
  return (
    <a
      href={linkPreview.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block max-w-sm border border-border rounded-lg overflow-hidden hover:border-primary/50 transition group"
    >
      {linkPreview.imageUrl && (
        <div className="aspect-video w-full overflow-hidden bg-muted">
          <img
            src={linkPreview.imageUrl}
            alt={linkPreview.title || 'Link preview'}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        </div>
      )}
      <div className="p-3 bg-muted/30">
        {linkPreview.siteName && (
          <p className="text-xs text-muted-foreground mb-1">{linkPreview.siteName}</p>
        )}
        {linkPreview.title && (
          <p className="font-medium text-sm line-clamp-2 mb-1">{linkPreview.title}</p>
        )}
        {linkPreview.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{linkPreview.description}</p>
        )}
        <p className="text-xs text-primary mt-2 flex items-center gap-1">
          <ExternalLink className="w-3 h-3" />
          {new URL(linkPreview.url).hostname}
        </p>
      </div>
    </a>
  );
};

// File Attachment Component
export const FileAttachment: React.FC<{ attachment: MessageAttachment }> = ({ attachment }) => {
  return (
    <a
      href={attachment.url}
      download
      className="flex items-center gap-3 p-3 bg-muted/50 border border-border rounded-lg hover:border-primary/50 transition max-w-sm"
    >
      <div className="flex-shrink-0 w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
        <Download className="w-5 h-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{attachment.fileName || 'File'}</p>
        {attachment.fileSize && (
          <p className="text-xs text-muted-foreground">{formatFileSize(attachment.fileSize)}</p>
        )}
      </div>
    </a>
  );
};

// Helper functions
function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
