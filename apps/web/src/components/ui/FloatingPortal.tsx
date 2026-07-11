'use client';

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useClientReady } from '@/hooks/useClientReady';

type FloatingSide = 'top' | 'bottom' | 'left' | 'right';
type FloatingAlign = 'start' | 'center' | 'end';

export interface FloatingAnchorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface FloatingPosition {
  left: number;
  top: number;
}

interface FloatingPortalProps {
  open: boolean;
  anchorRef?: RefObject<HTMLElement | null>;
  anchorRect?: FloatingAnchorRect | null;
  placement?: FloatingSide;
  align?: FloatingAlign;
  offset?: number;
  viewportPadding?: number;
  zIndex?: number;
  role?: string;
  id?: string;
  ariaLabelledBy?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  onMouseEnter?: (event: MouseEvent<HTMLDivElement>) => void;
  onMouseLeave?: (event: MouseEvent<HTMLDivElement>) => void;
}

interface PortalTooltipProps {
  children: ReactElement;
  content: ReactNode;
  placement?: FloatingSide;
  align?: FloatingAlign;
  offset?: number;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  wrapperClassName?: string;
  contentClassName?: string;
  delay?: number;
}

export const FLOATING_Z_INDEX = {
  floating: 100,
  tooltip: 120,
  menu: 120,
  modal: 130,
} as const;

function toRect(anchor: FloatingAnchorRect): DOMRect {
  return {
    left: anchor.left,
    top: anchor.top,
    width: anchor.width,
    height: anchor.height,
    right: anchor.left + anchor.width,
    bottom: anchor.top + anchor.height,
    x: anchor.left,
    y: anchor.top,
    toJSON: () => anchor,
  } as DOMRect;
}

function clamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function oppositeSide(side: FloatingSide): FloatingSide {
  if (side === 'top') return 'bottom';
  if (side === 'bottom') return 'top';
  if (side === 'left') return 'right';
  return 'left';
}

function getCoords(
  anchor: DOMRect,
  content: DOMRect,
  side: FloatingSide,
  align: FloatingAlign,
  offset: number,
) {
  const anchorCenterX = anchor.left + anchor.width / 2;
  const anchorCenterY = anchor.top + anchor.height / 2;
  let left = anchorCenterX - content.width / 2;
  let top = anchorCenterY - content.height / 2;

  if (side === 'top') top = anchor.top - content.height - offset;
  if (side === 'bottom') top = anchor.bottom + offset;
  if (side === 'left') left = anchor.left - content.width - offset;
  if (side === 'right') left = anchor.right + offset;

  if (side === 'top' || side === 'bottom') {
    if (align === 'start') left = anchor.left;
    if (align === 'end') left = anchor.right - content.width;
  } else {
    if (align === 'start') top = anchor.top;
    if (align === 'end') top = anchor.bottom - content.height;
  }

  return { left, top };
}

function sideFits(
  position: FloatingPosition,
  content: DOMRect,
  side: FloatingSide,
  padding: number,
) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (side === 'top') return position.top >= padding;
  if (side === 'bottom') return position.top + content.height <= height - padding;
  if (side === 'left') return position.left >= padding;
  return position.left + content.width <= width - padding;
}

function computePosition(
  anchor: DOMRect,
  content: DOMRect,
  placement: FloatingSide,
  align: FloatingAlign,
  offset: number,
  padding: number,
): FloatingPosition {
  const preferred = getCoords(anchor, content, placement, align, offset);
  const flippedSide = oppositeSide(placement);
  const flipped = getCoords(anchor, content, flippedSide, align, offset);
  const side = sideFits(preferred, content, placement, padding) || !sideFits(flipped, content, flippedSide, padding)
    ? placement
    : flippedSide;
  const position = side === placement ? preferred : flipped;

  return {
    left: clamp(position.left, padding, window.innerWidth - content.width - padding),
    top: clamp(position.top, padding, window.innerHeight - content.height - padding),
  };
}

export function isEventInsideRefs(
  event: Event,
  refs: Array<RefObject<HTMLElement | null>>,
) {
  const path = event.composedPath();
  return refs.some((ref) => {
    const node = ref.current;
    return node ? path.includes(node) : false;
  });
}

export const FloatingPortal = ({
  open,
  anchorRef,
  anchorRect,
  placement = 'bottom',
  align = 'center',
  offset = 8,
  viewportPadding = 8,
  zIndex = FLOATING_Z_INDEX.tooltip,
  role,
  id,
  ariaLabelledBy,
  className = '',
  style,
  children,
  onMouseEnter,
  onMouseLeave,
}: FloatingPortalProps) => {
  const mounted = useClientReady();

  if (!open || !mounted) return null;

  return (
    <FloatingPortalContent
      anchorRef={anchorRef}
      anchorRect={anchorRect}
      placement={placement}
      align={align}
      offset={offset}
      viewportPadding={viewportPadding}
      zIndex={zIndex}
      role={role}
      id={id}
      ariaLabelledBy={ariaLabelledBy}
      className={className}
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </FloatingPortalContent>
  );
};

