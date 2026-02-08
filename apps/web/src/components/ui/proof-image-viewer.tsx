"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Download, Maximize2, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ProofImageViewerProps = {
  src?: string;
  images?: Array<{ src: string; alt?: string }>;
  alt: string;
  className?: string;
};

export const ProofImageViewer = ({ src, images, alt, className }: ProofImageViewerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const allImages = images?.length
    ? images
    : src
      ? [{ src, alt }]
      : [];

  const currentImage = allImages[currentIndex];

  useEffect(() => {
    setMounted(true);
  }, []);

  const rotate = () => setRotation((prev) => (prev + 90) % 360);

  useEffect(() => {
    if (currentIndex >= allImages.length) {
      setCurrentIndex(0);
    }
  }, [allImages.length, currentIndex]);

  if (!currentImage) {
    return null;
  }

  const hasMultiple = allImages.length > 1;
  const goNext = () => {
    setRotation(0);
    setCurrentIndex((prev) => (prev + 1) % allImages.length);
  };
  const goPrev = () => {
    setRotation(0);
    setCurrentIndex((prev) => (prev - 1 + allImages.length) % allImages.length);
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="gap-2"
        onClick={() => setIsOpen(true)}
      >
        <Maximize2 className="h-4 w-4" />
        View proof{hasMultiple ? ` (${allImages.length})` : ""}
      </Button>

      {isOpen && mounted ? createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-overlay/80 p-6">
          <div className="relative w-full max-w-3xl rounded-2xl border border-divider/40 bg-content1/90 p-4 shadow-lg backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-sm font-semibold text-default-600">
                Proof image {currentIndex + 1}/{allImages.length}
              </h3>
              <div className="flex items-center gap-2">
                <Button
                  as="a"
                  href={currentImage.src}
                  download
                  size="sm"
                  variant="outline"
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                </Button>
                {hasMultiple ? (
                  <>
                    <Button type="button" size="sm" variant="outline" onClick={goPrev}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={goNext}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={rotate}
                >
                  <RotateCw className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setIsOpen(false);
                    setRotation(0);
                    setCurrentIndex(0);
                  }}
                >
                  Close
                </Button>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-center rounded-xl border border-divider/40 bg-content2/70 p-4">
              <Image
                src={currentImage.src}
                alt={currentImage.alt ?? alt}
                width={1200}
                height={800}
                className="max-h-[85vh] w-auto rounded-lg object-contain"
                style={{ transform: `rotate(${rotation}deg)` }}
                unoptimized
              />
            </div>
            {hasMultiple ? (
              <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
                {allImages.map((image, index) => (
                  <button
                    key={`${image.src}-${index}`}
                    type="button"
                    className={cn(
                      "relative aspect-video overflow-hidden rounded-md border",
                      index === currentIndex ? "border-primary" : "border-divider/40",
                    )}
                    onClick={() => {
                      setCurrentIndex(index);
                      setRotation(0);
                    }}
                  >
                    <Image
                      src={image.src}
                      alt={image.alt ?? `Proof image ${index + 1}`}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  );
};
