/** Pure logic for BroadcastChannel + disk ordering (unit-tested). */

export function planBcQueueRefresh(params: {
  messageVersion: number;
  lastAppliedMessageVersion: number;
  diskVersion: number;
  lastDiskVersionApplied: number;
}): { shouldRefresh: boolean; nextLastMessageVersion: number; nextLastDiskVersion: number } {
  const { messageVersion, lastAppliedMessageVersion, diskVersion, lastDiskVersionApplied } = params;
  if (messageVersion === 0) {
    return {
      shouldRefresh: true,
      nextLastMessageVersion: lastAppliedMessageVersion,
      nextLastDiskVersion: Math.max(lastDiskVersionApplied, diskVersion),
    };
  }
  if (messageVersion <= lastAppliedMessageVersion) {
    if (diskVersion <= lastDiskVersionApplied) {
      return {
        shouldRefresh: false,
        nextLastMessageVersion: lastAppliedMessageVersion,
        nextLastDiskVersion: lastDiskVersionApplied,
      };
    }
    return {
      shouldRefresh: true,
      nextLastMessageVersion: lastAppliedMessageVersion,
      nextLastDiskVersion: diskVersion,
    };
  }
  return {
    shouldRefresh: true,
    nextLastMessageVersion: messageVersion,
    nextLastDiskVersion: Math.max(lastDiskVersionApplied, diskVersion),
  };
}
