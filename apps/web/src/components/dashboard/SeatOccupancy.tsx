export function SeatOccupancy({ current, max }: { current: number; max: number }) {
  const percentage = max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0;

  return (
    <div className="w-full py-2">
      <div className="mb-2 flex justify-between text-sm font-semibold text-gray-700">
        <span>Occupancy</span>
        <span className="font-bold text-gray-900">{percentage}% Full</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${
            percentage >= 90
              ? 'bg-red-500'
              : percentage >= 70
              ? 'bg-amber-500'
              : 'bg-primary-yellow'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
