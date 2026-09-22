/**
 * Type shim for omp's internal router.
 * The real import happens in try/catch at runtime (see tryRegisterArtifactsProtocol):
 * if omp moves the file, the extension still loads without the protocol.
 */
declare module "@oh-my-pi/pi-coding-agent/src/internal-urls/router" {
  export const InternalUrlRouter: {
    instance(): { register(handler: unknown): void };
  };
}
