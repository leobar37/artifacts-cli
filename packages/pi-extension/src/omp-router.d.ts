/**
 * Shim de tipos para el router interno de omp.
 * El import real ocurre en try/catch en runtime (ver tryRegisterArtifactsProtocol):
 * si omp mueve el archivo, la extensión sigue cargando sin protocolo.
 */
declare module "@oh-my-pi/pi-coding-agent/src/internal-urls/router" {
  export const InternalUrlRouter: {
    instance(): { register(handler: unknown): void };
  };
}
