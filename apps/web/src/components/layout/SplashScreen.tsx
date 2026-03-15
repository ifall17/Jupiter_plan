export default function SplashScreen() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        background: 'var(--page, #faf8f4)',
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          border: '3px solid var(--border, #e8e2d9)',
          borderTopColor: 'var(--terra, #c4622d)',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <p
        style={{
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: '0.06em',
          color: 'var(--text-lo, #8a7f72)',
          textTransform: 'uppercase',
        }}
      >
        Jupiter Plan
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
