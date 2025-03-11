"use client";

export const GridBackground = () => (
  <div className="fixed inset-0 min-h-screen">
    <div className="fixed inset-0 min-h-screen bg-[radial-gradient(circle,_rgba(120,_90,_255,_0.3)_2px,_transparent_2px)] bg-[length:48px_48px]" />
    <div
      className="fixed inset-0 min-h-screen opacity-50 transition-opacity duration-300 bg-[radial-gradient(circle_200px_at_var(--mouse-x)_var(--mouse-y),rgba(120,_90,_255,_0.1),transparent_100%)]"
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        e.currentTarget.style.setProperty("--mouse-x", `${x}px`);
        e.currentTarget.style.setProperty("--mouse-y", `${y}px`);
      }}
    />
  </div>
);
