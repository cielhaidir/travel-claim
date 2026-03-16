export default function RootLoading() {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent" />
        <p className="text-sm text-gray-600">Loading...</p>
      </div>
    </div>
  );
}