export default function DashboardSkeleton() {
  return (
    <div className="dashboard-page">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            style={{
              height: 110,
              background: 'var(--surface2)',
              borderRadius: 14,
              animation: 'pulse 1.5s ease infinite',
            }}
          />
        ))}
      </div>
    </div>
  );
}
