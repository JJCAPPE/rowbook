"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Pagination } from "@heroui/react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize2,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ProofImage = {
  id?: string;
  src: string;
  alt?: string;
};

type ProofImageViewerProps = {
  src?: string;
  alt?: string;
  images?: ProofImage[];
  className?: string;
  onRefresh?: () => Promise<unknown> | unknown;
};

const FOCUSABLE_ELEMENTS = [
  "a[href]:not([tabindex='-1'])",
  "button:not([disabled]):not([tabindex='-1'])",
  "input:not([disabled]):not([tabindex='-1'])",
  "select:not([disabled]):not([tabindex='-1'])",
  "textarea:not([disabled]):not([tabindex='-1'])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

export const ProofImageViewer = ({
  src,
  alt = "Proof image",
  images,
  className,
  onRefresh,
}: ProofImageViewerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [hasImageError, setHasImageError] = useState(false);
  const [imageRetryKey, setImageRetryKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const providedImages = images?.filter((image) => Boolean(image.src)) ?? [];
  const resolvedImages = providedImages.length > 0
    ? providedImages
    : (src ? [{ src, alt }] : []);
  const currentImage = resolvedImages[activeIndex] ?? resolvedImages[0];

  const resetImageView = useCallback(() => {
    setRotation(0);
    setZoom(MIN_ZOOM);
    setHasImageError(false);
    setImageRetryKey(0);
  }, []);

  const closeViewer = useCallback(() => {
    setIsOpen(false);
    setActiveIndex(0);
    resetImageView();
  }, [resetImageView]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (activeIndex >= resolvedImages.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, resolvedImages.length]);

  useEffect(() => {
    resetImageView();
  }, [currentImage?.src, resetImageView]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const dialog = dialogRef.current;
    const previouslyFocused = openerRef.current;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusFrame = window.requestAnimationFrame(() => {
      const initialFocus = dialog?.querySelector<HTMLElement>(
        "[data-proof-viewer-initial-focus]",
      );
      (initialFocus ?? dialog)?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeViewer();
        return;
      }

      if (event.key === "ArrowLeft" && resolvedImages.length > 1) {
        event.preventDefault();
        setActiveIndex((prev) => (prev - 1 + resolvedImages.length) % resolvedImages.length);
        resetImageView();
        return;
      }

      if (event.key === "ArrowRight" && resolvedImages.length > 1) {
        event.preventDefault();
        setActiveIndex((prev) => (prev + 1) % resolvedImages.length);
        resetImageView();
        return;
      }

      if (event.key !== "Tab" || !dialog) {
        return;
      }

      const focusableElements = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_ELEMENTS),
      ).filter(
        (element) =>
          element.getAttribute("aria-disabled") !== "true"
          && element.getAttribute("aria-hidden") !== "true",
      );

      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && (activeElement === firstElement || !dialog.contains(activeElement))) {
        event.preventDefault();
        lastElement?.focus();
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      if (previouslyFocused?.isConnected) {
        window.requestAnimationFrame(() => previouslyFocused.focus());
      }
    };
  }, [closeViewer, isOpen, resetImageView, resolvedImages.length]);

  if (!resolvedImages.length) {
    return null;
  }

  const rotate = () => setRotation((prev) => (prev + 90) % 360);
  const zoomOut = () => setZoom((current) => Math.max(MIN_ZOOM, current - ZOOM_STEP));
  const zoomIn = () => setZoom((current) => Math.min(MAX_ZOOM, current + ZOOM_STEP));

  const goToIndex = (index: number) => {
    setActiveIndex(index);
    resetImageView();
  };

  const showCarouselControls = resolvedImages.length > 1;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="gap-2"
        onClick={() => {
          openerRef.current = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
          setIsOpen(true);
          setActiveIndex(0);
          resetImageView();
        }}
      >
        <Maximize2 className="h-4 w-4" aria-hidden="true" />
        {showCarouselControls ? `View proofs (${resolvedImages.length})` : "View proof"}
      </Button>

      {isOpen && mounted ? createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-overlay/80 p-2 sm:p-6"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeViewer();
            }
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            tabIndex={-1}
            className="relative flex h-[calc(100dvh-1rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-divider/40 bg-content1/95 p-3 shadow-lg outline-none backdrop-blur sm:h-[min(48rem,calc(100dvh-3rem))] sm:p-4"
          >
            <div className="flex flex-col gap-3 border-b border-divider/40 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 id={titleId} className="text-sm font-semibold text-default-600">
                {showCarouselControls
                  ? `Proof image ${activeIndex + 1} of ${resolvedImages.length}`
                  : "Proof image"}
                </h2>
                <p id={descriptionId} className="sr-only">
                  Use the controls to zoom, rotate, download, or move between proof images.
                  Press Escape to close the viewer.
                </p>
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                <Button
                  as="a"
                  href={currentImage.src}
                  download
                  size="sm"
                  variant="outline"
                  isIconOnly
                  aria-label={`Download proof image ${activeIndex + 1}`}
                  title="Download proof image"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  isIconOnly
                  aria-label="Zoom out"
                  title="Zoom out"
                  disabled={zoom <= MIN_ZOOM}
                  onClick={zoomOut}
                >
                  <ZoomOut className="h-4 w-4" aria-hidden="true" />
                </Button>
                <span
                  className="min-w-10 text-center text-xs font-semibold tabular-nums text-default-500"
                  aria-live="polite"
                >
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  isIconOnly
                  aria-label="Zoom in"
                  title="Zoom in"
                  disabled={zoom >= MAX_ZOOM}
                  onClick={zoomIn}
                >
                  <ZoomIn className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  isIconOnly
                  aria-label="Rotate proof image clockwise"
                  title="Rotate proof image"
                  onClick={rotate}
                >
                  <RotateCw className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={closeViewer}
                  data-proof-viewer-initial-focus
                >
                  Close
                </Button>
              </div>
            </div>

            <div className="relative mt-3 min-h-0 flex-1 overflow-hidden rounded-xl border border-divider/40 bg-content2/70">
              <div className="h-full w-full overflow-auto overscroll-contain p-4 sm:p-8">
                <div className="flex min-h-full min-w-full items-center justify-center">
                  {hasImageError ? (
                    <div
                      role="status"
                      className="mx-auto max-w-sm space-y-3 rounded-2xl border border-divider/40 bg-content1/90 p-5 text-center"
                    >
                      <p className="font-semibold text-foreground">Proof image unavailable</p>
                      <p className="text-sm text-default-500">
                        This image could not be loaded. Its link may have expired.
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isRefreshing}
                        onClick={async () => {
                          setIsRefreshing(true);
                          try {
                            await onRefresh?.();
                            setHasImageError(false);
                            setImageRetryKey((current) => current + 1);
                          } finally {
                            setIsRefreshing(false);
                          }
                        }}
                      >
                        {isRefreshing ? "Refreshing…" : "Try again"}
                      </Button>
                    </div>
                  ) : (
                    <Image
                      key={`${currentImage.src}-${imageRetryKey}`}
                      src={currentImage.src}
                      alt={currentImage.alt ?? alt}
                      width={1200}
                      height={800}
                      className="max-h-[calc(100dvh-14rem)] max-w-full select-none rounded-lg object-contain transition-transform duration-200 ease-out motion-reduce:transition-none sm:max-h-[calc(100dvh-12rem)]"
                      style={{ transform: `rotate(${rotation}deg) scale(${zoom})` }}
                      onError={() => setHasImageError(true)}
                      draggable={false}
                      unoptimized
                    />
                  )}
                </div>
              </div>

              {showCarouselControls ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  isIconOnly
                  aria-label="View previous proof image"
                  title="Previous proof image"
                  className="absolute left-2 top-1/2 z-10 -translate-y-1/2 bg-content1/90 shadow-sm"
                  onClick={() => goToIndex((activeIndex - 1 + resolvedImages.length) % resolvedImages.length)}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
              ) : null}
              {showCarouselControls ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  isIconOnly
                  aria-label="View next proof image"
                  title="Next proof image"
                  className="absolute right-2 top-1/2 z-10 -translate-y-1/2 bg-content1/90 shadow-sm"
                  onClick={() => goToIndex((activeIndex + 1) % resolvedImages.length)}
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              ) : null}
            </div>

            {showCarouselControls ? (
              <div className="mt-3 flex justify-center">
                <Pagination
                  aria-label="Select proof image"
                  total={resolvedImages.length}
                  page={activeIndex + 1}
                  onChange={(page) => goToIndex(page - 1)}
                  showControls={false}
                  isCompact
                  size="sm"
                />
              </div>
            ) : null}
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  );
};
