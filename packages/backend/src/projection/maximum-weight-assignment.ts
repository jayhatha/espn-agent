interface FlowEdge {
  to: number;
  reverse: number;
  capacity: number;
  cost: number;
}

function addFlowEdge(
  graph: FlowEdge[][],
  from: number,
  to: number,
  cost: number,
): FlowEdge {
  const forward: FlowEdge = {
    to,
    reverse: graph[to].length,
    capacity: 1,
    cost,
  };
  const reverse: FlowEdge = {
    to: from,
    reverse: graph[from].length,
    capacity: 0,
    cost: -cost,
  };
  graph[from].push(forward);
  graph[to].push(reverse);
  return forward;
}

/**
 * Deterministic maximum-cardinality, maximum-weight bipartite assignment.
 * Input order breaks equal-cost ties.
 */
export function findMaximumWeightAssignment<TItem, TSlot>(
  items: readonly TItem[],
  slots: readonly TSlot[],
  getWeight: (item: TItem, slot: TSlot) => number,
  canAssign: (item: TItem, slot: TSlot) => boolean,
): Map<number, number> {
  const source = 0;
  const itemOffset = 1;
  const slotOffset = itemOffset + items.length;
  const sink = slotOffset + slots.length;
  const graph: FlowEdge[][] = Array.from({ length: sink + 1 }, () => []);
  const assignmentEdges: Array<{
    itemIndex: number;
    slotIndex: number;
    edge: FlowEdge;
  }> = [];

  items.forEach((_, itemIndex) => {
    addFlowEdge(graph, source, itemOffset + itemIndex, 0);
  });
  slots.forEach((_, slotIndex) => {
    addFlowEdge(graph, slotOffset + slotIndex, sink, 0);
  });
  items.forEach((item, itemIndex) => {
    slots.forEach((slot, slotIndex) => {
      if (!canAssign(item, slot)) return;
      const edge = addFlowEdge(
        graph,
        itemOffset + itemIndex,
        slotOffset + slotIndex,
        -getWeight(item, slot),
      );
      assignmentEdges.push({ itemIndex, slotIndex, edge });
    });
  });

  while (true) {
    const distance = Array<number>(graph.length).fill(Number.POSITIVE_INFINITY);
    const previousNode = Array<number>(graph.length).fill(-1);
    const previousEdge = Array<number>(graph.length).fill(-1);
    distance[source] = 0;

    for (let pass = 0; pass < graph.length - 1; pass++) {
      let changed = false;
      for (let node = 0; node < graph.length; node++) {
        if (!Number.isFinite(distance[node])) continue;
        graph[node].forEach((edge, edgeIndex) => {
          const nextDistance = distance[node] + edge.cost;
          if (edge.capacity > 0 && nextDistance < distance[edge.to]) {
            distance[edge.to] = nextDistance;
            previousNode[edge.to] = node;
            previousEdge[edge.to] = edgeIndex;
            changed = true;
          }
        });
      }
      if (!changed) break;
    }

    if (previousNode[sink] === -1) break;
    for (let node = sink; node !== source; node = previousNode[node]) {
      const from = previousNode[node];
      const edge = graph[from][previousEdge[node]];
      edge.capacity = 0;
      graph[node][edge.reverse].capacity = 1;
    }
  }

  const assignedItemBySlot = new Map<number, number>();
  for (const { itemIndex, slotIndex, edge } of assignmentEdges) {
    if (edge.capacity === 0) assignedItemBySlot.set(slotIndex, itemIndex);
  }
  return assignedItemBySlot;
}
