export function Logo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path d="M11.5 11.2A7.5 7.5 0 1 1 8.8 17M11.5 6.8v4.6H7" fill="none" stroke="var(--paper)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 12.5V16l2.6 1.6" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function GoogleMark() {
  return (
    <svg className="gmark" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M23 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.17a5.28 5.28 0 0 1-2.29 3.46v2.87h3.7C21.74 18.8 23 15.8 23 12.27z" />
      <path fill="#34A853" d="M12 23.5c3.1 0 5.7-1.03 7.58-2.78l-3.7-2.87c-1.03.69-2.34 1.1-3.88 1.1-2.98 0-5.5-2.01-6.4-4.72H1.78v2.96A11.5 11.5 0 0 0 12 23.5z" />
      <path fill="#FBBC05" d="M5.6 14.23a6.9 6.9 0 0 1 0-4.46V6.81H1.78a11.5 11.5 0 0 0 0 10.38l3.82-2.96z" />
      <path fill="#EA4335" d="M12 5.05c1.69 0 3.2.58 4.39 1.72l3.29-3.29C17.7 1.62 15.1.5 12 .5A11.5 11.5 0 0 0 1.78 6.81L5.6 9.77C6.5 7.06 9.02 5.05 12 5.05z" />
    </svg>
  );
}
