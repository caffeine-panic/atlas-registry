export function nacosPageCursor(pageNumber: number): string | undefined {
  return pageNumber > 1 ? String(pageNumber) : undefined;
}

export function clampNacosPage(pageNumber: number, totalPages: number): number {
  return Math.max(1, Math.min(pageNumber, Math.max(1, totalPages)));
}

function addressKey(address: ResourceAddress) {
  return JSON.stringify(address);
}

function mergedFields(
  current: ResourceSearchField[],
  incoming: ResourceSearchField[],
) {
  return [...new Set([...current, ...incoming])];
}

export function appendDedupedSearchPage(
  pages: ResourceSearchPage[],
  currentIndex: number,
  incoming: ResourceSearchPage,
): ResourceSearchPage[] {
  const retained = pages.slice(0, currentIndex + 1).map((page) => ({
    ...page,
    matches: page.matches?.map((match) => ({
      ...match,
      fields: [...match.fields],
    })),
  }));
  const locations = new Map<
    string,
    { pageIndex: number; matchIndex: number | undefined }
  >();
  retained.forEach((page, pageIndex) => {
    const matchIndexes = new Map(
      (page.matches ?? []).map((match, matchIndex) => [
        addressKey(match.address),
        matchIndex,
      ]),
    );
    page.items.forEach((item) =>
      locations.set(addressKey(item.address), {
        pageIndex,
        matchIndex: matchIndexes.get(addressKey(item.address)),
      }),
    );
  });

  const incomingMatches = new Map(
    (incoming.matches ?? []).map((match) => [addressKey(match.address), match]),
  );
  const items = [] as ResourceSearchPage["items"];
  const matches: ResourceSearchMatch[] = [];
  for (const item of incoming.items) {
    const key = addressKey(item.address);
    const match = incomingMatches.get(key);
    const existing = locations.get(key);
    if (existing) {
      if (match && existing.matchIndex !== undefined) {
        const previous =
          retained[existing.pageIndex].matches?.[existing.matchIndex];
        if (previous)
          previous.fields = mergedFields(previous.fields, match.fields);
      }
      continue;
    }
    items.push(item);
    if (match) matches.push(match);
  }
  return [
    ...retained,
    {
      ...incoming,
      items,
      matches: matches.length > 0 ? matches : undefined,
    },
  ];
}
import type {
  ResourceAddress,
  ResourceSearchField,
  ResourceSearchMatch,
  ResourceSearchPage,
} from "./registry";
