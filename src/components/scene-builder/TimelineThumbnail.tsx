interface TimelineThumbnailProps {
  thumbnail: {
    timestamp: number;
    url: string;
  };
  isActive: boolean;
  onClick: () => void;
}

export const TimelineThumbnail = ({ thumbnail, isActive, onClick }: TimelineThumbnailProps) => {
  return (
    <div
      className={`timeline-thumbnail ${isActive ? 'timeline-thumbnail--active' : ''}`}
      onClick={onClick}
    >
      <img src={thumbnail.url} alt={`${thumbnail.timestamp}s`} className="timeline-thumbnail__image" />
      <span className="timeline-thumbnail__time">{thumbnail.timestamp.toFixed(1)}s</span>
    </div>
  );
};