function FloatingPortalContent({
  anchorRef,
  anchorRect,
  placement = 'bottom',
  align = 'center',
  offset = 8,
  viewportPadding = 8,
  zIndex = FLOATING_Z_INDEX.tooltip,
  role,
  id,
  ariaLabelledBy,
  className = '',
  style,
  children,
  onMouseEnter,
  onMouseLeave,
}: Omit<FloatingPortalProps, 'open'>) {
  const floatingRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const [position, setPosition] = useState<FloatingPosition | null>(null);

  const updatePosition = useCallback(() => {
    const anchor = anchorRect ? toRect(anchorRect) : anchorRef?.current?.getBoundingClientRect();
    const content = floatingRef.current?.getBoundingClientRect();
    if (!anchor || !content) return;
    setPosition(computePosition(anchor, content, placement, align, offset, viewportPadding));
  }, [align, anchorRect, anchorRef, offset, placement, viewportPadding]);

  const scheduleUpdate = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      updatePosition();
    });
  }, [updatePosition]);

  useEffect(() => {
    scheduleUpdate();
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('scroll', scheduleUpdate, true);

    const observer = new ResizeObserver(scheduleUpdate);
    if (anchorRef?.current) observer.observe(anchorRef.current);
    if (floatingRef.current) observer.observe(floatingRef.current);

    return () => {
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('scroll', scheduleUpdate, true);
      observer.disconnect();
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [anchorRef, scheduleUpdate]);

  useEffect(() => {
    scheduleUpdate();
  }, [anchorRect, scheduleUpdate]);

  return createPortal(
    <div
      ref={floatingRef}
      id={id}
      role={role}
      aria-labelledby={ariaLabelledBy}
      className={className}
      style={{
        position: 'fixed',
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        zIndex,
        visibility: position ? 'visible' : 'hidden',
        ...style,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>,
    document.body,
  );
}

export function PortalTooltip({
  children,
  content,
  placement = 'top',
  align = 'center',
  offset = 8,
  disabled = false,
  open: controlledOpen,
  onOpenChange,
  wrapperClassName,
  contentClassName = '',
  delay = 120,
}: PortalTooltipProps) {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = !disabled && (controlledOpen ?? uncontrolledOpen);
  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (controlledOpen === undefined) {
        setUncontrolledOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [controlledOpen, onOpenChange],
  );

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const show = useCallback(() => {
    if (disabled) return;
    clearCloseTimer();
    setOpen(true);
  }, [clearCloseTimer, disabled, setOpen]);

  const hide = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, delay);
  }, [clearCloseTimer, delay, setOpen]);

  const hideNow = useCallback(() => {
    clearCloseTimer();
    setOpen(false);
  }, [clearCloseTimer, setOpen]);

  const handlePointerEnter = useCallback(() => {
    show();
  }, [show]);

  const handlePointerLeave = useCallback(() => {
    hide();
  }, [hide]);

  const handleMouseEnter = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (event.currentTarget !== event.target) return;
      show();
    },
    [show],
  );
  const handleMouseLeave = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (event.currentTarget !== event.target) return;
      hide();
    },
    [hide],
  );
  const handleFocus = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      show();
    },
    [show],
  );
  const handleBlur = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      hide();
    },
    [hide],
  );
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === 'Escape') hideNow();
    },
    [hideNow],
  );
  const setTriggerNode = useCallback((node: HTMLElement | null) => {
    triggerRef.current = node;
  }, []);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  if (!isValidElement(children)) return null;
  const child = children as ReactElement<{ 'aria-describedby'?: string }>;
  const usesBlockWrapper = child.type === 'div';
  const describedBy = [child.props['aria-describedby'], tooltipId].filter(Boolean).join(' ');
  const trigger = open
    ? cloneElement(child, { 'aria-describedby': describedBy })
    : child;
  const triggerWrapperClassName = [usesBlockWrapper ? 'block' : 'inline-flex', wrapperClassName]
    .filter(Boolean)
    .join(' ');

  const triggerWrapperProps = {
    className: triggerWrapperClassName,
    onPointerEnter: handlePointerEnter,
    onPointerLeave: handlePointerLeave,
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
    onFocus: handleFocus,
    onBlur: handleBlur,
    onKeyDown: handleKeyDown,
  };

  return (
    <>
      {usesBlockWrapper ? (
        <div ref={setTriggerNode} {...triggerWrapperProps}>{trigger}</div>
      ) : (
        <span ref={setTriggerNode} {...triggerWrapperProps}>{trigger}</span>
      )}
      <FloatingPortal
        open={open && !disabled}
        anchorRef={triggerRef}
        placement={placement}
        align={align}
        offset={offset}
        zIndex={FLOATING_Z_INDEX.tooltip}
        id={tooltipId}
        role="tooltip"
        className={[
          'max-w-[280px] rounded-lg border border-copper/30 bg-void-deep px-3 py-2 text-[11px] leading-relaxed text-ink-secondary shadow-[0_8px_24px_rgba(0,0,0,0.42)]',
          contentClassName,
        ].filter(Boolean).join(' ')}
        onMouseEnter={show}
        onMouseLeave={hide}
      >
        {content}
      </FloatingPortal>
    </>
  );
}
