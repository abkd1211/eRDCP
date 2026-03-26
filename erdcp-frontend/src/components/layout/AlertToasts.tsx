'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { X, AlertTriangle, CheckCircle, WifiOff, AlertCircle } from 'lucide-react';
import { useSocket } from '@/store/socket.store';
import type { AlertType } from '@/types';

const ALERT_ICON: Record<AlertType, React.ReactNode> = {
  deviation:     <AlertTriangle size={14} />,
  arrived:       <CheckCircle size={14} />,
  unresponsive:  <WifiOff size={14} />,
  incident_new:  <AlertCircle size={14} />,
};
const ALERT_COLOR: Record<AlertType, string> = {
  deviation:    '#C97B1A',
  arrived:      '#7CB518',
  unresponsive: '#E8442A',
  incident_new: '#1AB8C8',
};

export function AlertToasts() {
  const { alerts, dismissAlert } = useSocket();

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
      <AnimatePresence initial={false}>
        {alerts.slice(0, 4).map((alert) => (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, x: 64, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 64, scale: 0.95 }}
            transition={{ duration: 0.22 }}
            className="card-hi flex items-start gap-3 px-3 py-3"
            style={{ borderLeft: `2px solid ${ALERT_COLOR[alert.type]}` }}
          >
            <span className="flex-shrink-0 mt-0.5" style={{ color: ALERT_COLOR[alert.type] }}>
              {ALERT_ICON[alert.type]}
            </span>
            <p className="text-xs flex-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {alert.message}
            </p>
            <button onClick={() => dismissAlert(alert.id)}
              className="flex-shrink-0 transition-colors hover:opacity-70" style={{ color: 'var(--text-faint)' }}>
              <X size={13} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
