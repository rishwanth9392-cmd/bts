interface MapContainerProps {
  className?: string;
  label?: string;
}

export function MapContainer({ className = 'h-64', label = 'Live Map View (Coming in Phase 3)' }: MapContainerProps) {
  return (
    <div className={`flex w-full items-center justify-center rounded-2xl border-2 border-dashed border-primary-yellow bg-gray-50 p-4 shadow-inner ${className}`}>
      <span className="text-base font-bold text-gray-400">{label}</span>
    </div>
  );
}
