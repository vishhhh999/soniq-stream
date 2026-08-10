"use client";

import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { usePlayer } from "../PlayerProvider";
import SortableQueueItem from "../SortableQueueItem";

export default function QueuePanel() {
  const { queue, queueIndex, jumpToQueueIndex, reorderQueue } = usePlayer();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = queue.map((t, i) => `${t.id}-${i}`);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    reorderQueue(arrayMove(queue, oldIndex, newIndex));
  };

  return (
    <div className="flex flex-col h-full">
      <h3 className="text-sm font-medium text-primary px-1 pb-4">Queue</h3>
      {queue.length === 0 ? (
        <p className="text-sm text-tertiary text-center mt-8">Nothing queued.</p>
      ) : (
        <div className="flex-1 overflow-y-auto -mx-1">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={queue.map((t, i) => `${t.id}-${i}`)} strategy={verticalListSortingStrategy}>
              {queue.map((t, i) => (
                <SortableQueueItem key={`${t.id}-${i}`} track={t} index={i} isCurrent={i === queueIndex} onSelect={() => jumpToQueueIndex(i)} />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  );
}
