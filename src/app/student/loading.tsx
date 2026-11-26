export default function Loading() {
  return (
    <div className="flex flex-col gap-3.5 px-5 pt-6" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-4 w-32 rounded" />
      <div className="skeleton h-7 w-48 rounded-lg" />
      <div className="skeleton mt-2 h-64 rounded-sheet" />
      <div className="skeleton h-40 rounded-sheet" />
    </div>
  );
}
