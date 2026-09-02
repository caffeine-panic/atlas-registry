import { useCallback, useReducer } from "react";
import type { SetStateAction } from "react";
import type { ResourceAddress, ResourceDocument } from "./registry";
import type { TreeRow } from "./resourceTree";
import {
  initialResourceWorkspaceState,
  reduceResourceWorkspace,
  type ActiveSearch,
} from "./resourceWorkspaceState";

function resolve<T>(update: SetStateAction<T>, current: T): T {
  return typeof update === "function"
    ? (update as (value: T) => T)(current)
    : update;
}

export function useResourceWorkspace() {
  const [state, dispatch] = useReducer(
    reduceResourceWorkspace,
    initialResourceWorkspaceState,
  );

  const clearView = useCallback(() => dispatch({ type: "clearView" }), []);
  const showDocument = useCallback(
    (document?: ResourceDocument) => dispatch({ type: "document", document }),
    [],
  );
  const setRows = useCallback(
    (update: SetStateAction<TreeRow[]>) =>
      dispatch({
        type: "rows",
        update: (current) => resolve(update, current),
      }),
    [],
  );
  const setDraftValue = useCallback(
    (value: string) => dispatch({ type: "draft", value }),
    [],
  );
  const setSelectedAddress = useCallback(
    (address?: ResourceAddress) => dispatch({ type: "address", address }),
    [],
  );
  const setFilter = useCallback(
    (value: string) => dispatch({ type: "filter", value }),
    [],
  );
  const setResourceQuery = useCallback(
    (value: string) => dispatch({ type: "query", value }),
    [],
  );
  const setActiveSearch = useCallback(
    (update: SetStateAction<ActiveSearch | undefined>) =>
      dispatch({
        type: "search",
        update: (current) => resolve(update, current),
      }),
    [],
  );

  return {
    state,
    clearView,
    showDocument,
    setRows,
    setDraftValue,
    setSelectedAddress,
    setFilter,
    setResourceQuery,
    setActiveSearch,
  };
}
