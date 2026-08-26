export type ShutdownSignal = "SIGINT" | "SIGTERM";

type ShutdownEvent = {
  event: "shutdown_started" | "shutdown_complete" | "shutdown_failed" | "shutdown_forced";
  signal: ShutdownSignal;
  errorName?: string;
};

type TimerHandle = ReturnType<typeof setTimeout>;

type ShutdownOptions = {
  closeNetwork: () => Promise<void>;
  closeResources: () => Promise<void> | void;
  timeoutMs?: number;
  exit?: (code: number) => void;
  log?: (event: ShutdownEvent) => void;
  scheduleTimeout?: (callback: () => void, milliseconds: number) => TimerHandle;
  cancelTimeout?: (handle: TimerHandle) => void;
};

const defaultLog = (event: ShutdownEvent) => console.info(JSON.stringify(event));

export function createShutdownHandler(options: ShutdownOptions) {
  const timeoutMs = options.timeoutMs ?? 10_000,
    exit = options.exit || ((code: number) => process.exit(code)),
    log = options.log || defaultLog,
    scheduleTimeout = options.scheduleTimeout || setTimeout,
    cancelTimeout = options.cancelTimeout || clearTimeout;
  let inFlight: Promise<void> | undefined;

  return (signal: ShutdownSignal) => {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      log({ event: "shutdown_started", signal });
      let forced = false;
      const forceTimer = scheduleTimeout(() => {
        forced = true;
        log({ event: "shutdown_forced", signal });
        exit(1);
      }, timeoutMs);
      forceTimer.unref?.();

      let failure: unknown;
      try {
        await options.closeNetwork();
      } catch (error) {
        failure = error;
      }
      try {
        await options.closeResources();
      } catch (error) {
        failure ||= error;
      }
      cancelTimeout(forceTimer);
      if (forced) return;
      if (failure) {
        const errorName =
          failure instanceof Error && /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(failure.name)
            ? failure.name
            : "UnknownError";
        log({ event: "shutdown_failed", signal, errorName });
        exit(1);
        return;
      }
      log({ event: "shutdown_complete", signal });
      exit(0);
    })();
    return inFlight;
  };
}

export function registerShutdownSignals(
  handler: ReturnType<typeof createShutdownHandler>,
) {
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => void handler(signal));
}
