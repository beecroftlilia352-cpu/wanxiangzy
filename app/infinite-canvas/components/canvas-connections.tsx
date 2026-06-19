import { memo, type MouseEvent as ReactMouseEvent } from "react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasConnection, CanvasNodeData, Position, ViewportTransform } from "../types";

type ConnectionPathProps = {
    connection: CanvasConnection;
    from: CanvasNodeData;
    to: CanvasNodeData;
    active: boolean;
    viewport?: ViewportTransform;
    onSelect: () => void;
    onContextMenu?: (event: ReactMouseEvent<SVGPathElement>) => void;
};

function projectPoint(point: Position, viewport?: ViewportTransform) {
    if (!viewport) return point;
    return {
        x: point.x * viewport.k + viewport.x,
        y: point.y * viewport.k + viewport.y,
    };
}

function ConnectionPathBase({
    connection,
    from,
    to,
    active,
    viewport,
    onSelect,
    onContextMenu,
}: ConnectionPathProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const start = projectPoint({ x: from.position.x + from.width, y: from.position.y + from.height / 2 }, viewport);
    const end = projectPoint({ x: to.position.x, y: to.position.y + to.height / 2 }, viewport);
    const startX = start.x;
    const startY = start.y;
    const endX = end.x;
    const endY = end.y;
    const dx = Math.abs(endX - startX);
    const scale = viewport?.k ?? 1;
    const curvature = Math.max(dx * 0.5, 50 * scale);
    const pathD = `M ${startX} ${startY} C ${startX + curvature} ${startY}, ${endX - curvature} ${endY}, ${endX} ${endY}`;
    const strokeWidth = Math.max(active ? 1.4 : 1, (active ? 3 : 2) * scale);

    return (
        <g>
            <path
                data-connection-id={connection.id}
                d={pathD}
                stroke="transparent"
                strokeWidth="16"
                fill="none"
                style={{ cursor: "pointer", pointerEvents: "stroke" }}
                onClick={(event) => {
                    event.stopPropagation();
                    onSelect();
                }}
                onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onContextMenu?.(event);
                }}
            />
            <path
                d={pathD}
                stroke={active ? theme.node.activeStroke : theme.node.muted}
                strokeWidth={strokeWidth}
                strokeOpacity={active ? 1 : 0.82}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                style={{ filter: active ? `drop-shadow(0 0 8px ${theme.node.activeStroke}66)` : undefined, pointerEvents: "none" }}
            />
        </g>
    );
}

function sameNodeGeometry(a: CanvasNodeData, b: CanvasNodeData) {
    return a.id === b.id && a.width === b.width && a.height === b.height && a.position.x === b.position.x && a.position.y === b.position.y;
}

export const ConnectionPath = memo(
    ConnectionPathBase,
    (prev, next) =>
        prev.connection.id === next.connection.id &&
        prev.active === next.active &&
        prev.viewport?.x === next.viewport?.x &&
        prev.viewport?.y === next.viewport?.y &&
        prev.viewport?.k === next.viewport?.k &&
        sameNodeGeometry(prev.from, next.from) &&
        sameNodeGeometry(prev.to, next.to),
);
