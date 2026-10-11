'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface OnboardingSlide {
  titleHighlighted: string;
  titleRegular: string;
  subtitle: string;
  renderGraphic: () => React.ReactNode;
}

const SLIDES: OnboardingSlide[] = [
  {
    titleHighlighted: 'Track',
    titleRegular: 'your bus live',
    subtitle: 'See exactly where your college bus is on a live map, every morning.',
    renderGraphic: () => (
      <div className="relative flex h-64 w-full items-center justify-center overflow-hidden">
        {/* Warm Cream Horizon Backdrop Card */}
        <div className="absolute inset-0 bg-[#FEF9E7] rounded-3xl border border-amber-200/40 shadow-inner" />

        {/* Ambient Grid Accent */}
        <div
          className="absolute inset-0 opacity-20 pointer-events-none rounded-3xl"
          style={{
            backgroundImage: 'radial-gradient(#855300 0.75px, transparent 0.75px)',
            backgroundSize: '16px 16px',
          }}
        />

        <svg
          className="relative z-10 w-full max-w-xs h-56"
          viewBox="0 0 320 220"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Sky & Clouds */}
          <path
            d="M70 35C70 31 73 27 77 27C80 27 83 29 84 31C86 28 90 26 94 26C99 26 103 30 103 35C106 35 108 37 108 40C108 43 106 45 103 45H70C67 45 65 43 65 40C65 37 67 35 70 35Z"
            fill="#E2E8F0"
          />
          <path
            d="M190 24C190 20 193 16 197 16C200 16 203 18 204 20C206 17 210 15 214 15C219 15 223 19 223 24C226 24 228 26 228 29C228 32 226 34 223 34H190C187 34 185 32 185 29C185 26 187 24 190 24Z"
            fill="#E2E8F0"
            opacity="0.8"
          />

          {/* College Campus Buildings Silhouette */}
          <rect x="40" y="55" width="36" height="85" rx="3" fill="#94A3B8" />
          <rect x="46" y="65" width="8" height="6" fill="#F8FAFC" />
          <rect x="60" y="65" width="8" height="6" fill="#F8FAFC" />
          <rect x="46" y="80" width="8" height="6" fill="#F8FAFC" />
          <rect x="60" y="80" width="8" height="6" fill="#F8FAFC" />
          <rect x="46" y="95" width="8" height="6" fill="#F8FAFC" />
          <rect x="60" y="95" width="8" height="6" fill="#F8FAFC" />

          <rect x="90" y="38" width="45" height="102" rx="3" fill="#64748B" />
          <rect x="98" y="48" width="8" height="8" fill="#F8FAFC" opacity="0.9" />
          <rect x="116" y="48" width="8" height="8" fill="#F8FAFC" opacity="0.9" />
          <rect x="98" y="68" width="8" height="8" fill="#F8FAFC" opacity="0.9" />
          <rect x="116" y="68" width="8" height="8" fill="#F8FAFC" opacity="0.9" />
          <rect x="98" y="88" width="8" height="8" fill="#F8FAFC" opacity="0.9" />
          <rect x="116" y="88" width="8" height="8" fill="#F8FAFC" opacity="0.9" />

          <rect x="155" y="48" width="50" height="92" rx="3" fill="#475569" />
          <circle cx="168" cy="62" r="3" fill="#CBD5E1" />
          <circle cx="180" cy="62" r="3" fill="#CBD5E1" />
          <circle cx="192" cy="62" r="3" fill="#CBD5E1" />
          <circle cx="168" cy="78" r="3" fill="#CBD5E1" />
          <circle cx="180" cy="78" r="3" fill="#CBD5E1" />
          <circle cx="192" cy="78" r="3" fill="#CBD5E1" />

          {/* Road Surface */}
          <rect x="16" y="140" width="288" height="24" rx="4" fill="#475569" />
          <rect x="36" y="151" width="28" height="3" rx="1.5" fill="#FFFFFF" opacity="0.9" />
          <rect x="96" y="151" width="28" height="3" rx="1.5" fill="#FFFFFF" opacity="0.9" />
          <rect x="156" y="151" width="28" height="3" rx="1.5" fill="#FFFFFF" opacity="0.9" />
          <rect x="216" y="151" width="28" height="3" rx="1.5" fill="#FFFFFF" opacity="0.9" />

          {/* Yellow College Bus */}
          <g transform="translate(48, 88)">
            {/* Bus Body */}
            <path
              d="M10 24C10 21 12 19 15 19H172C178 19 184 24 186 30L194 48C195 50 196 52 196 55V72C196 74 194 76 192 76H10C7.8 76 6 74.2 6 72V28C6 25.8 7.8 24 10 24Z"
              fill="#F59E0B"
            />
            {/* Bus Roof Hat / Vent */}
            <rect x="25" y="16" width="130" height="4" rx="2" fill="#D97706" />
            {/* Accent Side Stripe */}
            <rect x="6" y="52" width="190" height="3.5" fill="#B45309" />
            <rect x="6" y="58" width="190" height="2" fill="#B45309" />
            {/* Windows */}
            <rect x="18" y="27" width="22" height="18" rx="2" fill="#1E293B" />
            <rect x="44" y="27" width="22" height="18" rx="2" fill="#1E293B" />
            <rect x="70" y="27" width="22" height="18" rx="2" fill="#1E293B" />
            <rect x="96" y="27" width="22" height="18" rx="2" fill="#1E293B" />
            <rect x="122" y="27" width="22" height="18" rx="2" fill="#1E293B" />
            {/* Windshield */}
            <path d="M152 27H166C170 27 173 30 175 34L180 45H152V27Z" fill="#0F172A" />
            {/* Wheels & Hubs */}
            <circle cx="48" cy="76" r="13" fill="#0F172A" />
            <circle cx="48" cy="76" r="6" fill="#94A3B8" />
            <circle cx="48" cy="76" r="2.5" fill="#F8FAFC" />
            <circle cx="160" cy="76" r="13" fill="#0F172A" />
            <circle cx="160" cy="76" r="6" fill="#94A3B8" />
            <circle cx="160" cy="76" r="2.5" fill="#F8FAFC" />

            {/* Pulsing GPS Beacon Halo */}
            <g transform="translate(162, -4)">
              <circle cx="0" cy="0" r="10" fill="#FBBF24" opacity="0.3" className="animate-ping" />
              <circle cx="0" cy="0" r="6" fill="#F59E0B" />
              <circle cx="0" cy="0" r="3" fill="#FFFFFF" />
            </g>
          </g>

          {/* Floating Live Telemetry Pills */}
          <g transform="translate(185, 20)">
            <rect x="0" y="0" width="105" height="26" rx="13" fill="#FFFFFF" filter="drop-shadow(0 4px 6px rgba(0,0,0,0.06))" />
            <circle cx="12" cy="13" r="4" fill="#10B981" />
            <text x="22" y="17" fill="#0F172A" fontSize="9" fontWeight="700" fontFamily="sans-serif">
              4 mins • 1.2 km
            </text>
          </g>

          <g transform="translate(25, 178)">
            <rect x="0" y="0" width="88" height="22" rx="11" fill="#FFFFFF" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.05))" />
            <circle cx="10" cy="11" r="3" fill="#F59E0B" />
            <text x="18" y="15" fill="#64748B" fontSize="8" fontWeight="600" fontFamily="sans-serif">
              Speed: 32 km/h
            </text>
          </g>
        </svg>
      </div>
    ),
  },
  {
    titleHighlighted: 'Never',
    titleRegular: 'miss your stop',
    subtitle: 'Get an alert when the bus is one stop away, so you are ready to board.',
    renderGraphic: () => (
      <div className="relative flex h-64 w-full items-center justify-center overflow-hidden">
        {/* Warm Cream Horizon Backdrop Card */}
        <div className="absolute inset-0 bg-[#FEF9E7] rounded-3xl border border-amber-200/40 shadow-inner" />

        <div
          className="absolute inset-0 opacity-20 pointer-events-none rounded-3xl"
          style={{
            backgroundImage: 'radial-gradient(#855300 0.75px, transparent 0.75px)',
            backgroundSize: '16px 16px',
          }}
        />

        <svg
          className="relative z-10 w-full max-w-xs h-56"
          viewBox="0 0 320 220"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Walking Student Character */}
          <g transform="translate(110, 16)">
            {/* Shadow */}
            <ellipse cx="40" cy="180" rx="42" ry="4" fill="#64748B" opacity="0.25" />

            {/* Legs & Shoes */}
            <path d="M35 110L20 155L6 178H20L34 150L45 110" fill="#3B82F6" />
            <path d="M42 110L52 145L58 178H44L38 145L34 110" fill="#2563EB" />

            {/* Torso & Yellow Sweater */}
            <path
              d="M28 50C28 42 36 38 46 38C56 38 65 42 66 50L68 85C68 90 64 94 58 94H34C28 94 26 90 26 85L28 50Z"
              fill="#FACC15"
            />

            {/* Purple Backpack */}
            <path d="M12 48C12 42 16 38 22 38L27 48V82C27 86 23 90 18 90C14 90 12 86 12 82V48Z" fill="#8B5CF6" />
            <path d="M14 62C14 60 16 58 19 58H25V70H19C16 70 14 68 14 66V62Z" fill="#7C3AED" />

            {/* Arms & Hands holding smartphone */}
            <path d="M54 50L75 70L85 64L70 48L54 50Z" fill="#FACC15" />
            <circle cx="86" cy="63" r="4" fill="#F87171" />

            {/* Mobile Phone Device with blue screen glow */}
            <rect x="85" y="52" width="8" height="16" rx="1.5" transform="rotate(20 85 52)" fill="#1E293B" />
            <rect x="86" y="54" width="6" height="12" rx="1" transform="rotate(20 86 54)" fill="#38BDF8" />

            {/* Head */}
            <circle cx="50" cy="28" r="11" fill="#F87171" />
            <path
              d="M40 24C40 16 46 10 56 10C64 10 70 14 68 22C66 22 62 18 56 18C50 18 46 22 46 26C44 26 42 28 40 24Z"
              fill="#3B82F6"
            />
            <circle cx="44" cy="27" r="2.5" fill="#EF4444" />
            <circle cx="44" cy="27" r="1.5" fill="#FFFFFF" />

            {/* Proximity Beacon Notification Cloud */}
            <g transform="translate(65, 12)">
              <rect
                x="0"
                y="0"
                width="116"
                height="32"
                rx="16"
                fill="#FFFFFF"
                filter="drop-shadow(0 4px 10px rgba(0,0,0,0.08))"
              />
              <circle cx="16" cy="16" r="6" fill="#F59E0B" />
              <path
                d="M14 14L16 16L19 13"
                stroke="#FFFFFF"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <text x="28" y="16" fill="#0F172A" fontSize="9" fontWeight="800" fontFamily="sans-serif">
                1 Stop Away!
              </text>
              <text x="28" y="24" fill="#64748B" fontSize="7" fontWeight="500" fontFamily="sans-serif">
                Walk to pickup curb
              </text>
            </g>
          </g>
        </svg>
      </div>
    ),
  },
  {
    titleHighlighted: 'Know',
    titleRegular: 'your seat availability',
    subtitle: 'View real-time occupancy percentages and seat capacity before arriving.',
    renderGraphic: () => (
      <div className="relative flex h-64 w-full items-center justify-center overflow-hidden">
        {/* Warm Cream Horizon Backdrop Card */}
        <div className="absolute inset-0 bg-[#FEF9E7] rounded-3xl border border-amber-200/40 shadow-inner" />

        <div
          className="absolute inset-0 opacity-20 pointer-events-none rounded-3xl"
          style={{
            backgroundImage: 'radial-gradient(#855300 0.75px, transparent 0.75px)',
            backgroundSize: '16px 16px',
          }}
        />

        {/* Seat Availability & Occupancy HUD */}
        <div className="relative z-10 flex flex-col items-center justify-center w-full max-w-xs px-4">
          {/* Top Status Capsule */}
          <div className="flex items-center gap-2 mb-3 bg-white px-4 py-1.5 rounded-full shadow-sm border border-slate-200/80">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold text-slate-900">72% Capacity</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              Seats Available
            </span>
          </div>

          {/* Segmented Capacity Percentage Bar */}
          <div className="w-full bg-white rounded-2xl p-3.5 shadow-sm border border-slate-200/80">
            <div className="flex justify-between items-center text-xs mb-2">
              <span className="font-semibold text-slate-700">Seat Occupancy</span>
              <span className="font-bold text-amber-600">72%</span>
            </div>

            {/* Segmented Bar */}
            <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden p-0.5 flex gap-1">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: '50%' }} />
              <div className="h-full bg-amber-400 rounded-full" style={{ width: '22%' }} />
              <div className="h-full bg-transparent rounded-full" style={{ width: '28%' }} />
            </div>

            {/* Visual Mini Seating Matrix Preview */}
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded bg-slate-800 text-white flex items-center justify-center text-[9px] font-bold">
                  ✓
                </span>
                <span>Occupied</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded bg-amber-400 text-slate-950 flex items-center justify-center text-[9px] font-bold">
                  •
                </span>
                <span className="font-medium text-amber-700">Vacant Seats</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    titleHighlighted: 'Everyone',
    titleRegular: 'in one place',
    subtitle: 'Admins manage routes and drivers. Students just open the app and go.',
    renderGraphic: () => (
      <div className="relative flex h-64 w-full items-center justify-center overflow-hidden">
        {/* Warm Cream Horizon Backdrop Card */}
        <div className="absolute inset-0 bg-[#FEF9E7] rounded-3xl border border-amber-200/40 shadow-inner" />

        <div
          className="absolute inset-0 opacity-20 pointer-events-none rounded-3xl"
          style={{
            backgroundImage: 'radial-gradient(#855300 0.75px, transparent 0.75px)',
            backgroundSize: '16px 16px',
          }}
        />

        <svg
          className="relative z-10 w-full max-w-xs h-56"
          viewBox="0 0 320 220"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Connected Network Lines */}
          <path
            d="M50 110 L90 85 L130 75 L170 100 L210 80 L250 85 L285 90"
            stroke="#FBBF24"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M70 155 L90 85 L120 135 L170 100 L210 135 L260 145"
            stroke="#F59E0B"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M120 135 L170 100 L245 105 L285 90"
            stroke="#FBBF24"
            strokeWidth="2"
            strokeDasharray="4 4"
          />

          {/* Student Node */}
          <g transform="translate(42, 100)">
            <circle cx="12" cy="12" r="14" fill="#EEF2FF" stroke="#6366F1" strokeWidth="2" />
            <text x="8" y="16" fill="#4338CA" fontSize="12" fontWeight="900" fontFamily="sans-serif">
              S
            </text>
          </g>

          {/* Driver Node */}
          <g transform="translate(82, 65)">
            <circle cx="12" cy="12" r="14" fill="#FFF1E8" stroke="#EA580C" strokeWidth="2" />
            <text x="8" y="16" fill="#C2410C" fontSize="12" fontWeight="900" fontFamily="sans-serif">
              D
            </text>
          </g>

          {/* Admin Command Tower Node (Central Hub) */}
          <g transform="translate(150, 75)">
            <circle
              cx="20"
              cy="20"
              r="24"
              fill="#EBF3FF"
              stroke="#2563EB"
              strokeWidth="3"
              filter="drop-shadow(0 4px 6px rgba(0,0,0,0.1))"
            />
            <text x="14" y="26" fill="#1D4ED8" fontSize="18" fontWeight="900" fontFamily="sans-serif">
              A
            </text>
          </g>

          <g transform="translate(225, 65)">
            <circle cx="12" cy="12" r="14" fill="#EEF2FF" stroke="#6366F1" strokeWidth="2" />
            <text x="8" y="16" fill="#4338CA" fontSize="12" fontWeight="900" fontFamily="sans-serif">
              S
            </text>
          </g>

          <g transform="translate(255, 125)">
            <circle cx="12" cy="12" r="14" fill="#FFF1E8" stroke="#EA580C" strokeWidth="2" />
            <text x="8" y="16" fill="#C2410C" fontSize="12" fontWeight="900" fontFamily="sans-serif">
              D
            </text>
          </g>

          {/* Campus Dispatch Center Pill */}
          <g transform="translate(100, 160)">
            <rect
              x="0"
              y="0"
              width="120"
              height="26"
              rx="13"
              fill="#FFFFFF"
              filter="drop-shadow(0 4px 8px rgba(0,0,0,0.06))"
            />
            <circle cx="12" cy="13" r="4" fill="#F59E0B" />
            <text x="22" y="17" fill="#0F172A" fontSize="9" fontWeight="800" fontFamily="sans-serif">
              Unified Campus Fleet
            </text>
          </g>
        </svg>
      </div>
    ),
  },
];

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const router = useRouter();

  // Touch Swipe Handling
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  const handleNext = useCallback(() => {
    if (currentStep < SLIDES.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      router.push('/welcome');
    }
  }, [currentStep, router]);

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const onTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const distance = touchStartX.current - touchEndX.current;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe && currentStep < SLIDES.length - 1) {
      handleNext();
    }
    if (isRightSwipe && currentStep > 0) {
      handlePrev();
    }

    touchStartX.current = null;
    touchEndX.current = null;
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrev]);

  const slide = SLIDES[currentStep];

  return (
    <div
      className="flex min-h-screen flex-col bg-white px-6 pb-10 pt-6 select-none sm:items-center"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div className="flex w-full max-w-sm flex-1 flex-col justify-between">
        {/* Top Header - Branding & Skip Button */}
        <div className="flex h-10 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-400 text-slate-950 shadow-xs">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z" />
              </svg>
            </div>
            <span className="text-sm font-black tracking-tight text-slate-900">BTS Tracker</span>
          </div>

          {currentStep < SLIDES.length - 1 ? (
            <Link
              href="/welcome"
              className="text-xs font-semibold px-3 py-1 rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              Skip
            </Link>
          ) : (
            <span className="h-4" />
          )}
        </div>

        {/* Center Graphic Illustration */}
        <div className="my-auto py-2">
          {slide.renderGraphic()}

          {/* Typography Heading & Subtitle */}
          <div className="mt-8 text-center px-2">
            <h1 className="text-3xl font-black tracking-tight text-slate-900">
              <span className="text-amber-500">{slide.titleHighlighted}</span>{' '}
              {slide.titleRegular}
            </h1>
            <p className="mt-3 text-sm text-slate-500 leading-relaxed max-w-xs mx-auto">
              {slide.subtitle}
            </p>
          </div>
        </div>

        {/* Footer Navigation: Pagination Dots + Action Button */}
        <div className="mt-auto flex flex-col items-center space-y-6 pt-4">
          {/* Pagination Pill Indicators */}
          <div className="flex items-center space-x-2">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentStep(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === currentStep
                    ? 'w-8 bg-amber-400'
                    : 'w-2 bg-slate-200 hover:bg-slate-300'
                }`}
              />
            ))}
          </div>

          {/* Primary Action Button (Continue / Get started) */}
          <button
            onClick={handleNext}
            className="w-full py-4 rounded-full bg-amber-400 hover:bg-amber-500 active:scale-[0.98] font-bold text-base text-slate-950 shadow-[0_10px_25px_-5px_rgba(245,158,11,0.45)] transition-all duration-200 flex items-center justify-center gap-2"
          >
            <span>{currentStep === SLIDES.length - 1 ? 'Get Started' : 'Continue'}</span>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>

          {/* Secondary Sign In Link */}
          <div className="text-center">
            <Link
              href="/welcome"
              className="text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors"
            >
              Already registered? <span className="font-bold text-slate-900 underline underline-offset-2">Sign in</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
