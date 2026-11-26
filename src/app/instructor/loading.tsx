export default function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-9 w-72 rounded-lg" />
      <div className="skeleton h-10 w-full max-w-md rounded-full" />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="skeleton h-80 rounded-card" />
        <div className="skeleton h-80 rounded-card" />
      </div>
    </div>
  );
}
