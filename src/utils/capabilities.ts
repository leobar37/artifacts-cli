/**
 * Viewer capabilities live in the shared store package so the CLI and the
 * omp extension serve the exact same component/formats reference
 * (`artifact capabilities` and the `artifact_capabilities` tool).
 */
export {
  getViewerCapabilities,
  formatCapabilitiesText,
  type ComponentDoc,
  type ComponentPropDoc,
  type FormatDoc,
  type ViewerCapabilities,
} from "@tarileo/artifact-store";
