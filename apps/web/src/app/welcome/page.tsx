'use client';

import Link from 'next/link';

interface RoleCardProps {
  role: string;
  title: string;
  badgeLabel: string;
  tagline: string;
  description: string;
  features: string[];
  href: string;
  bgClass: string;
  borderClass: string;
  letterClass: string;
  letterBg: string;
  iconLetter: string;
  subIcon: React.ReactNode;
}

function RoleCard({
  title,
  badgeLabel,
  tagline,
  description,
  features,
  href,
  bgClass,
  borderClass,
  letterClass,
  letterBg,
  iconLetter,
  subIcon,
}: RoleCardProps) {
  return (
    <Link
      href={href}
      className={`group relative block w-full rounded-3xl p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg active:scale-[0.98] ${bgClass} ${borderClass} border shadow-xs`}
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left: Squircle Avatar Badge + Titles */}
        <div className="flex items-start gap-4">
          {/* White Squircle Avatar Badge */}
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm border border-slate-100">
            <span className={`text-2xl font-black ${letterClass}`}>{iconLetter}</span>
            {/* Mini overlay badge */}
            <div className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-white shadow-xs ${letterBg}`}>
              {subIcon}
            </div>
          </div>

          {/* Role Header & Tagline */}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-black tracking-tight text-slate-900 group-hover:text-slate-950 transition-colors">
                {title}
              </h3>
              <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 shadow-2xs">
                {badgeLabel}
              </span>
            </div>
            <p className="mt-0.5 text-xs font-semibold text-slate-700">{tagline}</p>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed pr-2">
              {description}
            </p>
          </div>
        </div>

        {/* Right: Round Action Arrow Pill Button */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white shadow-sm border border-slate-200/60 text-slate-700 group-hover:bg-amber-400 group-hover:text-slate-950 transition-all duration-200">
          <svg className="h-5 w-5 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>

      {/* Horizontal Feature Tag Pills */}
      <div className="mt-4 flex flex-wrap gap-2 pt-1 border-t border-black/[0.04]">
        {features.map((feature) => (
          <span
            key={feature}
            className="inline-flex items-center rounded-full bg-white/95 px-3 py-1 text-xs font-medium text-slate-800 shadow-2xs"
          >
            <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-amber-400" />
            {feature}
          </span>
        ))}
      </div>
    </Link>
  );
}

export default function WelcomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 px-6 pb-12 pt-8 sm:items-center selection:bg-amber-100 selection:text-amber-900">
      <div className="w-full max-w-sm">
        {/* Top Header / Branding Anchor */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-200/80 bg-amber-400 text-slate-950 shadow-sm">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z" />
              </svg>
            </div>
            <div>
              <span className="text-xl font-black tracking-tight text-slate-900 block leading-tight">
                BTS
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Campus Transit Hub
              </span>
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-2xs border border-slate-200">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Online</span>
          </div>
        </div>

        {/* Hero Title & Subtitle with First-Word Highlight */}
        <div className="mb-6">
          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            <span className="text-amber-500">Welcome</span> aboard
          </h1>
          <p className="mt-2 text-sm text-slate-500 leading-relaxed">
            Track your college bus in real time. Select your portal to proceed.
          </p>

          {/* Yellow Accent Pill Bar */}
          <div className="mt-3 h-1.5 w-12 rounded-full bg-amber-400" />
        </div>

        {/* Role Cards List */}
        <div className="flex flex-col space-y-4">
          {/* 1. Student Card (Lavender: #EEF2FF) */}
          <RoleCard
            role="Student"
            title="Student"
            badgeLabel="Rider"
            tagline="Ride to class, stress-free"
            description="Live bus map, arrival countdowns, stop notices, and verified boarding."
            features={['Live tracking', 'Arrival alerts', 'Route info']}
            href="/student/login"
            bgClass="bg-[#EEF2FF]"
            borderClass="border-indigo-100"
            letterClass="text-indigo-600"
            letterBg="bg-indigo-600"
            iconLetter="S"
            subIcon={
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 3L1 9l11 6 9-4.91V17h2V9L12 3zm0 15.5l-6-3.27V18l6 3 6-3v-2.77l-6 3.27z" />
              </svg>
            }
          />

          {/* 2. Driver Card (Peach: #FFF1E8) */}
          <RoleCard
            role="Driver"
            title="Driver"
            badgeLabel="Console"
            tagline="Share your route in one tap"
            description="Broadcast your live trip, update passenger load, and access rapid SOS."
            features={['One-tap start', 'Real-time location', 'Route notice']}
            href="/driver/login"
            bgClass="bg-[#FFF1E8]"
            borderClass="border-orange-100"
            letterClass="text-orange-600"
            letterBg="bg-orange-600"
            iconLetter="D"
            subIcon={
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
              </svg>
            }
          />

          {/* 3. Admin Card (Sky Blue: #EBF3FF) */}
          <RoleCard
            role="Admin"
            title="Admin"
            badgeLabel="Fleet Ops"
            tagline="Run your fleet from anywhere"
            description="Manage campus buses, assign drivers, audit telemetry, and manage incidents."
            features={['Fleet command', 'Driver dispatch', 'Live dashboard']}
            href="/admin/login"
            bgClass="bg-[#EBF3FF]"
            borderClass="border-blue-100"
            letterClass="text-blue-600"
            letterBg="bg-blue-600"
            iconLetter="A"
            subIcon={
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
              </svg>
            }
          />
        </div>

        {/* Real-time Telemetry Mesh Pill */}
        <div className="mt-8 flex items-center justify-center gap-2 rounded-full bg-white px-4 py-2 border border-slate-200/80 shadow-2xs">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 animate-ping" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
          </span>
          <span className="text-xs font-semibold text-slate-600">
            BTS Satellite GPS Mesh Active • 14 Buses Online
          </span>
        </div>

        {/* Footer Note */}
        <div className="mt-6 text-center">
          <p className="text-xs text-slate-500">
            Authorized institutional access only •{' '}
            <Link href="/" className="font-semibold text-slate-900 hover:text-amber-600 underline underline-offset-2">
              Back to Overview
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
