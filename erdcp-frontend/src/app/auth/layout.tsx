export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: 'var(--bg)' }}>
      {/* Background grid */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: 'linear-gradient(var(--border-strong) 1px, transparent 1px), linear-gradient(90deg, var(--border-strong) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      {/* Colour blobs */}
      <div className="absolute top-0 left-0 w-96 h-96 rounded-full blur-3xl opacity-15"
        style={{ background: '#E8442A', transform: 'translate(-40%, -40%)' }} />
      <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full blur-3xl opacity-10"
        style={{ background: '#1AB8C8', transform: 'translate(40%, 40%)' }} />
      <div className="relative z-10 w-full max-w-sm px-4">
        {children}
      </div>
    </div>
  );
}
