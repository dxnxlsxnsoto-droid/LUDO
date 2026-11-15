import React, { useEffect, useState } from 'react';

export const SubtleCornerClock: React.FC = () => {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const formattedTime = now.toLocaleTimeString('es-GT', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  return (
    <div
      aria-label="Hora actual"
      className="fixed bottom-3 right-4 pointer-events-none select-none z-20 text-[11px] font-medium tabular text-[#76766E]/75 tracking-tight"
    >
      {formattedTime}
    </div>
  );
};
