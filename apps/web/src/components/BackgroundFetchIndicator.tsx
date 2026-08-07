import { useIsFetching } from '@tanstack/react-query';

export function BackgroundFetchIndicator() {
  const backgroundFetchCount = useIsFetching({
    predicate: (query) => query.state.data !== undefined,
  });
  const isRefreshing = backgroundFetchCount > 0;

  return (
    <>
      <div
        aria-hidden="true"
        data-testid="background-fetch-indicator"
        data-refreshing={isRefreshing ? 'true' : 'false'}
        className={`pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 bg-accent shadow-[0_0_8px_var(--sam-color-accent-primary)] transition-opacity duration-150 motion-reduce:transition-none ${
          isRefreshing ? 'opacity-100 delay-150' : 'opacity-0 delay-0'
        }`}
      />
      <span className="sr-only" role="status" aria-live="polite">
        {isRefreshing ? 'Refreshing data' : ''}
      </span>
    </>
  );
}
