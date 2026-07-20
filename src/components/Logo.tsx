export function Logo({ className = "h-9 w-auto", variant }: { className?: string; variant?: "dark" | "light" }) {
  // "dark" = logo designed for dark backgrounds (dark bg + light artwork).
  // "light" = logo designed for light backgrounds (light bg + dark artwork).
  // Auto: show dark-bg version in dark theme, light-bg version in light theme.
  if (variant === "dark") return <img src="/2a-logo-dark.png" alt="2A" className={className} />;
  if (variant === "light") return <img src="/2a-logo-light.png" alt="2A" className={className} />;
  return (
    <>
      <img src="/2a-logo-light.png" alt="2A" className={`${className} block dark:hidden`} />
      <img src="/2a-logo-dark.png" alt="2A" className={`${className} hidden dark:block`} />
    </>
  );
}
