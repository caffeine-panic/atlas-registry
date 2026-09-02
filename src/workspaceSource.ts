import {
  cancelOperation,
  closeConnection,
  inspectNativeResource,
  listResources,
  loadConnectionProfiles,
  openConnection,
  readResource,
  registryCapabilities,
  searchResources,
} from "./registry";
import {
  createDemoWorkspaceSource,
  type WorkspaceMode,
  type WorkspaceSource,
} from "./demoWorkspace";

function createLiveWorkspaceSource(): WorkspaceSource {
  return {
    kind: "live",
    async bootstrap() {
      const [capabilities, profiles] = await Promise.all([
        registryCapabilities(),
        loadConnectionProfiles(),
      ]);
      return { capabilities, profiles, sessions: {} };
    },
    openConnection,
    closeConnection,
    cancelOperation,
    listResources,
    readResource,
    searchResources,
    inspectNativeResource,
  };
}

export function createWorkspaceSource(mode: WorkspaceMode): WorkspaceSource {
  return mode === "demo"
    ? createDemoWorkspaceSource()
    : createLiveWorkspaceSource();
}
